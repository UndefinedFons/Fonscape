import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  ALLOWED_SEED_PATHS,
  MANDATORY_USER_PATTERNS,
  PUBLIC_ENV_TEMPLATE_PATH,
  SEMVER,
  VERSION_FILE,
} from "./constants.mjs";
import {
  assertNoManagedSymlink,
  readOptional,
} from "./paths.mjs";

const execFileAsync = promisify(execFile);

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

export async function readPackageVersion(directory, label) {
  await assertNoManagedSymlink(directory, "package.json");
  let parsed;
  try {
    parsed = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  } catch (error) {
    throw new Error(`${label}的 package.json 无效：${error.message}`, { cause: error });
  }
  return normalizeVersion(parsed?.version, `${label} package.json 版本`);
}

export async function validateSourceVersion(directory, expectedVersion) {
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

export async function validateManifest(directory, expectedVersion) {
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

export async function runGit(args, options = {}) {
  return execFileAsync("git", args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, ...options });
}

export async function discoverLatest(repository) {
  const { stdout } = await runGit(["ls-remote", "--refs", "--tags", repository]);
  return latestStableVersion(stdout.split("\n").map((line) => line.split("refs/tags/v")[1]).filter(Boolean));
}

export async function cloneVersion(repository, version, parent, name) {
  const destination = join(parent, name);
  await runGit(["clone", "--quiet", "--depth", "1", "--branch", `v${version}`, "--single-branch", repository, destination]);
  return destination;
}
