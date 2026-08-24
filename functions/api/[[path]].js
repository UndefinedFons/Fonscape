import {
  ApiError,
  assertSameOrigin,
  clearSessionCookie,
  commentRow,
  constantTimeEqual,
  createSession,
  currentUser,
  destroySession,
  errorResponse,
  hashPassword,
  json,
  normalizeComment,
  normalizeNickname,
  normalizeUsername,
  publicUser,
  readLimitedBody,
  readJson,
  requireAdmin,
  requireDatabase,
  requireUser,
  validatePassword,
  validateTarget,
} from "../_lib/community.js";
import {
  assertTargetExists,
  limitFromEnv,
  protectAdminBootstrap,
  protectAvatar,
  protectComment,
  protectContentView,
  protectLogin,
  protectProfileUpdate,
  protectRegistration,
  releaseCommentStorage,
  reserveCommentStorage,
  reserveRegistrationSlot,
  scheduleMaintenance,
} from "../_lib/abuse.js";

export const AVATAR_MAX_BYTES = 100 * 1024;
export const AVATAR_TOTAL_MAX_BYTES = 100 * 1024 * 1024;
const USER_FIELDS = `u.id, u.username, u.password_hash, u.password_salt, u.nickname, u.role, u.status,
  u.created_at, u.updated_at, u.notifications_seen_at, u.admin_comments_seen_at,
  ua.user_id AS avatar_user_id, ua.updated_at AS avatar_updated_at`;

async function userById(db, userId) {
  return db.prepare(`SELECT ${USER_FIELDS} FROM users u
    LEFT JOIN user_avatars ua ON ua.user_id = u.id
    WHERE u.id = ? LIMIT 1`).bind(userId).first();
}

function routeParts(context) {
  const value = context.params.path;
  return (Array.isArray(value) ? value : String(value || "").split("/")).filter(Boolean);
}

async function session(context) {
  const user = await currentUser(context);
  if (!user) return json({ user: null });
  if (user.status === "banned") {
    const db = requireDatabase(context.env);
    await destroySession(db, context.request);
    return json({ user: null, accountNotice: "该账户已被管理员停用，当前登录已退出。" }, 200, { "Set-Cookie": clearSessionCookie(context.request) });
  }
  const db = requireDatabase(context.env);
  const [unreadReplies, unreadAdminComments] = await db.batch([
    db.prepare("SELECT COUNT(*) AS count FROM comments WHERE reply_to_user_id = ? AND user_id != ? AND status = 'published' AND created_at > ?")
      .bind(user.id, user.id, user.notifications_seen_at || user.created_at),
    db.prepare("SELECT COUNT(*) AS count FROM comments WHERE ? = 'admin' AND user_id != ? AND parent_id IS NULL AND status = 'published' AND created_at > ?")
      .bind(user.role, user.id, user.admin_comments_seen_at || user.created_at),
  ]);
  return json({ user: publicUser({
    ...user,
    unread_replies: unreadReplies.results?.[0]?.count || 0,
    unread_admin_comments: unreadAdminComments.results?.[0]?.count || 0,
  }, context.env) });
}

