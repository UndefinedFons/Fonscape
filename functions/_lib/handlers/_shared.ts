import { ApiError } from "../community.ts";

import type { Database, DatabaseRow, RequestContext, UserRow } from "../../types.ts";

export const USER_FIELDS = `u.id, u.username, u.password_hash, u.password_salt, u.nickname, u.role, u.status,
  u.created_at, u.updated_at, u.notifications_seen_at, u.admin_comments_seen_at,
  ua.user_id AS avatar_user_id, ua.updated_at AS avatar_updated_at`;

/** @param {unknown} error */
export function isUsernameConflict(error: unknown): boolean {
  const code = String(error && typeof error === "object" && "code" in error ? error.code : "");
  const message = error instanceof Error ? error.message : String(error);
  return /SQLITE_CONSTRAINT(?:_UNIQUE)?/iu.test(code)
    || /UNIQUE constraint failed:\s*(?:main\.)?users\.username/iu.test(message)
    || /users_username_unique_idx/iu.test(message);
}

/** @param {Database} db @param {string} userId */
export async function userById(db: Database, userId: string): Promise<UserRow | null> {
  return db.prepare(`SELECT ${USER_FIELDS} FROM users u
    LEFT JOIN user_avatars ua ON ua.user_id = u.id
    WHERE u.id = ? LIMIT 1`).bind(userId).first<UserRow>();
}

/** @param {RequestContext} context */
export function routeParts(context: RequestContext): string[] {
  const value = context.params.path;
  return (Array.isArray(value) ? value : String(value || "").split("/")).filter(Boolean);
}

/** @param {Database} db */
export async function adminSetupState(db: Database): Promise<{ initialized: boolean }> {
  const row = await db.prepare(`SELECT
    admin_initialized_at,
    EXISTS (SELECT 1 FROM users WHERE role = 'admin') AS has_admin
    FROM site_runtime WHERE id = 1 LIMIT 1`).first<DatabaseRow & { admin_initialized_at?: number | null; has_admin: number }>();
  if (!row) throw new ApiError(503, "站点初始化数据不可用。", "setup_state_unavailable");
  return { initialized: Boolean(row.admin_initialized_at || Number(row.has_admin)) };
}
