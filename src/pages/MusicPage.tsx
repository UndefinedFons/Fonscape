import type { ContentStats, ContentType, MusicSection, OnStatsChange, OnStatsTargets } from "../types.ts";
import { ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { lazy, use, useEffect, useMemo } from "react";
import { MusicReviewCard, PostMeta } from "../components/Cards.tsx";
import { Pagination } from "../components/Pagination.tsx";
import { CommentsSection } from "../community/CommentsSection.tsx";
import { loadMusicReview, siteConfig } from "../content/index.ts";
import { usePagination, useResponsivePageSize } from "../hooks.ts";
import { musicSections } from "../musicSections.ts";
import { replaceRoute } from "../routeState.ts";
import { parseMusicContentKey, routeHref } from "../routes.ts";
import { setDocumentTitle } from "../navigation.ts";
import { detailImageSizes } from "../responsiveImages.ts";
import { useResponsiveImage } from "../useResponsiveImage.ts";
import { useProgressiveCollection } from "../useProgressiveCollection.ts";
import { NotFound } from "./NotFound.tsx";

const RichArticleContent = lazy(() => import("../RichArticleContent.tsx").then((module) => ({ default: module.RichArticleContent })));

export function MusicPage({ query, stats, onStatsTargets }: { query: string; stats: ContentStats; onStatsTargets: OnStatsTargets }) {
  const { items: allMusicReviews, error: collectionError, retry: retryCollection } = useProgressiveCollection("music");
  const requestedSection = new URLSearchParams(query).get("section");
  const section = musicSections.find((item) => item.id === requestedSection)?.id || "songs";
  const activeIndex = musicSections.findIndex((item) => item.id === section);
  const activeEntries = allMusicReviews.filter((entry) => entry.section === section);
  const ActiveSectionIcon = musicSections.find((item) => item.id === section)!.icon;
  const pagination = usePagination(activeEntries, useResponsivePageSize(6, 3), section, "music");
  const pageStatsKey = JSON.stringify(pagination.pageItems.map((entry) => `${entry.section}/${entry.slug}`));
  const pageStatsTargets = useMemo(
    () => (JSON.parse(pageStatsKey) as string[]).map((slug) => ({ type: "music" as const, slug })),
    [pageStatsKey],
  );
  useEffect(() => { onStatsTargets(pageStatsTargets); }, [onStatsTargets, pageStatsTargets]);
  const selectSection = (nextSection: MusicSection) => {
    const nextQuery = nextSection === "songs" ? "" : `?section=${nextSection}`;
    replaceRoute(routeHref("/music", nextQuery), { notify: true });
  };
  return <section className="music-library page-width">
      <div className="music-tabs" role="tablist" aria-label="音乐分类" data-active-index={activeIndex}><span className="music-tab-indicator" aria-hidden="true" />{musicSections.map(({ id, label, icon: Icon }) => <button key={id} role="tab" aria-selected={section === id} className={section === id ? "active" : ""} onClick={() => selectSection(id)}><Icon size={23} weight="duotone" /><strong>{label}</strong></button>)}</div>
      <div ref={pagination.topRef} className={`music-panel paginated-view${pagination.leaving ? " is-leaving" : ""}`} role="tabpanel" key={section}>{activeEntries.length ? <div className="music-review-grid">{pagination.pageItems.map((entry, index) => <MusicReviewCard entry={entry} section={section} stats={stats[`${section}/${entry.slug}`]} imageLoading={index === 0 ? "eager" : "lazy"} key={entry.slug} />)}</div> : <div className="music-empty"><ActiveSectionIcon size={36} weight="duotone" /><h2>{section === "songs" ? "暂无歌曲" : section === "artists" ? "暂无音乐人" : "暂无专辑"}</h2></div>}</div><Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={pagination.changePage} />{(collectionError as Error | null) && <div className="collection-load-error" role="alert"><span>部分内容暂时无法加载，已显示已加载的内容。</span><button type="button" onClick={retryCollection}>重试加载</button></div>}
    </section>;
}

export function MusicDetailPage({ path, stats, onView, onStatsTargets, onCommentStats }: { path: string; stats: ContentStats; onView: (type: ContentType, slug: string) => void; onStatsTargets: OnStatsTargets; onCommentStats: OnStatsChange }) {
  const { section, slug } = parseMusicContentKey(path);
  const review = section && slug ? use(loadMusicReview(section, slug)) : null;
  const sourceCardImage = useResponsiveImage(review?.image || "", "(max-width: 760px) 88px, 104px");
  const detailCoverImage = useResponsiveImage(review?.image || "", detailImageSizes);
  const detailReview = review;
  const statsSlug = review ? `${section}/${review.slug}` : "";
  useEffect(() => { if (statsSlug) onView("music", statsSlug); }, [statsSlug, onView]);
  useEffect(() => { if (statsSlug) onStatsTargets([{ type: "music", slug: statsSlug }]); }, [statsSlug, onStatsTargets]);
  useEffect(() => { setDocumentTitle(review?.title || "页面不存在", siteConfig.title); }, [review?.title]);
  if (!review) return <NotFound embedded />;
  return <><article className="article-detail article-detail--music">
    <div className="article-intro-copy"><span className="category">MUSIC NOTE</span><h1>{review.title}</h1>{review.excerpt && <p className="article-lede">{review.excerpt}</p>}<PostMeta post={review} showTags={false} stats={stats[statsSlug]} /></div>
    {review.url && <a className="music-source-card music-source-card--lead" href={review.url} target="_blank" rel="noreferrer">{review.image && <img {...sourceCardImage} alt={`${review.sourceTitle || review.title}专辑封面`} decoding="async" />}<span><small>网易云音乐 · {review.kind}</small><strong>{review.sourceTitle || review.title}</strong><em>{review.sourceMeta || review.kind}</em></span><b>{review.action || "前往收听"}<ArrowRight size={17} /></b></a>}
    {!review.url && review.image && <img className="music-detail-cover" {...detailCoverImage} alt={`${review.title}的封面`} decoding="async" />}
    {detailReview?.content && <RichArticleContent post={detailReview} />}
  </article><CommentsSection targetType="music" slug={`${section}/${review.slug}`} onStatsChange={onCommentStats} /></>;
}
