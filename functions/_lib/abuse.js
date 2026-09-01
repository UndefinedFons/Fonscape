import { isStaticContentTarget } from "../_generated/content-targets.js";
import { ApiError, requireDatabase, sha256 } from "./community.js";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const DEFAULT_ABUSE_LIMITS = Object.freeze({
  // Capacity values are emergency fuses, not ordinary user quotas.
  MAX_MEMBER_ACCOUNTS: 5000,
  MAX_TOTAL_COMMENTS: 1000000,
  MAX_COMMENTS_PER_USER: 50000,
  MAX_COMMENTS_PER_TARGET: 100000,
  MAX_ACTIVE_SESSIONS: 20,
  REGISTER_GLOBAL_DAILY: 100,
  REGISTER_NETWORK_DAILY: 20,
  REGISTER_IP_DAILY: 3,
  LOGIN_GLOBAL_15M: 500,
  LOGIN_GLOBAL_DAILY: 5000,
  LOGIN_IP_15M: 30,
  LOGIN_ACCOUNT_15M: 10,
  COMMENT_GLOBAL_HOURLY: 500,
  COMMENT_GLOBAL_DAILY: 5000,
  COMMENT_IP_10M: 20,
  COMMENT_USER_10M: 8,
  COMMENT_USER_DAILY: 60,
  AVATAR_GLOBAL_DAILY: 500,
  AVATAR_IP_HOURLY: 30,
  AVATAR_USER_DAILY: 8,
  PROFILE_USER_HOURLY: 20,
  VIEW_GLOBAL_HOURLY: 10000,
});

const RATE_LIMIT_SECRET_BYTES = 32;

export function limitFromEnv(env, name, fallback = DEFAULT_ABUSE_LIMITS[name]) {
  const configured = env?.[name];
  if (configured === undefined || configured === null || String(configured).trim() === "") return fallback;
  const value = Number(configured);
  const maximum = Math.max(1_000, fallback * 100);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new ApiError(503, "服务限频配置无效。", "rate_limit_invalid");
  }
  return value;
}

function randomSecret() {
  const bytes = new Uint8Array(RATE_LIMIT_SECRET_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function rateLimitSecret(context) {
  context.data ||= {};
  if (context.data.rateLimitSecret) return context.data.rateLimitSecret;
  const db = requireDatabase(context.env);
  const candidate = randomSecret();
  const initialized = await db.prepare(`UPDATE site_runtime
    SET rate_limit_secret = ?
    WHERE id = 1 AND (rate_limit_secret IS NULL OR rate_limit_secret = '')
    RETURNING rate_limit_secret`)
    .bind(candidate).run();
  const secret = String(
    initialized.results?.[0]?.rate_limit_secret
      || (await db.prepare("SELECT rate_limit_secret FROM site_runtime WHERE id = 1 LIMIT 1").first())?.rate_limit_secret
      || "",
  );
  if (secret.length < RATE_LIMIT_SECRET_BYTES) {
    throw new ApiError(503, "服务安全数据尚未完成初始化。", "rate_limit_unavailable");
  }
  context.data.rateLimitSecret = secret;
  return secret;
}

function ipv4Prefix(address) {
  const parts = address.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/u.test(part) || Number(part) > 255)) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}

function expandIpv6(address) {
  const clean = address.toLowerCase().split("%")[0];
  if (!clean.includes(":")) return null;
  const halves = clean.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves[1] ? halves[1].split(":") : [];
  const convertIpv4Tail = (parts) => {
    const last = parts.at(-1);
    const prefix = last && ipv4Prefix(last);
    if (!prefix) return parts;
    const octets = last.split(".").map(Number);
    return [...parts.slice(0, -1), ((octets[0] << 8) | octets[1]).toString(16), ((octets[2] << 8) | octets[3]).toString(16)];
  };
  const normalizedHead = convertIpv4Tail(head);
  const normalizedTail = convertIpv4Tail(tail);
  const missing = 8 - normalizedHead.length - normalizedTail.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const parts = halves.length === 2
    ? [...normalizedHead, ...Array(missing).fill("0"), ...normalizedTail]
    : normalizedHead;
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/u.test(part))) return null;
  return parts.map((part) => Number.parseInt(part, 16).toString(16));
}

