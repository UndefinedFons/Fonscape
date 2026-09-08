import { test, expect } from "@playwright/test";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("a direct article keeps its page and return button usable while content and fonts load", async ({ page }) => {
  const article = deferred();
  const fonts = deferred();
  await page.route("**/fonscape/google-fonts-full.css", async (route) => {
    await fonts.promise;
    await route.continue();
  });
  await page.route("**/src/pages/ArticlePage.jsx", async (route) => {
    await article.promise;
    await route.continue();
  });
  await page.route("**/fonscape/content/entries/post/loading-review.json", (route) => route.fulfill({ status: 404, json: {} }));
  try {
    await page.goto("/post/loading-review", { waitUntil: "domcontentloaded" });
    const frame = page.locator("main.article-page");
    await expect(frame).toBeVisible();
    await expect(frame.getByRole("button", { name: "返回", exact: true })).toBeEnabled();
    await expect(frame.getByRole("status", { name: "正在加载内容" })).toBeVisible();
    const originalFrame = await frame.elementHandle();
    article.resolve();
    // The font request remains pending: it must not hold up page content.
    await expect(frame.getByRole("heading", { name: "这里暂时没有内容" })).toBeVisible();
    expect(await originalFrame.evaluate((node) => node === document.querySelector("main.article-page"))).toBe(true);
    await expect(frame.getByRole("status")).toHaveCount(0);
    await frame.getByRole("button", { name: "返回", exact: true }).click();
    await expect(page).toHaveURL(/\/posts$/u);
    await expect(page.getByRole("heading", { name: "文章", exact: true })).toBeVisible();
  } finally {
    article.resolve();
    fonts.resolve();
  }
});

test("a direct primary route shows its hero before the lazy page arrives", async ({ page }) => {
  const content = deferred();
  await page.route("**/src/pages/AboutPage.jsx", async (route) => {
    await content.promise;
    await route.continue();
  });
  try {
    await page.goto("/about", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".inner-hero").getByRole("heading", { name: "关于我", exact: true })).toBeVisible();
    await expect(page.getByRole("status", { name: "正在加载内容" })).toHaveCount(0);
    content.resolve();
    await expect(page.locator(".about-layout")).toBeVisible();
    await expect(page.getByRole("status", { name: "正在加载内容" })).toHaveCount(0);
  } finally {
    content.resolve();
  }
});

for (const width of [320, 768, 1280]) {
  test(`detail handoff follows changing content height without overlapping the footer at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.route('**/src/main.jsx', (route) => route.fulfill({ contentType: 'text/javascript', body: `
      import React, { use, useState } from '/node_modules/.vite/deps/react.js';
      import { createRoot } from '/node_modules/.vite/deps/react-dom_client.js';
      import { DetailPageFrame } from '/src/components/RoutePageFrame.tsx';
      import '/src/styles.css';
      let release;
      const ready = new Promise(resolve => { release = resolve; });
      function Body() {
        use(ready);
        const [height, setHeight] = useState(800);
        return React.createElement('article', null,
          React.createElement('button', {onClick: () => setHeight(100)}, 'Shrink content'),
          React.createElement('div', {style: {height}}, 'Content'));
      }
      createRoot(document.getElementById('root')).render(
        React.createElement('div', {className: 'app-shell'},
          React.createElement('button', {onClick: () => release()}, 'Resolve content'),
          React.createElement('div', {className: 'route-view'},
            React.createElement(DetailPageFrame, {kind: 'music', onReturn() {}}, React.createElement(Body))),
          React.createElement('footer', null, 'Footer')));
    ` }));
    await page.goto('/');
    await expect(page.getByRole('status')).toBeVisible();
    await page.evaluate(() => {
      window.heightSamples = [];
      const start = performance.now();
      function sample() {
        const main = document.querySelector('main').getBoundingClientRect();
        const footer = document.querySelector('footer').getBoundingClientRect();
        window.heightSamples.push({ height: main.height, gap: footer.top - main.bottom });
        if (performance.now() - start < 1000) requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    await page.getByRole('button', { name: 'Resolve content' }).click();
    await page.getByRole('button', { name: 'Shrink content' }).evaluate(button => button.click());
    await expect.poll(() => page.evaluate(() => document.querySelector('main').style.height)).toBe('');
    const samples = await page.evaluate(() => window.heightSamples);
    expect(samples.length).toBeGreaterThan(2);
    expect(Math.min(...samples.map(sample => sample.gap))).toBeGreaterThanOrEqual(0);
    await expect(page.locator('main')).not.toHaveAttribute('style', /height/u);
    expect(await page.locator('main').evaluate(node => node.offsetHeight)).toBeLessThan(500);
  });
}
