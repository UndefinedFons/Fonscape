export type UserRole = "member" | "admin";
export type UserStatus = "active" | "banned";
export type PublicCommentStatus = "published" | "hidden" | "deleted";

export interface PublicUser {
  id: string;
  username: string;
  nickname: string;
  role: UserRole;
  status: UserStatus;
  unreadReplies: number;
  unreadAdminComments: number;
  avatarUrl: string | null;
  avatarUpdatedAt: number | null;
  createdAt: number;
}

export interface PublicCommentAuthor {
  id: string;
  nickname: string | null;
  role: UserRole | null;
  avatarUrl: string | null;
  avatarUpdatedAt: number | null;
}

export interface PublicReplyUser {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  avatarUpdatedAt: number | null;
}

export type PublicProfile = Pick<PublicUser, "id" | "nickname" | "avatarUrl">;

export interface PublicComment {
  id: string;
  parentId: string | null;
  replyTo: string | null;
  replyToUser: PublicReplyUser | null;
  body: string;
  status: PublicCommentStatus;
  createdAt: number;
  updatedAt: number | null;
  editedAt: number | null;
  canDelete: boolean;
  author: PublicCommentAuthor;
}

export interface SessionResponse {
  user: PublicUser | null;
  accountNotice?: string;
}

export interface CommentListResponse {
  comments: PublicComment[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CreateCommentResponse {
  comment: PublicComment;
  replayed?: boolean;
}

export interface AccountComment extends PublicComment {
  contentType: "post" | "poem" | "music";
  contentSlug: string;
  contentTitle?: string;
  repliedToBody?: string | null;
  unread?: boolean;
}

export interface AccountReply extends Pick<PublicComment, "id" | "body" | "createdAt" | "author"> {
  contentType: AccountComment["contentType"];
  contentSlug: string;
  repliedToBody: string;
  repliedToCommentId: string | null;
  unread: boolean;
}

export interface DeleteCommentResponse {
  ok: true;
}

export interface ApiErrorPayload {
  error: string;
  code: string;
}

export interface PublicApiResponses {
  "/auth/session": SessionResponse;
  "/auth/login": SessionResponse;
  "/auth/register": SessionResponse;
  "/auth/logout": DeleteCommentResponse;
  "/admin/setup": { initialized: boolean } | SessionResponse;
  "/me": { user: PublicUser };
  "/me/avatar": { user: PublicUser };
  "/me/comments": { comments: AccountComment[] };
  "/me/replies": { replies: AccountReply[] };
  "/me/admin-comments": { comments: AccountComment[] };
  "/comments": CreateCommentResponse;
  [path: `/comments?${string}`]: CommentListResponse;
  [path: `/comments/${string}`]: DeleteCommentResponse;
  [path: `/me/notifications/${string}`]: DeleteCommentResponse;
  [path: `/me/admin-comments/${string}`]: DeleteCommentResponse;
  [path: `/profile/${string}`]: { profile: PublicProfile };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function timestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nullableTimestamp(value: unknown): value is number | null {
  return value === null || timestamp(value);
}

function count(value: unknown, minimum = 0): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
}

function userRole(value: unknown): value is UserRole {
  return value === "member" || value === "admin";
}

export function isPublicCommentStatus(value: unknown): value is PublicCommentStatus {
  return value === "published" || value === "hidden" || value === "deleted";
}

function publicUser(value: unknown): value is PublicUser {
  return record(value)
    && typeof value.id === "string" && typeof value.username === "string" && typeof value.nickname === "string"
    && userRole(value.role) && (value.status === "active" || value.status === "banned")
    && count(value.unreadReplies) && count(value.unreadAdminComments)
    && nullableString(value.avatarUrl) && nullableTimestamp(value.avatarUpdatedAt) && timestamp(value.createdAt);
}

function publicReplyUser(value: unknown): value is PublicReplyUser {
  return record(value) && typeof value.id === "string" && typeof value.nickname === "string"
    && nullableString(value.avatarUrl) && nullableTimestamp(value.avatarUpdatedAt);
}

function publicCommentAuthor(value: unknown): value is PublicCommentAuthor {
  return record(value) && typeof value.id === "string" && nullableString(value.nickname)
    && (value.role === null || userRole(value.role)) && nullableString(value.avatarUrl) && nullableTimestamp(value.avatarUpdatedAt);
}

function publicComment(value: unknown): value is PublicComment {
  if (!record(value)) return false;
  return typeof value.id === "string" && nullableString(value.parentId) && nullableString(value.replyTo)
    && (value.replyToUser === null || publicReplyUser(value.replyToUser))
    && typeof value.body === "string" && isPublicCommentStatus(value.status)
    && timestamp(value.createdAt) && nullableTimestamp(value.updatedAt) && nullableTimestamp(value.editedAt)
    && typeof value.canDelete === "boolean" && publicCommentAuthor(value.author);
}

function contentType(value: unknown): value is AccountComment["contentType"] {
  return value === "post" || value === "poem" || value === "music";
}

function accountComment(value: unknown): value is AccountComment {
  return publicComment(value) && record(value)
    && contentType(value.contentType)
    && typeof value.contentSlug === "string"
    && (value.contentTitle === undefined || typeof value.contentTitle === "string")
    && (value.repliedToBody === undefined || nullableString(value.repliedToBody))
    && (value.unread === undefined || typeof value.unread === "boolean");
}

function accountReply(value: unknown): value is AccountReply {
  return record(value) && typeof value.id === "string" && typeof value.body === "string" && timestamp(value.createdAt)
    && publicCommentAuthor(value.author) && contentType(value.contentType) && typeof value.contentSlug === "string"
    && typeof value.repliedToBody === "string" && nullableString(value.repliedToCommentId) && typeof value.unread === "boolean";
}

export function isPublicApiResponse<Path extends keyof PublicApiResponses>(path: Path, method: string, value: unknown): value is PublicApiResponses[Path] {
  if (!record(value)) return false;
  if (path === "/admin/setup") return method === "GET" ? typeof value.initialized === "boolean" : publicUser(value.user);
  if (path === "/auth/session" || path === "/auth/login" || path === "/auth/register") {
    return (value.user === null || publicUser(value.user)) && (value.accountNotice === undefined || typeof value.accountNotice === "string");
  }
  if (path === "/me" || path === "/me/avatar") return publicUser(value.user);
  if (path.startsWith("/profile/")) {
    return record(value.profile) && typeof value.profile.id === "string" && typeof value.profile.nickname === "string" && nullableString(value.profile.avatarUrl);
  }
  if (path === "/me/comments" || path === "/me/admin-comments") return Array.isArray(value.comments) && value.comments.every(accountComment);
  if (path === "/me/replies") return Array.isArray(value.replies) && value.replies.every(accountReply);
  if (path === "/comments") return publicComment(value.comment) && (value.replayed === undefined || typeof value.replayed === "boolean");
  if (path.startsWith("/comments?")) {
    return Array.isArray(value.comments) && value.comments.every(publicComment)
      && count(value.total) && count(value.page, 1) && count(value.pageSize, 1) && count(value.totalPages, 1);
  }
  if (path === "/auth/logout" || path.startsWith("/comments/") || path.startsWith("/me/notifications/") || path.startsWith("/me/admin-comments/")) return value.ok === true;
  return false;
}