export function networkPrefix(address) {
  const ipv4 = ipv4Prefix(address);
  if (ipv4) return ipv4;
  const ipv6 = expandIpv6(address);
  return ipv6 ? `${ipv6.slice(0, 4).join(":")}::/64` : "unknown";
}

export function clientSubjects(request) {
  const address = String(request.headers.get("CF-Connecting-IP") || "local").trim().slice(0, 96) || "local";
  return { address, network: networkPrefix(address) };
}

function rateLimitDecision(allowed, limit, count, windowStartedAt, windowMs, now) {
  const resetAt = windowStartedAt + windowMs;
  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt,
    retryAfterSeconds: allowed ? null : Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
}

export async function consumeFixedWindowDecision(db, key, limit, windowMs, now = Date.now()) {
  const resetBefore = now - windowMs;
  const result = await db.prepare(`INSERT INTO rate_limits (key, window_started_at, count, updated_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
      window_started_at = CASE WHEN rate_limits.window_started_at <= ? THEN excluded.window_started_at ELSE rate_limits.window_started_at END,
      count = CASE WHEN rate_limits.window_started_at <= ? THEN 1 ELSE rate_limits.count + 1 END,
      updated_at = excluded.updated_at
    WHERE rate_limits.window_started_at <= ? OR rate_limits.count < ?
    RETURNING window_started_at, count`)
    .bind(key, now, now, resetBefore, resetBefore, resetBefore, limit).run();
  const updated = result.results?.[0];
  if (updated) {
    return rateLimitDecision(true, limit, Number(updated.count), Number(updated.window_started_at), windowMs, now);
  }
  const current = await db.prepare("SELECT window_started_at, count FROM rate_limits WHERE key = ? LIMIT 1").bind(key).first();
  if (Number(result.meta?.changes || 0) === 1 && !current) {
    return rateLimitDecision(true, limit, 1, now, windowMs, now);
  }
  if (!current) return rateLimitDecision(false, limit, limit, now, windowMs, now);
  return rateLimitDecision(false, limit, Number(current.count), Number(current.window_started_at), windowMs, now);
}

export async function consumeFixedWindow(db, key, limit, windowMs, now = Date.now()) {
  return (await consumeFixedWindowDecision(db, key, limit, windowMs, now)).allowed;
}

async function policyKey(context, action, scope, subject, windowMs) {
  const secret = await rateLimitSecret(context);
  return sha256(`${secret}:${action}:${scope}:${windowMs}:${subject}`);
}

async function enforcePolicies(context, action, policies) {
  const db = requireDatabase(context.env);
  context.data ||= {};
  for (const policy of policies) {
    const limit = limitFromEnv(context.env, policy.limitName, policy.limit);
    const key = await policyKey(context, action, policy.scope, policy.subject, policy.windowMs);
    const decision = await consumeFixedWindowDecision(db, key, limit, policy.windowMs);
    const current = context.data.rateLimit;
    if (!current || decision.remaining / decision.limit < current.remaining / current.limit
      || (decision.remaining / decision.limit === current.remaining / current.limit && decision.resetAt < current.resetAt)) {
      context.data.rateLimit = decision;
    }
    if (decision.allowed) continue;
    console.warn(JSON.stringify({ event: "abuse_limit_blocked", action, scope: policy.scope, key: key.slice(0, 12) }));
    throw new ApiError(429, "操作太频繁，请稍后再试。", "rate_limited", {
      "RateLimit-Limit": String(decision.limit),
      "RateLimit-Remaining": String(decision.remaining),
      "RateLimit-Reset": String(Math.ceil(decision.resetAt / 1000)),
      "Retry-After": String(decision.retryAfterSeconds),
    });
  }
}

