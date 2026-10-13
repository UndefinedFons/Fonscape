import { execFile } from "node:child_process";
import type { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  ALLOWED_SEED_PATHS,
  MANDATORY_USER_PATTERNS,
  PUBLIC_ENV_TEMPLATE_PATH,
  SEMVER,
  VERSION_FILE,
} from "./constants.ts";
import { errorMessage, isRecord, isStringArray } from "./guards.ts";
import { assertNoManagedSymlink, readOptional } from "./paths.ts";
import type { ManifestOwnership, UpdateManifest } from "./types.ts";

const execFileAsync = promisify(execFile);

export function normalizeVersion(value: unknown, label = "版本号"): string {
  const match = String(value || "").trim().match(SEMVER);
  if (!match) throw new Error(`${label}必须是 X.Y.Z 格式。`);
  return `${match[1]}.${match[2]}.${match[3]}`;
}

function versionParts(value: unknown): readonly [number, number, number] {
  const match = normalizeVersion(value).match(SEMVER);
  if (!match) throw new Error("版本号必须是 X.Y.Z 格式。");
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareVersions(left: unknown, right: unknown): number {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < a.length; index += 1) {
    const leftPart = a[index];
    const rightPart = b[index];
    if (leftPart !== rightPart) return leftPart - rightPart;
  }
  return 0;
}

export function latestStableVersion(tags: readonly string[]): string {
  const versions = tags
    .map((tag) => String(tag).trim())
    .filter((tag) => SEMVER.test(tag))
    .map((tag) => normalizeVersion(tag));
  if (!versions.length) throw new Error("没有找到可用的稳定版本标签。");
  versions.sort(compareVersions);
  const latest = versions.at(-1);
  if (!latest) throw new Error("没有找到可用的稳定版本标签。");
  return latest;
}

export async function readPackageVersion(directory: string, label: string): Promise<string> {
  await assertNoManagedSymlink(directory, "package.json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  } catch (error) {
    throw new Error(`${label}的 package.json 无效：${errorMessage(error)}`, { cause: error });
  }
  const version = isRecord(parsed) ? parsed.version : undefined;
  return normalizeVersion(version, `${label} package.json 版本`);
}

export async function validateSourceVersion(directory: string, expectedVersion: string): Promise<void> {
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

export async function validateManifest(directory: string, expectedVersion: string): Promise<UpdateManifest> {
  await assertNoManagedSymlink(directory, "fonscape.manifest.json");
  const packageVersion = await readPackageVersion(directory, "目标目录");
  if (packageVersion !== expectedVersion) {
    throw new Error(`目标目录 package.json 版本 ${packageVersion} 与目标版本 ${expectedVersion} 不一致。`);
  }
  const raw = await readFile(join(directory, "fonscape.manifest.json"), "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || parsed.schemaVersion !== 1) throw new Error("不支持的 Fonscape manifest 版本。 ");
  if (normalizeVersion(parsed.version, "manifest 版本") !== expectedVersion) {
    throw new Error(`manifest 版本 ${String(parsed.version)} 与目标版本 ${expectedVersion} 不一致。`);
  }
  if (!isRecord(parsed.ownership)) throw new Error("manifest ownership.user 无效。");
  const rawOwnership = parsed.ownership;
  const user = rawOwnership.user;
  const seed = rawOwnership.seed;
  const merge = rawOwnership.merge;
  const theme = rawOwnership.theme;
  const history = rawOwnership.history;
  if (!isStringArray(user)) throw new Error("manifest ownership.user 无效。");
  if (!isStringArray(seed)) throw new Error("manifest ownership.seed 无效。");
  if (!isStringArray(merge)) throw new Error("manifest ownership.merge 无效。");
  if (!isStringArray(theme)) throw new Error("manifest ownership.theme 无效。");
  if (history !== undefined && !isStringArray(history)) {
    throw new Error("manifest ownership.history 无效。");
  }

  const ownership: ManifestOwnership = {
    user,
    seed,
    merge,
    theme,
    ...(history === undefined ? {} : { history }),
  };
  const version = normalizeVersion(parsed.version, "manifest 版本");
  if (ownership.user.includes(PUBLIC_ENV_TEMPLATE_PATH)) {
    throw new Error("manifest ownership.user 不能声明 .env.example 为用户文件。");
  }
  if (![...ownership.merge, ...ownership.theme].includes(PUBLIC_ENV_TEMPLATE_PATH)) {
    throw new Error("manifest 必须将精确 .env.example 声明为 merge 或 theme 文件。");
  }
  for (const pattern of MANDATORY_USER_PATTERNS) {
    if (!ownership.user.includes(pattern)) {
      throw new Error(`manifest ownership.user 缺少受保护路径：${pattern}`);
    }
  }
  if (ownership.seed.some((pattern) => !ALLOWED_SEED_PATHS.has(pattern))) {
    throw new Error("manifest ownership.seed 只能包含 fonscape.config.js 与 src/content/friends.json。");
  }
  if (ownership.seed.some((pattern) => !ownership.user.includes(pattern))) {
    throw new Error("manifest ownership.seed 必须是受保护的 user 路径。");
  }
  return { schemaVersion: 1, version, ownership };
}

interface GitOptions {
  encoding?: "utf8" | null;
}

interface GitStringResult {
  stdout: string;
  stderr: string;
}

interface GitBufferResult {
  stdout: Buffer;
  stderr: Buffer;
}

export function runGit(args: string[], options: { encoding: null }): Promise<GitBufferResult>;
export function runGit(args: string[], options?: { encoding?: "utf8" }): Promise<GitStringResult>;
export function runGit(args: string[], options: GitOptions = {}): Promise<GitStringResult | GitBufferResult> {
  const common = { maxBuffer: 8 * 1024 * 1024 };
  if (options.encoding === null) {
    return execFileAsync("git", args, { ...common, encoding: null });
  }
  return execFileAsync("git", args, { ...common, encoding: "utf8" });
}

export async function discoverLatest(repository: string): Promise<string> {
  const { stdout } = await runGit(["ls-remote", "--refs", "--tags", repository]);
  return latestStableVersion(stdout.split("\n").map((line) => line.split("refs/tags/v")[1]).filter(Boolean));
}

export async function cloneVersion(repository: string, version: string, parent: string, name: string): Promise<string> {
  const destination = join(parent, name);
  await runGit(["clone", "--quiet", "--depth", "1", "--branch", `v${version}`, "--single-branch", repository, destination]);
  return destination;
}
