import { isStaticContentTarget } from "../../_generated/content-targets.js";
import { ApiError, sha256 } from "../community.js";
import {
  commentPolicyDefinitions,
  limitFromEnv,
  rateLimitDecision,
  rateLimitSecret,
} from "./limits.js";

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

export async function insertCommentWithRateLimitsAtomically(db, {
  id,
  userId,
  role,
  target,
  body,
  parentId = null,
  replyToUserId = null,
  replyToCommentId = null,
  requestHash,
  now = Date.now(),
  env,
}, policies) {
  const claimToken = crypto.randomUUID();
  const userMaximum = limitFromEnv(env, "MAX_COMMENTS_PER_USER");
  const targetMaximum = limitFromEnv(env, "MAX_COMMENTS_PER_TARGET");
  const totalMaximum = limitFromEnv(env, "MAX_TOTAL_COMMENTS");
  const rateReadyClause = policies.length
    ? `AND (SELECT COUNT(*) FROM rate_limits WHERE key IN (${policies.map(() => "?").join(", ")})
      AND comment_mutation_token = ?) = ?`
    : "";
  const rateReadyBindings = policies.length
    ? [...policies.map((policy) => policy.key), claimToken, policies.length]
    : [];
  const statements = [db.prepare(`INSERT INTO comment_mutations
    (id, user_id, request_hash, claim_token, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', ?, ?)
    ON CONFLICT(id) DO NOTHING`).bind(id, userId, requestHash, claimToken, now, now)];

  for (const policy of policies) {
    const resetBefore = now - policy.windowMs;
    statements.push(db.prepare(`INSERT INTO rate_limits (key, window_started_at, count, updated_at, comment_mutation_token)
      SELECT ?, ?, 1, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM comment_mutations
        WHERE id = ? AND claim_token = ? AND status = 'pending'
      ) AND NOT EXISTS (SELECT 1 FROM comments WHERE id = ?)
      ON CONFLICT(key) DO UPDATE SET
        window_started_at = CASE WHEN rate_limits.window_started_at <= ? THEN excluded.window_started_at ELSE rate_limits.window_started_at END,
        count = CASE WHEN rate_limits.window_started_at <= ? THEN 1 ELSE rate_limits.count + 1 END,
        updated_at = excluded.updated_at,
        comment_mutation_token = excluded.comment_mutation_token
      WHERE rate_limits.window_started_at <= ? OR rate_limits.count < ?
      RETURNING window_started_at, count`).bind(
      policy.key, now, now, claimToken, id, claimToken, id,
      resetBefore, resetBefore, resetBefore, policy.limit,
    ));
  }

  statements.push(db.prepare(`INSERT INTO comments
    (id, content_type, content_slug, parent_id, reply_to_user_id,
      reply_to_comment_id, user_id, body, status, created_at, updated_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?
    WHERE EXISTS (
      SELECT 1 FROM comment_mutations
      WHERE id = ? AND claim_token = ? AND status = 'pending'
    ) AND NOT EXISTS (SELECT 1 FROM comments WHERE id = ?)
      AND EXISTS (
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
      ), 0) < ?
      ${rateReadyClause}`).bind(
    id, target.type, target.slug, parentId, replyToUserId,
    replyToCommentId, userId, body, now, now,
    id, claimToken, id, totalMaximum, role, userId, userMaximum,
    target.type, target.slug, targetMaximum,
    ...rateReadyBindings,
  ));
  // The CHECK constraint deliberately aborts this batch when the claimed
  // mutation could not create its comment. That rolls back every rate-window
  // write in the same D1/libSQL transaction.
  statements.push(db.prepare(`UPDATE comment_mutations
    SET status = CASE WHEN EXISTS (SELECT 1 FROM comments WHERE id = ?) THEN 'completed' ELSE 'failed' END,
        updated_at = ?
    WHERE id = ? AND claim_token = ? AND status = 'pending'`).bind(id, now, id, claimToken));

  let results;
  try {
    results = await db.batch(statements);
  } catch (error) {
    if (isCommentMutationRollback(error)) throw new ApiError(503, "评论区暂时无法接收更多内容。", "comment_mutation_not_created");
    throw error;
  }
  const rateLimit = policies.reduce((current, policy, index) => {
    const row = results[index + 1]?.results?.[0];
    if (!row) return current;
    const decision = rateLimitDecision(true, policy.limit, Number(row.count), Number(row.window_started_at), policy.windowMs, now);
    if (!current || decision.remaining / decision.limit < current.remaining / current.limit
      || (decision.remaining / decision.limit === current.remaining / current.limit && decision.resetAt < current.resetAt)) return decision;
    return current;
  }, null);
  return {
    created: Number(results[policies.length + 1]?.meta?.changes || 0),
    rateLimit,
  };
}

export function isCommentMutationRollback(error) {
  const code = String(error?.code || "");
  const message = error instanceof Error ? error.message : String(error);
  return /SQLITE_CONSTRAINT(?:_CHECK)?/iu.test(code)
    && /comment_mutations|pending|completed/iu.test(message);
}

export async function prepareCommentRatePolicies(context, user) {
  const definitions = commentPolicyDefinitions(context, user);
  const secret = definitions.length ? await rateLimitSecret(context) : "";
  return Promise.all(definitions.map(async (policy) => ({
    ...policy,
    limit: limitFromEnv(context.env, policy.limitName, policy.limit),
    key: await sha256(`${secret}:comment:${policy.scope}:${policy.windowMs}:${policy.subject}`),
  })));
}

export async function commentCapacityFailure(db, { role, userId, target, env }) {
  const userMaximum = limitFromEnv(env, "MAX_COMMENTS_PER_USER");
  const targetMaximum = limitFromEnv(env, "MAX_COMMENTS_PER_TARGET");
  const totalMaximum = limitFromEnv(env, "MAX_TOTAL_COMMENTS");
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
    .bind(role, userId, userMaximum, target.type, target.slug, targetMaximum, totalMaximum, totalMaximum).first();
  if (Number(state?.user_full || 0)) return { status: 429, message: "该账户已达到评论存储上限。", code: "comment_storage_limit" };
  if (Number(state?.target_full || 0)) return { status: 429, message: "该页面的评论数量已达到上限。", code: "comment_target_full" };
  if (Number(state?.total_full || 0)) return { status: 503, message: "评论区暂时无法接收更多内容。", code: "comment_capacity_reached" };
  return null;
}

export async function commentRateLimitFailure(db, policies, now = Date.now()) {
  for (const policy of policies) {
    const row = await db.prepare("SELECT window_started_at, count FROM rate_limits WHERE key = ? LIMIT 1").bind(policy.key).first();
    const windowStartedAt = Number(row?.window_started_at);
    const count = Number(row?.count);
    if (!Number.isSafeInteger(windowStartedAt) || windowStartedAt <= now - policy.windowMs || count < policy.limit) continue;
    return rateLimitDecision(false, policy.limit, count, windowStartedAt, policy.windowMs, now);
  }
  return null;
}

export async function assertTargetExists(db, target) {
  if (isStaticContentTarget(target.type, target.slug)) return;
  throw new ApiError(404, "目标内容不存在。", "content_not_found");
}
