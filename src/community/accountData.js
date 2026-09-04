import { api, contentHref, formatCommunityTime } from "./api.js";
import { go, parseRoutePath, replaceRoute } from "../routeState.js";
import { routeHref } from "../routes.js";

const commentsCache = new Map();
const commentsRequests = new Map();
const repliesCache = new Map();
const repliesRequests = new Map();
const receivedCommentsCache = new Map();
const receivedCommentsRequests = new Map();

export function cachedMyComments(viewerId) {
  return commentsCache.get(viewerId);
}

export function cachedMyReplies(viewerId) {
  return repliesCache.get(viewerId);
}

export function cachedReceivedComments(viewerId) {
  return receivedCommentsCache.get(viewerId);
}

export function contentMeta(item, contentLookup) {
  if (item.contentType === "post") {
    if (item.contentSlug === "site-friends") return { title: "友链", section: "页面 · 友链" };
    if (item.contentSlug === "site-about") return { title: "关于我", section: "页面 · 关于" };
    const post = contentLookup.get(`post:${item.contentSlug}`);
    return { title: post?.title || item.contentSlug, section: `文章${post?.category ? ` · ${post.category}` : ""}` };
  }
  if (item.contentType === "poem") {
    const poem = contentLookup.get(`poem:${item.contentSlug}`);
    return { title: poem?.title || item.contentSlug, section: "小诗" };
  }
  const [section, slug] = String(item.contentSlug || "").split("/");
  const review = contentLookup.get(`music:${section}/${slug}`);
  return { title: item.contentTitle || review?.title || slug || item.contentSlug, section: `音乐 · ${review?.kind || "内容"}` };
}

export function loadMyReplies(viewerId, refresh = false) {
  if (!refresh && repliesCache.has(viewerId)) return Promise.resolve(repliesCache.get(viewerId));
  if (repliesRequests.has(viewerId)) return repliesRequests.get(viewerId);
  const request = api("/me/replies").then((result) => {
    const feed = { items: result.replies || [] };
    repliesCache.set(viewerId, feed);
    repliesRequests.delete(viewerId);
    return feed;
  }).catch((error) => {
    repliesRequests.delete(viewerId);
    throw error;
  });
  repliesRequests.set(viewerId, request);
  return request;
}

export function loadMyComments(viewerId, refresh = false) {
  if (!refresh && commentsCache.has(viewerId)) return Promise.resolve(commentsCache.get(viewerId));
  if (commentsRequests.has(viewerId)) return commentsRequests.get(viewerId);
  const request = api("/me/comments").then((result) => {
    commentsCache.set(viewerId, result.comments);
    commentsRequests.delete(viewerId);
    return result.comments;
  }).catch((error) => {
    commentsRequests.delete(viewerId);
    throw error;
  });
  commentsRequests.set(viewerId, request);
  return request;
}

export function loadReceivedComments(viewerId, refresh = false) {
  if (!refresh && receivedCommentsCache.has(viewerId)) return Promise.resolve(receivedCommentsCache.get(viewerId));
  if (receivedCommentsRequests.has(viewerId)) return receivedCommentsRequests.get(viewerId);
  const request = api("/me/admin-comments").then((result) => {
    const feed = { items: result.comments || [] };
    receivedCommentsCache.set(viewerId, feed);
    receivedCommentsRequests.delete(viewerId);
    return feed;
  }).catch((error) => {
    receivedCommentsRequests.delete(viewerId);
    throw error;
  });
  receivedCommentsRequests.set(viewerId, request);
  return request;
}

export function commentLinkProps(item, closeAccount, markRead) {
  const href = routeHref(contentHref(item.contentType, item.contentSlug), { comment: item.id });
  return {
    href,
    onClick: (event) => {
      event.preventDefault();
      if (item.unread && markRead) Promise.resolve(markRead(item.id)).catch(() => {});
      closeAccount();
      const currentPath = parseRoutePath();
      const nextPath = new URL(href, window.location.href).pathname;
      if (currentPath === nextPath) {
        replaceRoute(href);
        window.setTimeout(() => window.dispatchEvent(new CustomEvent("fonscape:locate-comment", { detail: { id: item.id } })), 320);
      } else {
        go(href);
      }
    },
  };
}

export { formatCommunityTime };
