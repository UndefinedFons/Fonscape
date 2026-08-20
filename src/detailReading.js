const DETAIL_READING_TARGETS = [
  ["/post/", ".article-page .article-body"],
  ["/poem/", ".poem-page article"],
  ["/music/", ".music-detail-page .article-detail"],
];

export function getDetailReadingTarget(route) {
  return DETAIL_READING_TARGETS.find(([prefix]) => route.startsWith(prefix))?.[1] || "";
}
