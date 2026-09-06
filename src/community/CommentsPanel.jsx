import { CommentsSection } from "./CommentsSection.jsx";

export function CommentsPanel({ targetType, slug }) {
  return <div className="material-panel comments-material-panel"><CommentsSection targetType={targetType} slug={slug} /></div>;
}
