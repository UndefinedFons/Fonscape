const SESSION_COOKIE = "fonscape_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
// Cloudflare Workers Web Crypto caps PBKDF2 at 100,000 iterations.
const PASSWORD_ITERATIONS = 100000;

export class ApiError extends Error {
  constructor(status, message, code = "request_error", headers = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

export function errorResponse(error) {
  if (error instanceof ApiError) {
    return json({ error: error.message, code: error.code }, error.status, error.headers);
  }
  console.error(JSON.stringify({
    event: "api_request_failed",
    error: error instanceof Error ? error.message : String(error),
  }));
  return json({ error: "服务暂时不可用，请稍后再试。", code: "internal_error" }, 500);
}

export function requireDatabase(env) {
  if (!env.DB) throw new ApiError(503, "评论服务尚未完成数据库配置。", "database_unavailable");
  return env.DB;
}

export function assertSameOrigin(request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  if (request.headers.get("Sec-Fetch-Site") === "cross-site") {
    throw new ApiError(403, "请求来源无效。", "invalid_origin");
  }
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) {
    throw new ApiError(403, "请求来源无效。", "invalid_origin");
  }
}

export async function readLimitedBody(request, maximumBytes) {
  const declaredLength = request.headers.get("Content-Length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      throw new ApiError(400, "请求体长度无效。", "invalid_content_length");
    }
    if (parsedLength > maximumBytes) throw new ApiError(413, "提交的数据过大。", "body_too_large");
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel("body limit exceeded");
        throw new ApiError(413, "提交的数据过大。", "body_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function readJson(request, maximumBytes = 16 * 1024) {
  const type = request.headers.get("Content-Type") || "";
  if (!type.includes("application/json")) throw new ApiError(415, "请使用 JSON 提交数据。", "invalid_content_type");
  try {
    const bytes = await readLimitedBody(request, maximumBytes);
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!value || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
      throw new ApiError(400, "提交的数据必须是 JSON 对象。", "invalid_json_object");
    }
    return value;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "提交的数据格式不正确。", "invalid_json");
  }
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function randomToken(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function sha256(value) {
  const input = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", input)));
}

export async function hashPassword(password, encodedSalt = null) {
  const salt = encodedSalt ? base64UrlToBytes(encodedSalt) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PASSWORD_ITERATIONS }, key, 256);
  return { hash: bytesToBase64Url(new Uint8Array(bits)), salt: bytesToBase64Url(salt) };
}

export async function constantTimeEqual(left, right) {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  if (typeof crypto.subtle.timingSafeEqual === "function") {
    return crypto.subtle.timingSafeEqual(leftHash, rightHash);
  }
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

export function normalizeUsername(value) {
  const username = String(value || "").trim();
  if (!/^[A-Za-z0-9]{3,20}$/u.test(username)) {
    throw new ApiError(400, "账户名需为 3–20 位英文字母或数字。", "invalid_username");
  }
  return username;
}

export function normalizeNickname(value) {
  const nickname = String(value || "").trim().replace(/\s+/gu, " ");
  if (nickname.length < 1 || nickname.length > 10 || !/^[\p{L}\p{N}]+(?: [\p{L}\p{N}]+)*$/u.test(nickname)) {
    throw new ApiError(400, "昵称需为 1–10 个字符，可由任意语言的文字、字母或数字组成。", "invalid_nickname");
  }
  return nickname;
}

export function validatePassword(value) {
  const password = String(value || "");
  if (password.length < 6 || password.length > 20 || !/^[A-Za-z0-9]{6,20}$/u.test(password)) {
    throw new ApiError(400, "密码需为 6–20 位英文字母或数字。", "invalid_password");
  }
  return password;
}

export function normalizeComment(value) {
  const body = String(value || "").trim().replace(/\r\n?/gu, "\n");
  if (!body || body.length > 500) throw new ApiError(400, "评论需为 1–500 个字符。", "invalid_comment");
  return body;
}

export function validateTarget(type, slug) {
  const normalizedType = String(type || "").trim();
  if (!/^[a-z][a-z0-9_-]{0,31}$/u.test(normalizedType)) throw new ApiError(400, "内容类型无效。", "invalid_target");
  const normalizedSlug = String(slug || "").trim();
  if (!/^[a-z0-9][a-z0-9/_-]{0,119}$/u.test(normalizedSlug)) throw new ApiError(400, "内容地址无效。", "invalid_target");
  return { type: normalizedType, slug: normalizedSlug };
}

export function parseCookies(request) {
  const entries = [];
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const value = part.trim();
    if (!value) continue;
    const separator = value.indexOf("=");
    const name = separator < 0 ? value : value.slice(0, separator);
    const encoded = separator < 0 ? "" : value.slice(separator + 1);
    try {
      entries.push([name, decodeURIComponent(encoded)]);
    } catch {
      // A malformed cookie must behave like an absent cookie, not fail an API request.
    }
  }
  return Object.fromEntries(entries);
}

