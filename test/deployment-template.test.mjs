import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
}

async function readOptional(path) {
  try {
    return await readFile(new URL(path, import.meta.url), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

test("one-click deployment asks for only an empty administrator bootstrap token", async () => {
  const [environmentExample, packageJson, readme, vercel, wrangler] = await Promise.all([
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readJson("../package.json"),
    readOptional("../README.md"),
    readJson("../vercel.json"),
    readJson("../wrangler.jsonc"),
  ]);

  assert.deepEqual(Object.keys(packageJson.cloudflare.bindings).sort(), [
    "ADMIN_BOOTSTRAP_TOKEN",
    "DB",
  ]);
  assert.match(environmentExample, /^ADMIN_BOOTSTRAP_TOKEN=\s*$/mu);
  assert.doesNotMatch(environmentExample, /ADMIN_USERNAME|RATE_LIMIT_SALT|TURSO_/u);
  assert.deepEqual(wrangler.d1_databases.map(({ binding }) => binding), ["DB"]);
  if (wrangler.name === "fonscape") {
    assert.equal(Object.hasOwn(wrangler.d1_databases[0], "database_id"), false);
  }
  assert.doesNotMatch(JSON.stringify(wrangler), /TURSO_/u);
  assert.equal(packageJson.scripts.deploy, "pnpm db:migrate:cloudflare && wrangler deploy");
  assert.equal(Object.hasOwn(vercel, "installCommand"), false, "Vercel must select the pnpm version from the lockfile");
  assert.equal(vercel.buildCommand, "pnpm build:vercel");

  if (readme !== null) {
    const buttonMatch = readme.match(/\[!\[Deploy with Vercel\].*?\]\((https:\/\/vercel\.com\/new\/clone\?[^\s)]+)\)/u);
    assert.ok(buttonMatch, "README must contain a Vercel Deploy Button");
    const button = new URL(buttonMatch[1]);
    assert.equal(button.searchParams.get("env"), "ADMIN_BOOTSTRAP_TOKEN");
    assert.equal(button.searchParams.has("envDefaults"), false);
    assert.equal(button.searchParams.get("skippable-integrations"), "0");
    assert.deepEqual(JSON.parse(button.searchParams.get("products")), [{
      type: "integration",
      protocol: "storage",
      productSlug: "database",
      integrationSlug: "tursocloud",
    }]);
  }
});

test("content targets generate before supported install and project commands", async () => {
  const packageJson = await readJson("../package.json");
  for (const hook of ["pnpm:devPreinstall", "predev", "prebuild", "pretest", "precheck"]) {
    assert.equal(packageJson.scripts[hook], "node scripts/generate-content-targets.mjs");
  }
  assert.doesNotMatch(packageJson.scripts.check, /--check/u);
});
