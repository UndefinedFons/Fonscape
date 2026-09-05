export const ROLLUP_DEFAULT_CHUNK_WARNING_LIMIT_KB = 500;
// Vite measures minified JavaScript in decimal kB. The Mermaid parser's
// indivisible runtime is 673.21 kB in the current lockfile; keep the limit at
// the smallest whole-kB value that accepts it and still catches growth.
export const MERMAID_CHUNK_WARNING_LIMIT_KB = 674;

const MERMAID_ENGINE_CHUNK_PATTERN = /^mermaid-(?:cytoscape|parser-chunk-[A-Za-z0-9]+)(?:-|$)/u;

export function isMermaidEngineChunkName(name) {
  return MERMAID_ENGINE_CHUNK_PATTERN.test(String(name ?? ""));
}

export function isKnownMermaidCircularChunkWarning(warning) {
  const message = String(warning?.message || warning || "");
  return message.startsWith("Circular chunk: flowDiagram-")
    && message.includes(" -> mermaid-chunk-")
    && message.includes("onlyExplicitManualChunks");
}

function chunkName(chunk) {
  return String(chunk?.name || chunk?.fileName || "");
}

function chunkSizeInKilobytes(chunk) {
  return Buffer.byteLength(String(chunk?.code ?? ""), "utf8") / 1000;
}

/**
 * Return the ordinary-chunk warning that Vite would otherwise hide while its
 * global limit is raised enough for Mermaid's parser runtime. Chunks above the
 * raised limit are still reported by Vite's own reporter.
 *
 * @param {{ type?: string, name?: string, fileName?: string, code?: string }} chunk
 * @returns {string | null}
 */
export function ordinaryChunkSizeWarning(chunk) {
  if (chunk?.type !== "chunk" || isMermaidEngineChunkName(chunkName(chunk))) return null;
  const size = chunkSizeInKilobytes(chunk);
  if (size <= ROLLUP_DEFAULT_CHUNK_WARNING_LIMIT_KB || size > MERMAID_CHUNK_WARNING_LIMIT_KB) return null;
  const name = chunk.fileName || chunkName(chunk);
  return `Chunk ${name} is larger than ${ROLLUP_DEFAULT_CHUNK_WARNING_LIMIT_KB} kB after minification (${size.toFixed(2)} kB).`;
}

export function mermaidChunkWarningPlugin() {
  return {
    name: "fonscape-chunk-size-warning",
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        const warning = ordinaryChunkSizeWarning(chunk);
        if (warning) this.warn(warning);
      }
    },
  };
}
