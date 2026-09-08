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
