import { siteConfig } from "../siteConfig.js";
import { CommentsSection } from "./CommentsSection.jsx";

export function CommentsPanel({ targetType, slug, onStatsChange }) {
  if (!siteConfig.showCommunity) return null;
  return <div className="material-panel comments-material-panel"><CommentsSection targetType={targetType} slug={slug} onStatsChange={onStatsChange} /></div>;
}
