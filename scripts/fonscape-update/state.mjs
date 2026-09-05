import { randomBytes } from "node:crypto";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  CONFLICT_MARKER,
  UPDATE_DIRECTORY,
  VERSION_FILE,
} from "./constants.mjs";
import {
  action,
  absoluteManagedPath,
  assertNoManagedSymlink,
  assertNoSymlink,
  ensureDirectory,
  exists,
  hash,
  isText,
  modeFor,
  readOptional,
  safeRelativePath,
  inside,
} from "./paths.mjs";
import { normalizeVersion } from "./versions.mjs";

export async function atomicWrite(path, content, mode = 0o644) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = join(dirname(path), `.${basename(path)}.fonscape-${randomBytes(6).toString("hex")}`);
  await writeFile(temporaryPath, content, { mode });
  await chmod(temporaryPath, mode);
  await rename(temporaryPath, path);
}

export async function copyOptional(source, destination) {
  const value = await readOptional(source);
  if (value === null) return false;
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  return true;
}

export async function atomicCopy(source, destination, mode = 0o644) {
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

export async function withUpdateLock(project, operation) {
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

export async function writeConflictBundle(project, plan) {
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

export async function resolveConflicts(plan, resolutionDirectory, alreadySelected = new Set()) {
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

export async function takeIncomingFiles(plan, paths = [], target) {
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

export function keepCurrentFiles(plan, paths = []) {
  for (const path of new Set(paths)) {
    const actionIndex = plan.actions.findIndex((item) => item.path === path);
    const conflictIndex = plan.conflicts.findIndex((item) => item.path === path);
    if (actionIndex < 0 && conflictIndex < 0) throw new Error(`--keep 指定的文件不在升级计划中：${path}`);
    if (actionIndex >= 0) plan.actions.splice(actionIndex, 1);
    if (conflictIndex >= 0) plan.conflicts.splice(conflictIndex, 1);
    plan.warnings.push(`已按 --keep 保留站点当前文件：${path}`);
  }
}

export async function createBackup(project, plan) {
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

export async function applyPlan(project, plan) {
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

export async function rollback(project, backupArgument) {
  return withUpdateLock(project, () => rollbackUnlocked(project, backupArgument));
}
