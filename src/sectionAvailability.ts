import type { ContentType, SiteConfig } from "./types.ts";

type SectionFlag = "showPoems" | "showMusic";
type OptionalSectionId = "poems" | "music";
interface SectionDefinition {
  id: OptionalSectionId;
  flag: SectionFlag;
  indexPath: string;
  detailPrefix: string;
  collectionType: Exclude<ContentType, "post">;
}

/**
 * Optional content sections share this small table so every entry point uses
 * the same flag, route and collection mapping.
 */
export const sectionAvailability: ReadonlyArray<Readonly<SectionDefinition>> = Object.freeze([
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

export function normalizeRoutePath(path: unknown): string {
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
 */
export function normalizeRouteLocation(path: unknown): string {
  let value = String(path || "/").trim();
  if (value.startsWith("#")) value = value.slice(1);
  const queryIndex = value.indexOf("?");
  const route = normalizeRoutePath(queryIndex >= 0 ? value.slice(0, queryIndex) : value);
  const query = queryIndex >= 0 ? value.slice(queryIndex + 1) : "";
  return query ? `${route}?${query}` : route;
}

export function getSectionDefinition(value: unknown): Readonly<SectionDefinition> | null {
  const route = normalizeRoutePath(value);
  return sectionAvailability.find(({ id, indexPath, detailPrefix }) => value === id || route === indexPath || route.startsWith(detailPrefix)) || null;
}

export function getSectionAvailability(config: Partial<SiteConfig> = {}): Readonly<Record<OptionalSectionId, boolean>> {
  return Object.freeze(Object.fromEntries(sectionAvailability.map(({ id, flag }) => [id, config?.[flag] === true])) as Record<OptionalSectionId, boolean>);
}

export function isSiteRouteEnabled(path: unknown, config: Partial<SiteConfig> = {}): boolean {
  const route = normalizeRoutePath(path);
  if (route === "/friends") return config.showCommunity !== false;
  if (route === "/admin" || route.startsWith("/admin/")) return config.showCommunity !== false;
  const section = getSectionDefinition(path);
  return !section || config?.[section.flag] === true;
}

export function getEnabledCollectionTypes(config: Partial<SiteConfig> = {}): ContentType[] {
  const availability = getSectionAvailability(config);
  return ["post", ...sectionAvailability.filter(({ id }) => availability[id]).map(({ collectionType }) => collectionType)];
}
