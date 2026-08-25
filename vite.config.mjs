import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import siteConfig from "./fonscape.config.js";

function escapeAttribute(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function heroPreloadPlugin() {
  return {
    name: "fonscape-hero-preload",
    transformIndexHtml(html) {
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
      const withoutStaticHeroPreloads = html.replace(/\s*<link\s+rel="preload"\s+href="[^"]+"\s+as="image"[^>]*fetchpriority="high"\s*\/?>/gu, "");
      return withoutStaticHeroPreloads.replace("</head>", `    ${preloads.join("\n    ")}\n  </head>`);
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
  plugins: [react(), heroPreloadPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), "index.html"),
      },
    },
  },
});
