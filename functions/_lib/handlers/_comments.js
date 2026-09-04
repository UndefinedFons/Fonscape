import {
  ApiError,
  commentRow,
  currentUser,
  json,
  normalizeComment,
  publicUser,
  readJson,
  requireDatabase,
  requireAdmin,
  requireUser,
  sha256,
  validateTarget,
} from "../community.js";
import {
  assertTargetExists,
  commentCapacityFailure,
  commentRateLimitFailure,
  insertCommentWithRateLimitsAtomically,
  prepareCommentRatePolicies,
} from "../abuse.js";

const commentSelect = `SELECT c.*, u.nickname, u.role AS user_role,
  ua.user_id AS avatar_user_id, ua.updated_at AS avatar_updated_at,
  reply.nickname AS reply_to_nickname,
  reply_avatar.user_id AS reply_to_avatar_user_id, reply_avatar.updated_at AS reply_to_avatar_updated_at
  FROM comments c JOIN users u ON u.id = c.user_id
  LEFT JOIN user_avatars ua ON ua.user_id = u.id
  LEFT JOIN users reply ON reply.id = c.reply_to_user_id
  LEFT JOIN user_avatars reply_avatar ON reply_avatar.user_id = reply.id`;

const COMMENT_PAGE_SIZE = 20;
const COMMENT_PAGE_MAX = 100000;

function parseCommentPage(value) {
  const normalized = String(value || "1").trim();
  if (!/^\d+$/u.test(normalized)) throw new ApiError(400, "评论页码无效。", "invalid_comment_page");
  const page = Number(normalized);
  if (!Number.isSafeInteger(page) || page < 1 || page > COMMENT_PAGE_MAX) {
    throw new ApiError(400, "评论页码无效。", "invalid_comment_page");
  }
  return page;
}

function normalizeCommentMutationId(value) {
  if (value === undefined || value === null || value === "") return crypto.randomUUID();
  const id = String(value).trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id)) {
    throw new ApiError(400, "评论提交标识无效。", "invalid_comment_mutation_id");
  }
  return id;
}

function normalizeNotificationId(value) {
  const id = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/u.test(id)) throw new ApiError(400, "通知标识无效。", "invalid_notification_id");
  return id;
}

function commentMutationMatches(row, { userId, target, body, requestedParentId }) {
  return row
    && row.status === "published"
    && row.user_id === userId
    && row.content_type === target.type
    && row.content_slug === target.slug
    && row.body === body
    && (row.reply_to_comment_id || null) === requestedParentId;
}

async function commentById(db, id) {
  return db.prepare(`${commentSelect} WHERE c.id = ? LIMIT 1`).bind(id).first();
}