async function register(context) {
  const db = requireDatabase(context.env);
  if (!(await adminSetupState(db)).initialized) {
    throw new ApiError(403, "管理员完成站点初始化后才会开放注册。", "registration_closed");
  }
  await protectRegistration(context);
  const input = await readJson(context.request);
  const username = normalizeUsername(input.username);
  const nickname = normalizeNickname(input.nickname);
  const password = validatePassword(input.password);
  const existing = await db.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE LIMIT 1").bind(username).first();
  if (existing) throw new ApiError(409, "这个账户名已经被使用。", "username_exists");
  const credentials = await hashPassword(password);
  const id = crypto.randomUUID();
  const now = Date.now();
  const releaseRegistrationSlot = await reserveRegistrationSlot(db, context.env);
  try {
    await db.batch([
      db.prepare("INSERT INTO users (id, username, password_hash, password_salt, nickname, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, username, credentials.hash, credentials.salt, nickname, "member", now, now),
      db.prepare("INSERT INTO account_usage (user_id, comments_created, updated_at) VALUES (?, 0, ?)").bind(id, now),
    ]);
  } catch (error) {
    await releaseRegistrationSlot();
    throw error;
  }
  const auth = await createSession(db, id, context.request, limitFromEnv(context.env, "MAX_ACTIVE_SESSIONS"));
  const user = await userById(db, id);
  return json({ user: publicUser(user, context.env) }, 201, { "Set-Cookie": auth.cookie });
}

async function adminSetupState(db) {
  const row = await db.prepare(`SELECT
    admin_initialized_at,
    EXISTS (SELECT 1 FROM users WHERE role = 'admin') AS has_admin
    FROM site_runtime WHERE id = 1 LIMIT 1`).first();
  if (!row) throw new ApiError(503, "站点初始化数据不可用。", "setup_state_unavailable");
  return { initialized: Boolean(row.admin_initialized_at || Number(row.has_admin)) };
}

async function adminSetupStatus(context) {
  return json(await adminSetupState(requireDatabase(context.env)));
}

async function setupAdmin(context) {
  const db = requireDatabase(context.env);
  if ((await adminSetupState(db)).initialized) {
    throw new ApiError(409, "管理员账户已经完成初始化。", "admin_already_initialized");
  }
  await protectAdminBootstrap(context);
  const input = await readJson(context.request);
  const suppliedToken = String(input.token || "");
  const expectedToken = String(context.env.ADMIN_BOOTSTRAP_TOKEN || "");
  if (!expectedToken || !await constantTimeEqual(suppliedToken, expectedToken)) throw new ApiError(403, "管理员初始化链接无效。", "invalid_bootstrap_token");
  const username = normalizeUsername(input.username);
  const existingUsername = await db.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE LIMIT 1").bind(username).first();
  if (existingUsername) throw new ApiError(409, "这个账户名已经被使用。", "username_exists");
  const nickname = normalizeNickname(input.nickname === undefined ? username.slice(0, 10) : input.nickname);
  const password = validatePassword(input.password);
  const credentials = await hashPassword(password);
  const id = crypto.randomUUID();
  const claim = crypto.randomUUID();
  const now = Date.now();
  const results = await db.batch([
    db.prepare(`UPDATE site_runtime
      SET admin_initialized_at = ?, admin_bootstrap_claim = ?
      WHERE id = 1 AND admin_initialized_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin')`)
      .bind(now, claim),
    db.prepare(`INSERT INTO users
      (id, username, password_hash, password_salt, nickname, role, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, 'admin', ?, ?
      FROM site_runtime
      WHERE id = 1 AND admin_bootstrap_claim = ?
        AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin')`)
      .bind(id, username, credentials.hash, credentials.salt, nickname, now, now, claim),
    db.prepare(`INSERT INTO account_usage (user_id, comments_created, updated_at)
      SELECT ?, 0, ? WHERE EXISTS (SELECT 1 FROM users WHERE id = ? AND role = 'admin')`)
      .bind(id, now, id),
  ]);
  if (Number(results[1]?.meta?.changes || 0) !== 1) {
    throw new ApiError(409, "管理员账户已经完成初始化。", "admin_already_initialized");
  }
  const auth = await createSession(db, id, context.request, limitFromEnv(context.env, "MAX_ACTIVE_SESSIONS"));
  const user = await userById(db, id);
  return json({ user: publicUser(user, context.env) }, 201, { "Set-Cookie": auth.cookie });
}

async function login(context) {
  const db = requireDatabase(context.env);
  const input = await readJson(context.request);
  const username = String(input.username || "").trim();
  if (!username || username.length > 64) throw new ApiError(401, "账户名或密码不正确。", "invalid_credentials");
  await protectLogin(context, username);
  const password = String(input.password || "");
  const user = await db.prepare(`SELECT ${USER_FIELDS} FROM users u
    LEFT JOIN user_avatars ua ON ua.user_id = u.id
    WHERE u.username = ? COLLATE NOCASE LIMIT 1`).bind(username).first();
  if (!user) throw new ApiError(401, "账户名或密码不正确。", "invalid_credentials");
  const credentials = await hashPassword(password, user.password_salt);
  if (!await constantTimeEqual(credentials.hash, user.password_hash)) throw new ApiError(401, "账户名或密码不正确。", "invalid_credentials");
  if (user.status !== "active") throw new ApiError(403, "该账户暂时无法登录。", "account_banned");
  const auth = await createSession(db, user.id, context.request, limitFromEnv(context.env, "MAX_ACTIVE_SESSIONS"));
  return json({ user: publicUser(user, context.env) }, 200, { "Set-Cookie": auth.cookie });
}

async function logout(context) {
  const db = requireDatabase(context.env);
  await destroySession(db, context.request);
  return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(context.request) });
}

