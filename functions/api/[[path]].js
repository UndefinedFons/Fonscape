import { ApiError, assertSameOrigin, errorResponse } from "../_lib/community.js";
import { scheduleMaintenance } from "../_lib/abuse.js";
import {
  adminSetupStatus,
  login,
  logout,
  register,
  session,
  setupAdmin,
} from "../_lib/handlers/_auth.js";
import {
  avatar,
  AVATAR_MAX_BYTES,
  AVATAR_TOTAL_MAX_BYTES,
  profile,
  updateMe,
  uploadAvatar,
} from "../_lib/handlers/_accounts.js";
import {
  adminReceivedComments,
  createComment,
  deleteComment,
  listComments,
  markAdminCommentRead,
  markReplyNotificationRead,
  myComments,
  myReplies,
} from "../_lib/handlers/_comments.js";
import { contentStats, recordContentView, siteRuntime } from "../_lib/handlers/_stats.js";
import { routeParts } from "../_lib/handlers/_shared.js";

export { AVATAR_MAX_BYTES, AVATAR_TOTAL_MAX_BYTES };

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
  if (method === "PATCH" && parts[0] === "me" && parts[1] === "notifications" && parts.length === 3) return markReplyNotificationRead(context, parts[2]);
  if (method === "GET" && parts[0] === "me" && parts[1] === "admin-comments") return adminReceivedComments(context);
  if (method === "PATCH" && parts[0] === "me" && parts[1] === "admin-comments" && parts.length === 3) return markAdminCommentRead(context, parts[2]);
  if (method === "GET" && parts[0] === "profile" && parts[1] && parts.length === 2) return profile(context, parts[1]);
  if ((method === "GET" || method === "HEAD") && parts[0] === "avatar" && parts[1]) return avatar(context, parts[1]);
  if (method === "GET" && parts[0] === "content" && parts[1] === "stats" && parts.length === 2) return contentStats(context, url);
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
    if (!["GET", "HEAD", "OPTIONS"].includes(context.request.method)) scheduleMaintenance(context);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
