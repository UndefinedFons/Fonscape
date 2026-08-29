import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parsePost } from "./src/content/frontmatter.js";
import siteConfig from "./fonscape.config.js";
import { generateContentArtifacts } from "./scripts/generate-content-targets.mjs";
import { generateFontStylesheets } from "./scripts/generate-font-css.mjs";
import { generateResponsiveImages } from "./scripts/generate-responsive-images.mjs";
import { responsiveImageCandidates, responsiveImageUrl } from "./src/responsiveImages.ts";

function escapeAttribute(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function escapeHtmlText(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function applySiteMetadata(html, config = siteConfig) {
  return html
    .replace(/(<html\b[^>]*\blang=")[^"]*(")/iu, (_match, before, after) => `${before}${escapeAttribute(config.language)}${after}`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*("\s*\/?>)/iu, (_match, before, after) => `${before}${escapeAttribute(config.description)}${after}`)
    .replace(/<title>[\s\S]*?<\/title>/iu, () => `<title>${escapeHtmlText(config.title)}</title>`);
}

export function localizeGoogleFontStylesheet(html) {
  const criticalFontCss = readFileSync(resolve(process.cwd(), "public/fonscape/google-fonts.css"), "utf8");
  return html
    .replace(/\s*<link\s+rel="preconnect"\s+href="https:\/\/fonts\.googleapis\.com"\s*\/?>/u, "")
    .replace(/([ \t]*)<link\s+rel="stylesheet"\s+href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]+"\s*\/?>/u, (_match, indent) => `${indent}<style data-fonscape-critical-fonts>${criticalFontCss}</style>`);
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

function preloadImage(source, { media = "", sizes = "", intendedWidth = 0, includeCandidates = true } = {}) {
  if (!source) return "";
  const candidates = includeCandidates ? responsiveImageCandidates(source) : [];
  const href = intendedWidth ? responsiveImageUrl(source, intendedWidth) : source;
  const attributes = [
    `rel="preload"`,
    `href="${escapeAttribute(href)}"`,
    `as="image"`,
    media && `media="${escapeAttribute(media)}"`,
    candidates.length > 1 && `imagesrcset="${escapeAttribute(candidates.map(({ src, width }) => `${src} ${width}w`).join(", "))}"`,
    candidates.length > 1 && sizes && `imagesizes="${escapeAttribute(sizes)}"`,
    `fetchpriority="high"`,
  ].filter(Boolean);
  return `<link ${attributes.join(" ")} />`;
}

function heroPreloadPlugin() {
  return {
    name: "fonscape-hero-preload",
    transformIndexHtml(html) {
      const optimizedHtml = applySiteMetadata(localizeGoogleFontStylesheet(html));
      const homeHero = siteConfig.heroes?.home || {};
      const desktopImage = homeHero.image;
      const mobileImage = homeHero.mobileImage || desktopImage;
      const preloads = [];
      if (desktopImage && mobileImage) {
        preloads.push(preloadImage(mobileImage, { media: "(max-width: 760px)", intendedWidth: 960, includeCandidates: false }));
        preloads.push(preloadImage(desktopImage, { media: "(min-width: 761px)", intendedWidth: 1600, includeCandidates: false }));
      } else if (desktopImage) {
        preloads.push(preloadImage(desktopImage, { intendedWidth: 1600, includeCandidates: false }));
      }
      if (homeHero.glassImage) {
        preloads.push(preloadImage(homeHero.glassImage, { intendedWidth: 1280, includeCandidates: false }));
      }
      const featuredImage = homeFeaturedImage();
      if (featuredImage && !preloads.some((preload) => preload.includes(`href="${escapeAttribute(featuredImage)}"`))) {
        preloads.push(preloadImage(featuredImage, { sizes: "(max-width: 760px) calc(100vw - 24px), min(62vw, 760px)", intendedWidth: 768 }));
      }
      const withoutStaticHeroPreloads = optimizedHtml.replace(/\s*<link\s+rel="preload"\s+href="[^"]+"\s+as="image"[^>]*fetchpriority="high"\s*\/?>/gu, "");
      return withoutStaticHeroPreloads.replace("</head>", `    ${preloads.join("\n    ")}\n  </head>`);
    },
  };
}

function contentMetadataPlugin() {
  const contentRoot = resolve(process.cwd(), "src/content");
  const imageRoot = resolve(process.cwd(), "public/assets");
  const metadataPath = resolve(process.cwd(), "functions/_generated/content-metadata.js");
  let generation = Promise.resolve();
  const regenerate = () => {
    generation = generation.then(() => Promise.all([generateContentArtifacts(), generateFontStylesheets(), generateResponsiveImages()]));
    return generation;
  };
  return {
    name: "fonscape-content-metadata",
    async handleHotUpdate({ file, modules, server }) {
      if (file.startsWith(`${imageRoot}/`) && /\.(?:avif|jpe?g|png|webp)$/iu.test(file)) {
        await generateResponsiveImages();
        server.ws.send({ type: "full-reload" });
        return [];
      }
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
