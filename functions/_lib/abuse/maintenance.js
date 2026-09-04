import { requireDatabase } from "../community.js";
import {
  DAY,
  HOUR,
  consumeFixedWindow,
  policyKey,
} from "./limits.js";

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
        SUM(CASE WHEN status = 'published' AND (parent_id IS NULL OR EXISTS (
          SELECT 1 FROM comments parent
          WHERE parent.id = comments.parent_id AND parent.status = 'published'
        )) THEN 1 ELSE 0 END),
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
