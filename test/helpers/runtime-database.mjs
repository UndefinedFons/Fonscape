import { createClient } from "@libsql/client";
import { migrateTurso } from "../../scripts/migrate-turso.mjs";
import { createTursoD1Database } from "../../server/turso-d1.js";

export async function migratedDatabase() {
  const client = createClient({ url: ":memory:" });
  await migrateTurso({ client, apply: true });
  return { client, db: createTursoD1Database({ client }) };
}

export async function seedUser(client, {
  id = "member-1",
  username = "reader01",
  nickname = "读者",
  role = "member",
  now = Date.now(),
} = {}) {
  await client.execute({
    sql: `INSERT INTO users
      (id, username, password_hash, password_salt, nickname, role, status,
        created_at, updated_at)
      VALUES (?, ?, 'hash', 'salt', ?, ?, 'active', ?, ?)`,
    args: [id, username, nickname, role, now, now],
  });
  await client.execute({
    sql: "INSERT INTO account_usage (user_id, comments_created, updated_at) VALUES (?, 0, ?)",
    args: [id, now],
  });
  return { id, username, nickname, role, status: "active", created_at: now };
}

export function requestContext({ path, method = "GET", db, currentUser, query = "", body, headers = {}, env = {} }) {
  const pending = [];
  return {
    request: new Request(`https://example.test/api/${path.join("/")}${query}`, {
      method,
      headers: body === undefined ? headers : { "Content-Type": "application/json", ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env: { DB: db, ...env },
    params: { path },
    data: { currentUser },
    waitUntil(promise) { pending.push(promise); },
    async settle() { await Promise.all(pending); },
  };
}