export function sessionCookie(token, request, maxAge = SESSION_TTL_SECONDS) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookie(request) {
  return sessionCookie("", request, 0);
}

export async function createSession(db, userId, request, maximumActiveSessions = 6) {
  const token = randomToken();
  const now = Date.now();
  const keepExisting = Math.max(0, Math.min(20, maximumActiveSessions) - 1);
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
    db.prepare(`DELETE FROM sessions WHERE user_id = ? AND id_hash NOT IN (
      SELECT id_hash FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
    )`).bind(userId, userId, keepExisting),
    db.prepare("INSERT INTO sessions (id_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
      .bind(await sha256(token), userId, now + SESSION_TTL_SECONDS * 1000, now),
  ]);
  return { token, cookie: sessionCookie(token, request) };
}

export async function destroySession(db, request) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (token) await db.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(await sha256(token)).run();
}

function effectiveRole(user) {
  return user.role;
}

export function publicUser(user) {
  const role = effectiveRole(user);
  const avatarUpdatedAt = user.avatar_user_id === user.id && user.avatar_updated_at ? Number(user.avatar_updated_at) : null;
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    role,
    status: user.status,
    unreadReplies: Number(user.unread_replies || 0),
    unreadAdminComments: role === "admin" ? Number(user.unread_admin_comments || 0) : 0,
    avatarUrl: avatarUpdatedAt ? `/api/avatar/${user.id}?v=${avatarUpdatedAt}` : null,
    avatarUpdatedAt,
    createdAt: user.created_at,
  };
}

export async function currentUser(context) {
  if (context.data.currentUser !== undefined) return context.data.currentUser;
  const db = requireDatabase(context.env);
  const token = parseCookies(context.request)[SESSION_COOKIE];
  if (!token) return (context.data.currentUser = null);
  const now = Date.now();
  const row = await db.prepare(`SELECT u.id, u.username, u.nickname, u.role, u.status, u.created_at, u.updated_at,
    u.notifications_seen_at, u.admin_comments_seen_at, ua.user_id AS avatar_user_id, ua.updated_at AS avatar_updated_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    LEFT JOIN user_avatars ua ON ua.user_id = u.id
    WHERE s.id_hash = ? AND s.expires_at > ? LIMIT 1`)
    .bind(await sha256(token), now).first();
  if (!row) return (context.data.currentUser = null);
  context.data.currentUser = row;
  return row;
}

export async function requireUser(context) {
  const user = await currentUser(context);
  if (!user) throw new ApiError(401, "请先登录。", "authentication_required");
  if (user.status !== "active") throw new ApiError(403, "该账户暂时无法发言。", "account_banned");
  return user;
}

export async function requireAdmin(context) {
  const user = await requireUser(context);
  if (effectiveRole(user) !== "admin") throw new ApiError(403, "仅管理员可以访问。", "admin_required");
  return user;
}

export function commentRow(row, viewerId = null, viewerRole = null) {
  const authorAvatarUpdatedAt = row.avatar_user_id === row.user_id && row.avatar_updated_at ? Number(row.avatar_updated_at) : null;
  const replyAvatarUpdatedAt = row.reply_to_avatar_user_id === row.reply_to_user_id && row.reply_to_avatar_updated_at
    ? Number(row.reply_to_avatar_updated_at)
    : null;
  return {
    id: row.id,
    parentId: row.parent_id,
    replyTo: row.reply_to_nickname || null,
    replyToUser: row.reply_to_user_id ? {
      id: row.reply_to_user_id,
      nickname: row.reply_to_nickname || "该用户",
      avatarUrl: replyAvatarUpdatedAt ? `/api/avatar/${row.reply_to_user_id}?v=${replyAvatarUpdatedAt}` : null,
      avatarUpdatedAt: replyAvatarUpdatedAt,
    } : null,
    body: row.body,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    editedAt: row.edited_at,
    canDelete: Boolean(viewerId) && (viewerId === row.user_id || viewerRole === "admin"),
    author: {
      id: row.user_id,
      nickname: row.nickname,
      role: row.user_role,
      avatarUrl: authorAvatarUpdatedAt ? `/api/avatar/${row.user_id}?v=${authorAvatarUpdatedAt}` : null,
      avatarUpdatedAt: authorAvatarUpdatedAt,
    },
  };
}
