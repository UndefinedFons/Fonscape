import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import eslintConfig from "../eslint.config.js";

test("the quality gate rejects every lint warning without disabling Hooks checks", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.scripts.lint, "eslint . --max-warnings 0");
  assert.match(manifest.scripts.check, /\bpnpm lint\b/u);
  const hooks = eslintConfig.find((config) => config.plugins?.["react-hooks"]);
  assert.equal(hooks.rules["react-hooks/rules-of-hooks"], "error");
  assert.equal(hooks.rules["react-hooks/exhaustive-deps"], "warn");
});
