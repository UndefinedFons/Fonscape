/** @typedef {"showPoems"|"showMusic"} SectionFlag */
/** @typedef {{id: string, flag: SectionFlag, indexPath: string, detailPrefix: string, collectionType: string}} SectionDefinition */

/**
 * Optional content sections share this small table so every entry point uses
 * the same flag, route and collection mapping.
 */
/** @type {ReadonlyArray<Readonly<SectionDefinition>>} */
export const sectionAvailability = Object.freeze([
  Object.freeze({
    id: "poems",
    flag: "showPoems",
    indexPath: "/poems",
    detailPrefix: "/poem/",
    collectionType: "poem",
  }),
  Object.freeze({
    id: "music",
    flag: "showMusic",
    indexPath: "/music",
    detailPrefix: "/music/",
    collectionType: "music",
  }),
]);

/**
 * @param {unknown} path
 * @returns {string}
 */
export function normalizeRoutePath(path) {
  let value = String(path || "/").trim();
  if (value.startsWith("#")) value = value.slice(1);
  const queryIndex = value.indexOf("?");
  if (queryIndex >= 0) value = value.slice(0, queryIndex);
  if (!value) return "/";
  if (!value.startsWith("/")) value = `/${value}`;
  return value.replace(/\/+$/u, "") || "/";
}

/**
 * Preserve a hash route's query while normalizing its path. This is used for
 * return targets so article filters and section selections survive.
 * @param {unknown} path
 * @returns {string}
 */
export function normalizeRouteLocation(path) {
  let value = String(path || "/").trim();
  if (value.startsWith("#")) value = value.slice(1);
  const queryIndex = value.indexOf("?");
  const route = normalizeRoutePath(queryIndex >= 0 ? value.slice(0, queryIndex) : value);
  const query = queryIndex >= 0 ? value.slice(queryIndex + 1) : "";
  return query ? `${route}?${query}` : route;
}

/**
 * @param {unknown} value
 * @returns {Readonly<SectionDefinition>|null}
 */
export function getSectionDefinition(value) {
  const route = normalizeRoutePath(value);
  return sectionAvailability.find(({ id, indexPath, detailPrefix }) => value === id || route === indexPath || route.startsWith(detailPrefix)) || null;
}

/**
 * @param {Partial<import("./types.js").SiteConfig>} [config]
 * @returns {Readonly<Record<string, boolean>>}
 */
export function getSectionAvailability(config = {}) {
  return Object.freeze(Object.fromEntries(sectionAvailability.map(({ id, flag }) => [id, config?.[flag] === true])));
}

/**
 * @param {unknown} path
 * @param {Partial<import("./types.js").SiteConfig>} [config]
 * @returns {boolean}
 */
export function isSiteRouteEnabled(path, config = {}) {
  const section = getSectionDefinition(path);
  return !section || config?.[section.flag] === true;
}

/**
 * @param {Partial<import("./types.js").SiteConfig>} [config]
 * @returns {string[]}
 */
export function getEnabledCollectionTypes(config = {}) {
  const availability = getSectionAvailability(config);
  return ["post", ...sectionAvailability.filter(({ id }) => availability[id]).map(({ collectionType }) => collectionType)];
}
