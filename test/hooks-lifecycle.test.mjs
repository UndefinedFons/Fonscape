import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("crop preview redraws for rotation and aspect changes, not crop-box movement", async () => {
  const source = await read("src/community/AvatarCropper.jsx");
  const start = source.indexOf("  const cropUrl =");
  const end = source.indexOf("  const imageBounds =", start);
  assert.ok(start >= 0 && end > start);
  const render = new Function("crop", "cropCanvas", "Image", "useEffect", source.slice(start, end));
  const images = [];
  const rotations = [];
  const context = {
    clearRect() {}, save() {}, translate() {}, drawImage() {}, restore() {},
    rotate(value) { rotations.push(value); },
  };
  const canvas = { getContext: () => context };
  class PreviewImage {
    constructor() {
      this.naturalWidth = 800;
      this.naturalHeight = 600;
      images.push(this);
    }
  }
  let previousDependencies;
  let cleanup;
  const useEffect = (effect, dependencies) => {
    if (previousDependencies?.every((value, index) => Object.is(value, dependencies[index]))) return;
    cleanup?.();
    previousDependencies = dependencies;
    cleanup = effect();
  };
  const crop = { url: "blob:local-crop", rotation: 0, stageAspect: 1, cropX: 0, cropSize: 1 };
  const draw = (value) => render(value, { current: canvas }, PreviewImage, useEffect);
  draw(crop);
  images[0].onload();
  assert.equal(canvas.height, 640);
  draw({ ...crop, cropX: 0.2, cropSize: 0.5 });
  assert.equal(images.length, 1);
  draw({ ...crop, rotation: 90 });
  assert.equal(images[0].onload, null);
  images[1].onload();
  assert.equal(rotations.at(-1), Math.PI / 2);
  draw({ ...crop, rotation: 90, stageAspect: 2 });
  assert.equal(images[1].onload, null);
  images[2].onload();
  assert.equal(canvas.height, 320);
  draw(null);
  assert.equal(images[2].onload, null);
  assert.equal(images.length, 3);
});

test("pagination scroll honors the reduced-motion preference", async () => {
  const source = await read("src/hooks.js");

  assert.match(source, /matchMedia\?\.\("\(prefers-reduced-motion: reduce\)"\)\?\.matches/u);
  assert.match(source, /behavior: reducedMotion \? "auto" : "smooth"/u);
});

test("pagination and article index keep the established exit animations", async () => {
  const [hooks, posts] = await Promise.all([
    read("src/hooks.js"),
    read("src/pages/PostsPage.jsx"),
  ]);
  const pagination = hooks.slice(hooks.indexOf("function usePagination"));

  assert.match(pagination, /setLeaving\(true\);/u);
  assert.match(pagination, /window\.setTimeout\(\(\) => \{[\s\S]*?\}, 150\);/u);
  assert.match(posts, /setFilterSummaryClosing\(true\);[\s\S]*?window\.setTimeout\(clear, 260\)/u);
  assert.match(posts, /setViewSwitching\(true\);[\s\S]*?\}, 280\);/u);
  assert.match(posts, /setSwitching\("leaving"\);[\s\S]*?\}, 190\);/u);
  assert.match(posts, /article-index--archive[\s\S]*?is-view-switching/u);
  assert.match(posts, /pagination\.leaving[\s\S]*?is-filter-leaving/u);
});

test("the established transition selectors and timings remain intact", async () => {
  const [base, index, interactions, materials] = await Promise.all([
    read("src/styles/base.css"),
    read("src/styles/article-index.css"),
    read("src/styles/interactions.css"),
    read("src/styles/materials.css"),
  ]);

  assert.match(base, /\.paginated-view \{[^}]*transition:opacity \.15s ease,transform \.15s ease/u);
  assert.match(base, /\.paginated-view\.is-leaving \{ opacity:0; transform:translateY\(8px\); \}/u);
  assert.match(index, /\.archive-timeline\.is-leaving/u);
  assert.match(index, /\.article-index\.is-view-switching>/u);
  assert.match(index, /\.active-filter-summary\.is-leaving/u);
  assert.match(interactions, /\.article-filter-backdrop\.is-closing \{\s*transition-duration:\.44s/u);
  assert.match(materials, /\.article-index--archive\.is-view-switching::before/u);
});

test("image crop and reply transitions react only to their lifecycle inputs", async () => {
  const replyEditor = await read("src/community/ReplyEditor.jsx");

  assert.match(replyEditor, /if \(immediateOpen\) editorNode\.classList\.add\("is-open"\)/u);
  assert.match(replyEditor, /\}, \[immediateOpen\]\);/u);
});

test("listing statistics keep a stable target identity while pagination arrays are recreated", async () => {
  const [music, poems, posts] = await Promise.all([
    read("src/pages/MusicPage.jsx"),
    read("src/pages/PoemsPage.jsx"),
    read("src/pages/PostsPage.jsx"),
  ]);

  for (const source of [music, poems, posts]) {
    assert.match(source, /pageStatsTargets/u);
    assert.match(source, /onStatsTargets\(pageStatsTargets\)/u);
  }
});

test("archive selection resets only for changed archive content and keeps stats writes isolated", async () => {
  const posts = await read("src/pages/PostsPage.jsx");
  const archive = posts.slice(posts.indexOf("function ArticleArchive"));

  assert.match(archive, /filteredPostsKey/u);
  assert.match(archive, /visibleStatsKey/u);
  assert.match(archive, /onStatsTargets\(visibleStatsTargets\)/u);
});

test("posts query synchronization uses scalar route inputs instead of rebuilding filter arrays", async () => {
  const posts = await read("src/pages/PostsPage.jsx");
  const queryEffectStart = posts.indexOf("  useEffect(() => {\n    if (!hasFilterParameter");
  const queryEffect = posts.slice(queryEffectStart, posts.indexOf("  useEffect(() => { updateArticleIndexState", queryEffectStart));

  assert.match(posts, /const requestedView = parameters\.get\("view"\) \|\| "";/u);
  assert.match(posts, /const hasFilterParameter = parameters\.has\("filter"\);/u);
  assert.match(posts, /const requestedTagSelection = allTags\.includes\(requestedTag\)/u);
  assert.match(posts, /const requestedSeriesSelection = allSeries\.includes\(requestedSeries\)/u);
  assert.match(queryEffect, /setCategory\("全部"\)/u);
});
