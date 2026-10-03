import "../styles/music.css";
import type { ContentStats, ContentType, OnStatsChange, OnStatsTargets } from "../types.ts";
import { lazy, use, useEffect, useLayoutEffect, useRef } from "react";
import { Disc } from "@phosphor-icons/react/Disc";
import { MusicStage } from "../components/MusicStage.tsx";
import { MusicRecord } from "../components/MusicRecord.tsx";
import { PostMeta } from "../components/Cards.tsx";
import { Pagination } from "../components/Pagination.tsx";
import { CommentsSection } from "../community/CommentsSection.tsx";
import { loadMusicReview, siteConfig } from "../content/index.ts";
import { usePagination, useResponsivePageSize } from "../hooks.ts";
import { useMusicSession } from "../useMusicSession.ts";
import { parseMusicContentKey } from "../routes.ts";
import { setDocumentTitle } from "../navigation.ts";
import { useProgressiveCollection } from "../useProgressiveCollection.ts";
import { sortMusicLibrary } from "./musicContent.ts";
import { NotFound } from "./NotFound.tsx";

const RichArticleContent = lazy(() => import("../RichArticleContent.tsx").then((module) => ({ default: module.RichArticleContent })));

export function MusicPage({ onStatsTargets }: { query: string; stats: ContentStats; onStatsTargets: OnStatsTargets }) {
  const session = useMusicSession();
  const playingKey = session.playing && session.entry ? `${session.entry.section}/${session.entry.slug}` : "";
  const previousLayout = useRef(new Map<string, { left: number; top: number; width: number; height: number }>());
  const previousPlayingKey = useRef("");
  const previousGridTop = useRef(0);
  const { items, error, retry } = useProgressiveCollection("music");
  const pagination = usePagination(sortMusicLibrary(items), useResponsivePageSize(16, 8), "music", "music");
  const layoutKey = pagination.pageItems.map((entry) => `${entry.section}/${entry.slug}`).join("|");
  useEffect(() => { onStatsTargets([]); }, [onStatsTargets]);
  useLayoutEffect(() => {
    const next = new Map<string, { left: number; top: number; width: number; height: number }>();
    const animations: Animation[] = [];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const grid = pagination.topRef.current;
    const cards = grid ? [...grid.querySelectorAll<HTMLElement>(".music-record")] : [];
    const previousGridHeight = Math.max(0, Math.max(0, ...[...previousLayout.current.values()].map(({ top, height }) => top + height)) - previousGridTop.current);
    const applyRowMotion = () => {
      const rows = new Map<number, number>();
      cards.forEach((card) => {
        const top = card.offsetTop;
        const row = rows.get(top) ?? rows.size;
        rows.set(top, row);
        card.style.setProperty("--music-row", String(row));
        card.style.setProperty("--music-shift", row % 2 ? "48px" : "-48px");
      });
    };
    applyRowMotion();
    window.addEventListener("resize", applyRowMotion);
    cards.forEach((card) => {
      const key = card.querySelector("a")?.getAttribute("href") || "";
      const rect = { left: card.offsetLeft, top: card.offsetTop, width: card.offsetWidth, height: card.offsetHeight };
      const previous = previousLayout.current.get(key);
      next.set(key, rect);
      if (!reduced && previous && rect.width && rect.height && (previous.left !== rect.left || previous.top !== rect.top || previous.width !== rect.width || previous.height !== rect.height)) {
        animations.push(card.animate([
          { transform: `translate(${previous.left - rect.left}px,${previous.top - rect.top}px) scale(${previous.width / rect.width},${previous.height / rect.height})`, transformOrigin: "top left" },
          { transform: "none", transformOrigin: "top left" },
        ], { duration: 520, easing: "cubic-bezier(.22,1,.36,1)" }));
      }
    });
    if (grid) {
      grid.style.minHeight = "";
      const currentGridHeight = grid.offsetHeight;
      if (!reduced && previousPlayingKey.current && !playingKey && currentGridHeight > 0 && previousGridHeight > currentGridHeight) {
        animations.push(grid.animate([
          { minHeight: `${previousGridHeight}px` },
          { minHeight: `${currentGridHeight}px` },
        ], { duration: 520, easing: "cubic-bezier(.22,1,.36,1)" }));
      }
    }
    previousLayout.current = next;
    previousPlayingKey.current = playingKey;
    previousGridTop.current = grid?.offsetTop ?? 0;
    return () => {
      window.removeEventListener("resize", applyRowMotion);
      animations.forEach((animation) => animation.cancel());
    };
  }, [playingKey, layoutKey, pagination.topRef]);
  return <section className="music-library page-width" aria-label="歌曲、专辑与歌单">
    <div ref={pagination.topRef} className={`music-record-grid paginated-view${pagination.leaving ? " is-leaving" : ""}`}>{pagination.pageItems.map((entry, index) => <MusicRecord entry={entry} eager={index < 2} order={index} key={`${entry.section}-${entry.slug}`} />)}</div>
    {!items.length && <div className="music-empty"><Disc size={36} weight="duotone" /><h2>暂无音乐</h2></div>}
    <Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={pagination.changePage} />{(error as Error | null) && <div className="collection-load-error" role="alert"><span>部分内容暂时无法加载，已显示已加载的内容。</span><button type="button" onClick={retry}>重试加载</button></div>}
  </section>;
}

export function MusicDetailPage({ path, stats, onView, onStatsTargets, onCommentStats }: { path: string; stats: ContentStats; onView: (type: ContentType, slug: string) => void; onStatsTargets: OnStatsTargets; onCommentStats: OnStatsChange }) {
  const { section, slug } = parseMusicContentKey(path);
  const review = section && slug ? use(loadMusicReview(section, slug)) : null;
  const statsSlug = review ? `${section}/${review.slug}` : "";
  useEffect(() => { if (statsSlug) onView("music", statsSlug); }, [statsSlug, onView]);
  useEffect(() => { if (statsSlug) onStatsTargets([{ type: "music", slug: statsSlug }]); }, [statsSlug, onStatsTargets]);
  useEffect(() => { setDocumentTitle(review?.sourceTitle || "页面不存在", siteConfig.title); }, [review?.sourceTitle]);
  if (!review) return <NotFound embedded />;
  return <><MusicStage seed={review} />{review.content.trim() && <article className="article-detail article-detail--music music-listening-note">
    <div className="article-intro-copy"><span className="category">MUSIC NOTE</span>{review.title && <h1>{review.title}</h1>}{review.excerpt && <p className="article-lede">{review.excerpt}</p>}<PostMeta post={review} showTags={false} stats={stats[statsSlug]} /></div>
    {review.content && <RichArticleContent post={review} />}
  </article>}{siteConfig.showCommunity && <section className="music-comments-panel comments-material-panel material-panel"><CommentsSection targetType="music" slug={`${section}/${review.slug}`} onStatsChange={onCommentStats} /></section>}</>;
}
