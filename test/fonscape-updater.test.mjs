import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import {
  classifyPath,
  compareVersions,
  latestStableVersion,
  main,
  normalizeVersion,
} from "../scripts/fonscape-update.mjs";

const ownership = {
  user: [
    ".env",
    ".env.*",
    ".dev.vars",
    ".dev.vars.*",
    "fonscape.config.js",
    "src/content/friends.json",
    "src/content/posts/**",
    "src/content/poems/**",
    "src/content/music/**",
    "public/assets/**",
    "public/audio/**",
  ],
  seed: ["src/content/friends.json"],
  history: ["migrations/**"],
  merge: [".env.example", "package.json"],
  theme: ["docs/**", "src/**", "scripts/**"],
};

async function put(root, path, content) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "fonscape-updater-test-"));
  const source = join(root, "source");
  const target = join(root, "target");
  const project = join(root, "project");
  await Promise.all([mkdir(source), mkdir(target), mkdir(project)]);
  const sourcePackage = {
    name: "fonscape",
    version: "1.0.0",
    private: true,
    scripts: { check: "node --test" },
  };
  const targetPackage = {
    name: "fonscape",
    version: "1.1.0",
    private: true,
    scripts: { check: "pnpm generate && node --test", fonscape: "node scripts/fonscape-update.mjs" },
  };
  const projectPackage = {
    ...sourcePackage,
    version: "0.1.0",
    scripts: { ...sourcePackage.scripts, custom: "node custom.mjs" },
  };
  await Promise.all([
    put(source, "package.json", `${JSON.stringify(sourcePackage, null, 2)}\n`),
    put(target, "package.json", `${JSON.stringify(targetPackage, null, 2)}\n`),
    put(project, "package.json", `${JSON.stringify(projectPackage, null, 2)}\n`),
    put(target, "fonscape.manifest.json", `${JSON.stringify({ schemaVersion: 1, version: "1.1.0", ownership }, null, 2)}\n`),
    put(target, "src/content/friends.json", "[]\n"),
    put(source, "src/App.jsx", "const version = 'old';\n"),
    put(target, "src/App.jsx", "const version = 'new';\n"),
    put(project, "src/App.jsx", "const version = 'old';\n"),
    put(source, "src/styles.css", "body { color: black; }\n/* unchanged one */\n/* unchanged two */\nmain { padding: 1rem; }\n"),
    put(target, "src/styles.css", "body { color: purple; }\n/* unchanged one */\n/* unchanged two */\nmain { padding: 1rem; }\n"),
    put(project, "src/styles.css", "body { color: black; }\n/* unchanged one */\n/* unchanged two */\nmain { padding: 2rem; }\n"),
    put(target, "scripts/new-feature.mjs", "export const enabled = true;\n"),
    put(source, "docs/optional.md", "Old optional documentation.\n"),
    put(target, "docs/optional.md", "New optional documentation.\n"),
    put(target, "public/assets/default.svg", "<svg />\n"),
    put(project, ".fonscape-version", "1.0.0\n"),
  ]);
  return { root, source, target, project };
}

test("semantic versions are strict and stable tags sort numerically", () => {
  assert.equal(normalizeVersion("v1.1.0"), "1.1.0");
  assert.equal(compareVersions("1.10.0", "1.9.9") > 0, true);
  assert.equal(latestStableVersion(["v1.9.0", "v1.10.0", "v2.0.0-beta.1"]), "1.10.0");
  assert.throws(() => normalizeVersion("1.1"), /X\.Y\.Z/u);
});

test("manifest ownership gives user files priority over broad theme paths", () => {
  const manifest = { ownership };
  assert.equal(classifyPath("src/content/site.js", manifest), "theme");
  assert.equal(classifyPath("public/assets/avatar.png", manifest), "user");
  assert.equal(classifyPath(".env", manifest), "user");
  assert.equal(classifyPath(".env.production", manifest), "user");
  assert.equal(classifyPath(".env.example", manifest), "merge");
  assert.equal(classifyPath("src/App.jsx", manifest), "theme");
  assert.equal(classifyPath("migrations/0001_setup.sql", manifest), "history");
  assert.equal(classifyPath("package.json", manifest), "merge");
  assert.equal(classifyPath("CNAME", manifest), "unmanaged");
});