export async function protectRegistration(context) {
  const { address, network } = clientSubjects(context.request);
  await enforcePolicies(context, "register", [
    { scope: "ip-day", subject: address, limitName: "REGISTER_IP_DAILY", limit: DEFAULT_ABUSE_LIMITS.REGISTER_IP_DAILY, windowMs: DAY },
    { scope: "network-day", subject: network, limitName: "REGISTER_NETWORK_DAILY", limit: DEFAULT_ABUSE_LIMITS.REGISTER_NETWORK_DAILY, windowMs: DAY },
    { scope: "global-day", subject: "global", limitName: "REGISTER_GLOBAL_DAILY", limit: DEFAULT_ABUSE_LIMITS.REGISTER_GLOBAL_DAILY, windowMs: DAY },
  ]);
}

export async function protectAdminBootstrap(context) {
  const { address } = clientSubjects(context.request);
  await enforcePolicies(context, "admin-bootstrap", [
    { scope: "ip-day", subject: address, limit: 5, windowMs: DAY },
    { scope: "global-day", subject: "global", limit: 20, windowMs: DAY },
  ]);
}

export async function protectLogin(context, username) {
  const { address } = clientSubjects(context.request);
  await enforcePolicies(context, "login", [
    { scope: "account-15m", subject: username.toLowerCase(), limitName: "LOGIN_ACCOUNT_15M", limit: DEFAULT_ABUSE_LIMITS.LOGIN_ACCOUNT_15M, windowMs: 15 * MINUTE },
    { scope: "ip-15m", subject: address, limitName: "LOGIN_IP_15M", limit: DEFAULT_ABUSE_LIMITS.LOGIN_IP_15M, windowMs: 15 * MINUTE },
    { scope: "global-15m", subject: "global", limitName: "LOGIN_GLOBAL_15M", limit: DEFAULT_ABUSE_LIMITS.LOGIN_GLOBAL_15M, windowMs: 15 * MINUTE },
    { scope: "global-day", subject: "global", limitName: "LOGIN_GLOBAL_DAILY", limit: DEFAULT_ABUSE_LIMITS.LOGIN_GLOBAL_DAILY, windowMs: DAY },
  ]);
}

export async function protectComment(context, user) {
  if (user.role === "admin") return;
  const { address } = clientSubjects(context.request);
  await enforcePolicies(context, "comment", [
    { scope: "user-10m", subject: user.id, limitName: "COMMENT_USER_10M", limit: DEFAULT_ABUSE_LIMITS.COMMENT_USER_10M, windowMs: 10 * MINUTE },
    { scope: "user-day", subject: user.id, limitName: "COMMENT_USER_DAILY", limit: DEFAULT_ABUSE_LIMITS.COMMENT_USER_DAILY, windowMs: DAY },
    { scope: "ip-10m", subject: address, limitName: "COMMENT_IP_10M", limit: DEFAULT_ABUSE_LIMITS.COMMENT_IP_10M, windowMs: 10 * MINUTE },
    { scope: "global-hour", subject: "global", limitName: "COMMENT_GLOBAL_HOURLY", limit: DEFAULT_ABUSE_LIMITS.COMMENT_GLOBAL_HOURLY, windowMs: HOUR },
    { scope: "global-day", subject: "global", limitName: "COMMENT_GLOBAL_DAILY", limit: DEFAULT_ABUSE_LIMITS.COMMENT_GLOBAL_DAILY, windowMs: DAY },
  ]);
}

export async function protectAvatar(context, user) {
  if (user.role === "admin") return;
  const { address } = clientSubjects(context.request);
  await enforcePolicies(context, "avatar", [
    { scope: "user-day", subject: user.id, limitName: "AVATAR_USER_DAILY", limit: DEFAULT_ABUSE_LIMITS.AVATAR_USER_DAILY, windowMs: DAY },
    { scope: "ip-hour", subject: address, limitName: "AVATAR_IP_HOURLY", limit: DEFAULT_ABUSE_LIMITS.AVATAR_IP_HOURLY, windowMs: HOUR },
    { scope: "global-day", subject: "global", limitName: "AVATAR_GLOBAL_DAILY", limit: DEFAULT_ABUSE_LIMITS.AVATAR_GLOBAL_DAILY, windowMs: DAY },
  ]);
}

