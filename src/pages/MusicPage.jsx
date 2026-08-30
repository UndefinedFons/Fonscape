import { ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { CalendarBlank } from "@phosphor-icons/react/CalendarBlank";
import { ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { Eye } from "@phosphor-icons/react/Eye";
import { MusicNotes } from "@phosphor-icons/react/MusicNotes";
import { TextAa } from "@phosphor-icons/react/TextAa";
import { lazy, use, useEffect, useMemo, useState } from "react";
import { MusicReviewCard } from "../components/Cards.jsx";
import { Pagination } from "../components/Pagination.jsx";
import { PageHero } from "../components/PageHero.jsx";
import { CommentsSection } from "../community/CommentsSection.jsx";
import { loadCollection, loadMusicReview, siteConfig } from "../content/index.js";
import { usePagination, useResponsivePageSize } from "../hooks.js";
import { musicSections } from "../musicSections.js";
import { go, parseHashQuery } from "../routeState.js";
import { detailImageSizes, responsiveImageProps } from "../responsiveImages.ts";
import { formatContentDate, getPostWordCount } from "../siteUtils.js";
import { NotFound } from "./NotFound.jsx";

const RichArticleContent = lazy(() => import("../RichArticleContent.jsx").then((module) => ({ default: module.RichArticleContent })));

export function MusicPage({ stats, onStatsTargets }) {
  const allMusicReviews = use(loadCollection("music"));
  const requestedSection = new URLSearchParams(parseHashQuery()).get("section");
  const [section, setSection] = useState(() => musicSections.some((item) => item.id === requestedSection) ? requestedSection : "songs");
  const activeIndex = musicSections.findIndex((item) => item.id === section);
  const activeEntries = allMusicReviews.filter((entry) => entry.section === section);
  const ActiveSectionIcon = musicSections.find((item) => item.id === section).icon;
  const pagination = usePagination(activeEntries, useResponsivePageSize(6, 3), section, "music");
  const pageStatsKey = JSON.stringify(pagination.pageItems.map((entry) => `${entry.section}/${entry.slug}`));
  const pageStatsTargets = useMemo(
    () => JSON.parse(pageStatsKey).map((slug) => ({ type: "music", slug })),
    [pageStatsKey],
  );
  useEffect(() => { onStatsTargets(pageStatsTargets); }, [onStatsTargets, pageStatsTargets]);
  const selectSection = (nextSection) => {
    setSection(nextSection);
    const nextQuery = nextSection === "songs" ? "" : `?section=${nextSection}`;
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#/music${nextQuery}`);
  };
  return <main><PageHero kicker="MUSIC NOTES" title="音乐" description={siteConfig.pages.musicDescription} icon={MusicNotes} variant="music" />
    <section className="music-library page-width">
      <div className="music-tabs" role="tablist" aria-label="音乐分类" data-active-index={activeIndex}><span className="music-tab-indicator" aria-hidden="true" />{musicSections.map(({ id, label, icon: Icon }) => <button key={id} role="tab" aria-selected={section === id} className={section === id ? "active" : ""} onClick={() => selectSection(id)}><Icon size={23} weight="duotone" /><strong>{label}</strong></button>)}</div>
      <div ref={pagination.topRef} className={`music-panel paginated-view${pagination.leaving ? " is-leaving" : ""}`} role="tabpanel" key={section}>{activeEntries.length ? <div className="music-review-grid">{pagination.pageItems.map((entry) => <MusicReviewCard entry={entry} section={section} stats={stats[`${section}/${entry.slug}`]} key={entry.slug} />)}</div> : <div className="music-empty"><ActiveSectionIcon size={36} weight="duotone" /><h2>{section === "songs" ? "暂无歌曲" : section === "artists" ? "暂无音乐人" : "暂无专辑"}</h2></div>}</div><Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={pagination.changePage} />
    </section>
  </main>;
}

export function MusicDetailPage({ path, stats, onView, onStatsTargets }) {
  const [section, slug] = path.split("/");
  const review = section && slug ? use(loadMusicReview(section, slug)) : null;
  const detailReview = review;
  const statsSlug = review ? `${section}/${review.slug}` : "";
  useEffect(() => { if (statsSlug) onView("music", statsSlug); }, [statsSlug, onView]);
  useEffect(() => { if (statsSlug) onStatsTargets([{ type: "music", slug: statsSlug }]); }, [statsSlug, onStatsTargets]);
  if (!review) return <NotFound />;
  return <main className="article-page music-detail-page material-panel page-width"><button className="back-button" onClick={() => history.length > 1 ? history.back() : go(`/music${section === "songs" ? "" : `?section=${section}`}`)}><ArrowLeft size={17} />返回</button><article className="article-detail article-detail--music">
    <div className="article-intro-copy"><span className="category">MUSIC NOTE</span><h1>{review.title}</h1>{review.excerpt && <p className="article-lede">{review.excerpt}</p>}<div className="post-meta"><span><TextAa size={16} />{getPostWordCount(review)} 字</span><span><CalendarBlank size={16} />{formatContentDate(review.date)}</span><span><Eye size={16} />{stats[statsSlug]?.views || 0}</span><span><ChatCircleDots size={16} />{stats[statsSlug]?.comments || 0}</span></div></div>
    {review.url && <a className="music-source-card music-source-card--lead" href={review.url} target="_blank" rel="noreferrer">{review.image && <img src={review.image} {...responsiveImageProps(review.image, "(max-width: 760px) 88px, 104px")} alt={`${review.sourceTitle || review.title}专辑封面`} decoding="async" />}<span><small>网易云音乐 · {review.kind}</small><strong>{review.sourceTitle || review.title}</strong><em>{review.sourceMeta || review.kind}</em></span><b>{review.action || "前往收听"}<ArrowRight size={17} /></b></a>}
    {!review.url && review.image && <img className="music-detail-cover" src={review.image} {...responsiveImageProps(review.image, detailImageSizes)} alt={`${review.title}的封面`} decoding="async" />}
    {detailReview?.content && <RichArticleContent post={detailReview} />}
  </article><CommentsSection targetType="music" slug={`${section}/${review.slug}`} /></main>;
}
