#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import {
  access,
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const CANONICAL_REPOSITORY = "https://github.com/UndefinedFons/Fonscape.git";
const VERSION_FILE = ".fonscape-version";
const UPDATE_DIRECTORY = ".fonscape-update";
const SEMVER = /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const CONFLICT_MARKER = /^(?:<{7}|={7}|>{7})/mu;
const MANDATORY_USER_PATTERNS = [
  ".env",
  ".env.*",
  ".dev.vars",
  ".dev.vars.*",
  "fonscape.config.js",
  "src/content/friends.json",
  "src/content/posts/**",
  "src/content/poems/**",
  "src/content/music/**",
  "public/assets/**",
  "public/audio/**",
];
const ALLOWED_SEED_PATHS = new Set(["fonscape.config.js", "src/content/friends.json"]);
const PUBLIC_ENV_TEMPLATE_PATH = ".env.example";

function usage() {
  return `Fonscape 安全升级器

用法：
  pnpm fonscape update [--from X.Y.Z] [--to X.Y.Z] [--apply]
  pnpm fonscape update --keep <站点文件> [--keep <另一个文件>]
  pnpm fonscape update --take-incoming <冲突文件> [--take-incoming <另一个冲突文件>]
  pnpm fonscape update --reconcile-theme [--apply]
  pnpm fonscape update --apply --resolutions <已解决冲突目录>
  pnpm fonscape update --rollback <备份目录>

默认仅预演，不会修改文件。站点必须已有 ${VERSION_FILE}；缺少 marker 时，
即使提供 --from 也会停止，升级器不会猜测或初始化来源版本。
--reconcile-theme 会让目标发布版重新接管全部 theme 文件，但仍保护 user 文件，
并继续三方合并 merge 文件；应用前请先检查预演清单。`;
}

