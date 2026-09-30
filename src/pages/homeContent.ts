import { contentDateTimestamp, sortNewestFirst } from "../content/date.ts";
import type { DatedEntry, MusicReviewMetadata, MusicSection, PoemMetadata, PostMetadata } from "../types.ts";

type FeaturedPost = Pick<DatedEntry, "date"> & { featured: boolean; featuredOrder?: number };
type HomeMusicEntry = MusicReviewMetadata & { section: MusicSection };
interface HomeContentResult {
  featuredPosts: PostMetadata[];
  recentPosts: PostMetadata[];
  latestPoems: PoemMetadata[];
  latestMusic: HomeMusicEntry[];
  musicCount: number;
}

export function sortFeaturedPosts<T extends FeaturedPost>(posts: readonly T[]): T[] {
  return [...posts]
    .filter((post) => post.featured)
    .sort((left, right) => (left.featuredOrder ?? Number.MAX_SAFE_INTEGER) - (right.featuredOrder ?? Number.MAX_SAFE_INTEGER)
      || contentDateTimestamp(left.date) - contentDateTimestamp(right.date));
}

export function getHomeContent(
  posts: readonly PostMetadata[],
  poems: readonly PoemMetadata[],
  musicReviews: Partial<Record<MusicSection, MusicReviewMetadata[]>>,
): HomeContentResult {
  const featuredPosts = sortFeaturedPosts(posts);
  const recentPosts = [...posts].sort(sortNewestFirst).slice(0, 5);
  const latestPoems = [...poems].sort(sortNewestFirst).slice(0, 5);
  const latestMusic = Object.entries(musicReviews)
    .flatMap(([section, entries]) => entries.map((entry) => ({ ...entry, section: section as MusicSection })))
    .sort(sortNewestFirst)
    .slice(0, 5);

  return {
    featuredPosts,
    recentPosts,
    latestPoems,
    latestMusic,
    musicCount: Object.values(musicReviews).flat().length,
  };
}