async function updateMe(context) {
  const user = await requireUser(context);
  await protectProfileUpdate(context, user);
  const db = requireDatabase(context.env);
  const input = await readJson(context.request);
  const nickname = normalizeNickname(input.nickname);
  const now = Date.now();
  await db.prepare("UPDATE users SET nickname = ?, updated_at = ? WHERE id = ?").bind(nickname, now, user.id).run();
  const updated = await userById(db, user.id);
  context.data.currentUser = updated;
  return json({ user: publicUser(updated, context.env) });
}

async function uploadAvatar(context) {
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
  return json({ user: publicUser(updated, context.env) });
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

async function avatar(context, userId) {
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

async function profile(context, userId) {
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

const commentSelect = `SELECT c.*, u.nickname, u.role AS user_role,
  ua.user_id AS avatar_user_id, ua.updated_at AS avatar_updated_at,
  reply.nickname AS reply_to_nickname,
  reply_avatar.user_id AS reply_to_avatar_user_id, reply_avatar.updated_at AS reply_to_avatar_updated_at
  FROM comments c JOIN users u ON u.id = c.user_id
  LEFT JOIN user_avatars ua ON ua.user_id = u.id
  LEFT JOIN users reply ON reply.id = c.reply_to_user_id
  LEFT JOIN user_avatars reply_avatar ON reply_avatar.user_id = reply.id`;

async function listComments(context, url) {
  const db = requireDatabase(context.env);
  const target = validateTarget(url.searchParams.get("type"), url.searchParams.get("slug"));
  await assertTargetExists(db, target);
  const viewer = await currentUser(context);
  const viewerRole = viewer ? publicUser(viewer, context.env).role : null;
  const result = await db.prepare(`${commentSelect} WHERE c.content_type = ? AND c.content_slug = ? AND c.status = 'published'
    AND (c.parent_id IS NULL OR EXISTS (SELECT 1 FROM comments parent WHERE parent.id = c.parent_id AND parent.status = 'published'))
    ORDER BY c.created_at ASC LIMIT 200`)
    .bind(target.type, target.slug).all();
  return json({ comments: result.results.map((row) => commentRow(row, viewer?.id || null, viewerRole)) });
}

async function createComment(context) {
  const user = await requireUser(context);
  const db = requireDatabase(context.env);
  const input = await readJson(context.request);
  const target = validateTarget(input.type, input.slug);
  const body = normalizeComment(input.body);
  await assertTargetExists(db, target);
  await protectComment(context, user, target);
  let parentId = null;
  let replyToUserId = null;
  let replyToCommentId = null;
  if (input.parentId) {
    const parent = await db.prepare("SELECT id, parent_id, user_id, content_type, content_slug, status FROM comments WHERE id = ? LIMIT 1").bind(String(input.parentId)).first();
    if (!parent || parent.status !== "published" || parent.content_type !== target.type || parent.content_slug !== target.slug) throw new ApiError(400, "回复的评论不存在。", "invalid_parent");
    parentId = parent.parent_id || parent.id;
    replyToUserId = parent.user_id;
    replyToCommentId = parent.id;
  }
  const id = crypto.randomUUID();
  const now = Date.now();
  const rollbackCommentStorage = await reserveCommentStorage(db, user, target, body, context.env);
  try {
    await db.prepare("INSERT INTO comments (id, content_type, content_slug, parent_id, reply_to_user_id, reply_to_comment_id, user_id, body, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)")
      .bind(id, target.type, target.slug, parentId, replyToUserId, replyToCommentId, user.id, body, now, now).run();
  } catch (error) {
    await rollbackCommentStorage();
    throw error;
  }
  const row = await db.prepare(`${commentSelect} WHERE c.id = ?`).bind(id).first();
  return json({ comment: commentRow(row, user.id, publicUser(user, context.env).role) }, 201);
}

async function deleteComment(context, commentId) {
  const user = await requireUser(context);
  await protectProfileUpdate(context, user);
  const db = requireDatabase(context.env);
  const existing = await db.prepare("SELECT user_id, status FROM comments WHERE id = ? LIMIT 1").bind(commentId).first();
  if (!existing) throw new ApiError(404, "评论不存在。", "comment_not_found");
  const viewer = publicUser(user, context.env);
  if (existing.user_id !== user.id && viewer.role !== "admin") throw new ApiError(403, "不能删除其他人的评论。", "not_comment_owner");
  if (existing.status === "deleted") return json({ ok: true });
  const now = Date.now();
  const result = await db.prepare("UPDATE comments SET body = '[已删除]', status = 'deleted', updated_at = ?, moderated_at = ?, moderated_by = ? WHERE id = ? AND status != 'deleted'")
    .bind(now, viewer.role === "admin" ? now : null, viewer.role === "admin" ? user.id : null, commentId).run();
  if (Number(result.meta?.changes || 0) === 1) await releaseCommentStorage(db, existing.user_id);
  return json({ ok: true });
}

async function myComments(context) {
  const user = await requireUser(context);
  const db = requireDatabase(context.env);
  const result = await db.prepare(`${commentSelect} WHERE c.user_id = ? ORDER BY c.created_at DESC LIMIT 100`).bind(user.id).all();
  return json({ comments: result.results.map((row) => ({ ...commentRow(row, user.id), contentType: row.content_type, contentSlug: row.content_slug })) });
}

async function myReplies(context) {
  const user = await requireUser(context);
  const db = requireDatabase(context.env);
  const result = await db.prepare(`SELECT c.*, u.nickname, u.role AS user_role,
    ua.user_id AS avatar_user_id, ua.updated_at AS avatar_updated_at,
    target.body AS replied_to_body, target.id AS replied_to_comment_id
    FROM comments c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN user_avatars ua ON ua.user_id = u.id
    LEFT JOIN comments target ON target.id = COALESCE(c.reply_to_comment_id, c.parent_id)
    WHERE c.reply_to_user_id = ? AND c.user_id != ? AND c.status = 'published'
    ORDER BY c.created_at DESC LIMIT 100`).bind(user.id, user.id).all();
  return json({ replies: result.results.map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    contentType: row.content_type,
    contentSlug: row.content_slug,
    repliedToBody: row.replied_to_body || "",
    repliedToCommentId: row.replied_to_comment_id || row.parent_id,
    unread: Number(row.created_at) > Number(user.notifications_seen_at || 0),
    author: {
      id: row.user_id,
      nickname: row.nickname,
      role: row.user_role,
      avatarUrl: row.avatar_user_id === row.user_id && row.avatar_updated_at ? `/api/avatar/${row.user_id}?v=${row.avatar_updated_at}` : null,
      avatarUpdatedAt: row.avatar_user_id === row.user_id && row.avatar_updated_at ? Number(row.avatar_updated_at) : null,
    },
  })) });
}

