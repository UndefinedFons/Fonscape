import { CalendarBlank } from "@phosphor-icons/react/CalendarBlank";
import { ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { Eye } from "@phosphor-icons/react/Eye";
import { Feather } from "@phosphor-icons/react/Feather";
import { use, useEffect } from "react";
import { CommentsPanel } from "../community/CommentsPanel.tsx";
import { loadPoem, siteConfig } from "../content/index.ts";
import { setDocumentTitle } from "../navigation.ts";
import { formatContentDate } from "../siteUtils.ts";
import { NotFound } from "./NotFound.tsx";
import type { ContentStat, OnStatsChange } from "../types.ts";

type StatsTarget = { type: "poem"; slug: string };
type CommentStatsHandler = OnStatsChange;

export function PoemPage({ slug, stats, onView, onStatsTargets }: {
  slug: string;
  stats: Record<string, ContentStat>;
  onView: (type: "poem", slug: string) => Promise<void>;
  onStatsTargets: (targets: StatsTarget[]) => Promise<void>;
}) {
  const poem = use(loadPoem(slug));
  const detailPoem = poem;
  useEffect(() => { if (poem?.slug) onView("poem", poem.slug); }, [poem?.slug, onView]);
  useEffect(() => { if (poem?.slug) onStatsTargets([{ type: "poem", slug: poem.slug }]); }, [poem?.slug, onStatsTargets]);
  useEffect(() => { setDocumentTitle(poem?.title || "页面不存在", siteConfig.title); }, [poem?.title]);
  if (!poem) return <NotFound embedded />;
  return <><Feather size={30} /><span className="eyebrow">SMALL POEM</span><h1>{poem.title}</h1><div className="post-meta poem-detail-meta"><span><CalendarBlank size={16} /><time dateTime={poem.date}>{formatContentDate(poem.date)}</time></span><span><Eye size={16} />{stats[poem.slug]?.views || 0}</span>{siteConfig.showCommunity && <span><ChatCircleDots size={16} />{stats[poem.slug]?.comments || 0}</span>}</div><div className="poem-lines">{detailPoem!.lines.map((line, index) => <p key={`${poem.slug}-${index}`}>{line}</p>)}</div>{poem.note && <p className="poem-note">{poem.note}</p>}</>;
}

export function PoemComments({ slug, onCommentStats }: { slug: string; onCommentStats: CommentStatsHandler }) {
  const poem = use(loadPoem(slug));
  return poem ? <CommentsPanel targetType="poem" slug={poem.slug} onStatsChange={onCommentStats} /> : null;
}
