/** @typedef {import("../types.js").DatedEntry & {featured: boolean, featuredOrder?: number}} HomePost */
/** @typedef {import("../types.js").DatedEntry} HomePoem */
/** @typedef {import("../types.js").DatedEntry & {section: "songs" | "artists" | "albums"}} HomeMusic */

/**
 * @param {HomePost[]} posts
 */
export function sortFeaturedPosts(posts) {
  return [...posts]
    .filter((post) => post.featured)
    .sort((left, right) => (left.featuredOrder ?? Number.MAX_SAFE_INTEGER) - (right.featuredOrder ?? Number.MAX_SAFE_INTEGER)
      || new Date(left.date).getTime() - new Date(right.date).getTime());
}

/**
 * @param {HomePost[]} posts
 * @param {HomePoem[]} poems
 * @param {Record<string, HomeMusic[]>} musicReviews
 */
export function getHomeContent(posts, poems, musicReviews) {
  const featuredPosts = sortFeaturedPosts(posts);
  const recentPosts = [...posts]
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
    .slice(0, 5);
  const latestPoems = [...poems]
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
    .slice(0, 5);
  const latestMusic = Object.entries(musicReviews)
    .flatMap(([section, entries]) => entries.map((entry) => ({ ...entry, section })))
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
    .slice(0, 5);

  return {
    featuredPosts,
    recentPosts,
    latestPoems,
    latestMusic,
    musicCount: Object.values(musicReviews).flat().length,
  };
}