async function markReplyNotificationsRead(context) {
  const user = await requireUser(context);
  await protectProfileUpdate(context, user);
  const db = requireDatabase(context.env);
  const now = Date.now();
  await db.prepare("UPDATE users SET notifications_seen_at = ?, updated_at = ? WHERE id = ?").bind(now, now, user.id).run();
  return json({ ok: true });
}

async function adminReceivedComments(context) {
  const admin = await requireAdmin(context);
  const db = requireDatabase(context.env);
  const result = await db.prepare(`SELECT c.*, u.nickname, u.role AS user_role,
    ua.user_id AS avatar_user_id, ua.updated_at AS avatar_updated_at,
    reply.nickname AS reply_to_nickname
    FROM comments c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN user_avatars ua ON ua.user_id = u.id
    LEFT JOIN users reply ON reply.id = c.reply_to_user_id
    WHERE c.user_id != ? AND c.parent_id IS NULL AND c.status = 'published'
    ORDER BY c.created_at DESC LIMIT 100`).bind(admin.id).all();
  const seenAt = Number(admin.admin_comments_seen_at || admin.created_at || 0);
  return json({ comments: (result.results || []).map((row) => ({
    ...commentRow(row, admin.id, "admin"),
    contentType: row.content_type,
    contentSlug: row.content_slug,
    contentTitle: "",
    unread: Number(row.created_at) > seenAt,
  })) });
}