export async function listComments(context, url) {
  const db = requireDatabase(context.env);
  const target = validateTarget(url.searchParams.get("type"), url.searchParams.get("slug"));
  await assertTargetExists(db, target);
  const viewer = await currentUser(context);
  const viewerRole = viewer ? publicUser(viewer).role : null;
  const locatedId = String(url.searchParams.get("comment") || "").trim();
  const requestedPage = parseCommentPage(url.searchParams.get("page"));
  let locatedRoot = null;
  if (locatedId && /^[A-Za-z0-9-]{1,64}$/u.test(locatedId)) {
    const located = await db.prepare(`${commentSelect} WHERE c.id = ? AND c.content_type = ? AND c.content_slug = ? AND c.status = 'published'
      AND (c.parent_id IS NULL OR EXISTS (SELECT 1 FROM comments parent WHERE parent.id = c.parent_id AND parent.status = 'published')) LIMIT 1`)
      .bind(locatedId, target.type, target.slug).first();
    if (located?.parent_id) {
      locatedRoot = await db.prepare(`${commentSelect} WHERE c.id = ? AND c.content_type = ? AND c.content_slug = ?
        AND c.status = 'published' AND c.parent_id IS NULL LIMIT 1`)
        .bind(located.parent_id, target.type, target.slug).first();
    } else if (located) {
      locatedRoot = located;
    }
  }

  const [totalResult, threadResult] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS count FROM comments c
      WHERE c.content_type = ? AND c.content_slug = ? AND c.status = 'published'
        AND (c.parent_id IS NULL OR EXISTS (
          SELECT 1 FROM comments parent WHERE parent.id = c.parent_id AND parent.status = 'published'
        ))`).bind(target.type, target.slug),
    db.prepare(`SELECT COUNT(*) AS count FROM comments c
      WHERE c.content_type = ? AND c.content_slug = ? AND c.status = 'published' AND c.parent_id IS NULL`)
      .bind(target.type, target.slug),
  ]);
  const total = Number(totalResult?.results?.[0]?.count || 0);
  const threadTotal = Number(threadResult?.results?.[0]?.count || 0);
  const totalPages = Math.max(1, Math.ceil(threadTotal / COMMENT_PAGE_SIZE));
  let page = Math.min(requestedPage, totalPages);
  if (locatedRoot) {
    const newerRoots = await db.prepare(`SELECT COUNT(*) AS count FROM comments c
      WHERE c.content_type = ? AND c.content_slug = ? AND c.status = 'published' AND c.parent_id IS NULL
        AND (c.created_at > ? OR (c.created_at = ? AND c.id > ?))`)
      .bind(target.type, target.slug, locatedRoot.created_at, locatedRoot.created_at, locatedRoot.id).first();
    page = Math.min(totalPages, Math.floor(Number(newerRoots?.count || 0) / COMMENT_PAGE_SIZE) + 1);
  }

  const rootResult = await db.prepare(`${commentSelect} WHERE c.content_type = ? AND c.content_slug = ?
    AND c.status = 'published' AND c.parent_id IS NULL
    ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?`)
    .bind(target.type, target.slug, COMMENT_PAGE_SIZE, (page - 1) * COMMENT_PAGE_SIZE).all();
  const rootRows = rootResult.results || [];
  let replyRows = [];
  if (rootRows.length) {
    const rootIds = rootRows.map((row) => row.id);
    const placeholders = rootIds.map(() => "?").join(", ");
    const replies = await db.prepare(`${commentSelect} WHERE c.content_type = ? AND c.content_slug = ?
      AND c.status = 'published' AND c.parent_id IN (${placeholders})
      ORDER BY c.created_at ASC, c.id ASC`)
      .bind(target.type, target.slug, ...rootIds).all();
    replyRows = replies.results || [];
  }
  return json({
    comments: [...rootRows, ...replyRows].map((row) => commentRow(row, viewer?.id || null, viewerRole)),
    total,
    page,
    pageSize: COMMENT_PAGE_SIZE,
    totalPages,
  });
}

export async function createComment(context) {
  const user = await requireUser(context);
  const db = requireDatabase(context.env);
  const input = await readJson(context.request);
  const target = validateTarget(input.type, input.slug);
  const body = normalizeComment(input.body);
  const requestedParentId = input.parentId ? String(input.parentId) : null;
  const id = normalizeCommentMutationId(input.clientMutationId);
  await assertTargetExists(db, target);
  const existing = await commentById(db, id);
  if (existing) {
    if (!commentMutationMatches(existing, { userId: user.id, target, body, requestedParentId })) {
      throw new ApiError(409, "评论提交标识已被其他内容使用。", "comment_mutation_conflict");
    }
    return json({ comment: commentRow(existing, user.id, publicUser(user).role), replayed: true });
  }
  let parentId = null;
  let replyToUserId = null;
  let replyToCommentId = null;
  if (requestedParentId) {
    const parent = await db.prepare("SELECT id, parent_id, user_id, content_type, content_slug, status FROM comments WHERE id = ? LIMIT 1").bind(requestedParentId).first();
    if (!parent || parent.status !== "published" || parent.content_type !== target.type || parent.content_slug !== target.slug) throw new ApiError(400, "回复的评论不存在。", "invalid_parent");
    parentId = parent.parent_id || parent.id;
    replyToUserId = parent.user_id;
    replyToCommentId = parent.id;
  }
  const now = Date.now();
  const requestHash = await sha256(JSON.stringify([user.id, target.type, target.slug, body, requestedParentId]));
  const policies = await prepareCommentRatePolicies(context, user);
  try {
    const result = await insertCommentWithRateLimitsAtomically(db, {
      id,
      userId: user.id,
      role: user.role,
      target,
      body,
      parentId,
      replyToUserId,
      replyToCommentId,
      requestHash,
      now,
      env: context.env,
    }, policies);
    if (result.rateLimit) {
      context.data ||= {};
      context.data.rateLimit = result.rateLimit;
    }
    const row = await commentById(db, id);
    if (!row) throw new ApiError(503, "评论区暂时无法接收更多内容。", "comment_mutation_in_progress");
    if (!commentMutationMatches(row, { userId: user.id, target, body, requestedParentId })) {
      throw new ApiError(409, "评论提交标识已被其他内容使用。", "comment_mutation_conflict");
    }
    const created = Number(result.created || 0) > 0;
    return json({ comment: commentRow(row, user.id, publicUser(user).role), ...(created ? {} : { replayed: true }) }, created ? 201 : 200);
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== "comment_mutation_not_created") throw error;
    const capacity = await commentCapacityFailure(db, { role: user.role, userId: user.id, target, env: context.env });
    if (capacity) throw new ApiError(capacity.status, capacity.message, capacity.code);
    const rateLimit = await commentRateLimitFailure(db, policies, now);
    if (rateLimit) throw new ApiError(429, "操作太频繁，请稍后再试。", "rate_limited", {
      "RateLimit-Limit": String(rateLimit.limit),
      "RateLimit-Remaining": String(rateLimit.remaining),
      "RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1000)),
      "Retry-After": String(rateLimit.retryAfterSeconds),
    });
    throw new ApiError(503, "评论区暂时无法接收更多内容。", "comment_capacity_reached");
  }
}

export async function deleteComment(context, commentId) {
  const user = await requireUser(context);
  const db = requireDatabase(context.env);
  const existing = await db.prepare("SELECT user_id, status FROM comments WHERE id = ? LIMIT 1").bind(commentId).first();
  if (!existing) throw new ApiError(404, "评论不存在。", "comment_not_found");
  const viewer = publicUser(user);
  if (existing.user_id !== user.id && viewer.role !== "admin") throw new ApiError(403, "不能删除其他人的评论。", "not_comment_owner");
  if (existing.status === "deleted") return json({ ok: true });
  const now = Date.now();
  await db.prepare("UPDATE comments SET body = '[已删除]', status = 'deleted', updated_at = ?, moderated_at = ?, moderated_by = ? WHERE id = ? AND status != 'deleted'")
    .bind(now, viewer.role === "admin" ? now : null, viewer.role === "admin" ? user.id : null, commentId).run();
  return json({ ok: true });
}

export async function myComments(context) {
  const user = await requireUser(context);
  const db = requireDatabase(context.env);
  const result = await db.prepare(`${commentSelect} WHERE c.user_id = ? ORDER BY c.created_at DESC LIMIT 100`).bind(user.id).all();
  return json({ comments: result.results.map((row) => ({ ...commentRow(row, user.id), contentType: row.content_type, contentSlug: row.content_slug })) });
}

export async function myReplies(context) {
  const user = await requireUser(context);
  const db = requireDatabase(context.env);
  const seenAt = Number(user.notifications_seen_at || user.created_at || 0);
  const result = await db.prepare(`SELECT c.*, u.nickname, u.role AS user_role,
    ua.user_id AS avatar_user_id, ua.updated_at AS avatar_updated_at,
    target.body AS replied_to_body, target.id AS replied_to_comment_id,
    notification_read.comment_id AS notification_read_id
    FROM comments c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN user_avatars ua ON ua.user_id = u.id
    LEFT JOIN comments target ON target.id = COALESCE(c.reply_to_comment_id, c.parent_id)
    LEFT JOIN comment_notification_reads notification_read ON notification_read.user_id = ? AND notification_read.comment_id = c.id
    WHERE c.reply_to_user_id = ? AND c.user_id != ? AND c.status = 'published'
    ORDER BY c.created_at DESC LIMIT 100`).bind(user.id, user.id, user.id).all();
  const rows = result.results || [];
  return json({ replies: rows.map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    contentType: row.content_type,
    contentSlug: row.content_slug,
    repliedToBody: row.replied_to_body || "",
    repliedToCommentId: row.replied_to_comment_id || row.parent_id,
    unread: Number(row.created_at) > seenAt && !row.notification_read_id,
    author: {
      id: row.user_id,
      nickname: row.nickname,
      role: row.user_role,
      avatarUrl: row.avatar_user_id === row.user_id && row.avatar_updated_at ? `/api/avatar/${row.user_id}?v=${row.avatar_updated_at}` : null,
      avatarUpdatedAt: row.avatar_user_id === row.user_id && row.avatar_updated_at ? Number(row.avatar_updated_at) : null,
    },
  })) });
}

export async function markReplyNotificationRead(context, commentId) {
  const user = await requireUser(context);
  const db = requireDatabase(context.env);
  const normalizedCommentId = normalizeNotificationId(commentId);
  await db.prepare(`INSERT INTO comment_notification_reads (user_id, comment_id, created_at)
    SELECT ?, c.id, ? FROM comments c
    WHERE c.id = ? AND c.reply_to_user_id = ? AND c.user_id != ? AND c.status = 'published'
    ON CONFLICT(user_id, comment_id) DO NOTHING`).bind(user.id, Date.now(), normalizedCommentId, user.id, user.id).run();
  return json({ ok: true });
}

export async function adminReceivedComments(context) {
  const admin = await requireAdmin(context);
  const db = requireDatabase(context.env);
  const seenAt = Number(admin.admin_comments_seen_at || admin.created_at || 0);
  const result = await db.prepare(`SELECT c.*, u.nickname, u.role AS user_role,
    ua.user_id AS avatar_user_id, ua.updated_at AS avatar_updated_at,
    reply.nickname AS reply_to_nickname,
    notification_read.comment_id AS notification_read_id
    FROM comments c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN user_avatars ua ON ua.user_id = u.id
    LEFT JOIN users reply ON reply.id = c.reply_to_user_id
    LEFT JOIN comment_notification_reads notification_read ON notification_read.user_id = ? AND notification_read.comment_id = c.id
    WHERE c.user_id != ? AND c.parent_id IS NULL AND c.status = 'published'
    ORDER BY c.created_at DESC LIMIT 100`).bind(admin.id, admin.id).all();
  const rows = result.results || [];
  return json({ comments: rows.map((row) => ({
    ...commentRow(row, admin.id, "admin"),
    contentType: row.content_type,
    contentSlug: row.content_slug,
    contentTitle: "",
    unread: Number(row.created_at) > seenAt && !row.notification_read_id,
  })) });
}

export async function markAdminCommentRead(context, commentId) {
  const admin = await requireAdmin(context);
  const db = requireDatabase(context.env);
  const normalizedCommentId = normalizeNotificationId(commentId);
  await db.prepare(`INSERT INTO comment_notification_reads (user_id, comment_id, created_at)
    SELECT ?, c.id, ? FROM comments c
    WHERE c.id = ? AND c.user_id != ? AND c.parent_id IS NULL AND c.status = 'published'
    ON CONFLICT(user_id, comment_id) DO NOTHING`).bind(admin.id, Date.now(), normalizedCommentId, admin.id).run();
  return json({ ok: true });
}