test("theme reconciliation restores the release without touching user files", async (context) => {
  const data = await fixture();
  context.after(() => rm(data.root, { recursive: true, force: true }));
  await Promise.all([
    put(data.source, "src/unchanged.jsx", "export const theme = 'release';\n"),
    put(data.target, "src/unchanged.jsx", "export const theme = 'release';\n"),
    put(data.project, "src/unchanged.jsx", "export const theme = 'site fork';\n"),
    put(data.project, "src/retired-theme-file.jsx", "export const retired = true;\n"),
    put(data.project, "src/content/posts/site.md", "# My post\n"),
    put(data.project, "public/assets/site.png", "site asset\n"),
  ]);

  await main([
    "update",
    "--project", data.project,
    "--source-dir", data.source,
    "--target-dir", data.target,
    "--reconcile-theme",
    "--apply",
  ]);

  assert.equal(await readFile(join(data.project, "src/unchanged.jsx"), "utf8"), "export const theme = 'release';\n");
  await assert.rejects(access(join(data.project, "src/retired-theme-file.jsx")), { code: "ENOENT" });
  assert.equal(await readFile(join(data.project, "src/content/posts/site.md"), "utf8"), "# My post\n");
  assert.equal(await readFile(join(data.project, "public/assets/site.png"), "utf8"), "site asset\n");
});

test("migration history is additive and keeps installation-only records", async (context) => {
  const data = await fixture();
  context.after(() => rm(data.root, { recursive: true, force: true }));
  await Promise.all([
    put(data.source, "migrations/0001_setup.sql", "CREATE TABLE example (id TEXT);\n"),
    put(data.target, "migrations/0001_setup.sql", "CREATE TABLE example (id TEXT);\n"),
    put(data.target, "migrations/0002_renamed_history.sql", "SELECT 1;\n"),
    put(data.target, "migrations/0003_runtime.sql", "ALTER TABLE example ADD COLUMN created_at TEXT;\n"),
    put(data.project, "migrations/0001_setup.sql", "CREATE TABLE example (id TEXT);\n"),
    put(data.project, "migrations/0001_installation_history.sql", "SELECT 1;\n"),
  ]);

  await main([
    "update",
    "--project", data.project,
    "--source-dir", data.source,
    "--target-dir", data.target,
    "--reconcile-theme",
    "--apply",
  ]);

  assert.equal(await readFile(join(data.project, "migrations/0001_installation_history.sql"), "utf8"), "SELECT 1;\n");
  await assert.rejects(access(join(data.project, "migrations/0002_renamed_history.sql")), { code: "ENOENT" });
  assert.equal(await readFile(join(data.project, "migrations/0003_runtime.sql"), "utf8"), "ALTER TABLE example ADD COLUMN created_at TEXT;\n");
});

test("ordinary follow-up updates keep recognizing renamed migration history", async (context) => {
  const data = await fixture();
  context.after(() => rm(data.root, { recursive: true, force: true }));
  await Promise.all([
    put(data.source, "migrations/0002_release_history.sql", "SELECT 1;\n"),
    put(data.target, "migrations/0002_release_history.sql", "SELECT 1;\n"),
    put(data.target, "migrations/0003_new_history.sql", "SELECT 2;\n"),
    put(data.project, "migrations/0001_installation_history.sql", "SELECT 1;\n"),
  ]);

  await main([
    "update",
    "--project", data.project,
    "--source-dir", data.source,
    "--target-dir", data.target,
    "--apply",
  ]);

  assert.equal(await readFile(join(data.project, "migrations/0001_installation_history.sql"), "utf8"), "SELECT 1;\n");
  await assert.rejects(access(join(data.project, "migrations/0002_release_history.sql")), { code: "ENOENT" });
  assert.equal(await readFile(join(data.project, "migrations/0003_new_history.sql"), "utf8"), "SELECT 2;\n");
});

