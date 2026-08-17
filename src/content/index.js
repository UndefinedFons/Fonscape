import { authorProfile, friendLinks, navItems, siteConfig } from "./site.js";
import {
  assertUniqueEntries,
  parseMusicReview,
  parsePoem,
  parsePost,
  sortNewestFirst,
} from "./frontmatter.js";

const postSources = import.meta.glob("./posts/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});
const poemSources = import.meta.glob("./poems/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});
const musicSources = import.meta.glob("./music/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

function loadCollection(sources, parser, label) {
  return assertUniqueEntries(
    Object.entries(sources).map(([path, source]) => parser(path, source)),
    label,
  ).sort(sortNewestFirst);
}

export const posts = loadCollection(postSources, parsePost, "文章");
export const poems = loadCollection(poemSources, parsePoem, "小诗");
const allMusicReviews = loadCollection(musicSources, parseMusicReview, "音乐");
export const musicReviews = Object.fromEntries(
  ["songs", "artists", "albums"].map((section) => [
    section,
    allMusicReviews.filter((review) => review.section === section),
  ]),
);
export { authorProfile, friendLinks, navItems, siteConfig };
