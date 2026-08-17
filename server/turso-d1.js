import { createClient } from "@libsql/client";

function normalizeArgument(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return value;
}

function normalizeValue(value) {
  if (value instanceof Uint8Array) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  if (typeof value === "bigint") return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString();
  return value;
}

function normalizeRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalizeValue(value)]));
}

function resultToD1(result) {
  const lastRowId = result.lastInsertRowid;
  return {
    success: true,
    results: (result.rows || []).map(normalizeRow),
    meta: {
      changes: Number(result.rowsAffected || 0),
      last_row_id: lastRowId === undefined || lastRowId === null
        ? 0
        : (typeof lastRowId === "bigint" && !Number.isSafeInteger(Number(lastRowId)) ? lastRowId.toString() : Number(lastRowId)),
    },
  };
}

export class TursoD1PreparedStatement {
  #client;
  #sql;
  #args;

  constructor(client, sql, args = []) {
    this.#client = client;
    this.#sql = String(sql);
    this.#args = args;
  }

  bind(...args) {
    return new TursoD1PreparedStatement(this.#client, this.#sql, args);
  }

  descriptor() {
    return {
      sql: this.#sql,
      args: this.#args.map(normalizeArgument),
    };
  }

  belongsTo(client) {
    return this.#client === client;
  }

  async all() {
    return resultToD1(await this.#client.execute(this.descriptor()));
  }

  async first(column) {
    const result = await this.all();
    const row = result.results[0] || null;
    return column === undefined || column === null ? row : row?.[column] ?? null;
  }

  async run() {
    return resultToD1(await this.#client.execute(this.descriptor()));
  }
}

export function createTursoD1Database({ url, authToken, client } = {}) {
  const databaseClient = client || createClient({ url, ...(authToken ? { authToken } : {}) });
  if (!databaseClient || typeof databaseClient.execute !== "function" || typeof databaseClient.batch !== "function") {
    throw new TypeError("a libSQL-compatible client is required");
  }

  return Object.freeze({
    prepare(sql) {
      return new TursoD1PreparedStatement(databaseClient, sql);
    },
    async batch(statements) {
      if (!Array.isArray(statements)) throw new TypeError("D1 batch expects an array of prepared statements");
      const descriptors = statements.map((statement) => {
        if (!(statement instanceof TursoD1PreparedStatement) || !statement.belongsTo(databaseClient)) {
          throw new TypeError("D1 batch only accepts adapter prepared statements");
        }
        return statement.descriptor();
      });
      return (await databaseClient.batch(descriptors, "write")).map(resultToD1);
    },
  });
}
