import { sortNewestFirst } from "../content/date.ts";
import type { DatedEntry } from "../types.ts";

type FeaturedMusic = Pick<DatedEntry, "date"> & {
  featured: boolean;
  featuredOrder?: number;
};

/** Put manually ordered music pins first, then keep every other record newest-first. */
export function sortMusicLibrary<T extends FeaturedMusic>(entries: readonly T[]): T[] {
  return [...entries].sort((left, right) => {
    if (left.featured !== right.featured) return left.featured ? -1 : 1;
    if (!left.featured) return sortNewestFirst(left, right);
    return (left.featuredOrder ?? Number.MAX_SAFE_INTEGER) - (right.featuredOrder ?? Number.MAX_SAFE_INTEGER)
      || sortNewestFirst(left, right);
  });
}
