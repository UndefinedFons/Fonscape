import { createHash } from "node:crypto";
import {
  access,
  lstat,
  mkdir,
  readdir,
  readFile,
  stat,
} from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { Buffer } from "node:buffer";
import type { DeleteAction, ManifestOwnership, UpdateAction, WriteAction } from "./types.ts";
import {
  PUBLIC_ENV_TEMPLATE_PATH,
  UPDATE_DIRECTORY,
} from "./constants.ts";
import { errorCode } from "./guards.ts";

export function safeRelativePath(path: unknown): string {
  const normalized = String(path || "").replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) throw new Error(`不安全的路径：${path}`);
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) throw new Error(`不安全的路径：${path}`);
  return normalized;
}

export function inside(root: string, path: string): boolean {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(path);
  return resolvedPath === resolvedRoot || resolvedPath.startsWith(`${resolvedRoot}${sep}`);
}

export async function assertNoSymlink(path: string, label = path) {
  const info = await lstat(path).catch((error) => {
    if (errorCode(error) === "ENOENT") return null;
    throw error;
  });
  if (info?.isSymbolicLink()) throw new Error(`${label}不能是符号链接：${path}`);
  return info;
}

export async function ensureDirectory(path: string, label = path): Promise<string> {
  await assertNoSymlink(path, label);
  await mkdir(path, { recursive: true });
  const info = await lstat(path);
  if (!info.isDirectory()) throw new Error(`${label}必须是目录：${path}`);
  return path;
}

export function absoluteManagedPath(root: string, path: string): string {
  const safe = safeRelativePath(path);
  const absolute = resolve(root, safe);
  if (!inside(root, absolute)) throw new Error(`路径越界：${path}`);
  return absolute;
}

export function matchesPattern(path: string, pattern: string): boolean {
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return path === prefix || path.startsWith(`${prefix}/`);
  }
  if (pattern.endsWith(".*")) return path === pattern.slice(0, -2) || path.startsWith(pattern.slice(0, -1));
  return path === pattern;
}

type ManagedOwnership = "user" | "history" | "merge" | "theme";

export function classifyPath(path: string, manifest: { ownership: ManifestOwnership }): ManagedOwnership | "unmanaged" {
  const ownerships: readonly ManagedOwnership[] = ["user", "history", "merge", "theme"];
  for (const ownership of ownerships) {
    if (ownership === "user" && path === PUBLIC_ENV_TEMPLATE_PATH) continue;
    if ((manifest.ownership[ownership] || []).some((pattern) => matchesPattern(path, pattern))) return ownership;
  }
  return "unmanaged";
}

export async function exists(path: string): Promise<boolean> {
  return access(path).then(() => true, () => false);
}

export async function readOptional(path: string): Promise<Buffer | null> {
  return readFile(path).catch((error) => {
    if (errorCode(error) === "ENOENT") return null;
    throw error;
  });
}

export function equal(left: Buffer | null, right: Buffer | null): boolean {
  if (left === null || right === null) return left === right;
  return left.equals(right);
}

export function hash(value: Buffer | null): string | null {
  return value === null ? null : createHash("sha256").update(value).digest("hex");
}

export function isText(value: Buffer | null): boolean {
  return value === null || !value.subarray(0, 8192).includes(0);
}

export async function walkFiles(root: string, prefix = ""): Promise<string[]> {
  if (!prefix) await assertNoSymlink(root, "源目录");
  const directory = prefix ? join(root, prefix) : root;
  if (!(await exists(directory))) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!prefix && [".git", "node_modules", "dist", UPDATE_DIRECTORY].includes(entry.name)) continue;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`源目录不能包含符号链接：${path}`);
    if (entry.isDirectory()) files.push(...await walkFiles(root, path));
    else files.push(safeRelativePath(path));
  }
  return files;
}

export async function assertNoManagedSymlink(root: string, path: string): Promise<void> {
  await assertNoSymlink(root, "项目根目录");
  const parts = safeRelativePath(path).split("/");
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    const info = await lstat(current).catch((error) => errorCode(error) === "ENOENT" ? null : Promise.reject(error));
    if (!info) return;
    if (info.isSymbolicLink()) throw new Error(`受管理路径不能经过符号链接：${path}`);
  }
}

export function staticPatternRoot(pattern: string): string {
  const segments = safeRelativePath(pattern).split("/");
  const literalSegments: string[] = [];
  for (const segment of segments) {
    if (/[*?[\]{}]/u.test(segment)) break;
    literalSegments.push(segment);
  }
  return literalSegments.join("/");
}

export async function walkInstalledHistory(project: string, manifest: { ownership: ManifestOwnership }): Promise<string[]> {
  const files = new Set<string>();
  const roots = new Set((manifest.ownership.history || []).map(staticPatternRoot));
  for (const root of roots) {
    if (!root) {
      for (const path of await walkFiles(project)) {
        if (classifyPath(path, manifest) === "history") files.add(path);
      }
      continue;
    }
    await assertNoManagedSymlink(project, root);
    const info = await lstat(join(project, root)).catch((error) => errorCode(error) === "ENOENT" ? null : Promise.reject(error));
    if (!info) continue;
    const paths = info.isDirectory() ? await walkFiles(project, root) : [root];
    for (const path of paths) {
      if (classifyPath(path, manifest) === "history") files.add(path);
    }
  }
  return [...files];
}

export function action(path: string, operation: "delete", content: null, reason: string, mode: null, expectedLocal: Buffer | null): DeleteAction;
export function action(path: string, operation: "write", content: Buffer, reason: string, mode: number, expectedLocal: Buffer | null): WriteAction;
export function action(
  path: string,
  operation: "delete" | "write",
  content: Buffer | null,
  reason: string,
  mode: number | null,
  expectedLocal: Buffer | null,
): UpdateAction {
  if (operation === "delete") {
    return { path, operation, content: null, reason, mode: null, expectedLocalHash: hash(expectedLocal) };
  }
  if (content === null || mode === null) throw new Error(`写入操作缺少内容或文件权限：${path}`);
  return { path, operation, content, reason, mode, expectedLocalHash: hash(expectedLocal) };
}

export async function modeFor(directory: string, path: string, fallback = 0o644): Promise<number> {
  return stat(join(directory, path)).then((info) => info.mode & 0o777, () => fallback);
}
