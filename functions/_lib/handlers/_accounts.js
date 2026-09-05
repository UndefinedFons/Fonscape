import {
  ApiError,
  json,
  normalizeNickname,
  publicUser,
  readJson,
  readLimitedBody,
  requireDatabase,
  requireUser,
} from "../community.js";
import { protectAvatar, protectProfileUpdate } from "../abuse.js";
import { userById } from "./_shared.js";

export const AVATAR_MAX_BYTES = 100 * 1024;
export const AVATAR_TOTAL_MAX_BYTES = 100 * 1024 * 1024;

export async function updateMe(context) {
  const user = await requireUser(context);
  await protectProfileUpdate(context, user);
  const db = requireDatabase(context.env);
  const input = await readJson(context.request);
  const nickname = normalizeNickname(input.nickname);
  const now = Date.now();
  await db.prepare("UPDATE users SET nickname = ?, updated_at = ? WHERE id = ?").bind(nickname, now, user.id).run();
  const updated = await userById(db, user.id);
  context.data.currentUser = updated;
  return json({ user: publicUser(updated) });
}

export async function uploadAvatar(context) {
  const user = await requireUser(context);
  await protectAvatar(context, user);
  const db = requireDatabase(context.env);
  const declaredType = (context.request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(declaredType)) throw new ApiError(415, "头像仅支持 JPEG、PNG 或 WebP。", "invalid_avatar_type");
  const bytes = await readLimitedBody(context.request, AVATAR_MAX_BYTES);
  if (!bytes.byteLength) throw new ApiError(400, "头像文件不能为空。", "invalid_avatar");
  const actualType = detectAvatarMime(bytes);
  if (!actualType || actualType !== declaredType) throw new ApiError(415, "图片格式与文件内容不一致，仅支持 JPEG、PNG 或 WebP。", "invalid_avatar_type");
  const now = Date.now();
  // user_id is the primary key, so a new upload atomically replaces the old
  // BLOB instead of creating another avatar record for the same account.
  try {
    await db.prepare(`INSERT INTO user_avatars (user_id, image_data, mime_type, byte_size, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        image_data = excluded.image_data,
        mime_type = excluded.mime_type,
        byte_size = excluded.byte_size,
        updated_at = excluded.updated_at`)
      .bind(user.id, bytes.buffer, actualType, bytes.byteLength, now).run();
  } catch (error) {
    if (/avatar_capacity_reached/iu.test(error instanceof Error ? error.message : String(error))) {
      throw new ApiError(503, "站点头像存储空间已满。", "avatar_capacity_reached");
    }
    throw error;
  }
  const updated = await userById(db, user.id);
  context.data.currentUser = updated;
  return json({ user: publicUser(updated) });
}

function avatarBody(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (Array.isArray(value)) return Uint8Array.from(value);
  if (Array.isArray(value?.data)) return Uint8Array.from(value.data);
  if (value && typeof value === "object") {
    const keys = Object.keys(value).filter((key) => /^\d+$/u.test(key)).sort((left, right) => Number(left) - Number(right));
    if (keys.length) return Uint8Array.from(keys.map((key) => value[key]));
  }
  throw new ApiError(404, "头像不存在。", "avatar_not_found");
}

function detectAvatarMime(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)) return "image/png";
  if (bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return "";
}

export async function avatar(context, userId) {
  const db = requireDatabase(context.env);
  const row = await db.prepare("SELECT image_data, mime_type, byte_size, updated_at FROM user_avatars WHERE user_id = ? LIMIT 1").bind(userId).first();
  if (!row?.image_data) throw new ApiError(404, "头像不存在。", "avatar_not_found");
  const etag = `"avatar-${userId}-${row.updated_at}-${row.byte_size}"`;
  const versioned = new URL(context.request.url).searchParams.has("v");
  const cacheHeaders = {
    "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate",
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
  };
  if (context.request.headers.get("If-None-Match") === etag) return new Response(null, { status: 304, headers: cacheHeaders });
  const bytes = avatarBody(row.image_data);
  if (bytes.byteLength !== Number(row.byte_size) || bytes.byteLength > AVATAR_MAX_BYTES || detectAvatarMime(bytes) !== row.mime_type) {
    throw new ApiError(404, "头像不存在。", "avatar_not_found");
  }
  return new Response(context.request.method === "HEAD" ? null : bytes, {
    headers: {
      ...cacheHeaders,
      "Content-Type": row.mime_type,
      "Content-Length": String(bytes.byteLength),
    },
  });
}

export async function profile(context, userId) {
  const normalizedUserId = String(userId || "").trim();
  if (!/^[A-Za-z0-9-]{1,64}$/u.test(normalizedUserId)) throw new ApiError(404, "账户资料不存在。", "profile_not_found");
  const db = requireDatabase(context.env);
  const row = await db.prepare(`SELECT u.id, u.nickname,
    ua.user_id AS avatar_user_id, ua.updated_at AS avatar_updated_at
    FROM users u
    LEFT JOIN user_avatars ua ON ua.user_id = u.id
    WHERE u.id = ? AND u.status = 'active' LIMIT 1`).bind(normalizedUserId).first();
  if (!row) throw new ApiError(404, "账户资料不存在。", "profile_not_found");
  return json({
    profile: {
      id: row.id,
      nickname: row.nickname,
      avatarUrl: row.avatar_user_id === row.id && row.avatar_updated_at ? `/api/avatar/${row.id}?v=${row.avatar_updated_at}` : null,
    },
  });
}
