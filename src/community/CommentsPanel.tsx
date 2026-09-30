import { siteConfig } from "../siteConfig.ts";
import { CommentsSection } from "./CommentsSection.tsx";
import type { ContentType, OnStatsChange } from "../types.ts";

export function CommentsPanel({ targetType, slug, onStatsChange }: { targetType: ContentType; slug: string; onStatsChange?: OnStatsChange }) {
  if (!siteConfig.showCommunity) return null;
  return <div className="material-panel comments-material-panel"><CommentsSection targetType={targetType} slug={slug} onStatsChange={onStatsChange} /></div>;
}
