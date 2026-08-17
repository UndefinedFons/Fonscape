import { contentRepositoryConfig } from "../content-repository.config.mjs";

const CONTENT_TYPES = new Set(["post", "poem", "music"]);
const SAFE_SLUG = /^[a-z0-9][a-z0-9_-]{0,119}$/u;

function requiredString(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new TypeError(`content repository ${field} is required`);
  return normalized;
}

function normalizeConfig(config) {
  if (!config || config.schemaVersion !== 1) throw new TypeError("unsupported content repository configuration");
  const collections = {};
  for (const type of CONTENT_TYPES) {
    const collection = config.collections?.[type];
    const directory = requiredString(collection?.directory, `${type}.directory`);
    const extension = requiredString(collection?.extension, `${type}.extension`);
    if (!directory.startsWith("src/content/") || directory.includes("..") || !extension.startsWith(".")) {
      throw new TypeError(`invalid content repository collection: ${type}`);
    }
    collections[type] = Object.freeze({ directory, extension });
  }
  return Object.freeze({
    schemaVersion: config.schemaVersion,
    sourceOfTruth: requiredString(config.sourceOfTruth, "sourceOfTruth"),
    publicationMode: requiredString(config.publicationMode, "publicationMode"),
    assetDirectory: requiredString(config.assetDirectory, "assetDirectory"),
    collections: Object.freeze(collections),
  });
}

export function contentPathFor(config, type, slug) {
  const normalized = String(slug || "").trim();
  if (!CONTENT_TYPES.has(type) || !SAFE_SLUG.test(normalized)) throw new TypeError("invalid content destination");
  const collection = normalizeConfig(config).collections[type];
  return `${collection.directory}/${normalized}${collection.extension}`;
}

/**
 * The provider only receives a declarative change; it can be backed by a Git
 * hosting API, a local Git workflow, or another reviewed repository service.
 */
export function createContentRepositoryBoundary({
  config = contentRepositoryConfig,
  proposeChange,
} = {}) {
  if (typeof proposeChange !== "function") throw new TypeError("proposeChange must be a function");
  const normalizedConfig = normalizeConfig(config);
  return Object.freeze({
    config: normalizedConfig,
    destinationFor(type, slug) {
      return contentPathFor(normalizedConfig, type, slug);
    },
    async propose({ type, slug, content, message }) {
      const path = contentPathFor(normalizedConfig, type, slug);
      const normalizedContent = String(content || "");
      if (!normalizedContent.trim()) throw new TypeError("content must not be empty");
      return proposeChange({
        path,
        content: normalizedContent,
        message: requiredString(message, "change message"),
        publicationMode: normalizedConfig.publicationMode,
      });
    },
  });
}

export { contentRepositoryConfig };