export async function protectProfileUpdate(context, user) {
  if (user.role === "admin") return;
  await enforcePolicies(context, "profile", [
    { scope: "user-hour", subject: user.id, limitName: "PROFILE_USER_HOURLY", limit: DEFAULT_ABUSE_LIMITS.PROFILE_USER_HOURLY, windowMs: HOUR },
  ]);
}

export async function protectContentView(context) {
  await enforcePolicies(context, "content-view", [
    { scope: "global-hour", subject: "global", limitName: "VIEW_GLOBAL_HOURLY", limit: DEFAULT_ABUSE_LIMITS.VIEW_GLOBAL_HOURLY, windowMs: HOUR },
  ]);
}

async function reserveStorageCounter(db, metric, amount, maximum, now = Date.now()) {
  if (!amount) return true;
  const result = await db.prepare(`INSERT INTO storage_counters (metric, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(metric) DO UPDATE SET value = storage_counters.value + excluded.value, updated_at = excluded.updated_at
    WHERE storage_counters.value + excluded.value BETWEEN 0 AND ?`)
    .bind(metric, amount, now, maximum).run();
  return Number(result.meta?.changes || 0) === 1;
}

async function rollbackStorageCounter(db, metric, amount) {
  if (amount) await db.prepare(`UPDATE storage_counters
    SET value = MAX(0, value - ?), updated_at = ?
    WHERE metric = ?`).bind(amount, Date.now(), metric).run();
}

export async function reserveRegistrationSlot(db, env) {
  const maximum = limitFromEnv(env, "MAX_MEMBER_ACCOUNTS");
  if (!await reserveStorageCounter(db, "member_accounts", 1, maximum)) {
    throw new ApiError(503, "注册名额暂时已满。", "registration_capacity_reached");
  }
  return () => rollbackStorageCounter(db, "member_accounts", 1);
}

/**
 * Insert and validate one comment in a single SQLite write statement. D1 and
 * libSQL serialize the conditional INSERT together with its counter triggers,
 * so concurrent writers cannot pass a stale read-side capacity check. The
 * comment rate-limit windows remain enforced before this capacity write.
 */
export async function insertCommentAtomically(db, {
  id,
  userId,
  role,
  target,
  body,
  parentId = null,
  replyToUserId = null,
  replyToCommentId = null,
  now = Date.now(),
}, env) {
  const userMaximum = limitFromEnv(env, "MAX_COMMENTS_PER_USER");
  const targetMaximum = limitFromEnv(env, "MAX_COMMENTS_PER_TARGET");
  const totalMaximum = limitFromEnv(env, "MAX_TOTAL_COMMENTS");
  const result = await db.prepare(`INSERT INTO comments
    (id, content_type, content_slug, parent_id, reply_to_user_id,
      reply_to_comment_id, user_id, body, status, created_at, updated_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?
    WHERE EXISTS (
      SELECT 1 FROM storage_counters
      WHERE metric = 'comments_created' AND value < ?
    )
      AND (? = 'admin' OR EXISTS (
        SELECT 1 FROM account_usage
        WHERE user_id = ? AND comments_created < ?
      ))
      AND COALESCE((
        SELECT active_comments FROM comment_target_usage
        WHERE content_type = ? AND content_slug = ?
      ), 0) < ?`)
    .bind(
      id, target.type, target.slug, parentId, replyToUserId,
      replyToCommentId, userId, body, now, now,
      totalMaximum, role, userId, userMaximum,
      target.type, target.slug, targetMaximum,
    ).run();
  if (Number(result.meta?.changes || 0) > 0) return;

  const state = await db.prepare(`SELECT
    CASE WHEN ? != 'admin' AND NOT EXISTS (
      SELECT 1 FROM account_usage WHERE user_id = ? AND comments_created < ?
    ) THEN 1 ELSE 0 END AS user_full,
    CASE WHEN COALESCE((
      SELECT active_comments FROM comment_target_usage
      WHERE content_type = ? AND content_slug = ?
    ), 0) >= ? THEN 1 ELSE 0 END AS target_full,
    CASE WHEN COALESCE((
      SELECT value FROM storage_counters WHERE metric = 'comments_created'
    ), ?) >= ? THEN 1 ELSE 0 END AS total_full`)
    .bind(
      role, userId, userMaximum,
      target.type, target.slug, targetMaximum,
      totalMaximum, totalMaximum,
    ).first();
  if (Number(state?.user_full || 0)) throw new ApiError(429, "该账户已达到评论存储上限。", "comment_storage_limit");
  if (Number(state?.target_full || 0)) throw new ApiError(429, "该页面的评论数量已达到上限。", "comment_target_full");
  throw new ApiError(503, "评论区暂时无法接收更多内容。", "comment_capacity_reached");
}

