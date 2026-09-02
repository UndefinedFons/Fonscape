import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import { insertCommentWithRateLimitsAtomically } from "../functions/_lib/abuse.js";
import { migrateTurso } from "../scripts/migrate-turso.mjs";
import { createTursoD1Database } from "../server/turso-d1.js";

test("administrator comments work with an empty rate-limit policy set", async () => {
  const client = createClient({ url: ":memory:" });
  try {
    await migrateTurso({ client, apply: true });
    const db = createTursoD1Database({ client });
    const now = Date.now();
    const userId = "admin-1";
    const commentId = "admin-comment-1";

    await client.execute({
      sql: `INSERT INTO users
        (id, username, password_hash, password_salt, nickname, role, status, created_at, updated_at)
        VALUES (?, 'siteadmin', 'hash', 'salt', '管理员', 'admin', 'active', ?, ?)`,
      args: [userId, now, now],
    });
    await client.execute({
      sql: "INSERT INTO account_usage (user_id, comments_created, updated_at) VALUES (?, 0, ?)",
      args: [userId, now],
    });

    const result = await insertCommentWithRateLimitsAtomically(db, {
      id: commentId,
      userId,
      role: "admin",
      target: { type: "post", slug: "site-about" },
      body: "管理员评论",
      requestHash: "admin-comment-request-hash",
      now,
      env: {},
    }, []);

    assert.equal(result.created, 1);
    assert.equal(result.rateLimit, null);
    assert.equal((await client.execute({
      sql: "SELECT COUNT(*) AS count FROM comments WHERE id = ? AND user_id = ?",
      args: [commentId, userId],
    })).rows[0].count, 1);
    assert.equal((await client.execute("SELECT COUNT(*) AS count FROM rate_limits")).rows[0].count, 0);
    assert.equal((await client.execute({
      sql: "SELECT status FROM comment_mutations WHERE id = ?",
      args: [commentId],
    })).rows[0].status, "completed");
  } finally {
    await client.close();
  }
});
