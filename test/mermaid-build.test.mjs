import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MERMAID_CHUNK_WARNING_LIMIT_KB,
  ROLLUP_DEFAULT_CHUNK_WARNING_LIMIT_KB,
  isMermaidEngineChunkName,
  isKnownMermaidCircularChunkWarning,
  mermaidChunkWarningPlugin,
  ordinaryChunkSizeWarning,
} from "../scripts/chunk-size-warning.mjs";
import {
  dynamicJavaScriptLimit,
  MAX_DYNAMIC_JAVASCRIPT_GZIP_LIMIT,
  MERMAID_ENGINE_GZIP_LIMIT,
} from "../scripts/check-performance-budget.mjs";

test("Mermaid's parser allowance is scoped while ordinary chunks keep the 500 kB warning", async () => {
  const viteConfig = await readFile("vite.config.mjs", "utf8");
  assert.equal(MERMAID_CHUNK_WARNING_LIMIT_KB, 674);
  assert.equal(ROLLUP_DEFAULT_CHUNK_WARNING_LIMIT_KB, 500);
  assert.match(viteConfig, /chunkSizeWarningLimit:\s*MERMAID_CHUNK_WARNING_LIMIT_KB/u);
  assert.match(viteConfig, /mermaidChunkWarningPlugin\(\)/u);
  assert.equal(isMermaidEngineChunkName("mermaid-parser-chunk-FOHPRMQF"), true);
  assert.equal(isMermaidEngineChunkName("mermaid-cytoscape"), true);
  assert.equal(isMermaidEngineChunkName("mermaid-chunk-SHT3W25Y"), false);
  assert.equal(isKnownMermaidCircularChunkWarning({ message: "Circular chunk: flowDiagram-HODETNUW -> mermaid-chunk-SHT3W25Y -> flowDiagram-HODETNUW. Please consider disabling the output.onlyExplicitManualChunks option." }), true);
  assert.equal(isKnownMermaidCircularChunkWarning({ message: "Circular dependency: src/a.js -> src/b.js -> src/a.js" }), false);

  const mermaid = { type: "chunk", name: "mermaid-parser-chunk-FOHPRMQF", fileName: "mermaid-parser-chunk-FOHPRMQF.js", code: "x".repeat(600_000) };
  const ordinary = { type: "chunk", name: "article", fileName: "article.js", code: "x".repeat(600_000) };
  const largerOrdinary = { ...ordinary, code: "x".repeat(675_001) };
  assert.equal(ordinaryChunkSizeWarning(mermaid), null);
  assert.match(ordinaryChunkSizeWarning(ordinary), /article\.js.*500 kB/u);
  assert.equal(ordinaryChunkSizeWarning(largerOrdinary), null);

  const warnings = [];
  mermaidChunkWarningPlugin().generateBundle.call({ warn: (warning) => warnings.push(warning) }, {}, { mermaid, ordinary });
  assert.deepEqual(warnings, [ordinaryChunkSizeWarning(ordinary)]);
});

test("Mermaid keeps its 160 KiB gzip budget and ordinary dynamic chunks keep 96 KiB", () => {
  assert.equal(MERMAID_ENGINE_GZIP_LIMIT, 160 * 1024);
  assert.equal(MAX_DYNAMIC_JAVASCRIPT_GZIP_LIMIT, 96 * 1024);
  assert.equal(dynamicJavaScriptLimit("/dist/assets/mermaid-parser-chunk-FOHPRMQF-BrckqHAO.js"), MERMAID_ENGINE_GZIP_LIMIT);
  assert.equal(dynamicJavaScriptLimit("/dist/assets/mermaid-cytoscape-Bch-eiPH.js"), MERMAID_ENGINE_GZIP_LIMIT);
  assert.equal(dynamicJavaScriptLimit("/dist/assets/article.js"), MAX_DYNAMIC_JAVASCRIPT_GZIP_LIMIT);
});