test("ordinary history scans reject symlinks inside migration storage", async (context) => {
  const data = await fixture();
  context.after(() => rm(data.root, { recursive: true, force: true }));
  const outside = join(data.root, "outside-migration.sql");
  await writeFile(outside, "SELECT 1;\n");
  await mkdir(join(data.project, "migrations"));
  await symlink(outside, join(data.project, "migrations/0001_installation_history.sql"));

  await assert.rejects(main([
    "update",
    "--project", data.project,
    "--source-dir", data.source,
    "--target-dir", data.target,
  ]), /源目录不能包含符号链接：migrations\/0001_installation_history\.sql/u);
});

test("migration history refuses to overwrite a changed checksum", async (context) => {
  const data = await fixture();
  context.after(() => rm(data.root, { recursive: true, force: true }));
  await Promise.all([
    put(data.source, "migrations/0001_setup.sql", "SELECT 'source';\n"),
    put(data.target, "migrations/0001_setup.sql", "SELECT 'target';\n"),
    put(data.project, "migrations/0001_setup.sql", "SELECT 'installed';\n"),
  ]);

  await assert.rejects(main([
    "update",
    "--project", data.project,
    "--source-dir", data.source,
    "--target-dir", data.target,
    "--reconcile-theme",
    "--apply",
  ]), /存在不能自动处理的冲突/u);
  assert.equal(await readFile(join(data.project, "migrations/0001_setup.sql"), "utf8"), "SELECT 'installed';\n");
});

test("real env files stay user-owned while the public env example three-way merges", async (context) => {
  const data = await fixture();
  context.after(() => rm(data.root, { recursive: true, force: true }));
  await Promise.all([
    put(data.source, ".env", "SECRET=base\n"),
    put(data.target, ".env", "SECRET=incoming\n"),
    put(data.project, ".env", "SECRET=site\n"),
    put(data.source, ".env.production", "PRODUCTION_SECRET=base\n"),
    put(data.target, ".env.production", "PRODUCTION_SECRET=incoming\n"),
    put(data.project, ".env.production", "PRODUCTION_SECRET=site\n"),
    put(data.source, ".env.example", "PUBLIC_NAME=base\nPUBLIC_COLOR=blue\n"),
    put(data.target, ".env.example", "PUBLIC_NAME=incoming\nPUBLIC_COLOR=blue\n"),
    put(data.project, ".env.example", "PUBLIC_NAME=base\nPUBLIC_COLOR=blue\nSITE_ONLY=1\n"),
  ]);
  await main([
    "update",
    "--project", data.project,
    "--source-dir", data.source,
    "--target-dir", data.target,
    "--apply",
  ]);
  assert.equal(await readFile(join(data.project, ".env"), "utf8"), "SECRET=site\n");
  assert.equal(await readFile(join(data.project, ".env.production"), "utf8"), "PRODUCTION_SECRET=site\n");
  assert.equal(await readFile(join(data.project, ".env.example"), "utf8"), "PUBLIC_NAME=incoming\nPUBLIC_COLOR=blue\nSITE_ONLY=1\n");
});

test("apply preserves user content, merges site package metadata, backs up, and rolls back", async (context) => {
  const data = await fixture();
  context.after(() => rm(data.root, { recursive: true, force: true }));
  await main([
    "update",
    "--project", data.project,
    "--source-dir", data.source,
    "--target-dir", data.target,
    "--apply",
  ]);

  assert.equal(await readFile(join(data.project, "src/content/friends.json"), "utf8"), "[]\n");
  assert.equal(await readFile(join(data.project, "src/App.jsx"), "utf8"), "const version = 'new';\n");
  assert.match(await readFile(join(data.project, "src/styles.css"), "utf8"), /color: purple[\s\S]*padding: 2rem/u);
  assert.equal(await readFile(join(data.project, "scripts/new-feature.mjs"), "utf8"), "export const enabled = true;\n");
  await assert.rejects(access(join(data.project, "docs/optional.md")), { code: "ENOENT" });
  await assert.rejects(access(join(data.project, "public/assets/default.svg")), { code: "ENOENT" });
  const mergedPackage = JSON.parse(await readFile(join(data.project, "package.json"), "utf8"));
  assert.equal(mergedPackage.version, "0.1.0");
  assert.equal(mergedPackage.scripts.custom, "node custom.mjs");
  assert.equal(mergedPackage.scripts.fonscape, "node scripts/fonscape-update.mjs");
  assert.equal(await readFile(join(data.project, ".fonscape-version"), "utf8"), "1.1.0\n");

  const backupsRoot = join(data.project, ".fonscape-update", "backups");
  const [backupName] = await readdir(backupsRoot);
  await main(["update", "--project", data.project, "--rollback", relative(data.project, join(backupsRoot, backupName))]);
  assert.equal(await readFile(join(data.project, "src/App.jsx"), "utf8"), "const version = 'old';\n");
  assert.equal(await readFile(join(data.project, ".fonscape-version"), "utf8"), "1.0.0\n");
});

