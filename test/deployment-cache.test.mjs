import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cacheAction = "actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9";
const cacheNamespace = "fonscape-responsive-images-v1";
const cachePrefix = `${cacheNamespace}-\${{ runner.os }}-\${{ runner.arch }}-node22-pnpm11.16.0-\${{ hashFiles('scripts/generate-responsive-images.mjs', 'scripts/generate-content-targets.mjs', 'scripts/generate-font-css.mjs', 'src/content/frontmatter.js', 'src/content/markdown.js', 'src/pages/homeContent.js', 'src/siteConfig.js', 'src/responsiveImages.ts', 'package.json', 'pnpm-lock.yaml') }}-`;

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

test("Checks and deployment share a resilient responsive image cache contract", async () => {
  const [checkWorkflow, deployWorkflow, gitignore, guide] = await Promise.all([
    readWorkflow("check.yml"),
    readWorkflow("deploy.yml"),
    readFile(new URL("../.gitignore", import.meta.url), "utf8"),
    readFile(new URL("../GUIDE.md", import.meta.url), "utf8"),
  ]);
  const steps = [cacheStep(checkWorkflow), cacheStep(deployWorkflow)];

  for (const step of steps) {
    assert.match(step, new RegExp(`uses: ${cacheAction.replaceAll("/", "\\/")} # v6\\.1\\.0`, "u"));
    assert.match(step, /continue-on-error:\s*true/u);
    assert.match(step, /fail-on-cache-miss:\s*false/u);
    assert.match(step, /path:\s*\|\n\s+public\/fonscape\/generated-images\/\n\s+\.fonscape-cache\/responsive-images\//u);
    assert.match(step, /hashFiles\('scripts\/generate-responsive-images\.mjs'/u);
    assert.match(step, /scripts\/generate-content-targets\.mjs/u);
    assert.match(step, /scripts\/generate-font-css\.mjs/u);
    assert.match(step, /pnpm-lock\.yaml/u);
    assert.match(step, /hashFiles\('public\/assets\/\*\*\/\*'/u);
    assert.match(step, /fonscape\.config\.js/u);
    assert.match(step, /src\/content\/\*\*\/\*/u);
    assert.doesNotMatch(step, /hashFiles\([^)]*generated-images/u, "generated outputs must not affect cache hashes");
    assert.equal(restorePrefix(step), cachePrefix);
    assert.ok(step.includes(`key: ${cachePrefix}`), "cache key must use the shared namespace and toolchain prefix");
  }

  assert.equal(restorePrefix(cacheStep(checkWorkflow)), restorePrefix(cacheStep(deployWorkflow)));
  for (const workflow of [checkWorkflow, deployWorkflow]) {
    const installIndex = workflow.indexOf("run: pnpm install --frozen-lockfile");
    const cacheIndex = workflow.indexOf("- name: Restore responsive image cache");
    const checkIndex = workflow.indexOf("- name: Test and build");
    assert.ok(installIndex < cacheIndex && cacheIndex < checkIndex, "cache must restore after install and before checks");
  }

  assert.match(checkWorkflow, /run: pnpm check/u);
  assert.match(checkWorkflow, /wrangler deploy --dry-run/u);
  assert.match(checkWorkflow, /run: pnpm audit --prod/u);
  assert.match(deployWorkflow, /run: pnpm db:migrate:cloudflare/u);
  assert.match(deployWorkflow, /run: pnpm exec wrangler deploy/u);
  assert.match(gitignore, /^\.fonscape-cache\/$/mu);
  assert.match(guide, /冷缓存/u);
  assert.match(guide, /热缓存/u);
  assert.match(guide, /缓存键.*失效/u);
});
