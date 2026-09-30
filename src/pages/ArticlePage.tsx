import type { ArticleOutlineItem, ContentStats, ContentType, OnStatsChange, OnStatsTargets } from "../types.ts";
import { ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { FolderOpen } from "@phosphor-icons/react/FolderOpen";
import { Hash } from "@phosphor-icons/react/Hash";
import { lazy, use, useEffect, useMemo } from "react";
import { ArticleMusicPlayer } from "../ArticleMusicPlayer.tsx";
import { CommentsSection } from "../community/CommentsSection.tsx";
import { PostMeta } from "../components/Cards.tsx";
import { contentRoute, loadCollectionFacets, loadPost, siteConfig } from "../content/index.ts";
import { contentDateTimestamp } from "../content/date.ts";
import { detailImageSizes } from "../responsiveImages.ts";
import { setDocumentTitle } from "../navigation.ts";
import { getPostOutline } from "../richContent.ts";
import { ZoomableImage } from "../ZoomableImage.tsx";
import { NotFound } from "./NotFound.tsx";
import { routeHref } from "../routes.ts";

const RichArticleContent = lazy(() => import("../RichArticleContent.tsx").then((module) => ({ default: module.RichArticleContent })));

export function ArticlePage({ slug, stats, onView, onOutline, onStatsTargets, onCommentStats }: { slug: string; stats: ContentStats; onView: (type: ContentType, slug: string) => void; onOutline: (items: ArticleOutlineItem[]) => void; onStatsTargets: OnStatsTargets; onCommentStats: OnStatsChange }) {
  const post = use(loadPost(slug));
  const detailPost = post;
  const inlineMusicPlayer = useMemo(() => post?.music && post.musicPlacement === "inline" ? <ArticleMusicPlayer track={post.music} autoplay={false} /> : null, [post]);
  const inlineMusicPlayers = useMemo(() => Object.fromEntries((post?.musicBlocks || []).map((track) => [track.id, <ArticleMusicPlayer key={track.id} track={track} autoplay={Boolean(track.autoplay)} />])), [post]);
  useEffect(() => { if (post?.slug) onView("post", post.slug); }, [post?.slug, onView]);
  useEffect(() => { if (post?.slug) onStatsTargets([{ type: "post", slug: post.slug }]); }, [post?.slug, onStatsTargets]);
  useEffect(() => { setDocumentTitle(post?.title || "页面不存在", siteConfig.title); }, [post?.title]);
  useEffect(() => {
    onOutline(post ? getPostOutline(post) : []);
    return () => onOutline([]);
  }, [post, onOutline]);
  if (!post) return <NotFound embedded />;
  const coverMode = post.image && post.coverMode !== "none" ? "wide" : "none";
  const showDetailCover = coverMode !== "none";
  const seriesPosts = post.series ? use(loadCollectionFacets("post")).filter((item) => item.series === post.series).sort((a, b) => (a.seriesOrder || 0) - (b.seriesOrder || 0) || contentDateTimestamp(a.date) - contentDateTimestamp(b.date)) : [];
  const seriesIndex = seriesPosts.findIndex((item) => item.key === post.slug);
  const previousChapter = seriesIndex > 0 ? seriesPosts[seriesIndex - 1] : null;
  const nextChapter = seriesIndex >= 0 && seriesIndex < seriesPosts.length - 1 ? seriesPosts[seriesIndex + 1] : null;
  return <><article className={`article-detail article-detail--${coverMode}`}>
    <div className={`article-intro article-intro--${coverMode}`}>
      <div className="article-intro-copy"><div className="article-detail-kickers"><span className="category">{post.category}</span></div><h1>{post.title}</h1>{post.excerpt && <p className="article-lede">{post.excerpt}</p>}{(post.series || post.tags.length > 0) && <div className="article-tags article-tags--intro">{post.series && <a className="article-series-link" href={routeHref("/posts", { series: post.series })}><FolderOpen size={15} />{post.series}</a>}{post.tags.map((tag) => <a href={routeHref("/posts", { tag })} key={tag}><Hash size={15} />{tag}</a>)}</div>}<PostMeta post={post} showTags={false} stats={stats?.[post.slug]} /></div>
      {showDetailCover && <ZoomableImage src={post.image} alt={`${post.title}的文章封面`} showLightboxCaption={false} sizes={detailImageSizes} className="article-cover" triggerClassName="article-cover-frame" loading="eager" />}
    </div>
    {post.music && post.musicPlacement !== "inline" && <ArticleMusicPlayer track={post.music} />}
    {detailPost && <RichArticleContent post={detailPost} inlineMusicPlayer={inlineMusicPlayer} inlineMusicPlayers={inlineMusicPlayers} />}
    {post.series && <nav className="series-navigation" aria-label={`${post.series}系列章节`}><header><FolderOpen size={20} weight="duotone" /><span><small>SERIES</small><strong>{post.series}</strong></span><em>{seriesIndex + 1} / {seriesPosts.length}</em></header><div>{previousChapter ? <a href={contentRoute("post", previousChapter)}><ArrowLeft size={17} /><span><small>上一章</small><strong>{previousChapter.title}</strong></span></a> : <span className="is-disabled"><ArrowLeft size={17} /><span><small>上一章</small><strong>这是第一章</strong></span></span>}{nextChapter ? <a href={contentRoute("post", nextChapter)}><span><small>下一章</small><strong>{nextChapter.title}</strong></span><ArrowRight size={17} /></a> : <span className="is-disabled"><span><small>下一章</small><strong>已经读到最后</strong></span><ArrowRight size={17} /></span>}</div></nav>}
  </article><CommentsSection targetType="post" slug={post.slug} onStatsChange={onCommentStats} /></>;
}
