import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import test from "node:test";
import {
  buildContentDistribution,
  generateContentArtifacts,
  writeGeneratedContentFiles,
} from "../scripts/generate-content-targets.mjs";
import { createContentGenerationQueue } from "../vite.config.mjs";

test("content source paths cannot escape the repository or clear prior generated output", { skip: sep === "\\" }, async (context) => {
  const projectRoot = await mkdtemp(join(tmpdir(), "fonscape-content-source-"));
  context.after(() => rm(projectRoot, { recursive: true, force: true }));

  const sourceDirectory = join(projectRoot, "src", "content", "posts");
  const generatedDirectory = join(projectRoot, "public", "fonscape", "content");
  const protectedFile = join(projectRoot, ".github", "workflows", "pwn.md");
  await mkdir(sourceDirectory, { recursive: true });
  await mkdir(generatedDirectory, { recursive: true });
  await mkdir(join(projectRoot, ".github", "workflows"), { recursive: true });

  const traversalName = ["evil", ...Array(6).fill(".."), ".github", "workflows", "pwn.md"].join("\\");
  await writeFile(join(sourceDirectory, traversalName), "---\ntitle: Attack\ndate: 2026-01-01\ncategory: 记录\n---\n正文");
  await writeFile(protectedFile, "protected");
  await writeFile(join(generatedDirectory, "keep.json"), "previous output");

  const generationError = await generateContentArtifacts({ projectRoot }).then(() => null, (error) => error);
  assert.equal(await readFile(protectedFile, "utf8"), "protected");
  assert.equal(await readFile(join(generatedDirectory, "keep.json"), "utf8"), "previous output");
  assert.match(generationError?.message ?? "", /内容文件路径无效/u);
});

test("generated content destinations are preflighted while nested Unicode paths remain valid", async (context) => {
  const projectRoot = await mkdtemp(join(tmpdir(), "fonscape-content-output-"));
  context.after(() => rm(projectRoot, { recursive: true, force: true }));

  const generatedDirectory = join(projectRoot, "public", "fonscape", "content");
  const protectedFile = join(projectRoot, ".github", "workflows", "pwn.md");
  await mkdir(generatedDirectory, { recursive: true });
  await mkdir(join(projectRoot, ".github", "workflows"), { recursive: true });
  await writeFile(protectedFile, "protected");
  await writeFile(join(generatedDirectory, "keep.json"), "previous output");

  const unsafeFiles = new Map([[
    "bodies/post/evil/../../../../../../.github/workflows/pwn.md",
    "overwritten",
  ]]);
  const writeError = await writeGeneratedContentFiles(unsafeFiles, generatedDirectory).then(() => null, (error) => error);
  assert.equal(await readFile(protectedFile, "utf8"), "protected");
  assert.equal(await readFile(join(generatedDirectory, "keep.json"), "utf8"), "previous output");
  assert.match(writeError?.message ?? "", /生成内容路径无效/u);

  const record = {
    name: "notes/风起.md",
    source: "./posts/notes/风起.md",
    raw: "正文",
    entry: { slug: "safe-entry", title: "安全路径", date: "2026-01-01", category: "记录", featured: false, tags: [], wordCount: 1 },
  };
  const { files } = buildContentDistribution([["post", [record]]]);
  assert.equal(files.get("bodies/post/notes/风起.md"), "正文");
  await writeGeneratedContentFiles(new Map([["bodies/post/notes/风起.md", "正文"]]), generatedDirectory);
  assert.equal(await readFile(join(generatedDirectory, "bodies", "post", "notes", "风起.md"), "utf8"), "正文");
});

test("a failed content generation surfaces its error and queued hot updates stay ordered", async () => {
  const originalError = new Error("invalid Markdown");
  let attempts = 0;
  let finishFirstGeneration;
  const firstGeneration = new Promise((resolve) => {
    finishFirstGeneration = resolve;
  });
  const events = [];
  const regenerate = createContentGenerationQueue(async () => {
    attempts += 1;
    events.push(`start ${attempts}`);
    if (attempts === 1) {
      await firstGeneration;
      events.push("finish 1");
      throw originalError;
    }
    events.push(`finish ${attempts}`);
    return "recovered";
  });

  const failedGeneration = regenerate();
  const queuedGeneration = regenerate();
  await Promise.resolve();
  assert.deepEqual(events, ["start 1"]);

  finishFirstGeneration();
  await assert.rejects(failedGeneration, (error) => error === originalError);
  assert.equal(await queuedGeneration, "recovered");
  assert.deepEqual(events, ["start 1", "finish 1", "start 2", "finish 2"]);
  assert.equal(attempts, 2);
});

test("a Markdown hot update uses resolved music metadata when regenerating fonts", () => {
  execFileSync(process.execPath, ["--input-type=module", "--eval", `
    import assert from "node:assert/strict";
    import { registerHooks } from "node:module";
    import { resolve } from "node:path";
    globalThis.generationFixture = { metadata: "旧音乐名称" };
    const modules = new Map([
      ["generate-responsive-images.mjs", "export async function generateResponsiveImages() {}"],
      ["generate-content-targets.mjs", 'export async function generateContentArtifacts() { await new Promise((finish) => { globalThis.generationFixture.finishMetadata = () => { globalThis.generationFixture.metadata = "新音乐名称"; finish(); }; }); }'],
      ["generate-font-css.mjs", "export async function generateFontStylesheets() { globalThis.generationFixture.fontInput = globalThis.generationFixture.metadata; }"],
      ["generate-rss.mjs", "export async function generateRssFeed() {}"],
      ["generate-sitemap.mjs", "export async function generateSitemap() {}"],
    ]);
    registerHooks({ load(url, context, nextLoad) {
      const module = [...modules].find(([name]) => url.endsWith("/scripts/" + name));
      return module ? { format: "module", source: module[1], shortCircuit: true } : nextLoad(url, context);
    }});
    const { default: config } = await import("./vite.config.mjs");
    const plugin = config.plugins.find((item) => item.name === "fonscape-content-metadata");
    const update = plugin.handleHotUpdate({ file: resolve("src/content/music/new.md"), modules: [], server: { moduleGraph: { getModuleById() {} } } });
    for (let attempt = 0; attempt < 10 && !globalThis.generationFixture.finishMetadata; attempt += 1) await Promise.resolve();
    assert.equal(typeof globalThis.generationFixture.finishMetadata, "function");
    globalThis.generationFixture.finishMetadata();
    await update;
    assert.equal(globalThis.generationFixture.fontInput, "新音乐名称", "font inputs must include metadata resolved by this update");
  `], { cwd: new URL("../", import.meta.url), stdio: "pipe" });
});
