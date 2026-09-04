import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readWorkflow(name) {
  return readFile(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8");
}

function cacheStep(workflow) {
  const match = workflow.match(/\s{6}- name: Restore responsive image cache[\s\S]*?(?=\n\s{6}- name:|\n\s{4}[a-z]|$)/u);
  assert.ok(match, "workflow must restore the responsive image cache");
  return match[0];
}

function restorePrefix(step) {
  const match = step.match(/restore-keys:\s*\|\n\s+([^\n]+)/u);
  assert.ok(match, "cache must provide a restore prefix");
  return match[1];
}

function cacheKey(step) {
  const match = step.match(/\n\s+key:\s*([^\n]+)/u);
  assert.ok(match, "cache must provide a primary key");
  return match[1];
}

test("Checks and deployment share a resilient responsive image cache contract", async () => {
  const [checkWorkflow, deployWorkflow, gitignore] = await Promise.all([
    readWorkflow("check.yml"),
    readWorkflow("deploy.yml"),
    readFile(new URL("../.gitignore", import.meta.url), "utf8"),
  ]);
  const steps = [cacheStep(checkWorkflow), cacheStep(deployWorkflow)];

  for (const step of steps) {
    assert.match(step, /uses:\s*actions\/cache@/u);
    assert.match(step, /continue-on-error:\s*true/u);
    assert.match(step, /fail-on-cache-miss:\s*false/u);
    assert.match(step, /path:\s*\|\n\s+public\/fonscape\/generated-images\/\n\s+\.fonscape-cache\/responsive-images\//u);
    const invalidationInputs = [
      "scripts/generate-responsive-images.mjs",
      "scripts/generate-content-targets.mjs",
      "scripts/generate-font-css.mjs",
      "src/content/frontmatter.js",
      "src/content/markdown.js",
      "src/pages/homeContent.js",
      "src/siteConfig.js",
      "src/responsiveImages.ts",
      "package.json",
      "pnpm-lock.yaml",
      "public/assets/**/*",
      "fonscape.config.js",
      "src/content/**/*",
    ];
    assert.ok(invalidationInputs.every((input) => step.includes(input)), "source and content inputs must invalidate the cache");
    assert.doesNotMatch(step, /hashFiles\([^)]*generated-images/u, "generated outputs must not affect cache hashes");
    assert.ok(cacheKey(step).startsWith(restorePrefix(step)), "primary key must extend the restore prefix");
  }

  assert.equal(restorePrefix(cacheStep(checkWorkflow)), restorePrefix(cacheStep(deployWorkflow)));
  for (const workflow of [checkWorkflow, deployWorkflow]) {
    const installIndex = workflow.indexOf("run: pnpm install --frozen-lockfile");
    const cacheIndex = workflow.indexOf("- name: Restore responsive image cache");
    const checkIndex = workflow.indexOf("- name: Test and build");
    assert.ok(installIndex < cacheIndex && cacheIndex < checkIndex, "cache must restore after install and before checks");
  }

  assert.match(gitignore, /^\.fonscape-cache\/$/mu);
});
