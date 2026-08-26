import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parsePost } from "./src/content/frontmatter.js";
import siteConfig from "./fonscape.config.js";
import { generateContentArtifacts } from "./scripts/generate-content-targets.mjs";
import { generateFontStylesheets } from "./scripts/generate-font-css.mjs";

function escapeAttribute(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

export function localizeGoogleFontStylesheet(html) {
  return html
    .replace(/\s*<link\s+rel="preconnect"\s+href="https:\/\/fonts\.googleapis\.com"\s*\/?>/u, "")
    .replace(/([ \t]*)<link\s+rel="stylesheet"\s+href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]+"\s*\/?>/u, (_match, indent) => [
      `${indent}<link rel="stylesheet" href="/fonscape/google-fonts.css" />`,
      `${indent}<link rel="preload" as="style" href="/fonscape/google-fonts-full.css" fetchpriority="low" />`,
      `${indent}<link rel="stylesheet" href="/fonscape/google-fonts-full.css" media="print" onload="this.media='all'" />`,
    ].join("\n"));
}

function markdownFiles(directory) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return entries.sort((left, right) => left.name.localeCompare(right.name)).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.isFile() && entry.name.endsWith(".md") ? [path] : [];
  });
}

function homeFeaturedImage() {
  const posts = markdownFiles(resolve(process.cwd(), "src/content/posts"))
    .map((path) => parsePost(path, readFileSync(path, "utf8")))
    .filter((post) => post.featured)
    .sort((left, right) => (left.featuredOrder ?? Number.MAX_SAFE_INTEGER) - (right.featuredOrder ?? Number.MAX_SAFE_INTEGER)
      || new Date(left.date).getTime() - new Date(right.date).getTime());
  const post = posts[0];
  return post?.cardImage || post?.image || "";
}

function heroPreloadPlugin() {
  return {
    name: "fonscape-hero-preload",
    transformIndexHtml(html) {
      const optimizedHtml = localizeGoogleFontStylesheet(html);
      const homeHero = siteConfig.heroes?.home || {};
      const desktopImage = homeHero.image;
      const mobileImage = homeHero.mobileImage || desktopImage;
      const preloads = [];
      if (desktopImage && mobileImage !== desktopImage) {
        preloads.push(`<link rel="preload" href="${escapeAttribute(mobileImage)}" as="image" media="(max-width: 760px)" fetchpriority="high" />`);
        preloads.push(`<link rel="preload" href="${escapeAttribute(desktopImage)}" as="image" media="(min-width: 761px)" fetchpriority="high" />`);
      } else if (desktopImage) {
        preloads.push(`<link rel="preload" href="${escapeAttribute(desktopImage)}" as="image" fetchpriority="high" />`);
      }
      if (homeHero.glassImage) {
        preloads.push(`<link rel="preload" href="${escapeAttribute(homeHero.glassImage)}" as="image" fetchpriority="high" />`);
      }
      const featuredImage = homeFeaturedImage();
      if (featuredImage && !preloads.some((preload) => preload.includes(`href="${escapeAttribute(featuredImage)}"`))) {
        preloads.push(`<link rel="preload" href="${escapeAttribute(featuredImage)}" as="image" fetchpriority="high" />`);
      }
      const withoutStaticHeroPreloads = optimizedHtml.replace(/\s*<link\s+rel="preload"\s+href="[^"]+"\s+as="image"[^>]*fetchpriority="high"\s*\/?>/gu, "");
      return withoutStaticHeroPreloads.replace("</head>", `    ${preloads.join("\n    ")}\n  </head>`);
    },
  };
}

function contentMetadataPlugin() {
  const contentRoot = resolve(process.cwd(), "src/content");
  const metadataPath = resolve(process.cwd(), "functions/_generated/content-metadata.js");
  let generation = Promise.resolve();
  const regenerate = () => {
    generation = generation.then(() => Promise.all([generateContentArtifacts(), generateFontStylesheets()]));
    return generation;
  };
  return {
    name: "fonscape-content-metadata",
    async buildStart() {
      await regenerate();
    },
    async handleHotUpdate({ file, modules, server }) {
      if (!file.startsWith(`${contentRoot}/`) || !file.endsWith(".md")) return undefined;
      await regenerate();
      const metadataModule = server.moduleGraph.getModuleById(metadataPath);
      if (metadataModule) server.moduleGraph.invalidateModule(metadataModule);
      return [...modules, ...(metadataModule ? [metadataModule] : [])];
    },
  };
}

export default defineConfig({
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [contentMetadataPlugin(), react(), heroPreloadPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), "index.html"),
      },
    },
  },
});
