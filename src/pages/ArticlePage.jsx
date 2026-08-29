import { ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { FolderOpen } from "@phosphor-icons/react/FolderOpen";
import { Hash } from "@phosphor-icons/react/Hash";
import { lazy, use, useEffect, useMemo } from "react";
import { ArticleMusicPlayer } from "../ArticleMusicPlayer.jsx";
import { CommentsSection } from "../community/CommentsSection.jsx";
import { PostMeta } from "../components/Cards.jsx";
import { loadCollectionFacets, loadPost } from "../content/index.js";
import { detailImageSizes } from "../responsiveImages.ts";
import { go } from "../routeState.js";
import { getPostOutline } from "../richContent.js";
import { ZoomableImage } from "../ZoomableImage.jsx";
import { NotFound } from "./NotFound.jsx";

const RichArticleContent = lazy(() => import("../RichArticleContent.jsx").then((module) => ({ default: module.RichArticleContent })));

export function ArticlePage({ slug, stats, onView, onOutline, onStatsTargets }) {
  const post = use(loadPost(slug));
  const detailPost = post;
  const inlineMusicPlayer = useMemo(() => post?.music && post.musicPlacement === "inline" ? <ArticleMusicPlayer track={post.music} autoplay={false} /> : null, [post]);
  const inlineMusicPlayers = useMemo(() => Object.fromEntries((post?.musicBlocks || []).map((track) => [track.id, <ArticleMusicPlayer key={track.id} track={track} autoplay={Boolean(track.autoplay)} />])), [post]);
  useEffect(() => { if (post?.slug) onView("post", post.slug); }, [post?.slug, onView]);
  useEffect(() => { if (post?.slug) onStatsTargets([{ type: "post", slug: post.slug }]); }, [post?.slug, onStatsTargets]);
  useEffect(() => {
    onOutline(getPostOutline(post));
    return () => onOutline([]);
  }, [post, onOutline]);
  if (!post) return <NotFound />;
  const coverMode = post.image && post.coverMode !== "none" ? "wide" : "none";
  const showDetailCover = coverMode !== "none";
  const seriesPosts = post.series ? use(loadCollectionFacets("post")).filter((item) => item.series === post.series).sort((a, b) => (a.seriesOrder || 0) - (b.seriesOrder || 0) || a.date.localeCompare(b.date)) : [];
  const seriesIndex = seriesPosts.findIndex((item) => item.slug === post.slug);
  const previousChapter = seriesIndex > 0 ? seriesPosts[seriesIndex - 1] : null;
  const nextChapter = seriesIndex >= 0 && seriesIndex < seriesPosts.length - 1 ? seriesPosts[seriesIndex + 1] : null;
  return <main className="article-page material-panel page-width"><button className="back-button" onClick={() => history.length > 1 ? history.back() : go("/posts")}><ArrowLeft size={17} />返回</button><article className={`article-detail article-detail--${coverMode}`}>
    <div className={`article-intro article-intro--${coverMode}`}>
      <div className="article-intro-copy"><div className="article-detail-kickers"><span className="category">{post.category}</span></div><h1>{post.title}</h1>{post.excerpt && <p className="article-lede">{post.excerpt}</p>}{(post.series || post.tags.length > 0) && <div className="article-tags article-tags--intro">{post.series && <a className="article-series-link" href={`#/posts?series=${encodeURIComponent(post.series)}`}><FolderOpen size={15} />{post.series}</a>}{post.tags.map((tag) => <a href={`#/posts?tag=${encodeURIComponent(tag)}`} key={tag}><Hash size={15} />{tag}</a>)}</div>}<PostMeta post={post} showTags={false} stats={stats?.[post.slug]} /></div>
      {showDetailCover && <ZoomableImage src={post.image} alt={`${post.title}的文章封面`} showLightboxCaption={false} sizes={detailImageSizes} className="article-cover" triggerClassName="article-cover-frame" loading="eager" />}
    </div>
    {post.music && post.musicPlacement !== "inline" && <ArticleMusicPlayer track={post.music} />}
    {detailPost && <RichArticleContent post={detailPost} inlineMusicPlayer={inlineMusicPlayer} inlineMusicPlayers={inlineMusicPlayers} />}
    {post.series && <nav className="series-navigation" aria-label={`${post.series}系列章节`}><header><FolderOpen size={20} weight="duotone" /><span><small>SERIES</small><strong>{post.series}</strong></span><em>{seriesIndex + 1} / {seriesPosts.length}</em></header><div>{previousChapter ? <a href={`#/post/${previousChapter.slug}`}><ArrowLeft size={17} /><span><small>上一章</small><strong>{previousChapter.title}</strong></span></a> : <span className="is-disabled"><ArrowLeft size={17} /><span><small>上一章</small><strong>这是第一章</strong></span></span>}{nextChapter ? <a href={`#/post/${nextChapter.slug}`}><span><small>下一章</small><strong>{nextChapter.title}</strong></span><ArrowRight size={17} /></a> : <span className="is-disabled"><span><small>下一章</small><strong>已经读到最后</strong></span><ArrowRight size={17} /></span>}</div></nav>}
  </article><CommentsSection targetType="post" slug={post.slug} /></main>;
}
