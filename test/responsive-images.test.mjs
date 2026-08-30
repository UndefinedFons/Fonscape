import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import sharp from "sharp";
import {
  extractLocalRasterSources,
  generateResponsiveImages,
  isLocalRasterSource,
  loadResponsiveImageCache,
  renderResponsiveVariant,
  renderResponsiveVariantBuffer,
  RESPONSIVE_IMAGE_CACHE_VERSION,
  saveResponsiveImageCache,
  safeLocalSourcePath,
  selectResponsiveWidths,
  shouldKeepResponsiveVariant,
  sourceAssetPath,
} from "../scripts/generate-responsive-images.mjs";
import { responsiveImageProps, responsiveImageUrl } from "../src/responsiveImages.ts";

test("Markdown image discovery includes rendered local rasters and ignores code or remote sources", () => {
  const markdown = [
    "![正文图](/assets/posts/body.png)",
    "![重复图](/assets/posts/body.png)",
    "![带空格](</assets/posts/space image.jpg>)",
    "![完整引用][figure]",
    "![折叠引用][]",
    "[figure]: /assets/posts/reference.webp \"图注\"",
    "[折叠引用]: /assets/posts/collapsed.avif",
    "`![代码示例](/assets/posts/code.png)`",
    "~~~md",
    "![代码块](/assets/posts/fenced.png)",
    "~~~",
    "<img src='/assets/posts/raw-html.png' alt='不会渲染'>",
    "![远程图](https://example.com/remote.png)",
  ].join("\n");
  assert.deepEqual(extractLocalRasterSources(markdown), [
    "/assets/posts/body.png",
    "/assets/posts/space image.jpg",
    "/assets/posts/reference.webp",
    "/assets/posts/collapsed.avif",
  ]);
});

test("responsive image source selection stays inside local raster assets", () => {
  assert.equal(isLocalRasterSource("/assets/cover.jpg"), true);
  assert.equal(isLocalRasterSource("/fonscape/art.webp?v=1"), true);
  assert.equal(isLocalRasterSource("https://example.com/cover.webp"), false);
  assert.equal(isLocalRasterSource("/api/avatar/1"), false);
  assert.equal(isLocalRasterSource("/assets/logo.svg"), false);
  assert.throws(() => sourceAssetPath("/assets/../../private.webp"), /越出 public 目录/u);
});

test("responsive image generation rejects symbolic-link sources", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fonscape-responsive-image-link-"));
  const outsidePath = join(directory, "outside.png");
  const linkName = `.responsive-image-link-${process.pid}.png`;
  const linkPath = resolve("public", "assets", linkName);
  try {
    await writeFile(outsidePath, "not-public");
    await symlink(outsidePath, linkPath);
    await assert.rejects(() => safeLocalSourcePath(`/assets/${linkName}`), /符号链接/u);
  } finally {
    await rm(linkPath, { force: true });
    await rm(directory, { recursive: true, force: true });
  }
});

