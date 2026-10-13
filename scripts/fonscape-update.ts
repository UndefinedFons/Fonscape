#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { main, rollback } from "./fonscape-update/cli.ts";
import { errorMessage } from "./fonscape-update/guards.ts";

export { createUpdatePlan } from "./fonscape-update/plan.ts";
export { classifyPath } from "./fonscape-update/paths.ts";
export { compareVersions, latestStableVersion, normalizeVersion } from "./fonscape-update/versions.ts";
export { main, rollback };

const isEntry = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  main().catch((error) => {
    console.error(`Fonscape 升级失败：${errorMessage(error)}`);
    process.exitCode = 1;
  });
}
