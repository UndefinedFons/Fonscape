import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { parseArgs, usage } from "./args.mjs";
import { CANONICAL_REPOSITORY, VERSION_FILE } from "./constants.mjs";
import {
  assertNoManagedSymlink,
  assertNoSymlink,
  exists,
  readOptional,
} from "./paths.mjs";
import {
  cloneVersion,
  compareVersions,
  discoverLatest,
  normalizeVersion,
  readPackageVersion,
  validateManifest,
  validateSourceVersion,
} from "./versions.mjs";
import { createUpdatePlan } from "./plan.mjs";
import {
  applyPlan,
  keepCurrentFiles,
  resolveConflicts,
  rollback,
  takeIncomingFiles,
  withUpdateLock,
  writeConflictBundle,
} from "./state.mjs";

export function printPlan(plan) {
  console.log(`Fonscape ${plan.fromVersion} → ${plan.targetVersion}`);
  console.log(`计划更新 ${plan.actions.length} 个文件；保护 ${plan.skippedUserFiles.length} 个用户文件；冲突 ${plan.conflicts.length} 个。`);
  for (const item of plan.actions) console.log(`  ${item.operation === "delete" ? "删除" : "更新"} ${item.path} (${item.reason})`);
  for (const warning of plan.warnings) console.warn(`  提醒：${warning}`);
  for (const conflict of plan.conflicts) console.error(`  冲突：${conflict.path} (${conflict.reason})`);
}

export async function resolveInstalledVersion(project, provided) {
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

export async function main(argv = process.argv.slice(2)) {
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

export { rollback };