test("a same-line theme conflict aborts without changing project files", async (context) => {
  const data = await fixture();
  context.after(() => rm(data.root, { recursive: true, force: true }));
  await put(data.project, "src/App.jsx", "const version = 'site-custom';\n");
  await assert.rejects(
    main([
      "update",
      "--project", data.project,
      "--source-dir", data.source,
      "--target-dir", data.target,
      "--apply",
    ]),
    /存在不能自动处理的冲突/u,
  );
  assert.equal(await readFile(join(data.project, "src/App.jsx"), "utf8"), "const version = 'site-custom';\n");
  assert.equal(await readFile(join(data.project, ".fonscape-version"), "utf8"), "1.0.0\n");
  const conflictRoot = join(data.project, ".fonscape-update", "conflicts", "1.0.0-to-1.1.0");
  assert.equal(JSON.parse(await readFile(join(conflictRoot, "conflicts.json"), "utf8")).conflicts[0].path, "src/App.jsx");
});

test("reviewed conflict resolutions can be applied on a second run", async (context) => {
  const data = await fixture();
  context.after(() => rm(data.root, { recursive: true, force: true }));
  await put(data.project, "src/App.jsx", "const version = 'site-custom';\n");
  const command = [
    "update",
    "--project", data.project,
    "--source-dir", data.source,
    "--target-dir", data.target,
  ];
  await assert.rejects(main(command), /存在不能自动处理的冲突/u);
  const resolutions = join(data.project, ".fonscape-update", "conflicts", "1.0.0-to-1.1.0", "resolved");
  await put(resolutions, "src/App.jsx", "const version = 'site-custom';\nexport const newApi = true;\n");
  await main([...command, "--resolutions", resolutions, "--apply"]);
  assert.equal(
    await readFile(join(data.project, "src/App.jsx"), "utf8"),
    "const version = 'site-custom';\nexport const newApi = true;\n",
  );
  assert.equal(await readFile(join(data.project, ".fonscape-version"), "utf8"), "1.1.0\n");
});

test("multiple conflicts in one file are reported as reviewable conflicts", async (context) => {
  const data = await fixture();
  context.after(() => rm(data.root, { recursive: true, force: true }));
  await Promise.all([
    put(data.source, "src/App.jsx", "const first = 'base';\nconst gap = true;\nconst second = 'base';\n"),
    put(data.target, "src/App.jsx", "const first = 'target';\nconst gap = true;\nconst second = 'target';\n"),
    put(data.project, "src/App.jsx", "const first = 'site';\nconst gap = true;\nconst second = 'site';\n"),
  ]);
  await assert.rejects(
    main([
      "update",
      "--project", data.project,
      "--source-dir", data.source,
      "--target-dir", data.target,
    ]),
    /存在不能自动处理的冲突/u,
  );
  const conflicts = JSON.parse(await readFile(join(
    data.project,
    ".fonscape-update",
    "conflicts",
    "1.0.0-to-1.1.0",
    "conflicts.json",
  ), "utf8"));
  assert.deepEqual(conflicts.conflicts, [{ path: "src/App.jsx", reason: "three-way-merge-conflict" }]);
});

