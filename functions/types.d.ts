/** Values accepted by the D1 binding's parameter API. */
export type DatabaseValue =
  | string
  | number
  | boolean
  | null
  | ArrayBuffer
  | ArrayBufferView;

/** The scalar values returned by the SQL queries used by the application. */
export type DatabaseField = string | number | null | Uint8Array;

export type DatabaseRow = Record<string, DatabaseField | undefined>;

export interface DatabaseResult<Row extends DatabaseRow = DatabaseRow> {
  results: Row[];
  success: true;
  meta: Record<string, unknown>;
}

export interface PreparedStatement {
  bind(...values: DatabaseValue[]): PreparedStatement;
  first<Row extends DatabaseRow = DatabaseRow>(): Promise<Row | null>;
  run<Row extends DatabaseRow = DatabaseRow>(): Promise<DatabaseResult<Row>>;
  all<Row extends DatabaseRow = DatabaseRow>(): Promise<DatabaseResult<Row>>;
}

export interface Database {
  prepare(query: string): PreparedStatement;
  batch<Row extends DatabaseRow = DatabaseRow>(statements: PreparedStatement[]): Promise<DatabaseResult<Row>[]>;
}

export interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

export interface AppEnv {
  DB?: Database;
  ASSETS: AssetsBinding;
  ADMIN_BOOTSTRAP_TOKEN?: string;
  [key: string]: unknown;
}

export type UserRole = "member" | "admin";
export type UserStatus = "active" | "banned";

export interface UserRow extends DatabaseRow {
  id: string;
  username: string;
  password_hash?: string | null;
  password_salt?: string | null;
  nickname: string;
  role: UserRole;
  status: UserStatus;
  created_at: number;
  updated_at?: number | null;
  notifications_seen_at?: number | null;
  admin_comments_seen_at?: number | null;
  avatar_user_id?: string | null;
  avatar_updated_at?: number | null;
  unread_replies?: number | null;
  unread_admin_comments?: number | null;
}

export interface CommentRow extends DatabaseRow {
  id: string;
  user_id: string;
  user_role?: UserRole;
  nickname?: string;
  body: string;
  status: string;
  content_type: string;
  content_slug: string;
  parent_id?: string | null;
  reply_to_comment_id?: string | null;
  reply_to_user_id?: string | null;
  reply_to_nickname?: string | null;
  reply_to_avatar_user_id?: string | null;
  reply_to_avatar_updated_at?: number | null;
  avatar_user_id?: string | null;
  avatar_updated_at?: number | null;
  created_at: number;
  updated_at?: number | null;
  edited_at?: number | null;
  replied_to_body?: string | null;
  replied_to_comment_id?: string | null;
  notification_read_id?: string | null;
}

export interface RequestContextData {
  currentUser?: UserRow | null;
  rateLimitSecret?: string;
  rateLimit?: RateLimitDecision;
}

export interface RequestContext {
  request: Request;
  env: AppEnv;
  params: { path?: string | string[] };
  data: RequestContextData;
  waitUntil(promise: Promise<unknown>): void;
  next(request?: Request | string, init?: RequestInit): Promise<Response>;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number | null;
}

export interface ContentTarget {
  type: string;
  slug: string;
}

export interface RateLimitPolicy {
  limitName?: string;
  limit: number;
  scope: string;
  subject: string;
  windowMs: number;
}

export interface RateLimitPolicyResult extends RateLimitPolicy {
  key: string;
}

export interface RateLimitFailure {
  status: number;
  message: string;
  code: string;
  limit?: number;
  remaining?: number;
  resetAt?: number;
  retryAfterSeconds?: number;
}
