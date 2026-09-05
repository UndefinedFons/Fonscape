import { readFile } from "node:fs/promises";

export async function readThemeStyles() {
  const entry = new URL("../../src/styles.css", import.meta.url);
  const source = await readFile(entry, "utf8");
  const imports = [...source.matchAll(/@import "([^";]+)";/gu)];
  return (await Promise.all(imports.map(([, path]) => readFile(new URL(path, entry), "utf8")))).join("");
}
