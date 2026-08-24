import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = join(root, "migrations");
const migrationTable = "fonscape_schema_migrations";
const busyRetryLimit = 12;

function isDatabaseBusy(error) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code || "")
    : "";
  const message = error instanceof Error ? error.message : String(error);
  return code === "SQLITE_BUSY" || /SQLITE_BUSY|database is locked/iu.test(message);
}

function retryDelay(attempt) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, Math.min(50 * (2 ** attempt), 500));
  });
}

async function withBusyRetry(operation) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isDatabaseBusy(error) || attempt >= busyRetryLimit) throw error;
      await retryDelay(attempt);
    }
  }
}

function hasSqlCode(value) {
  let index = 0;
  while (index < value.length) {
    if (/\s/u.test(value[index])) {
      index += 1;
    } else if (value[index] === "-" && value[index + 1] === "-") {
      const lineEnd = value.indexOf("\n", index + 2);
      index = lineEnd === -1 ? value.length : lineEnd + 1;
    } else if (value[index] === "/" && value[index + 1] === "*") {
      const blockEnd = value.indexOf("*/", index + 2);
      if (blockEnd === -1) return true;
      index = blockEnd + 2;
    } else {
      return true;
    }
  }
  return false;
}

function isTriggerStatement(value) {
  const withoutLeadingComments = value.replace(
    /^\s*(?:(?:--[^\n]*(?:\n|$))|(?:\/\*[\s\S]*?\*\/\s*))*/u,
    "",
  );
  return /^CREATE\s+(?:TEMP(?:ORARY)?\s+)?TRIGGER\b/iu.test(withoutLeadingComments);
}

function triggerCompoundDepth(value) {
  let depth = 0;
  let state = "normal";
  let token = "";

  const flushToken = () => {
    if (!token) return;
    const keyword = token.toUpperCase();
    if (keyword === "BEGIN" || keyword === "CASE") depth += 1;
    if (keyword === "END") depth = Math.max(0, depth - 1);
    token = "";
  };

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const next = value[index + 1];

    if (state === "line-comment") {
      if (character === "\n" || character === "\r") state = "normal";
      continue;
    }
    if (state === "block-comment") {
      if (character === "*" && next === "/") {
        state = "normal";
        index += 1;
      }
      continue;
    }
    if (state === "single-quote") {
      if (character === "'" && next === "'") index += 1;
      else if (character === "'") state = "normal";
      continue;
    }
    if (state === "double-quote") {
      if (character === '"' && next === '"') index += 1;
      else if (character === '"') state = "normal";
      continue;
    }
    if (state === "backtick") {
      if (character === "`" && next === "`") index += 1;
      else if (character === "`") state = "normal";
      continue;
    }
    if (state === "bracket-quote") {
      if (character === "]" && next === "]") index += 1;
      else if (character === "]") state = "normal";
      continue;
    }
    if (character === "-" && next === "-") {
      flushToken();
      state = "line-comment";
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      flushToken();
      state = "block-comment";
      index += 1;
      continue;
    }
    if (character === "'") {
      flushToken();
      state = "single-quote";
      continue;
    }
    if (character === '"') {
      flushToken();
      state = "double-quote";
      continue;
    }
    if (character === "`") {
      flushToken();
      state = "backtick";
      continue;
    }
    if (character === "[") {
      flushToken();
      state = "bracket-quote";
      continue;
    }
    if (/[A-Za-z0-9_$]/u.test(character)) {
      token += character;
    } else {
      flushToken();
    }
  }
  flushToken();
  return depth;
}

export function splitSqlStatements(source) {
  const statements = [];
  let start = 0;
  let state = "normal";

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (state === "line-comment") {
      if (character === "\n") state = "normal";
      continue;
    }
    if (state === "block-comment") {
      if (character === "*" && next === "/") {
        state = "normal";
        index += 1;
      }
      continue;
    }
    if (state === "single-quote") {
      if (character === "'" && next === "'") {
        index += 1;
      } else if (character === "'") {
        state = "normal";
      }
      continue;
    }
    if (state === "double-quote") {
      if (character === '"' && next === '"') {
        index += 1;
      } else if (character === '"') {
        state = "normal";
      }
      continue;
    }
    if (state === "backtick") {
      if (character === "`" && next === "`") {
        index += 1;
      } else if (character === "`") {
        state = "normal";
      }
      continue;
    }
    if (state === "bracket-quote") {
      if (character === "]" && next === "]") {
        index += 1;
      } else if (character === "]") {
        state = "normal";
      }
      continue;
    }
    if (character === "-" && next === "-") {
      state = "line-comment";
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      state = "block-comment";
      index += 1;
      continue;
    }
    if (character === "'") {
      state = "single-quote";
      continue;
    }
    if (character === '"') {
      state = "double-quote";
      continue;
    }
    if (character === "`") {
      state = "backtick";
      continue;
    }
    if (character === "[") {
      state = "bracket-quote";
      continue;
    }
    if (character === ";") {
      const statement = source.slice(start, index).trim();
      if (isTriggerStatement(statement) && triggerCompoundDepth(statement) > 0) continue;
      if (statement && hasSqlCode(statement)) statements.push(statement);
      start = index + 1;
    }
  }

  const remaining = source.slice(start).trim();
  if (remaining && hasSqlCode(remaining)) statements.push(remaining);
  return statements;
}

