import { Buffer } from "node:buffer";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === "string");
}

export function errorMessage(error: unknown): string {
  if (isRecord(error) && typeof error.message === "string") return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

export function errorCode(error: unknown): string | number | undefined {
  if (!isRecord(error)) return undefined;
  return typeof error.code === "string" || typeof error.code === "number" ? error.code : undefined;
}

export function errorStdout(error: unknown): string | Buffer | undefined {
  if (!isRecord(error)) return undefined;
  const stdout = error.stdout;
  if (typeof stdout === "string") return stdout;
  if (Buffer.isBuffer(stdout)) return stdout;
  return undefined;
}
