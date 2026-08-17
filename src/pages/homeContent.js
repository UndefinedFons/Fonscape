export function getHomeContent(posts, poems, musicReviews) {
  const featuredPosts = posts
    .filter((post) => post.featured)
    .sort((left, right) => (left.featuredOrder ?? Number.MAX_SAFE_INTEGER) - (right.featuredOrder ?? Number.MAX_SAFE_INTEGER)
      || new Date(left.date) - new Date(right.date));
  const recentPosts = [...posts]
    .sort((left, right) => new Date(right.date) - new Date(left.date))
    .slice(0, 5);
  const latestPoems = [...poems]
    .sort((left, right) => new Date(right.date) - new Date(left.date))
    .slice(0, 5);
  const latestMusic = Object.entries(musicReviews)
    .flatMap(([section, entries]) => entries.map((entry) => ({ ...entry, section })))
    .sort((left, right) => new Date(right.date) - new Date(left.date))
    .slice(0, 5);

  return {
    featuredPosts,
    recentPosts,
    latestPoems,
    latestMusic,
    musicCount: Object.values(musicReviews).flat().length,
  };
}
