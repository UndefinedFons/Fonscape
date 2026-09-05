import { ApiError } from "../community.js";

export const USER_FIELDS = `u.id, u.username, u.password_hash, u.password_salt, u.nickname, u.role, u.status,
  u.created_at, u.updated_at, u.notifications_seen_at, u.admin_comments_seen_at,
  ua.user_id AS avatar_user_id, ua.updated_at AS avatar_updated_at`;

export function isUsernameConflict(error) {
  const code = String(error?.code || "");
  const message = error instanceof Error ? error.message : String(error);
  return /SQLITE_CONSTRAINT(?:_UNIQUE)?/iu.test(code)
    || /UNIQUE constraint failed:\s*(?:main\.)?users\.username/iu.test(message)
    || /users_username_unique_idx/iu.test(message);
}

export async function userById(db, userId) {
  return db.prepare(`SELECT ${USER_FIELDS} FROM users u
    LEFT JOIN user_avatars ua ON ua.user_id = u.id
    WHERE u.id = ? LIMIT 1`).bind(userId).first();
}

export function routeParts(context) {
  const value = context.params.path;
  return (Array.isArray(value) ? value : String(value || "").split("/")).filter(Boolean);
}

export async function adminSetupState(db) {
  const row = await db.prepare(`SELECT
    admin_initialized_at,
    EXISTS (SELECT 1 FROM users WHERE role = 'admin') AS has_admin
    FROM site_runtime WHERE id = 1 LIMIT 1`).first();
  if (!row) throw new ApiError(503, "站点初始化数据不可用。", "setup_state_unavailable");
  return { initialized: Boolean(row.admin_initialized_at || Number(row.has_admin)) };
}