export async function readMigrations(directory = migrationsDirectory) {
  const names = (await readdir(directory))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
    .sort();
  if (!names.length) throw new Error("no SQL migrations were found");
  return Promise.all(names.map(async (name) => {
    const source = await readFile(join(directory, name), "utf8");
    const statements = splitSqlStatements(source);
    if (!statements.length) throw new Error(`migration ${name} is empty`);
    return {
      name,
      source,
      checksum: createHash("sha256").update(source).digest("hex"),
      statements,
    };
  }));
}

function migrationConfiguration(environment) {
  const url = String(environment.TURSO_DATABASE_URL || "").trim();
  const authToken = String(environment.TURSO_AUTH_TOKEN || "").trim();
  if (!url) throw new Error("TURSO_DATABASE_URL is required");
  if (!authToken && !url.startsWith("file:") && url !== ":memory:") {
    throw new Error("TURSO_AUTH_TOKEN is required for a remote Turso database");
  }
  return { url, authToken };
}

async function appliedMigrations(client, createTable) {
  if (createTable) {
    await withBusyRetry(() => client.execute(`CREATE TABLE IF NOT EXISTS ${migrationTable} (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )`));
  }
  try {
    const result = await withBusyRetry(
      () => client.execute(`SELECT name, checksum FROM ${migrationTable} ORDER BY name`),
    );
    return new Map(result.rows.map((row) => [row.name, row.checksum]));
  } catch (error) {
    if (!createTable && /no such table/iu.test(error instanceof Error ? error.message : String(error))) return new Map();
    throw error;
  }
}

async function applyMigration(client, migration) {
  try {
    await withBusyRetry(() => client.batch([
      {
        sql: `INSERT INTO ${migrationTable} (name, checksum, applied_at) VALUES (?, ?, ?)`,
        args: [migration.name, migration.checksum, Date.now()],
      },
      ...migration.statements.map((sql) => ({ sql })),
    ], "write"));
    return true;
  } catch (error) {
    const existing = await withBusyRetry(() => client.execute({
      sql: `SELECT checksum FROM ${migrationTable} WHERE name = ?`,
      args: [migration.name],
    }));
    if (!existing.rows.length) throw error;
    const appliedChecksum = String(existing.rows[0].checksum);
    if (appliedChecksum !== migration.checksum) {
      throw new Error(`migration checksum changed after application: ${migration.name}`);
    }
    return false;
  }
}

export async function migrateTurso({ client, apply = false, migrations } = {}) {
  const migrationList = migrations || await readMigrations();
  const existing = await appliedMigrations(client, apply);
  const pending = [];
  for (const migration of migrationList) {
    const appliedChecksum = existing.get(migration.name);
    if (appliedChecksum && appliedChecksum !== migration.checksum) {
      throw new Error(`migration checksum changed after application: ${migration.name}`);
    }
    if (!appliedChecksum) pending.push(migration);
  }
  if (!apply) return { applied: [], pending: pending.map((migration) => migration.name) };

  const applied = [];
  for (const migration of pending) {
    if (await applyMigration(client, migration)) applied.push(migration.name);
  }
  return { applied, pending: [] };
}

async function main() {
  const argumentsSet = new Set(process.argv.slice(2));
  const supported = new Set(["--apply"]);
  for (const argument of argumentsSet) {
    if (!supported.has(argument)) throw new Error(`unknown option: ${argument}`);
  }
  const config = migrationConfiguration(process.env);
  const client = createClient({
    url: config.url,
    ...(config.authToken ? { authToken: config.authToken } : {}),
  });
  const result = await migrateTurso({ client, apply: argumentsSet.has("--apply") });
  if (result.pending.length) {
    console.log(`Turso migration plan: ${result.pending.join(", ")}`);
    console.log("Review the target database, then re-run with --apply to make changes.");
  } else if (result.applied.length) {
    console.log(`Applied Turso migrations: ${result.applied.join(", ")}`);
  } else {
    console.log("Turso schema is current.");
  }
  await client.close?.();
}

const invokedPath = process.argv[1] ? fileURLToPath(import.meta.url) === resolve(process.argv[1]) : false;
if (invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