test("explicit keep choices preserve current auto-merges and conflicts", async (context) => {
  const data = await fixture();
  context.after(() => rm(data.root, { recursive: true, force: true }));
  await put(data.project, "src/App.jsx", "const version = 'site-custom';\n");
  const currentStyles = await readFile(join(data.project, "src/styles.css"), "utf8");
  await main([
    "update",
    "--project", data.project,
    "--source-dir", data.source,
    "--target-dir", data.target,
    "--keep", "src/App.jsx",
    "--keep", "src/styles.css",
    "--apply",
  ]);
  assert.equal(await readFile(join(data.project, "src/App.jsx"), "utf8"), "const version = 'site-custom';\n");
  assert.equal(await readFile(join(data.project, "src/styles.css"), "utf8"), currentStyles);
  assert.equal(await readFile(join(data.project, ".fonscape-version"), "utf8"), "1.1.0\n");
});

test("missing marker always rejects while an existing marker validates explicit --from", async (context) => {
  const data = await fixture();
  context.after(() => rm(data.root, { recursive: true, force: true }));
  await rm(join(data.project, ".fonscape-version"));
  const command = [
    "update",
    "--project", data.project,
    "--source-dir", data.source,
    "--target-dir", data.target,
  ];
  await assert.rejects(main(command), /未找到 \.fonscape-version/u);
  await assert.rejects(main([...command, "--from", "1.0.0"]), /无法安全确定当前主题版本/u);
  await writeFile(join(data.project, ".fonscape-version"), "1.0.0\n");
  await main([...command, "--from", "1.0.0"]);
  await writeFile(join(data.project, ".fonscape-version"), "1.1.0\n");
  await assert.rejects(main([...command, "--from", "1.0.0"]), /与已安装的 \.fonscape-version 版本 1\.1\.0 不一致/u);
});

test("project and updater state symlinks are rejected before any write", async (context) => {
  const data = await fixture();
  context.after(() => rm(data.root, { recursive: true, force: true }));
  const projectAlias = join(data.root, "project-alias");
  await symlink(data.project, projectAlias);
  await assert.rejects(
    main([
      "update",
      "--project", projectAlias,
      "--source-dir", data.source,
      "--target-dir", data.target,
      "--apply",
    ]),
    /项目根目录不能是符号链接/u,
  );

  const outside = join(data.root, "outside-state");
  await mkdir(outside);
  await symlink(outside, join(data.project, ".fonscape-update"));
  await assert.rejects(
    main([
      "update",
      "--project", data.project,
      "--source-dir", data.source,
      "--target-dir", data.target,
      "--apply",
    ]),
    /升级状态目录不能是符号链接/u,
  );
  assert.deepEqual(await readdir(outside), []);
});

test("seed and mandatory user ownership are enforced by the target manifest", async (context) => {
  const data = await fixture();
  context.after(() => rm(data.root, { recursive: true, force: true }));
  const manifestPath = join(data.target, "fonscape.manifest.json");
  const manifest = await readJson(manifestPath);
  manifest.ownership.seed.push(".env");
  await writeJson(manifestPath, manifest);
  await put(data.target, ".env", "SHOULD_NOT_BE_SCAFFOLDED=1\n");
  await assert.rejects(
    main([
      "update",
      "--project", data.project,
      "--source-dir", data.source,
      "--target-dir", data.target,
    ]),
    /ownership\.seed 只能包含/u,
  );

  const second = await fixture();
  context.after(() => rm(second.root, { recursive: true, force: true }));
  const secondManifestPath = join(second.target, "fonscape.manifest.json");
  const secondManifest = await readJson(secondManifestPath);
  secondManifest.ownership.user = secondManifest.ownership.user.filter((pattern) => pattern !== "public/audio/**");
  await writeJson(secondManifestPath, secondManifest);
  await assert.rejects(
    main([
      "update",
      "--project", second.project,
      "--source-dir", second.source,
      "--target-dir", second.target,
    ]),
    /ownership\.user 缺少受保护路径：public\/audio\/\*\*/u,
  );
});

test("the target manifest must manage the public env example outside user ownership", async (context) => {
  const data = await fixture();
  context.after(() => rm(data.root, { recursive: true, force: true }));
  const manifestPath = join(data.target, "fonscape.manifest.json");
  const manifest = await readJson(manifestPath);
  manifest.ownership.merge = manifest.ownership.merge.filter((pattern) => pattern !== ".env.example");
  await writeJson(manifestPath, manifest);
  await assert.rejects(
    main([
      "update",
      "--project", data.project,
      "--source-dir", data.source,
      "--target-dir", data.target,
    ]),
    /必须将精确 \.env\.example 声明为 merge 或 theme/u,
  );
});

