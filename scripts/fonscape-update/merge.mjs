import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runGit } from "./versions.mjs";

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

export function mergePackageJson(base, local, target, warnings) {
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

export async function mergeText(base, local, target, temporaryDirectory, path) {
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
