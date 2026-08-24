import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const setupPageUrl = new URL("../src/pages/AdminSetupPage.jsx", import.meta.url);
const appUrl = new URL("../src/App.jsx", import.meta.url);
const mainUrl = new URL("../src/main.jsx", import.meta.url);

test("administrator setup keeps the bootstrap token empty and visible", async () => {
  const source = await readFile(setupPageUrl, "utf8");
  assert.match(source, /useState\(\{ token: "", username: "", nickname: "", password: "" \}\)/u);
  assert.match(source, /name="token" type="text" value=\{form\.token\}/u);
  assert.doesNotMatch(source, /defaultValue=/u);
  assert.doesNotMatch(source, /ADMIN_BOOTSTRAP_TOKEN/u);
  assert.doesNotMatch(source, /令牌保持可见/u);
  assert.match(source, /typeof result\.initialized !== "boolean"/u);
  assert.match(source, /暂时无法检查初始化状态/u);
  assert.match(source, /window\.location\.replace\("#\/"\)/u);
});

test("administrator setup collects a nickname and can reveal the password", async () => {
  const source = await readFile(setupPageUrl, "utf8");
  assert.match(source, /id="admin-setup-nickname" name="nickname" value=\{form\.nickname\}/u);
  assert.match(source, /autoComplete="nickname" minLength="1" maxLength="10" required/u);
  assert.match(source, /type=\{passwordVisible \? "text" : "password"\}/u);
  assert.match(source, /className="password-visibility-button"/u);
  assert.match(source, /aria-label=\{passwordVisible \? "隐藏密码" : "显示密码"\}/u);
  assert.match(source, /<EyeSlash[\s\S]*<Eye/u);
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

test("direct and retired administrator routes return to their canonical destinations", async () => {
  const [appSource, mainSource] = await Promise.all([
    readFile(appUrl, "utf8"),
    readFile(mainUrl, "utf8"),
  ]);
  assert.match(mainSource, /directPath === "\/admin\/setup"[\s\S]*replace\("\/#\/admin\/setup"\)/u);
  assert.match(mainSource, /directPath === "\/admin"[\s\S]*replace\("\/#\/"\)/u);
  assert.match(appSource, /route === "\/admin" \|\| (?:\(route\.startsWith\("\/admin\/"\) && !isSetupRoute\)|route\.startsWith\("\/admin\/"\))/u);
  assert.match(appSource, /isRetiredAdminRoute\) window\.location\.replace\("#\/"\)/u);
});
