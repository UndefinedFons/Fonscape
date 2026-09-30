import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";
import appConfig from "../vite.config.mjs";

const siteConfigPath = fileURLToPath(new URL("../fonscape.config.js", import.meta.url));

export default mergeConfig(appConfig, {
  plugins: [{
    name: "community-test-fixture",
    transform(code, id) {
      if (id !== siteConfigPath) return;
      return `${code}\nsiteConfig.showCommunity = true;`;
    },
  }],
});
