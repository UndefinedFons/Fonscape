import {
  ApiError,
  clearSessionCookie,
  constantTimeEqual,
  createSession,
  currentUser,
  destroySession,
  hashPassword,
  json,
  normalizeNickname,
  normalizeUsername,
  publicUser,
  readJson,
  requireDatabase,
  validatePassword,
} from "../community.js";
import {
  limitFromEnv,
  protectAdminBootstrap,
  protectLogin,
  protectRegistration,
  reserveRegistrationSlot,
} from "../abuse.js";
import { adminSetupState, isUsernameConflict, userById, USER_FIELDS } from "./_shared.js";

export async function session(context) {
  const user = await currentUser(context);
  if (!user) return json({ user: null });
  if (user.status === "banned") {
    const db = requireDatabase(context.env);
    await destroySession(db, context.request);
    return json({ user: null, accountNotice: "该账户已被管理员停用，当前登录已退出。" }, 200, { "Set-Cookie": clearSessionCookie(context.request) });
  }
  const db = requireDatabase(context.env);
  const notificationsSeenAt = Number(user.notifications_seen_at || user.created_at || 0);
  const adminCommentsSeenAt = Number(user.admin_comments_seen_at || user.created_at || 0);
  const [unreadReplies, unreadAdminComments] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS count FROM comments c
      WHERE c.reply_to_user_id = ? AND c.user_id != ? AND c.status = 'published' AND c.created_at > ?
        AND NOT EXISTS (SELECT 1 FROM comment_notification_reads notification_read
          WHERE notification_read.user_id = ? AND notification_read.comment_id = c.id)`)
      .bind(user.id, user.id, notificationsSeenAt, user.id),
    db.prepare(`SELECT COUNT(*) AS count FROM comments c
      WHERE ? = 'admin' AND c.user_id != ? AND c.parent_id IS NULL AND c.status = 'published' AND c.created_at > ?
        AND NOT EXISTS (SELECT 1 FROM comment_notification_reads notification_read
          WHERE notification_read.user_id = ? AND notification_read.comment_id = c.id)`)
      .bind(user.role, user.id, adminCommentsSeenAt, user.id),
  ]);
  const publicViewer = publicUser({
    ...user,
    unread_replies: unreadReplies.results?.[0]?.count || 0,
    unread_admin_comments: unreadAdminComments.results?.[0]?.count || 0,
  });
  return json({ user: publicViewer });
}

export async function register(context) {
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
    try {
      await releaseRegistrationSlot();
    } catch (rollbackError) {
      console.error(JSON.stringify({ event: "registration_capacity_rollback_failed", error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError) }));
    }
    if (isUsernameConflict(error)) throw new ApiError(409, "这个账户名已经被使用。", "username_exists");
    throw error;
  }
  const auth = await createSession(db, id, context.request, limitFromEnv(context.env, "MAX_ACTIVE_SESSIONS"));
  const user = await userById(db, id);
  return json({ user: publicUser(user) }, 201, { "Set-Cookie": auth.cookie });
}

export async function adminSetupStatus(context) {
  return json(await adminSetupState(requireDatabase(context.env)));
}

export async function setupAdmin(context) {
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
  let results;
  try {
    results = await db.batch([
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
  } catch (error) {
    if (isUsernameConflict(error)) throw new ApiError(409, "这个账户名已经被使用。", "username_exists");
    throw error;
  }
  if (Number(results[1]?.meta?.changes || 0) !== 1) {
    throw new ApiError(409, "管理员账户已经完成初始化。", "admin_already_initialized");
  }
  const auth = await createSession(db, id, context.request, limitFromEnv(context.env, "MAX_ACTIVE_SESSIONS"));
  const user = await userById(db, id);
  return json({ user: publicUser(user) }, 201, { "Set-Cookie": auth.cookie });
}

export async function login(context) {
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
  return json({ user: publicUser(user) }, 200, { "Set-Cookie": auth.cookie });
}

export async function logout(context) {
  const db = requireDatabase(context.env);
  await destroySession(db, context.request);
  return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(context.request) });
}
