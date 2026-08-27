import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import sharp from "sharp";
import {
  generateResponsiveImages,
  isLocalRasterSource,
  renderResponsiveVariant,
  safeLocalSourcePath,
  sourceAssetPath,
} from "../scripts/generate-responsive-images.mjs";
import { responsiveImageProps, responsiveImageUrl } from "../src/responsiveImages.js";

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

test("responsive manifests are deterministic and missing entries retain the original", async () => {
  await generateResponsiveImages({ check: true });
  const first = await readFile("functions/_generated/responsive-images.js", "utf8");
  await generateResponsiveImages();
  const second = await readFile("functions/_generated/responsive-images.js", "utf8");
  assert.equal(second, first);
  assert.deepEqual(responsiveImageProps("/assets/not-generated.png", "100vw"), {});
  assert.equal(responsiveImageUrl("/assets/not-generated.png", 640), "/assets/not-generated.png");
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
