import {
  ApiError,
  json,
  readJson,
  requireDatabase,
  validateTarget,
} from "../community.js";
import {
  assertTargetExists,
  protectContentView,
} from "../abuse.js";

const CONTENT_STATS_TARGET_LIMIT = 100;
const CONTENT_STATS_DEFAULT_LIMIT = 200;

function parseContentStatsRequest(url) {
  const targetValues = url.searchParams.getAll("target");
  const legacyType = url.searchParams.get("type");
  const legacySlug = url.searchParams.get("slug");
  if (legacyType || legacySlug) {
    if (!legacyType || !legacySlug || targetValues.length) {
      throw new ApiError(400, "内容统计参数无效。", "invalid_stats_query");
    }
    targetValues.push(`${legacyType}:${legacySlug}`);
  }
  if (targetValues.length > CONTENT_STATS_TARGET_LIMIT) {
    throw new ApiError(400, `一次最多查询 ${CONTENT_STATS_TARGET_LIMIT} 个内容目标。`, "stats_target_limit");
  }
  if (targetValues.length) {
    const targets = targetValues.map((value) => {
      const separator = value.indexOf(":");
      if (separator <= 0) throw new ApiError(400, "内容统计目标无效。", "invalid_stats_query");
      return validateTarget(value.slice(0, separator), value.slice(separator + 1));
    });
    const unique = new Map(targets.map((target) => [`${target.type}:${target.slug}`, target]));
    return { targets: [...unique.values()] };
  }
  const limitValue = url.searchParams.get("limit");
  const limit = limitValue === null ? CONTENT_STATS_DEFAULT_LIMIT : Number(limitValue);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > CONTENT_STATS_DEFAULT_LIMIT) {
    throw new ApiError(400, `内容统计 limit 必须是 1–${CONTENT_STATS_DEFAULT_LIMIT} 的整数。`, "invalid_stats_query");
  }
  return { targets: null, limit };
}

function statsFromRows(rows) {
  const stats = {};
  for (const row of rows || []) {
    const type = String(row.type || "");
    const slug = String(row.slug || "");
    if (!type || !slug) continue;
    stats[type] ||= {};
    stats[type][slug] = {
      views: Number(row.views || 0),
      comments: Number(row.comments || 0),
    };
  }
  return stats;
}

async function readContentStats(context, url) {
  const db = requireDatabase(context.env);
  const request = parseContentStatsRequest(url);
  let result;
  if (request.targets) {
    const values = request.targets.flatMap((target) => [target.type, target.slug]);
    const placeholders = request.targets.map(() => "(?, ?)").join(", ");
    result = await db.prepare(`WITH requested(content_type, content_slug) AS (VALUES ${placeholders})
      SELECT requested.content_type AS type,
        requested.content_slug AS slug,
        COALESCE(metrics.views, 0) AS views,
        COALESCE(usage.published_comments, 0) AS comments
      FROM requested
      LEFT JOIN content_metrics metrics
        ON metrics.content_type = requested.content_type
        AND metrics.content_slug = requested.content_slug
      LEFT JOIN comment_target_usage usage
        ON usage.content_type = requested.content_type
        AND usage.content_slug = requested.content_slug`)
      .bind(...values).all();
  } else {
    result = await db.prepare(`SELECT type, slug, views, comments FROM (
      SELECT metrics.content_type AS type,
        metrics.content_slug AS slug,
        COALESCE(metrics.views, 0) AS views,
        COALESCE(usage.published_comments, 0) AS comments,
        metrics.updated_at AS updated_at
      FROM content_metrics metrics
      LEFT JOIN comment_target_usage usage
        ON usage.content_type = metrics.content_type
        AND usage.content_slug = metrics.content_slug
      UNION ALL
      SELECT usage.content_type AS type,
        usage.content_slug AS slug,
        0 AS views,
        usage.published_comments AS comments,
        usage.updated_at AS updated_at
      FROM comment_target_usage usage
      LEFT JOIN content_metrics metrics
        ON metrics.content_type = usage.content_type
        AND metrics.content_slug = usage.content_slug
      WHERE metrics.content_type IS NULL
    )
    ORDER BY updated_at DESC, type ASC, slug ASC
    LIMIT ?`).bind(request.limit).all();
  }
  return statsFromRows(result.results);
}

export async function contentStats(context, url) {
  return json({ stats: await readContentStats(context, url) });
}

async function incrementContentView(context, target) {
  const db = requireDatabase(context.env);
  await assertTargetExists(db, target);
  await protectContentView(context);
  const now = Date.now();
  const result = await db.prepare(`INSERT INTO content_metrics (content_type, content_slug, views, updated_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(content_type, content_slug) DO UPDATE SET views = views + 1, updated_at = excluded.updated_at
    RETURNING views`)
    .bind(target.type, target.slug, now).run();
  return json({ type: target.type, slug: target.slug, views: Number(result.results?.[0]?.views || 0) });
}

export async function recordContentView(context) {
  const input = await readJson(context.request);
  return incrementContentView(context, validateTarget(input.type, input.slug));
}

export async function siteRuntime(context) {
  const db = requireDatabase(context.env);
  const candidates = [];
  for (const sql of [
    "SELECT launched_at FROM site_runtime WHERE id = 1 LIMIT 1",
    "SELECT CAST(strftime('%s', MIN(applied_at)) AS INTEGER) * 1000 AS launched_at FROM d1_migrations",
    "SELECT MIN(applied_at) AS launched_at FROM fonscape_schema_migrations",
  ]) {
    try {
      const row = await db.prepare(sql).first();
      const value = Number(row?.launched_at);
      if (Number.isFinite(value) && value > 0) candidates.push(value);
    } catch {
      // Cloudflare and Turso use different migration ledgers. The missing
      // platform-specific table is expected; the current database still owns
      // the persisted site_runtime fallback.
    }
  }
  const launchedAt = Math.min(...candidates);
  if (!Number.isFinite(launchedAt)) {
    throw new ApiError(503, "站点运行时间尚未完成初始化。", "site_runtime_unavailable");
  }
  return json({ launchedAt });
}
