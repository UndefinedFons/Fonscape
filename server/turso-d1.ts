import { createClient } from "@libsql/client";
import type { Client, InValue, ResultSet, Row, Value } from "@libsql/client";
import type { Database, DatabaseField, DatabaseResult, DatabaseRow, DatabaseValue } from "../functions/types.ts";

function normalizeArgument(value: DatabaseValue): InValue {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return value;
}

function normalizeValue(value: Value | ArrayBufferView): DatabaseField {
  if (value instanceof Uint8Array) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
  if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
  if (typeof value === "bigint") return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString();
  return value;
}

function normalizeRow(row: Row): DatabaseRow {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalizeValue(value)]));
}

function resultToD1<T extends DatabaseRow = DatabaseRow>(result: ResultSet): DatabaseResult<T> {
  const lastRowId = result.lastInsertRowid;
  return {
    success: true,
    results: (result.rows || []).map(normalizeRow) as T[],
    meta: {
      changes: Number(result.rowsAffected || 0),
      last_row_id: lastRowId === undefined || lastRowId === null
        ? 0
        : (typeof lastRowId === "bigint" && !Number.isSafeInteger(Number(lastRowId)) ? lastRowId.toString() : Number(lastRowId)),
    },
  };
}

export class TursoD1PreparedStatement {
  #client: Client;
  #sql: string;
  #args: DatabaseValue[];

  constructor(client: Client, sql: string, args: DatabaseValue[] = []) {
    this.#client = client;
    this.#sql = String(sql);
    this.#args = args;
  }

  bind(...args: DatabaseValue[]): TursoD1PreparedStatement {
    return new TursoD1PreparedStatement(this.#client, this.#sql, args);
  }

  descriptor() {
    return {
      sql: this.#sql,
      args: this.#args.map(normalizeArgument),
    };
  }

  belongsTo(client: Client): boolean {
    return this.#client === client;
  }

  async all<T extends DatabaseRow = DatabaseRow>(): Promise<DatabaseResult<T>> {
    return resultToD1<T>(await this.#client.execute(this.descriptor()));
  }

  first<T extends DatabaseRow = DatabaseRow>(): Promise<T | null>;
  first(column: string): Promise<DatabaseField | null>;
  async first<T extends DatabaseRow = DatabaseRow>(column?: string): Promise<T | DatabaseField | null> {
    const result = await this.all<T>();
    const row = result.results[0] || null;
    return column === undefined || column === null ? row : row?.[column] ?? null;
  }

  async run<T extends DatabaseRow = DatabaseRow>(): Promise<DatabaseResult<T>> {
    return resultToD1<T>(await this.#client.execute(this.descriptor()));
  }
}

export function createTursoD1Database({ url, authToken, client }: { url?: string; authToken?: string; client?: Client } = {}): Database {
  const databaseClient = client || createClient({ url: url as string, ...(authToken ? { authToken } : {}) });
  if (!databaseClient || typeof databaseClient.execute !== "function" || typeof databaseClient.batch !== "function") {
    throw new TypeError("a libSQL-compatible client is required");
  }

  return Object.freeze({
    prepare(sql: string) {
      return new TursoD1PreparedStatement(databaseClient, sql);
    },
    async batch<T extends DatabaseRow = DatabaseRow>(statements: import("../functions/types.ts").PreparedStatement[]): Promise<DatabaseResult<T>[]> {
      if (!Array.isArray(statements)) throw new TypeError("D1 batch expects an array of prepared statements");
      const descriptors = statements.map((statement) => {
        if (!(statement instanceof TursoD1PreparedStatement) || !statement.belongsTo(databaseClient)) {
          throw new TypeError("D1 batch only accepts adapter prepared statements");
        }
        return statement.descriptor();
      });
      return (await databaseClient.batch(descriptors, "write")).map(resultToD1<T>);
    },
  });
}