function parseArgs(argv) {
  const args = argv[0] === "update" ? argv.slice(1) : argv;
  const parsed = { apply: false, project: process.cwd() };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--apply") parsed.apply = true;
    else if (arg === "--reconcile-theme") parsed.reconcile_theme = true;
    else if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (["--from", "--to", "--project", "--repository", "--source-dir", "--target-dir", "--resolutions", "--rollback", "--keep", "--take-incoming"].includes(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} 缺少参数。`);
      if (arg === "--keep") (parsed.keep ||= []).push(safeRelativePath(value));
      else if (arg === "--take-incoming") (parsed.take_incoming ||= []).push(safeRelativePath(value));
      else parsed[arg.slice(2).replaceAll("-", "_")] = value;
      index += 1;
    } else {
      throw new Error(`无法识别的参数：${arg}`);
    }
  }
  return parsed;
}

export function normalizeVersion(value, label = "版本号") {
  const match = String(value || "").trim().match(SEMVER);
  if (!match) throw new Error(`${label}必须是 X.Y.Z 格式。`);
  return `${match[1]}.${match[2]}.${match[3]}`;
}

export function compareVersions(left, right) {
  const a = normalizeVersion(left).split(".").map(Number);
  const b = normalizeVersion(right).split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

export function latestStableVersion(tags) {
  const versions = tags
    .map((tag) => String(tag).trim())
    .filter((tag) => SEMVER.test(tag))
    .map((tag) => normalizeVersion(tag));
  if (!versions.length) throw new Error("没有找到可用的稳定版本标签。");
  return versions.sort(compareVersions).at(-1);
}

function safeRelativePath(path) {
  const normalized = String(path || "").replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) throw new Error(`不安全的路径：${path}`);
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) throw new Error(`不安全的路径：${path}`);
  return normalized;
}

function inside(root, path) {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(path);
  return resolvedPath === resolvedRoot || resolvedPath.startsWith(`${resolvedRoot}${sep}`);
}

async function assertNoSymlink(path, label = path) {
  const info = await lstat(path).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (info?.isSymbolicLink()) throw new Error(`${label}不能是符号链接：${path}`);
  return info;
}

async function ensureDirectory(path, label = path) {
  await assertNoSymlink(path, label);
  await mkdir(path, { recursive: true });
  const info = await lstat(path);
  if (!info.isDirectory()) throw new Error(`${label}必须是目录：${path}`);
  return path;
}

function absoluteManagedPath(root, path) {
  const safe = safeRelativePath(path);
  const absolute = resolve(root, safe);
  if (!inside(root, absolute)) throw new Error(`路径越界：${path}`);
  return absolute;
}

function matchesPattern(path, pattern) {
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

async function exists(path) {
  return access(path).then(() => true, () => false);
}

async function readOptional(path) {
  return readFile(path).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
}

function equal(left, right) {
  if (left === null || right === null) return left === right;
  return left.equals(right);
}

function hash(value) {
  return value === null ? null : createHash("sha256").update(value).digest("hex");
}

function isText(value) {
  return value === null || !value.subarray(0, 8192).includes(0);
}

async function walkFiles(root, prefix = "") {
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

async function assertNoManagedSymlink(root, path) {
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

function staticPatternRoot(pattern) {
  const segments = safeRelativePath(pattern).split("/");
  const literalSegments = [];
  for (const segment of segments) {
    if (/[*?[\]{}]/u.test(segment)) break;
    literalSegments.push(segment);
  }
  return literalSegments.join("/");
}

async function walkInstalledHistory(project, manifest) {
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

async function readPackageVersion(directory, label) {
  await assertNoManagedSymlink(directory, "package.json");
  let parsed;
  try {
    parsed = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  } catch (error) {
    throw new Error(`${label}的 package.json 无效：${error.message}`, { cause: error });
  }
  return normalizeVersion(parsed?.version, `${label} package.json 版本`);
}

async function validateSourceVersion(directory, expectedVersion) {
  const actualVersion = await readPackageVersion(directory, "来源目录");
  if (actualVersion !== expectedVersion) {
    throw new Error(`来源目录 package.json 版本 ${actualVersion} 与来源版本 ${expectedVersion} 不一致。`);
  }
  await assertNoManagedSymlink(directory, VERSION_FILE);
  const marker = await readOptional(join(directory, VERSION_FILE));
  if (marker !== null) {
    const markerVersion = normalizeVersion(marker.toString("utf8"), "来源目录 marker 版本");
    if (markerVersion !== expectedVersion) {
      throw new Error(`来源目录 marker 版本 ${markerVersion} 与来源版本 ${expectedVersion} 不一致。`);
    }
  }
}

async function validateManifest(directory, expectedVersion) {
  await assertNoManagedSymlink(directory, "fonscape.manifest.json");
  const packageVersion = await readPackageVersion(directory, "目标目录");
  if (packageVersion !== expectedVersion) {
    throw new Error(`目标目录 package.json 版本 ${packageVersion} 与目标版本 ${expectedVersion} 不一致。`);
  }
  const raw = await readFile(join(directory, "fonscape.manifest.json"), "utf8");
  const manifest = JSON.parse(raw);
  if (manifest.schemaVersion !== 1) throw new Error("不支持的 Fonscape manifest 版本。 ");
  if (normalizeVersion(manifest.version, "manifest 版本") !== expectedVersion) {
    throw new Error(`manifest 版本 ${manifest.version} 与目标版本 ${expectedVersion} 不一致。`);
  }
  for (const key of ["user", "seed", "merge", "theme"]) {
    if (!Array.isArray(manifest.ownership?.[key]) || manifest.ownership[key].some((item) => typeof item !== "string")) {
      throw new Error(`manifest ownership.${key} 无效。`);
    }
  }
  if (manifest.ownership.history !== undefined && (
    !Array.isArray(manifest.ownership.history)
    || manifest.ownership.history.some((item) => typeof item !== "string")
  )) {
    throw new Error("manifest ownership.history 无效。");
  }
  if (manifest.ownership.user.includes(PUBLIC_ENV_TEMPLATE_PATH)) {
    throw new Error("manifest ownership.user 不能声明 .env.example 为用户文件。");
  }
  if (!["merge", "theme"].some((key) => manifest.ownership[key].includes(PUBLIC_ENV_TEMPLATE_PATH))) {
    throw new Error("manifest 必须将精确 .env.example 声明为 merge 或 theme 文件。");
  }
  for (const pattern of MANDATORY_USER_PATTERNS) {
    if (!manifest.ownership.user.includes(pattern)) {
      throw new Error(`manifest ownership.user 缺少受保护路径：${pattern}`);
    }
  }
  if (manifest.ownership.seed.some((pattern) => !ALLOWED_SEED_PATHS.has(pattern))) {
    throw new Error("manifest ownership.seed 只能包含 fonscape.config.js 与 src/content/friends.json。");
  }
  if (manifest.ownership.seed.some((pattern) => !manifest.ownership.user.includes(pattern))) {
    throw new Error("manifest ownership.seed 必须是受保护的 user 路径。");
  }
  return manifest;
}

async function runGit(args, options = {}) {
  return execFileAsync("git", args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, ...options });
}

async function discoverLatest(repository) {
  const { stdout } = await runGit(["ls-remote", "--refs", "--tags", repository]);
  return latestStableVersion(stdout.split("\n").map((line) => line.split("refs/tags/v")[1]).filter(Boolean));
}

async function cloneVersion(repository, version, parent, name) {
  const destination = join(parent, name);
  await runGit(["clone", "--quiet", "--depth", "1", "--branch", `v${version}`, "--single-branch", repository, destination]);
  return destination;
}

function jsonEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

const ABSENT = Symbol("absent");

function mergeJsonValue(base, local, target, path, warnings) {
  if (jsonEqual(local, base)) return target;
  if (jsonEqual(target, base) || jsonEqual(local, target)) return local;
  const objects = [base, local, target].every((value) => value !== null && value !== ABSENT && typeof value === "object" && !Array.isArray(value));
  if (objects) {
    const result = {};
    const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(target)]);
    for (const key of keys) {
      const value = mergeJsonValue(
        Object.hasOwn(base, key) ? base[key] : ABSENT,
        Object.hasOwn(local, key) ? local[key] : ABSENT,
        Object.hasOwn(target, key) ? target[key] : ABSENT,
        path ? `${path}.${key}` : key,
        warnings,
      );
      if (value !== ABSENT) result[key] = value;
    }
    return result;
  }
  warnings.push(`package.json 保留了站点自己的 ${path} 值；请确认它仍符合新版本要求。`);
  return local;
}

function mergePackageJson(base, local, target, warnings) {
  try {
    const merged = mergeJsonValue(
      JSON.parse(base.toString("utf8")),
      JSON.parse(local.toString("utf8")),
      JSON.parse(target.toString("utf8")),
      "",
      warnings,
    );
    return Buffer.from(`${JSON.stringify(merged, null, 2)}\n`);
  } catch {
    return null;
  }
}

async function mergeText(base, local, target, temporaryDirectory, path) {
  const token = createHash("sha256").update(path).digest("hex").slice(0, 16);
  const currentPath = join(temporaryDirectory, `${token}.current`);
  const basePath = join(temporaryDirectory, `${token}.base`);
  const targetPath = join(temporaryDirectory, `${token}.target`);
  await Promise.all([
    writeFile(currentPath, local),
    writeFile(basePath, base),
    writeFile(targetPath, target),
  ]);
  try {
    const { stdout } = await runGit(["merge-file", "-p", "--diff3", currentPath, basePath, targetPath], { encoding: null });
    return { content: Buffer.from(stdout), conflicted: false };
  } catch (error) {
    // git-merge-file returns the number of conflicts (capped at 127), not a
    // single generic conflict code. Values above that range are usage/errors.
    const conflictCount = Number(error.code);
    if (Number.isInteger(conflictCount) && conflictCount >= 1 && conflictCount <= 127) {
      return { content: Buffer.from(error.stdout || ""), conflicted: true };
    }
    throw error;
  }
}

function action(path, operation, content, reason, mode, expectedLocal) {
  return { path, operation, content, reason, mode, expectedLocalHash: hash(expectedLocal) };
}

async function modeFor(directory, path, fallback = 0o644) {
  return stat(join(directory, path)).then((info) => info.mode & 0o777, () => fallback);
}

export async function createUpdatePlan({ project, source, target, manifest, fromVersion, targetVersion, temporaryDirectory, reconcileTheme = false }) {
  const projectPaths = reconcileTheme ? await walkFiles(project) : [];
  const installedHistoryPaths = reconcileTheme
    ? projectPaths.filter((path) => classifyPath(path, manifest) === "history")
    : await walkInstalledHistory(project, manifest);
  const allPaths = new Set([
    ...await walkFiles(source),
    ...await walkFiles(target),
    ...projectPaths,
  ]);
  const actions = [];
  const conflicts = [];
  const warnings = [];
  const skippedUserFiles = [];
  const installedHistoryByHash = new Map();
  for (const path of installedHistoryPaths) {
    const content = await readOptional(join(project, path));
    if (content !== null && !installedHistoryByHash.has(hash(content))) installedHistoryByHash.set(hash(content), path);
  }

  for (const path of [...allPaths].sort()) {
    if (path === VERSION_FILE) continue;
    const ownership = classifyPath(path, manifest);
    if (ownership === "unmanaged") continue;
    await assertNoManagedSymlink(project, path);
    if (ownership === "user") {
      const seeded = manifest.ownership.seed.some((pattern) => matchesPattern(path, pattern));
      if (seeded) {
        const [base, local, incoming] = await Promise.all([
          readOptional(join(source, path)),
          readOptional(join(project, path)),
          readOptional(join(target, path)),
        ]);
        if (base === null && local === null && incoming !== null) {
          actions.push(action(path, "write", incoming, "new-user-scaffold", await modeFor(target, path), local));
          continue;
        }
      }
      skippedUserFiles.push(path);
      continue;
    }
    const [base, local, incoming] = await Promise.all([
      readOptional(join(source, path)),
      readOptional(join(project, path)),
      readOptional(join(target, path)),
    ]);
    if (ownership === "history") {
      if (local === null && incoming !== null) {
        const equivalentPath = installedHistoryByHash.get(hash(incoming));
        if (equivalentPath) {
          warnings.push(`目标迁移 ${path} 与已有历史 ${equivalentPath} 内容相同，不重复添加。`);
        } else {
          actions.push(action(path, "write", incoming, "new-history-file", await modeFor(target, path), local));
        }
      } else if (local !== null && incoming !== null && !equal(local, incoming)) {
        conflicts.push({ path, reason: "immutable-history-file-changed", base, local, incoming, merged: null });
      }
      continue;
    }
    if (reconcileTheme && ownership === "theme") {
      if (equal(local, incoming)) continue;
      if (incoming === null) {
        if (local !== null) actions.push(action(path, "delete", null, "theme-reconcile-remove", null, local));
      } else {
        actions.push(action(path, "write", incoming, local === null ? "theme-reconcile-restore" : "theme-reconcile", await modeFor(target, path), local));
      }
      continue;
    }
    if (base === null && incoming !== null) {
      if (local === null) actions.push(action(path, "write", incoming, "new-theme-file", await modeFor(target, path), local));
      else if (!equal(local, incoming)) conflicts.push({ path, reason: "new-file-collides", base, local, incoming, merged: null });
      continue;
    }
    if (base !== null && incoming === null) {
      if (local !== null && equal(local, base)) actions.push(action(path, "delete", null, "removed-theme-file", null, local));
      else if (local !== null) conflicts.push({ path, reason: "removed-file-has-local-changes", base, local, incoming, merged: null });
      continue;
    }
    if (base === null || incoming === null) continue;
    if (local === null) {
      // A missing tracked file is an intentional site-level deletion. Restoring
      // it could re-enable docs, UI, or integrations the owner removed.
      continue;
    }
    if (equal(local, incoming) || equal(base, incoming)) continue;
    if (equal(local, base)) {
      actions.push(action(path, "write", incoming, "upstream-change", await modeFor(target, path), local));
      continue;
    }

    if (path === "package.json") {
      const merged = mergePackageJson(base, local, incoming, warnings);
      if (merged) {
        if (!equal(merged, local)) actions.push(action(path, "write", merged, "three-way-json-merge", await modeFor(project, path), local));
        continue;
      }
    }
    if (isText(base) && isText(local) && isText(incoming)) {
      const merged = await mergeText(base, local, incoming, temporaryDirectory, path);
      if (!merged.conflicted) {
        if (!equal(merged.content, local)) actions.push(action(path, "write", merged.content, "three-way-text-merge", await modeFor(project, path), local));
        continue;
      }
      conflicts.push({ path, reason: "three-way-merge-conflict", base, local, incoming, merged: merged.content });
      continue;
    }
    conflicts.push({ path, reason: "binary-file-changed-on-both-sides", base, local, incoming, merged: null });
  }

  return { fromVersion, targetVersion, actions, conflicts, warnings, skippedUserFiles };
}

async function atomicWrite(path, content, mode = 0o644) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = join(dirname(path), `.${basename(path)}.fonscape-${randomBytes(6).toString("hex")}`);
  await writeFile(temporaryPath, content, { mode });
  await chmod(temporaryPath, mode);
  await rename(temporaryPath, path);
}

async function copyOptional(source, destination) {
  const value = await readOptional(source);
  if (value === null) return false;
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  return true;
}

async function atomicCopy(source, destination, mode = 0o644) {
  await mkdir(dirname(destination), { recursive: true });
  const temporaryPath = join(dirname(destination), `.${basename(destination)}.fonscape-restore-${randomBytes(6).toString("hex")}`);
  try {
    await copyFile(source, temporaryPath);
    await chmod(temporaryPath, mode);
    await rename(temporaryPath, destination);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

async function ensureUpdateState(project) {
  await assertNoSymlink(project, "项目根目录");
  return ensureDirectory(join(project, UPDATE_DIRECTORY), "升级状态目录");
}

async function ensureStateSubdirectory(project, name) {
  const state = await ensureUpdateState(project);
  return ensureDirectory(join(state, name), `升级状态目录/${name}`);
}

async function withUpdateLock(project, operation) {
  const state = await ensureUpdateState(project);
  const lockPath = join(state, "update.lock");
  let lock;
  try {
    lock = await open(lockPath, "wx");
  } catch (error) {
    if (error.code === "EEXIST") throw new Error("另一个 Fonscape 升级进程正在运行；请勿同时升级同一站点。");
    throw error;
  }
  try {
    return await operation();
  } finally {
    try {
      await lock.close();
    } finally {
      await rm(lockPath, { force: true });
    }
  }
}

async function writeConflictBundle(project, plan) {
  const conflictsDirectory = await ensureStateSubdirectory(project, "conflicts");
  const root = join(conflictsDirectory, `${plan.fromVersion}-to-${plan.targetVersion}`);
  await assertNoManagedSymlink(project, `${UPDATE_DIRECTORY}/conflicts/${basename(root)}`);
  if (await exists(root)) {
    const info = await lstat(root);
    if (!info.isDirectory()) throw new Error(`冲突材料目录不是目录：${root}`);
  }
  await rm(root, { recursive: true, force: true });
  for (const conflict of plan.conflicts) {
    for (const [name, value] of [["base", conflict.base], ["current", conflict.local], ["incoming", conflict.incoming]]) {
      if (value !== null) await atomicWrite(join(root, name, conflict.path), value);
    }
    if (conflict.merged !== null) await atomicWrite(join(root, "resolved", conflict.path), conflict.merged);
  }
  await atomicWrite(join(root, "conflicts.json"), Buffer.from(`${JSON.stringify({
    fromVersion: plan.fromVersion,
    targetVersion: plan.targetVersion,
    conflicts: plan.conflicts.map(({ path, reason }) => ({ path, reason })),
  }, null, 2)}\n`));
  return root;
}

async function resolveConflicts(plan, resolutionDirectory, alreadySelected = new Set()) {
  if (!resolutionDirectory) return;
  for (const path of alreadySelected) {
    const resolvedPath = join(resolutionDirectory, path);
    const content = await readOptional(resolvedPath);
    const hasUsableResolution = content !== null
      ? !(isText(content) && CONFLICT_MARKER.test(content.toString("utf8")))
      : await exists(`${resolvedPath}.fonscape-delete`);
    if (hasUsableResolution) {
      throw new Error(`--take-incoming 与 --resolutions 同时指定了冲突文件：${path}`);
    }
  }
  for (const conflict of plan.conflicts) {
    const resolvedPath = join(resolutionDirectory, conflict.path);
    const deleteMarker = `${resolvedPath}.fonscape-delete`;
    const content = await readOptional(resolvedPath);
    if (content !== null) {
      if (isText(content) && CONFLICT_MARKER.test(content.toString("utf8"))) throw new Error(`冲突标记尚未清理：${conflict.path}`);
      plan.actions.push(action(conflict.path, "write", content, "manual-conflict-resolution", await modeFor(resolutionDirectory, conflict.path), conflict.local));
    } else if (await exists(deleteMarker)) {
      plan.actions.push(action(conflict.path, "delete", null, "manual-conflict-resolution", null, conflict.local));
    } else {
      throw new Error(`缺少冲突解决结果：${conflict.path}`);
    }
  }
  plan.conflicts = [];
}

async function takeIncomingFiles(plan, paths = [], target) {
  const selected = new Set();
  for (const path of new Set(paths)) {
    const conflictIndex = plan.conflicts.findIndex((item) => item.path === path);
    if (conflictIndex < 0) throw new Error(`--take-incoming 指定的文件不是当前未解决冲突：${path}`);
    const [conflict] = plan.conflicts.splice(conflictIndex, 1);
    const operation = conflict.incoming === null ? "delete" : "write";
    plan.actions.push(action(
      path,
      operation,
      conflict.incoming,
      "take-incoming",
      operation === "delete" ? null : await modeFor(target, path),
      conflict.local,
    ));
    plan.warnings.push(`已按 --take-incoming 采用目标版本：${path}`);
    selected.add(path);
  }
  return selected;
}

function keepCurrentFiles(plan, paths = []) {
  for (const path of new Set(paths)) {
    const actionIndex = plan.actions.findIndex((item) => item.path === path);
    const conflictIndex = plan.conflicts.findIndex((item) => item.path === path);
    if (actionIndex < 0 && conflictIndex < 0) throw new Error(`--keep 指定的文件不在升级计划中：${path}`);
    if (actionIndex >= 0) plan.actions.splice(actionIndex, 1);
    if (conflictIndex >= 0) plan.conflicts.splice(conflictIndex, 1);
    plan.warnings.push(`已按 --keep 保留站点当前文件：${path}`);
  }
}

async function createBackup(project, plan) {
  const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const backupsDirectory = await ensureStateSubdirectory(project, "backups");
  const root = join(backupsDirectory, `${timestamp}-${plan.fromVersion}-to-${plan.targetVersion}`);
  await assertNoManagedSymlink(project, `${UPDATE_DIRECTORY}/backups/${basename(root)}`);
  if (await exists(root)) throw new Error(`备份目录已存在，已停止以免覆盖旧备份：${root}`);
  await mkdir(root, { recursive: true });
  await assertNoManagedSymlink(project, VERSION_FILE);
  const previousVersion = await readOptional(join(project, VERSION_FILE));
  const entries = [];
  for (const item of plan.actions) {
    await assertNoManagedSymlink(project, item.path);
    const source = absoluteManagedPath(project, item.path);
    const filesRoot = join(root, "files");
    await assertNoManagedSymlink(filesRoot, item.path);
    const destination = absoluteManagedPath(filesRoot, item.path);
    const present = await copyOptional(source, destination);
    const mode = present ? await modeFor(project, item.path) : null;
    entries.push({ path: item.path, present, mode });
  }
  await writeFile(join(root, "backup.json"), `${JSON.stringify({
    schemaVersion: 1,
    fromVersion: plan.fromVersion,
    targetVersion: plan.targetVersion,
    previousVersion: previousVersion?.toString("utf8") ?? null,
    entries,
  }, null, 2)}\n`);
  return root;
}

async function applyPlan(project, plan) {
  return withUpdateLock(project, async () => {
    let backup;
    try {
      await assertNoManagedSymlink(project, VERSION_FILE);
      for (const item of plan.actions) {
        // Check before reading or backing up so a symlink can never leak an
        // external file into updater state before the write phase rejects it.
        await assertNoManagedSymlink(project, item.path);
        const current = await readOptional(absoluteManagedPath(project, item.path));
        if (hash(current) !== item.expectedLocalHash) throw new Error(`生成计划后文件发生变化，已停止：${item.path}`);
      }
      backup = await createBackup(project, plan);
      for (const item of plan.actions.sort((a, b) => a.path.localeCompare(b.path))) {
        const destination = absoluteManagedPath(project, item.path);
        await assertNoManagedSymlink(project, item.path);
        if (item.operation === "delete") await rm(destination, { force: true });
        else await atomicWrite(destination, item.content, item.mode);
      }
      await atomicWrite(join(project, VERSION_FILE), Buffer.from(`${plan.targetVersion}\n`));
    } catch (error) {
      if (backup) {
        try {
          await rollbackUnlocked(project, backup);
        } catch (rollbackError) {
          throw new Error(`升级写入失败，自动回滚也失败：${rollbackError.message}`, { cause: error });
        }
        throw new Error(`升级写入失败，已自动回滚：${error.message}`, { cause: error });
      }
      throw error;
    }
    return backup;
  });
}

async function readBackup(project, backupArgument) {
  const backupsRoot = await ensureStateSubdirectory(project, "backups");
  const backup = isAbsolute(backupArgument) ? resolve(backupArgument) : resolve(project, backupArgument);
  if (!inside(backupsRoot, backup) || backup === backupsRoot) throw new Error("回滚目录必须位于 .fonscape-update/backups 内。");
  const backupRelative = relative(backupsRoot, backup);
  await assertNoManagedSymlink(backupsRoot, backupRelative);
  const backupInfo = await assertNoSymlink(backup, "备份目录");
  if (!backupInfo?.isDirectory()) throw new Error(`备份目录无效：${backup}`);
  const metadataPath = join(backup, "backup.json");
  const metadataInfo = await assertNoSymlink(metadataPath, "备份信息");
  if (!metadataInfo?.isFile()) throw new Error(`缺少有效的备份信息：${metadataPath}`);
  let metadata;
  try {
    metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  } catch (error) {
    throw new Error(`备份信息无效：${error.message}`, { cause: error });
  }
  if (
    !metadata ||
    metadata.schemaVersion !== 1 ||
    !Array.isArray(metadata.entries) ||
    typeof metadata.fromVersion !== "string" ||
    typeof metadata.targetVersion !== "string" ||
    !(metadata.previousVersion === null || typeof metadata.previousVersion === "string")
  ) throw new Error("备份信息无效。");
  normalizeVersion(metadata.fromVersion, "备份来源版本");
  normalizeVersion(metadata.targetVersion, "备份目标版本");
  if (metadata.previousVersion !== null) normalizeVersion(metadata.previousVersion, "备份 previousVersion");
  const paths = new Set();
  const filesRoot = join(backup, "files");
  for (const entry of metadata.entries) {
    if (!entry || typeof entry.path !== "string") throw new Error("备份条目路径无效。");
    const safePath = safeRelativePath(entry.path);
    if (safePath === VERSION_FILE || safePath === UPDATE_DIRECTORY || safePath.startsWith(`${UPDATE_DIRECTORY}/`)) {
      throw new Error(`备份条目不能操作升级器状态：${safePath}`);
    }
    if (paths.has(safePath)) throw new Error(`备份条目重复：${safePath}`);
    paths.add(safePath);
    if (typeof entry.present !== "boolean") throw new Error(`备份条目 present 无效：${safePath}`);
    if (entry.present) {
      if (!Number.isInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o777) throw new Error(`备份条目 mode 无效：${safePath}`);
      await assertNoManagedSymlink(filesRoot, safePath);
      const sourceInfo = await lstat(absoluteManagedPath(filesRoot, safePath)).catch((error) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (!sourceInfo?.isFile()) throw new Error(`备份文件缺失或不是普通文件：${safePath}`);
    } else if (entry.mode !== null) {
      throw new Error(`缺失文件的备份 mode 必须为 null：${safePath}`);
    }
    await assertNoManagedSymlink(project, safePath);
    const destinationInfo = await lstat(absoluteManagedPath(project, safePath)).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (destinationInfo?.isDirectory()) throw new Error(`回滚目标不能是目录：${safePath}`);
  }
  await assertNoManagedSymlink(project, VERSION_FILE);
  return { backup, metadata, filesRoot };
}

async function rollbackUnlocked(project, backupArgument) {
  const { metadata, filesRoot } = await readBackup(project, backupArgument);
  for (const entry of metadata.entries.slice().reverse()) {
    const destination = absoluteManagedPath(project, entry.path);
    if (entry.present) {
      await atomicCopy(absoluteManagedPath(filesRoot, entry.path), destination, entry.mode);
    }
    else await rm(destination, { force: true });
  }
  if (metadata.previousVersion === null) await rm(join(project, VERSION_FILE), { force: true });
  else await atomicWrite(join(project, VERSION_FILE), Buffer.from(metadata.previousVersion));
}

async function rollback(project, backupArgument) {
  return withUpdateLock(project, () => rollbackUnlocked(project, backupArgument));
}

function printPlan(plan) {
  console.log(`Fonscape ${plan.fromVersion} → ${plan.targetVersion}`);
  console.log(`计划更新 ${plan.actions.length} 个文件；保护 ${plan.skippedUserFiles.length} 个用户文件；冲突 ${plan.conflicts.length} 个。`);
  for (const item of plan.actions) console.log(`  ${item.operation === "delete" ? "删除" : "更新"} ${item.path} (${item.reason})`);
  for (const warning of plan.warnings) console.warn(`  提醒：${warning}`);
  for (const conflict of plan.conflicts) console.error(`  冲突：${conflict.path} (${conflict.reason})`);
}

async function resolveInstalledVersion(project, provided) {
  await assertNoManagedSymlink(project, VERSION_FILE);
  const marker = await readOptional(join(project, VERSION_FILE));
  if (marker) {
    const installed = normalizeVersion(marker.toString("utf8"), `${VERSION_FILE} 中的版本`);
    if (provided) {
      const requested = normalizeVersion(provided, "来源版本");
      if (requested !== installed) {
        throw new Error(`--from ${requested} 与已安装的 ${VERSION_FILE} 版本 ${installed} 不一致。`);
      }
    }
    return installed;
  }
  throw new Error(`未找到 ${VERSION_FILE}。升级器无法安全确定当前主题版本；请先为站点写入正确的 marker。`);
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const project = resolve(options.project);
  await assertNoSymlink(project, "项目根目录");
  if (options.rollback) {
    await rollback(project, options.rollback);
    console.log(`已从备份恢复：${options.rollback}`);
    return;
  }
  if (!(await exists(join(project, "package.json")))) throw new Error("目标目录不是 Fonscape 项目：缺少 package.json。");
  const repository = options.repository || CANONICAL_REPOSITORY;
  const fromVersion = await resolveInstalledVersion(project, options.from);
  const targetDirectory = options.target_dir ? resolve(options.target_dir) : null;
  if (targetDirectory) await assertNoSymlink(targetDirectory, "目标目录");
  const targetVersion = options.to
    ? normalizeVersion(options.to, "目标版本")
    : targetDirectory
      ? await readPackageVersion(targetDirectory, "目标目录")
      : await discoverLatest(repository);
  if (compareVersions(targetVersion, fromVersion) <= 0) throw new Error(`目标版本 ${targetVersion} 必须高于当前版本 ${fromVersion}。`);

  const temporaryRoot = await mkdtemp(join(tmpdir(), "fonscape-update-"));
  try {
    const source = options.source_dir
      ? resolve(options.source_dir)
      : await cloneVersion(repository, fromVersion, temporaryRoot, "source");
    const target = targetDirectory
      ? targetDirectory
      : await cloneVersion(repository, targetVersion, temporaryRoot, "target");
    await validateSourceVersion(source, fromVersion);
    const manifest = await validateManifest(target, targetVersion);
    const plan = await createUpdatePlan({
      project,
      source,
      target,
      manifest,
      fromVersion,
      targetVersion,
      temporaryDirectory: temporaryRoot,
      reconcileTheme: options.reconcile_theme,
    });
    keepCurrentFiles(plan, options.keep);
    const incomingPaths = await takeIncomingFiles(plan, options.take_incoming, target);
    await resolveConflicts(plan, options.resolutions ? resolve(options.resolutions) : null, incomingPaths);
    printPlan(plan);
    if (plan.conflicts.length) {
      const directory = await withUpdateLock(project, () => writeConflictBundle(project, plan));
      throw new Error(`存在不能自动处理的冲突。材料已写入 ${relative(project, directory)}，解决后用 --resolutions 指定其中的 resolved 目录。`);
    }
    if (!options.apply) {
      console.log("这是预演，没有修改任何站点文件。确认后增加 --apply。 ");
      return;
    }
    const backup = await applyPlan(project, plan);
    console.log(`升级文件已写入。备份位于 ${relative(project, backup)}。`);
    console.log("请运行 pnpm install --frozen-lockfile 与 pnpm check，并在预览环境核对页面后再发布。 ");
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

const isEntry = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  main().catch((error) => {
    console.error(`Fonscape 升级失败：${error.message}`);
    process.exitCode = 1;
  });
}

export { main, rollback };
