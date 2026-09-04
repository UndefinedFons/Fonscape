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
import {
  PUBLIC_ENV_TEMPLATE_PATH,
  UPDATE_DIRECTORY,
} from "./constants.mjs";

export function safeRelativePath(path) {
  const normalized = String(path || "").replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) throw new Error(`不安全的路径：${path}`);
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) throw new Error(`不安全的路径：${path}`);
  return normalized;
}

export function inside(root, path) {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(path);
  return resolvedPath === resolvedRoot || resolvedPath.startsWith(`${resolvedRoot}${sep}`);
}

export async function assertNoSymlink(path, label = path) {
  const info = await lstat(path).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (info?.isSymbolicLink()) throw new Error(`${label}不能是符号链接：${path}`);
  return info;
}

export async function ensureDirectory(path, label = path) {
  await assertNoSymlink(path, label);
  await mkdir(path, { recursive: true });
  const info = await lstat(path);
  if (!info.isDirectory()) throw new Error(`${label}必须是目录：${path}`);
  return path;
}

export function absoluteManagedPath(root, path) {
  const safe = safeRelativePath(path);
  const absolute = resolve(root, safe);
  if (!inside(root, absolute)) throw new Error(`路径越界：${path}`);
  return absolute;
}

export function matchesPattern(path, pattern) {
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return path === prefix || path.startsWith(`${prefix}/`);
  }
  if (pattern.endsWith(".*")) return path === pattern.slice(0, -2) || path.startsWith(pattern.slice(0, -1));
  return path === pattern;
}

export function classifyPath(path, manifest) {
  for (const ownership of ["user", "history", "merge", "theme"]) {
    if (ownership === "user" && path === PUBLIC_ENV_TEMPLATE_PATH) continue;
    if ((manifest.ownership[ownership] || []).some((pattern) => matchesPattern(path, pattern))) return ownership;
  }
  return "unmanaged";
}

export async function exists(path) {
  return access(path).then(() => true, () => false);
}

export async function readOptional(path) {
  return readFile(path).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
}

export function equal(left, right) {
  if (left === null || right === null) return left === right;
  return left.equals(right);
}

export function hash(value) {
  return value === null ? null : createHash("sha256").update(value).digest("hex");
}

export function isText(value) {
  return value === null || !value.subarray(0, 8192).includes(0);
}

export async function walkFiles(root, prefix = "") {
  if (!prefix) await assertNoSymlink(root, "源目录");
  const directory = prefix ? join(root, prefix) : root;
  if (!(await exists(directory))) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!prefix && [".git", "node_modules", "dist", UPDATE_DIRECTORY].includes(entry.name)) continue;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`源目录不能包含符号链接：${path}`);
    if (entry.isDirectory()) files.push(...await walkFiles(root, path));
    else files.push(safeRelativePath(path));
  }
  return files;
}

export async function assertNoManagedSymlink(root, path) {
  await assertNoSymlink(root, "项目根目录");
  const parts = safeRelativePath(path).split("/");
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    const info = await lstat(current).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
    if (!info) return;
    if (info.isSymbolicLink()) throw new Error(`受管理路径不能经过符号链接：${path}`);
  }
}

export function staticPatternRoot(pattern) {
  const segments = safeRelativePath(pattern).split("/");
  const literalSegments = [];
  for (const segment of segments) {
    if (/[*?[\]{}]/u.test(segment)) break;
    literalSegments.push(segment);
  }
  return literalSegments.join("/");
}

export async function walkInstalledHistory(project, manifest) {
  const files = new Set();
  const roots = new Set(manifest.ownership.history.map(staticPatternRoot));
  for (const root of roots) {
    if (!root) {
      for (const path of await walkFiles(project)) {
        if (classifyPath(path, manifest) === "history") files.add(path);
      }
      continue;
    }
    await assertNoManagedSymlink(project, root);
    const info = await lstat(join(project, root)).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
    if (!info) continue;
    const paths = info.isDirectory() ? await walkFiles(project, root) : [root];
    for (const path of paths) {
      if (classifyPath(path, manifest) === "history") files.add(path);
    }
  }
  return [...files];
}

export function action(path, operation, content, reason, mode, expectedLocal) {
  return { path, operation, content, reason, mode, expectedLocalHash: hash(expectedLocal) };
}

export async function modeFor(directory, path, fallback = 0o644) {
  return stat(join(directory, path)).then((info) => info.mode & 0o777, () => fallback);
}