async function markAdminCommentsRead(context) {
  const admin = await requireAdmin(context);
  await protectProfileUpdate(context, admin);
  const db = requireDatabase(context.env);
  const now = Date.now();
  await db.prepare("UPDATE users SET admin_comments_seen_at = ?, updated_at = ? WHERE id = ?").bind(now, now, admin.id).run();
  context.data.currentUser = { ...admin, admin_comments_seen_at: now };
  return json({ ok: true });
}

async function readContentStats(context) {
  const db = requireDatabase(context.env);
  const [views, comments] = await db.batch([
    db.prepare("SELECT content_type AS type, content_slug AS slug, views FROM content_metrics"),
    db.prepare("SELECT content_type AS type, content_slug AS slug, COUNT(*) AS comments FROM comments WHERE status = 'published' GROUP BY content_type, content_slug"),
  ]);
  const stats = { post: {}, poem: {}, music: {} };
  for (const row of views.results || []) {
    if (stats[row.type]) stats[row.type][row.slug] = { views: Number(row.views || 0), comments: 0 };
  }
  for (const row of comments.results || []) {
    if (stats[row.type]) stats[row.type][row.slug] = { views: stats[row.type][row.slug]?.views || 0, comments: Number(row.comments || 0) };
  }
  return stats;
}

async function contentStats(context) {
  return json({ stats: await readContentStats(context) });
}

async function siteRuntime(context) {
  const db = requireDatabase(context.env);
  const candidates = [];
  for (const sql of [
    "SELECT launched_at FROM site_runtime WHERE id = 1 LIMIT 1",
    "SELECT CAST(strftime('%s', MIN(applied_at)) AS INTEGER) * 1000 AS launched_at FROM d1_migrations",
    "SELECT MIN(applied_at) AS launched_at FROM fonscape_schema_migrations",
  ]) {
    try {
      const row = await db.prepare(sql).first();
      const value = Number(row?.launched_at);
      if (Number.isFinite(value) && value > 0) candidates.push(value);
    } catch {
      // Cloudflare and Turso use different migration ledgers. The missing
      // platform-specific table is expected; the current database still owns
      // the persisted site_runtime fallback.
    }
  }
  const launchedAt = Math.min(...candidates);
  if (!Number.isFinite(launchedAt)) {
    throw new ApiError(503, "站点运行时间尚未完成初始化。", "site_runtime_unavailable");
  }
  return json({ launchedAt });
}

async function articleStats(context) {
  return json({ stats: (await readContentStats(context)).post });
}

