import { parseRoutePath, parseRouteQuery, replaceRoute } from "../routeState.js";

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

export function groupCommentThreads(comments) {
  const replies = new Map();
  comments.forEach((comment) => {
    if (comment.parentId) replies.set(comment.parentId, [...(replies.get(comment.parentId) || []), comment]);
  });
  return comments
    .filter((comment) => !comment.parentId)
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
    .map((comment) => ({
      comment,
      replies: (replies.get(comment.id) || []).sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt)),
    }));
}