test("responsive variants keep aspect ratio and never enlarge an original", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fonscape-responsive-image-"));
  try {
    const source = await sharp({ create: { width: 100, height: 50, channels: 4, background: "#d97aa8" } }).png().toBuffer();
    const smallerPath = join(directory, "smaller.webp");
    const largerPath = join(directory, "larger.webp");
    const losslessPath = join(directory, "lossless.png");
    await renderResponsiveVariant(source, smallerPath, 60, sharp);
    await renderResponsiveVariant(source, largerPath, 200, sharp);
    await renderResponsiveVariant(source, losslessPath, 60, sharp);
    const [smaller, larger, lossless] = await Promise.all([sharp(smallerPath).metadata(), sharp(largerPath).metadata(), sharp(losslessPath).metadata()]);
    assert.deepEqual([smaller.width, smaller.height, smaller.format], [60, 30, "webp"]);
    assert.deepEqual([larger.width, larger.height, larger.format], [100, 50, "webp"]);
    assert.deepEqual([lossless.width, lossless.height, lossless.format], [60, 30, "png"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("responsive variants are retained only when they reduce transfer size", () => {
  assert.equal(shouldKeepResponsiveVariant(10_000, 9_999), true);
  assert.equal(shouldKeepResponsiveVariant(10_000, 10_000), false);
  assert.equal(shouldKeepResponsiveVariant(10_000, 10_001), false);
});

test("responsive width selection stays deterministic and caps each source at five generated files", () => {
  assert.deepEqual(selectResponsiveWidths([128, 256, 384, 640, 960, 1280, 1600], { preferSmall: true }), [128, 384, 640, 960, 1600]);
  assert.deepEqual(selectResponsiveWidths([384, 640, 768, 960, 1280, 1600]), [384, 640, 960, 1280, 1600]);
  assert.deepEqual(selectResponsiveWidths([384, 640, 960]), [384, 640, 960]);
});

test("read-only checks can size a missing candidate without writing it", async () => {
  const source = await sharp({ create: { width: 100, height: 50, channels: 4, background: "#d97aa8" } }).png().toBuffer();
  const output = await renderResponsiveVariantBuffer(source, "candidate.png", 60, sharp);
  const metadata = await sharp(output).metadata();
  assert.deepEqual([metadata.width, Buffer.isBuffer(output)], [60, true]);
});

test("responsive manifests are deterministic and missing entries retain the original", async () => {
  await generateResponsiveImages({ check: true });
  const first = await readFile("functions/_generated/responsive-images.js", "utf8");
  await generateResponsiveImages();
  const second = await readFile("functions/_generated/responsive-images.js", "utf8");
  assert.equal(second, first);
  assert.deepEqual(responsiveImageProps("/assets/not-generated.png", "100vw"), {});
  assert.equal(responsiveImageUrl("/assets/not-generated.png", 640), "/assets/not-generated.png");
});

test("responsive outcome cache is deterministic and ignores corrupt or stale records", async () => {
  const cacheDirectory = await mkdtemp(join(resolve("."), ".responsive-image-cache-fixture-"));
  const sourceBuffer = Buffer.from("fixture source bytes");
  const sourceHash = createHash("sha256").update(sourceBuffer).digest("hex");
  const acceptedBuffer = Buffer.from("small");
  const acceptedEntry = {
    source: "/assets/cache-fixture.png",
    sourceHash,
    sourceBytes: sourceBuffer.byteLength,
    width: 64,
    extension: ".png",
    fileName: "cache-fixture-0123456789ab-w64.png",
    outcome: "accepted",
    variantBytes: acceptedBuffer.byteLength,
    variantHash: createHash("sha256").update(acceptedBuffer).digest("hex"),
  };
  const rejectedEntry = {
    ...acceptedEntry,
    width: 128,
    fileName: "cache-fixture-0123456789ab-w128.png",
    outcome: "rejected",
    variantBytes: sourceBuffer.byteLength,
    variantHash: null,
  };
  const encoderFingerprint = "fixture-encoder-v1";
  try {
    assert.equal(await saveResponsiveImageCache({
      cacheDirectory,
      encoderFingerprint,
      entries: new Map([[
        "accepted",
        acceptedEntry,
      ], [
        "rejected",
        rejectedEntry,
      ]]),
    }), true);
    const firstManifest = await readFile(join(cacheDirectory, "manifest.json"), "utf8");
    const loaded = await loadResponsiveImageCache({ cacheDirectory, encoderFingerprint });
    assert.equal(loaded.available, true);
    assert.deepEqual([...loaded.entries.values()].sort((left, right) => left.width - right.width), [acceptedEntry, rejectedEntry]);
    assert.equal(await saveResponsiveImageCache({
      cacheDirectory,
      encoderFingerprint,
      entries: loaded.entries,
    }), true);
    assert.equal(await readFile(join(cacheDirectory, "manifest.json"), "utf8"), firstManifest);
    assert.equal((await loadResponsiveImageCache({
      cacheDirectory,
      encoderFingerprint: "different-encoder",
    })).available, false);

    await writeFile(join(cacheDirectory, "manifest.json"), "{broken cache");
    assert.equal((await loadResponsiveImageCache({ cacheDirectory, encoderFingerprint })).available, false);
    await writeFile(join(cacheDirectory, "manifest.json"), firstManifest);
    const changedSourceHash = createHash("sha256").update("changed source").digest("hex");
    const restored = await loadResponsiveImageCache({ cacheDirectory, encoderFingerprint });
    assert.equal([...restored.entries.values()].some((entry) => entry.sourceHash === changedSourceHash), false);
  } finally {
    await rm(cacheDirectory, { recursive: true, force: true });
  }
});

test("responsive generation reuses accepted and rejected outcomes without weakening recovery", async () => {
  const fixtureId = `${process.pid}-${Date.now()}`;
  const acceptedSource = `/assets/responsive-cache-accepted-${fixtureId}.jpg`;
  const rejectedSource = `/assets/responsive-cache-rejected-${fixtureId}.jpg`;
  const acceptedPath = resolve("public", acceptedSource.slice(1));
  const rejectedPath = resolve("public", rejectedSource.slice(1));
  const cacheDirectory = await mkdtemp(join(resolve("."), ".responsive-image-cache-fixture-"));
  const generatedDirectory = await mkdtemp(join(resolve("public"), ".responsive-image-output-fixture-"));
  const manifestDirectory = await mkdtemp(join(resolve("."), ".responsive-image-manifest-fixture-"));
  const makeFixture = async (width, height, quality) => {
    const buffer = Buffer.alloc(width * height * 3);
    for (let index = 0; index < buffer.length; index += 3) {
      buffer[index] = (index * 47) & 255;
      buffer[index + 1] = (index * 19) & 255;
      buffer[index + 2] = (index * 7) & 255;
    }
    return sharp(buffer, { raw: { width, height, channels: 3 } }).jpeg({ quality }).toBuffer();
  };
  const sourceTargets = {
    criticalSources: new Set([acceptedSource, rejectedSource]),
    targets: new Map([
      [acceptedSource, new Set(["detail"])],
      [rejectedSource, new Set(["detail"])],
    ]),
  };
  const readGeneratedManifests = async () => {
    const names = (await readdir(manifestDirectory)).filter((name) => (
      name === "responsive-images.js"
      || name === "responsive-images-full.js"
      || /^responsive-images-full-\d+\.js$/u.test(name)
    )).sort();
    return new Map(await Promise.all(names.map(async (name) => [
      name,
      await readFile(join(manifestDirectory, name), "utf8"),
    ])));
  };
  const countedSharp = (counter) => {
    const wrapped = (...args) => {
      counter.value += 1;
      return sharp(...args);
    };
    wrapped.versions = sharp.versions;
    return wrapped;
  };
  const options = { cacheDirectory, generatedDirectory, manifestDirectory, sourceTargets };
  let acceptedBytes;
  try {
    await writeFile(acceptedPath, await makeFixture(1000, 750, 60));
    await writeFile(rejectedPath, await makeFixture(400, 300, 1));

    const coldCounter = { value: 0 };
    const cold = await generateResponsiveImages({ ...options, sharpLibrary: countedSharp(coldCounter) });
    assert.deepEqual([cold.sourceCount, cold.variantCount], [2, 2]);
    assert.equal(coldCounter.value, 6);
    const coldManifests = await readGeneratedManifests();
    const cacheManifestPath = join(cacheDirectory, "manifest.json");
    const coldCacheText = await readFile(cacheManifestPath, "utf8");
    const coldCache = JSON.parse(coldCacheText);
    assert.equal(coldCache.version, RESPONSIVE_IMAGE_CACHE_VERSION);
    const acceptedEntries = coldCache.entries.filter((entry) => entry.outcome === "accepted");
    const rejectedEntries = coldCache.entries.filter((entry) => entry.outcome === "rejected");
    assert.equal(acceptedEntries.length, 2);
    assert.equal(rejectedEntries.length, 2);
    const rejectedOutputPath = join(generatedDirectory, rejectedEntries[0].fileName);
    await assert.rejects(readFile(rejectedOutputPath), /ENOENT/u);
    acceptedBytes = await readFile(join(generatedDirectory, acceptedEntries[0].fileName));

    const warmCounter = { value: 0 };
    const warm = await generateResponsiveImages({ ...options, sharpLibrary: countedSharp(warmCounter) });
    assert.deepEqual([warm.sourceCount, warm.variantCount], [2, 2]);
    assert.equal(warmCounter.value, 2, "warm generation only inspects each source; neither outcome is re-encoded");
    assert.deepEqual(await readGeneratedManifests(), coldManifests);
    assert.equal(await readFile(cacheManifestPath, "utf8"), coldCacheText);

    const acceptedOutputPath = join(generatedDirectory, acceptedEntries[0].fileName);
    await rm(acceptedOutputPath);
    const missingCounter = { value: 0 };
    await generateResponsiveImages({ ...options, sharpLibrary: countedSharp(missingCounter) });
    assert.equal(missingCounter.value, 3, "a missing accepted output is regenerated while the rejected outcome remains cached");
    assert.deepEqual(await readFile(acceptedOutputPath), acceptedBytes);

    await rm(acceptedOutputPath);
    const beforeCheckCache = await readFile(cacheManifestPath, "utf8");
    await assert.rejects(
      generateResponsiveImages({ ...options, check: true, sharpLibrary: countedSharp({ value: 0 }) }),
      /缺少响应式图片候选/u,
    );
    assert.equal(await readFile(cacheManifestPath, "utf8"), beforeCheckCache);
    await assert.rejects(readFile(acceptedOutputPath), /ENOENT/u);

    const restoreCounter = { value: 0 };
    await generateResponsiveImages({ ...options, sharpLibrary: countedSharp(restoreCounter) });
    await writeFile(cacheManifestPath, "{broken cache");
    const corruptCacheCounter = { value: 0 };
    await generateResponsiveImages({ ...options, sharpLibrary: countedSharp(corruptCacheCounter) });
    assert.equal(corruptCacheCounter.value, 6, "a corrupt cache falls back to a cold generation");
    assert.deepEqual(await readFile(acceptedOutputPath), acceptedBytes);

    const corruptOutput = Buffer.from(acceptedBytes);
    corruptOutput[0] ^= 255;
    await writeFile(acceptedOutputPath, corruptOutput);
    const corruptOutputCounter = { value: 0 };
    await generateResponsiveImages({ ...options, sharpLibrary: countedSharp(corruptOutputCounter) });
    assert.equal(corruptOutputCounter.value, 3, "a corrupt accepted output is regenerated without touching cached outcomes");
    assert.deepEqual(await readFile(acceptedOutputPath), acceptedBytes);

    const sameSizeCorruption = Buffer.from(acceptedBytes);
    sameSizeCorruption[0] ^= 255;
    await writeFile(acceptedOutputPath, sameSizeCorruption);
    const beforeCorruptCheckCache = await readFile(cacheManifestPath, "utf8");
    await assert.rejects(
      generateResponsiveImages({ ...options, check: true, sharpLibrary: countedSharp({ value: 0 }) }),
      /已损坏/u,
    );
    assert.deepEqual(await readFile(acceptedOutputPath), sameSizeCorruption);
    assert.equal(await readFile(cacheManifestPath, "utf8"), beforeCorruptCheckCache);
    await generateResponsiveImages({ ...options, sharpLibrary: countedSharp({ value: 0 }) });

    const oldGeneratedNames = new Set(await readdir(generatedDirectory));
    await writeFile(acceptedPath, await makeFixture(1000, 750, 70));
    const invalidatedCounter = { value: 0 };
    await generateResponsiveImages({ ...options, sharpLibrary: countedSharp(invalidatedCounter) });
    assert.equal(invalidatedCounter.value, 5, "changing source bytes invalidates only that source's cached candidates");
    const invalidatedCache = JSON.parse(await readFile(cacheManifestPath, "utf8"));
    assert.equal(invalidatedCache.entries.some((entry) => entry.source === acceptedSource), true);
    assert.equal(invalidatedCache.entries.some((entry) => entry.source === acceptedSource && entry.sourceHash === coldCache.entries.find((candidate) => candidate.source === acceptedSource)?.sourceHash), false);
    const invalidatedManifests = await readGeneratedManifests();
    assert.notDeepEqual(invalidatedManifests, coldManifests);
    const invalidatedGeneratedNames = new Set(await readdir(generatedDirectory));
    for (const name of oldGeneratedNames) assert.equal(invalidatedGeneratedNames.has(name), false);
  } finally {
    await rm(acceptedPath, { force: true });
    await rm(rejectedPath, { force: true });
    await rm(cacheDirectory, { recursive: true, force: true });
    await rm(generatedDirectory, { recursive: true, force: true });
    await rm(manifestDirectory, { recursive: true, force: true });
  }
});

test("responsive generator rejects read-only and manifest-only mode combinations before writing", async () => {
  const manifest = await readFile("functions/_generated/responsive-images.js", "utf8");
  await assert.rejects(
    generateResponsiveImages({ check: true, manifestOnly: true }),
    /不能同时使用/u,
  );
  assert.equal(await readFile("functions/_generated/responsive-images.js", "utf8"), manifest);
});

test("fingerprinted responsive images receive immutable deployment caching", async () => {
  const [cloudflareHeaders, vercelSource] = await Promise.all([
    readFile("public/_headers", "utf8"),
    readFile("vercel.json", "utf8"),
  ]);
  const vercel = JSON.parse(vercelSource);
  assert.match(cloudflareHeaders, /\/fonscape\/generated-images\/\*[\s\S]*max-age=31536000, immutable/u);
  assert.ok(vercel.headers.some((rule) => rule.source === "/fonscape/generated-images/:path*"
    && rule.headers.some((header) => header.key === "Cache-Control" && header.value.includes("immutable"))));
});