test("source and target package versions must match the requested versions", async (context) => {
  const sourceMismatch = await fixture();
  context.after(() => rm(sourceMismatch.root, { recursive: true, force: true }));
  const sourcePackage = await readJson(join(sourceMismatch.source, "package.json"));
  sourcePackage.version = "9.9.9";
  await writeJson(join(sourceMismatch.source, "package.json"), sourcePackage);
  await assert.rejects(
    main([
      "update",
      "--project", sourceMismatch.project,
      "--source-dir", sourceMismatch.source,
      "--target-dir", sourceMismatch.target,
    ]),
    /来源目录 package\.json 版本 9\.9\.9 与来源版本 1\.0\.0 不一致/u,
  );

  const sourceMarkerMismatch = await fixture();
  context.after(() => rm(sourceMarkerMismatch.root, { recursive: true, force: true }));
  await writeFile(join(sourceMarkerMismatch.source, ".fonscape-version"), "0.9.0\n");
  await assert.rejects(
    main([
      "update",
      "--project", sourceMarkerMismatch.project,
      "--source-dir", sourceMarkerMismatch.source,
      "--target-dir", sourceMarkerMismatch.target,
    ]),
    /来源目录 marker 版本 0\.9\.0 与来源版本 1\.0\.0 不一致/u,
  );

  const targetMismatch = await fixture();
  context.after(() => rm(targetMismatch.root, { recursive: true, force: true }));
  const targetPackage = await readJson(join(targetMismatch.target, "package.json"));
  targetPackage.version = "1.1.1";
  await writeJson(join(targetMismatch.target, "package.json"), targetPackage);
  await assert.rejects(
    main([
      "update",
      "--project", targetMismatch.project,
      "--source-dir", targetMismatch.source,
      "--target-dir", targetMismatch.target,
      "--to", "1.1.0",
    ]),
    /目标目录 package\.json 版本 1\.1\.1 与目标版本 1\.1\.0 不一致/u,
  );

  targetPackage.version = "1.1.0";
  await writeJson(join(targetMismatch.target, "package.json"), targetPackage);
  const targetManifest = await readJson(join(targetMismatch.target, "fonscape.manifest.json"));
  targetManifest.version = "1.0.0";
  await writeJson(join(targetMismatch.target, "fonscape.manifest.json"), targetManifest);
  await assert.rejects(
    main([
      "update",
      "--project", targetMismatch.project,
      "--source-dir", targetMismatch.source,
      "--target-dir", targetMismatch.target,
      "--to", "1.1.0",
    ]),
    /manifest 版本 1\.0\.0 与目标版本 1\.1\.0 不一致/u,
  );
});

test("a symlinked user-content parent is rejected before backup reads it", async (context) => {
  const data = await fixture();
  context.after(() => rm(data.root, { recursive: true, force: true }));
  const outside = join(data.root, "outside-content");
  await mkdir(outside);
  await rm(join(data.project, "src/content"), { recursive: true, force: true });
  await symlink(outside, join(data.project, "src/content"));
  await assert.rejects(
    main([
      "update",
      "--project", data.project,
      "--source-dir", data.source,
      "--target-dir", data.target,
      "--apply",
    ]),
    /受管理路径不能经过符号链接：src\/content\/friends\.json/u,
  );
  assert.deepEqual(await readdir(outside), []);
  await assert.rejects(access(join(data.project, ".fonscape-update")), { code: "ENOENT" });
});

