import type { CommentThread, PublicComment } from "../types.ts";
import { parseRoutePath, parseRouteQuery, replaceRoute } from "../routeState.ts";

export function readCommentTarget() {
  return new URLSearchParams(parseRouteQuery()).get("comment") || "";
}

export function consumeCommentTarget() {
  const query = new URLSearchParams(parseRouteQuery());
  if (!query.has("comment")) return;
  query.delete("comment");
  const path = parseRoutePath();
  replaceRoute(query.size ? `${path}?${query.toString()}` : path);
}

export function groupCommentThreads(comments: PublicComment[]): CommentThread[] {
  const replies = new Map<string, PublicComment[]>();
  comments.forEach((comment) => {
    if (comment.parentId) replies.set(comment.parentId, [...(replies.get(comment.parentId) || []), comment]);
  });
  return comments
    .filter((comment) => !comment.parentId)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .map((comment) => ({
      comment,
      replies: (replies.get(comment.id) || []).sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()),
    }));
}
