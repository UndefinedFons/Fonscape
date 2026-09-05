import { join } from "node:path";
import { VERSION_FILE } from "./constants.mjs";
import {
  action,
  assertNoManagedSymlink,
  classifyPath,
  equal,
  hash,
  isText,
  matchesPattern,
  modeFor,
  readOptional,
  walkFiles,
  walkInstalledHistory,
} from "./paths.mjs";
import { mergePackageJson, mergeText } from "./merge.mjs";

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