test("rollback is locked and validates missing or corrupt backup material before writing", async (context) => {
  const data = await fixture();
  context.after(() => rm(data.root, { recursive: true, force: true }));
  await main([
    "update",
    "--project", data.project,
    "--source-dir", data.source,
    "--target-dir", data.target,
    "--apply",
  ]);
  const backupsRoot = join(data.project, ".fonscape-update", "backups");
  const [backupName] = await readdir(backupsRoot);
  const backup = join(backupsRoot, backupName);
  const metadata = await readJson(join(backup, "backup.json"));
  const backedUp = metadata.entries.find((entry) => entry.present);
  assert.ok(backedUp);
  const currentAfterApply = await readFile(join(data.project, backedUp.path), "utf8");
  const lockPath = join(data.project, ".fonscape-update", "update.lock");
  await writeFile(lockPath, "held\n");
  await assert.rejects(
    main(["update", "--project", data.project, "--rollback", relative(data.project, backup)]),
    /另一个 Fonscape 升级进程正在运行/u,
  );
  assert.equal(await readFile(join(data.project, backedUp.path), "utf8"), currentAfterApply);
  await rm(lockPath);

  await rm(join(backup, "files", backedUp.path));
  await assert.rejects(
    main(["update", "--project", data.project, "--rollback", relative(data.project, backup)]),
    /备份文件缺失或不是普通文件/u,
  );
  assert.equal(await readFile(join(data.project, backedUp.path), "utf8"), currentAfterApply);

  const corrupt = await fixture();
  context.after(() => rm(corrupt.root, { recursive: true, force: true }));
  await main([
    "update",
    "--project", corrupt.project,
    "--source-dir", corrupt.source,
    "--target-dir", corrupt.target,
    "--apply",
  ]);
  const corruptBackupsRoot = join(corrupt.project, ".fonscape-update", "backups");
  const [corruptBackupName] = await readdir(corruptBackupsRoot);
  const corruptBackup = join(corruptBackupsRoot, corruptBackupName);
  await writeJson(join(corruptBackup, "backup.json"), {
    schemaVersion: 1,
    fromVersion: "1.0.0",
    targetVersion: "1.1.0",
    previousVersion: "1.0.0\n",
    entries: [{ path: "../escape.txt", present: false, mode: null }],
  });
  await assert.rejects(
    main(["update", "--project", corrupt.project, "--rollback", relative(corrupt.project, corruptBackup)]),
    /不安全的路径/u,
  );
});

test("keep rejects unsafe or unrelated paths and can override a matching resolution", async (context) => {
  const data = await fixture();
  context.after(() => rm(data.root, { recursive: true, force: true }));
  const command = [
    "update",
    "--project", data.project,
    "--source-dir", data.source,
    "--target-dir", data.target,
  ];
  await assert.rejects(main([...command, "--keep", "../outside"]), /不安全的路径/u);
  await assert.rejects(main([...command, "--keep", "src/not-in-plan.js"]), /不在升级计划中/u);

  await put(data.project, "src/App.jsx", "const version = 'site-custom';\n");
  await assert.rejects(main(command), /存在不能自动处理的冲突/u);
  const resolutions = join(data.project, ".fonscape-update", "conflicts", "1.0.0-to-1.1.0", "resolved");
  await put(resolutions, "src/App.jsx", "const version = 'resolved';\n");
  await main([...command, "--keep", "src/App.jsx", "--resolutions", resolutions, "--apply"]);
  assert.equal(await readFile(join(data.project, "src/App.jsx"), "utf8"), "const version = 'site-custom';\n");
  assert.equal(await readFile(join(data.project, ".fonscape-version"), "utf8"), "1.1.0\n");
});

test("take-incoming is repeatable and turns conflicts into incoming writes", async (context) => {
  const data = await fixture();
  context.after(() => rm(data.root, { recursive: true, force: true }));
  await put(data.project, "src/App.jsx", "const version = 'site-custom';\n");
  await put(data.project, "src/styles.css", "body { color: green; }\n/* unchanged one */\n/* unchanged two */\nmain { padding: 3rem; }\n");
  const command = [
    "update",
    "--project", data.project,
    "--source-dir", data.source,
    "--target-dir", data.target,
    "--take-incoming", "src/App.jsx",
    "--take-incoming", "src/styles.css",
    "--apply",
  ];
  await main(command);
  assert.equal(await readFile(join(data.project, "src/App.jsx"), "utf8"), "const version = 'new';\n");
  assert.equal(await readFile(join(data.project, "src/styles.css"), "utf8"), await readFile(join(data.target, "src/styles.css"), "utf8"));
  assert.equal(await readFile(join(data.project, ".fonscape-version"), "utf8"), "1.1.0\n");
});

