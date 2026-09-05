#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { main, rollback } from "./fonscape-update/cli.mjs";

export { createUpdatePlan } from "./fonscape-update/plan.mjs";
export { classifyPath } from "./fonscape-update/paths.mjs";
export { compareVersions, latestStableVersion, normalizeVersion } from "./fonscape-update/versions.mjs";
export { main, rollback };

const isEntry = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  main().catch((error) => {
    console.error(`Fonscape 升级失败：${error.message}`);
    process.exitCode = 1;
  });
}
