import { ApiError } from "../community.js";
import { limitFromEnv } from "./limits.js";

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
