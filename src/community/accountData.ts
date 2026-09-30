import type { MouseEvent } from "react";
import type { AccountComment, AccountCommentFeed, ContentLookup } from "../types.ts";
import type { AccountReply } from "../../functions/public-api.ts";
import { api, contentHref, formatCommunityTime } from "./api.ts";
import { go, parseRoutePath, replaceRoute } from "../routeState.ts";
import { routeHref } from "../routes.ts";

const commentsCache = new Map<string, AccountComment[]>();
const commentsRequests = new Map<string, Promise<AccountComment[]>>();
const repliesCache = new Map<string, AccountCommentFeed<AccountReply>>();
const repliesRequests = new Map<string, Promise<AccountCommentFeed<AccountReply>>>();
const receivedCommentsCache = new Map<string, AccountCommentFeed>();
const receivedCommentsRequests = new Map<string, Promise<AccountCommentFeed>>();

export function invalidateAccountData(): void {
  commentsCache.clear();
  commentsRequests.clear();
  repliesCache.clear();
  repliesRequests.clear();
  receivedCommentsCache.clear();
  receivedCommentsRequests.clear();
}

export function cachedMyComments(viewerId: string) {
  return commentsCache.get(viewerId);
}

export function cachedMyReplies(viewerId: string) {
  return repliesCache.get(viewerId);
}

export function cachedReceivedComments(viewerId: string) {
  return receivedCommentsCache.get(viewerId);
}

export function contentMeta(item: Pick<AccountComment, "contentType" | "contentSlug" | "contentTitle">, contentLookup: ContentLookup) {
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
  const contentSlug = String(item.contentSlug || "");
  const slug = contentSlug.split("/").slice(1).join("/");
  const review = contentLookup.get(`music:${contentSlug}`);
  return { title: item.contentTitle || review?.title || slug || contentSlug, section: `音乐 · ${review?.kind || "内容"}` };
}

export function loadMyReplies(viewerId: string, refresh = false): Promise<AccountCommentFeed<AccountReply>> {
  if (!refresh && repliesCache.has(viewerId)) return Promise.resolve(repliesCache.get(viewerId)!);
  if (repliesRequests.has(viewerId)) return repliesRequests.get(viewerId)!;
  const request = api("/me/replies").then((result) => {
    const feed = { items: result.replies || [] };
    if (repliesRequests.get(viewerId) === request) {
      repliesCache.set(viewerId, feed);
      repliesRequests.delete(viewerId);
    }
    return feed;
  }).catch((error) => {
    if (repliesRequests.get(viewerId) === request) repliesRequests.delete(viewerId);
    throw error;
  });
  repliesRequests.set(viewerId, request);
  return request;
}

export function loadMyComments(viewerId: string, refresh = false): Promise<AccountComment[]> {
  if (!refresh && commentsCache.has(viewerId)) return Promise.resolve(commentsCache.get(viewerId)!);
  if (commentsRequests.has(viewerId)) return commentsRequests.get(viewerId)!;
  const request = api("/me/comments").then((result) => {
    if (commentsRequests.get(viewerId) === request) {
      commentsCache.set(viewerId, result.comments);
      commentsRequests.delete(viewerId);
    }
    return result.comments;
  }).catch((error) => {
    if (commentsRequests.get(viewerId) === request) commentsRequests.delete(viewerId);
    throw error;
  });
  commentsRequests.set(viewerId, request);
  return request;
}

export function loadReceivedComments(viewerId: string, refresh = false): Promise<AccountCommentFeed> {
  if (!refresh && receivedCommentsCache.has(viewerId)) return Promise.resolve(receivedCommentsCache.get(viewerId)!);
  if (receivedCommentsRequests.has(viewerId)) return receivedCommentsRequests.get(viewerId)!;
  const request = api("/me/admin-comments").then((result) => {
    const feed = { items: result.comments || [] };
    if (receivedCommentsRequests.get(viewerId) === request) {
      receivedCommentsCache.set(viewerId, feed);
      receivedCommentsRequests.delete(viewerId);
    }
    return feed;
  }).catch((error) => {
    if (receivedCommentsRequests.get(viewerId) === request) receivedCommentsRequests.delete(viewerId);
    throw error;
  });
  receivedCommentsRequests.set(viewerId, request);
  return request;
}

export function commentLinkProps(item: Pick<AccountComment, "id" | "contentType" | "contentSlug" | "unread">, closeAccount: () => void, markRead?: (id: string) => Promise<void>) {
  const href = routeHref(contentHref(item.contentType, item.contentSlug), { comment: item.id });
  return {
    href,
    onClick: (event: MouseEvent<HTMLAnchorElement>) => {
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