test("take-incoming turns a removed incoming file into a delete and rejects unsafe or stale choices", async (context) => {
  const data = await fixture();
  context.after(() => rm(data.root, { recursive: true, force: true }));
  await assert.rejects(
    main([
      "update",
      "--project", data.project,
      "--source-dir", data.source,
      "--target-dir", data.target,
      "--take-incoming", "../outside",
    ]),
    /不安全的路径/u,
  );
  await assert.rejects(
    main([
      "update",
      "--project", data.project,
      "--source-dir", data.source,
      "--target-dir", data.target,
      "--take-incoming", "src/App.jsx",
    ]),
    /不是当前未解决冲突/u,
  );

  await put(data.project, "src/App.jsx", "const version = 'site-custom';\n");
  await rm(join(data.target, "src/App.jsx"));
  await main([
    "update",
    "--project", data.project,
    "--source-dir", data.source,
    "--target-dir", data.target,
    "--take-incoming", "src/App.jsx",
    "--apply",
  ]);
  await assert.rejects(access(join(data.project, "src/App.jsx")), { code: "ENOENT" });
  assert.equal(await readFile(join(data.project, ".fonscape-version"), "utf8"), "1.1.0\n");
});

test("take-incoming rejects conflicts already selected by keep or resolutions", async (context) => {
  const kept = await fixture();
  context.after(() => rm(kept.root, { recursive: true, force: true }));
  await put(kept.project, "src/App.jsx", "const version = 'site-custom';\n");
  await assert.rejects(
    main([
      "update",
      "--project", kept.project,
      "--source-dir", kept.source,
      "--target-dir", kept.target,
      "--keep", "src/App.jsx",
      "--take-incoming", "src/App.jsx",
    ]),
    /不是当前未解决冲突/u,
  );

  const resolved = await fixture();
  context.after(() => rm(resolved.root, { recursive: true, force: true }));
  await put(resolved.project, "src/App.jsx", "const version = 'site-custom';\n");
  const command = [
    "update",
    "--project", resolved.project,
    "--source-dir", resolved.source,
    "--target-dir", resolved.target,
  ];
  await assert.rejects(main(command), /存在不能自动处理的冲突/u);
  const resolutions = join(resolved.project, ".fonscape-update", "conflicts", "1.0.0-to-1.1.0", "resolved");
  await put(resolutions, "src/App.jsx", "const version = 'resolved';\n");
  await assert.rejects(
    main([...command, "--resolutions", resolutions, "--take-incoming", "src/App.jsx"]),
    /--take-incoming 与 --resolutions 同时指定了冲突文件/u,
  );

  const mixed = await fixture();
  context.after(() => rm(mixed.root, { recursive: true, force: true }));
  await put(mixed.project, "src/App.jsx", "const version = 'site-custom';\n");
  await put(mixed.project, "src/styles.css", "body { color: green; }\n/* unchanged one */\n/* unchanged two */\nmain { padding: 3rem; }\n");
  const mixedCommand = [
    "update",
    "--project", mixed.project,
    "--source-dir", mixed.source,
    "--target-dir", mixed.target,
  ];
  await assert.rejects(main(mixedCommand), /存在不能自动处理的冲突/u);
  const mixedResolutions = join(mixed.project, ".fonscape-update", "conflicts", "1.0.0-to-1.1.0", "resolved");
  await put(mixedResolutions, "src/styles.css", "body { color: resolved; }\n/* unchanged one */\n/* unchanged two */\nmain { padding: 3rem; }\n");
  await main([
    ...mixedCommand,
    "--take-incoming", "src/App.jsx",
    "--resolutions", mixedResolutions,
    "--apply",
  ]);
  assert.equal(await readFile(join(mixed.project, "src/App.jsx"), "utf8"), "const version = 'new';\n");
  assert.equal(await readFile(join(mixed.project, "src/styles.css"), "utf8"), "body { color: resolved; }\n/* unchanged one */\n/* unchanged two */\nmain { padding: 3rem; }\n");
});