async function incrementContentView(context, target) {
  const db = requireDatabase(context.env);
  await assertTargetExists(db, target);
  await protectContentView(context, target);
  const now = Date.now();
  await db.prepare(`INSERT INTO content_metrics (content_type, content_slug, views, updated_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(content_type, content_slug) DO UPDATE SET views = views + 1, updated_at = excluded.updated_at`)
    .bind(target.type, target.slug, now).run();
  const row = await db.prepare("SELECT views FROM content_metrics WHERE content_type = ? AND content_slug = ? LIMIT 1")
    .bind(target.type, target.slug).first();
  return json({ type: target.type, slug: target.slug, views: Number(row?.views || 0) });
}

async function recordContentView(context) {
  const input = await readJson(context.request);
  return incrementContentView(context, validateTarget(input.type, input.slug));
}

async function recordArticleView(context, value) {
  return incrementContentView(context, validateTarget("post", value));
}

async function handle(context) {
  assertSameOrigin(context.request);
  const parts = routeParts(context);
  const method = context.request.method;
  const url = new URL(context.request.url);
  if (method === "OPTIONS") return new Response(null, { status: 204 });
  if (method === "GET" && parts[0] === "admin" && parts[1] === "setup" && parts.length === 2) return adminSetupStatus(context);
  if (method === "POST" && parts[0] === "admin" && parts[1] === "setup" && parts.length === 2) return setupAdmin(context);
  if (method === "GET" && parts[0] === "auth" && parts[1] === "session") return session(context);
  if (method === "POST" && parts[0] === "auth" && parts[1] === "register") return register(context);
  if (method === "POST" && parts[0] === "auth" && parts[1] === "login") return login(context);
  if (method === "POST" && parts[0] === "auth" && parts[1] === "logout") return logout(context);
  if (method === "PATCH" && parts[0] === "me" && parts.length === 1) return updateMe(context);
  if (method === "POST" && parts[0] === "me" && parts[1] === "avatar") return uploadAvatar(context);
  if (method === "GET" && parts[0] === "me" && parts[1] === "comments") return myComments(context);
  if (method === "GET" && parts[0] === "me" && parts[1] === "replies") return myReplies(context);
  if (method === "PATCH" && parts[0] === "me" && parts[1] === "notifications") return markReplyNotificationsRead(context);
  if (method === "GET" && parts[0] === "me" && parts[1] === "admin-comments") return adminReceivedComments(context);
  if (method === "PATCH" && parts[0] === "me" && parts[1] === "admin-comments") return markAdminCommentsRead(context);
  if (method === "GET" && parts[0] === "profile" && parts[1] && parts.length === 2) return profile(context, parts[1]);
  if ((method === "GET" || method === "HEAD") && parts[0] === "avatar" && parts[1]) return avatar(context, parts[1]);
  if (method === "GET" && parts[0] === "articles" && parts[1] === "stats" && parts.length === 2) return articleStats(context);
  if (method === "POST" && parts[0] === "articles" && parts[1] && parts[2] === "view" && parts.length === 3) return recordArticleView(context, parts[1]);
  if (method === "GET" && parts[0] === "content" && parts[1] === "stats" && parts.length === 2) return contentStats(context);
  if (method === "POST" && parts[0] === "content" && parts[1] === "view" && parts.length === 2) return recordContentView(context);
  if (method === "GET" && parts[0] === "site" && parts[1] === "runtime" && parts.length === 2) return siteRuntime(context);
  if (method === "GET" && parts[0] === "comments" && parts.length === 1) return listComments(context, url);
  if (method === "POST" && parts[0] === "comments" && parts.length === 1) return createComment(context);
  if (method === "DELETE" && parts[0] === "comments" && parts[1]) return deleteComment(context, parts[1]);
  throw new ApiError(404, "接口不存在。", "not_found");
}

export async function onRequest(context) {
  try {
    const response = await handle(context);
    const rateLimit = context.data.rateLimit;
    if (rateLimit) {
      response.headers.set("RateLimit-Limit", String(rateLimit.limit));
      response.headers.set("RateLimit-Remaining", String(rateLimit.remaining));
      response.headers.set("RateLimit-Reset", String(Math.ceil(rateLimit.resetAt / 1000)));
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(context.request.method)) scheduleMaintenance(context);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
