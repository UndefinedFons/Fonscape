import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const setupPageUrl = new URL("../src/pages/AdminSetupPage.jsx", import.meta.url);
const appUrl = new URL("../src/App.jsx", import.meta.url);

test("administrator setup keeps the bootstrap token empty and visible", async () => {
  const source = await readFile(setupPageUrl, "utf8");
  assert.match(source, /useState\(\{ token: "", username: "", password: "" \}\)/u);
  assert.match(source, /name="token" type="text" value=\{form\.token\}/u);
  assert.doesNotMatch(source, /defaultValue=/u);
  assert.doesNotMatch(source, /ADMIN_BOOTSTRAP_TOKEN/u);
  assert.match(source, /typeof result\.initialized !== "boolean"/u);
  assert.match(source, /暂时无法检查初始化状态/u);
  assert.match(source, /window\.location\.replace\("#\/"\)/u);
});

test("administrator setup is a focused route without site navigation", async (context) => {
  const source = await readFile(appUrl, "utf8");
  if (!source.includes("AdminSetupPage")) {
    context.skip("the site kept its own application shell and does not expose the optional setup route");
    return;
  }
  assert.match(source, /const isSetupRoute = route === "\/admin\/setup"/u);
  assert.match(source, /\{!isSetupRoute && <Header/u);
  assert.match(source, /\{!isSetupRoute && <><Footer/u);
});