export async function assertTargetExists(db, target) {
  if (isStaticContentTarget(target.type, target.slug)) return;
  throw new ApiError(404, "目标内容不存在。", "content_not_found");
}

export async function cleanupRuntimeData(db, now = Date.now()) {
  const [sessions, rateLimits] = await db.batch([
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
    db.prepare("DELETE FROM rate_limits WHERE updated_at < ?").bind(now - 8 * DAY),
  ]);
  return {
    expiredSessions: Number(sessions.meta?.changes || 0),
    staleRateLimits: Number(rateLimits.meta?.changes || 0),
  };
}

// Trigger-maintained aggregates are authoritative during normal operation.
// This full reconciliation is intentionally reserved for scheduled recovery;
// it must never make an ordinary API write scan every runtime table.
export async function reconcileRuntimeCounters(db, now = Date.now()) {
  const [accountUsage] = await db.batch([
    db.prepare(`UPDATE account_usage
      SET comments_created = (
        SELECT COUNT(*) FROM comments
        WHERE comments.user_id = account_usage.user_id AND comments.status != 'deleted'
      ), updated_at = ?`).bind(now),
    db.prepare(`INSERT INTO storage_counters (metric, value, updated_at)
      VALUES ('member_accounts', (SELECT COUNT(*) FROM users WHERE role = 'member'), ?)
      ON CONFLICT(metric) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(now),
    db.prepare(`INSERT INTO storage_counters (metric, value, updated_at)
      VALUES ('comments_created', (SELECT COUNT(*) FROM comments WHERE status != 'deleted'), ?)
      ON CONFLICT(metric) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(now),
    db.prepare("DELETE FROM comment_target_usage"),
    db.prepare(`INSERT INTO comment_target_usage
      (content_type, content_slug, active_comments, published_comments, updated_at)
      SELECT content_type, content_slug,
        SUM(CASE WHEN status != 'deleted' THEN 1 ELSE 0 END),
        SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END),
        ?
      FROM comments
      GROUP BY content_type, content_slug`).bind(now),
    db.prepare(`INSERT INTO storage_counters (metric, value, updated_at)
      VALUES ('avatar_bytes', (SELECT COALESCE(SUM(byte_size), 0) FROM user_avatars), ?)
      ON CONFLICT(metric) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(now),
  ]);
  return {
    reconciledAccounts: Number(accountUsage.meta?.changes || 0),
  };
}

async function maintenance(context) {
  const db = requireDatabase(context.env);
  const now = Date.now();
  const key = await policyKey(context, "maintenance", "global", "global", 6 * HOUR);
  if (!await consumeFixedWindow(db, key, 1, 6 * HOUR, now)) return;
  await cleanupRuntimeData(db, now);
}

export function scheduleMaintenance(context) {
  context.waitUntil(maintenance(context).catch((error) => {
    console.error(JSON.stringify({ event: "background_maintenance_failed", error: error instanceof Error ? error.message : String(error) }));
  }));
}
