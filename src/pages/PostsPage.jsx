import { ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { BookOpenText } from "@phosphor-icons/react/BookOpenText";
import { ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { Eye } from "@phosphor-icons/react/Eye";
import { FolderOpen } from "@phosphor-icons/react/FolderOpen";
import { Funnel } from "@phosphor-icons/react/Funnel";
import { Hash } from "@phosphor-icons/react/Hash";
import { X } from "@phosphor-icons/react/X";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArticleCard } from "../components/Cards.jsx";
import { Pagination } from "../components/Pagination.jsx";
import { PageHero } from "../components/PageHero.jsx";
import { loadCollection, siteConfig } from "../content/index.js";
import { usePagination, useResponsivePageSize } from "../hooks.js";
import { lockPageScroll } from "../lockPageScroll.js";
import { ARTICLE_INDEX_DEFAULTS, articleIndexState, parseHash, parseHashQuery, updateArticleIndexState } from "../routeState.js";
import { getPostCategories } from "../siteConfig.js";

export function PostsPage({ query, stats, onStatsTargets }) {
  const posts = use(loadCollection("post"));
  const parameters = useMemo(() => new URLSearchParams(query), [query]);
  const allTags = [...new Set(posts.flatMap((post) => post.tags || []))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const allSeries = [...new Set(posts.map((post) => post.series).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const requestedTag = parameters.get("tag") || "";
  const requestedSeries = parameters.get("series") || "";
  const requestedView = parameters.get("view") || "";
  const hasFilterParameter = parameters.has("filter");
  const hasRequestedFilter = Boolean(requestedTag || requestedSeries);
  const initialIndexState = hasRequestedFilter ? ARTICLE_INDEX_DEFAULTS : articleIndexState;
  const categories = getPostCategories(siteConfig);
  const initialCategory = categories.includes(initialIndexState.category) ? initialIndexState.category : "全部";
  const [category, setCategory] = useState(initialCategory);
  const [selectedTag, setSelectedTag] = useState(allTags.includes(requestedTag) ? requestedTag : initialIndexState.tag);
  const [selectedSeries, setSelectedSeries] = useState(allSeries.includes(requestedSeries) ? requestedSeries : initialIndexState.series);
  const [filterOpen, setFilterOpen] = useState(hasFilterParameter);
  const [view, setView] = useState(requestedView === "archive" ? "archive" : initialIndexState.view);
  const [viewSwitching, setViewSwitching] = useState(false);
  const [filterSummaryClosing, setFilterSummaryClosing] = useState(false);
  const [filterResultsLeaving, setFilterResultsLeaving] = useState(false);
  const viewSwitchTimer = useRef(0);
  const filterSummaryTimer = useRef(0);
  const requestedTagSelection = allTags.includes(requestedTag) ? requestedTag : "";
  const requestedSeriesSelection = allSeries.includes(requestedSeries) ? requestedSeries : "";
  useEffect(() => {
    if (!hasFilterParameter && !requestedTag && !requestedSeries && requestedView !== "archive") return;
    setFilterSummaryClosing(false);
    setFilterResultsLeaving(false);
    setCategory("全部");
    setSelectedTag(requestedTagSelection);
    setSelectedSeries(requestedSeriesSelection);
    setView(requestedView === "archive" ? "archive" : "cards");
    setFilterOpen(hasFilterParameter);
  }, [hasFilterParameter, requestedSeries, requestedSeriesSelection, requestedTag, requestedTagSelection, requestedView]);
  useEffect(() => { updateArticleIndexState({ category, tag: selectedTag, series: selectedSeries, view }); }, [category, selectedTag, selectedSeries, view]);
  useEffect(() => () => {
    window.clearTimeout(viewSwitchTimer.current);
    window.clearTimeout(filterSummaryTimer.current);
  }, []);
  const filtered = posts.filter((post) => (category === "全部" || post.category === category) && (!selectedTag || post.tags?.includes(selectedTag)) && (!selectedSeries || post.series === selectedSeries));
  const filterKey = `${category}|${selectedTag}|${selectedSeries}`;
  const pagination = usePagination(filtered, useResponsivePageSize(6, 3), filterKey, "posts");
  const pageStatsKey = JSON.stringify(pagination.pageItems.map((post) => post.slug));
  const pageStatsTargets = useMemo(
    () => JSON.parse(pageStatsKey).map((slug) => ({ type: "post", slug })),
    [pageStatsKey],
  );
  useEffect(() => {
    if (view === "cards") onStatsTargets(pageStatsTargets);
  }, [onStatsTargets, pageStatsTargets, view]);
  const activeCategoryIndex = Math.max(0, categories.indexOf(category));
  const replaceFilterQuery = (tag, series) => {
    const currentParameters = new URLSearchParams(parseHashQuery());
    if (tag) currentParameters.set("tag", tag); else currentParameters.delete("tag");
    if (series) currentParameters.set("series", series); else currentParameters.delete("series");
    const nextQuery = currentParameters.toString();
    history.replaceState(history.state, "", `${location.pathname}${location.search}#/posts${nextQuery ? `?${nextQuery}` : ""}`);
  };
  const selectTag = (value) => { setFilterSummaryClosing(false); setFilterResultsLeaving(false); setSelectedTag(value); if (value) setSelectedSeries(""); replaceFilterQuery(value, ""); };
  const selectSeries = (value) => { setFilterSummaryClosing(false); setFilterResultsLeaving(false); setSelectedSeries(value); if (value) setSelectedTag(""); replaceFilterQuery("", value); };
  const clearSelectedFilter = () => {
    if (filterSummaryClosing) return;
    const clear = () => {
      setSelectedTag("");
      setSelectedSeries("");
      setFilterSummaryClosing(false);
      setFilterResultsLeaving(false);
      replaceFilterQuery("", "");
    };
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      clear();
      return;
    }
    setFilterSummaryClosing(true);
    setFilterResultsLeaving(true);
    window.clearTimeout(filterSummaryTimer.current);
    filterSummaryTimer.current = window.setTimeout(clear, 260);
  };
  const closeFilter = () => {
    setFilterOpen(false);
    const currentParameters = new URLSearchParams(parseHashQuery());
    if (!currentParameters.has("filter")) return;
    currentParameters.delete("filter");
    const nextQuery = currentParameters.toString();
    history.replaceState(null, "", `${location.pathname}${location.search}#${parseHash()}${nextQuery ? `?${nextQuery}` : ""}`);
  };
  const toggleArchive = () => {
    if (viewSwitching) return;
    const nextView = view === "archive" ? "cards" : "archive";
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      if (nextView === "archive") {
        setCategory("全部");
        setSelectedTag("");
        setSelectedSeries("");
        setFilterOpen(false);
      }
      setView(nextView);
      return;
    }
    setViewSwitching(true);
    window.clearTimeout(viewSwitchTimer.current);
    viewSwitchTimer.current = window.setTimeout(() => {
      if (nextView === "archive") {
        setCategory("全部");
        setSelectedTag("");
        setSelectedSeries("");
        setFilterOpen(false);
      }
      setView(nextView);
      viewSwitchTimer.current = window.setTimeout(() => setViewSwitching(false), 70);
    }, 280);
  };
  return <main><PageHero kicker="ARTICLE INDEX" title="文章" description={siteConfig.pages.postsDescription} icon={BookOpenText} variant="posts" />
    <section className={`article-index page-width${view === "archive" ? " article-index--archive" : ""}${viewSwitching ? " is-view-switching" : ""}`}>
      {view === "cards" && <div className="article-index-toolbar article-index-toolbar--cards"><div className="article-type-tabs" role="tablist" aria-label="文章类型" style={{ "--type-count": categories.length, "--type-index": activeCategoryIndex }}><span className="article-type-indicator" aria-hidden="true" />{categories.map((item) => <button type="button" role="tab" aria-selected={category === item} key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)} title={item}>{item}</button>)}</div><div className="article-index-actions"><button type="button" className={filterOpen ? "active" : ""} onClick={() => setFilterOpen(true)}><Funnel size={17} />筛选</button><button type="button" onClick={toggleArchive}><FolderOpen size={17} />文章归档</button></div></div>}
      {view === "cards" && (selectedTag || selectedSeries) && <div className={`active-filter-summary${filterSummaryClosing ? " is-leaving" : ""}`}><div className="active-filter-current">{selectedTag ? <Hash size={18} weight="duotone" /> : <FolderOpen size={18} weight="duotone" />}<span><small>{selectedTag ? "当前标签" : "当前系列"}</small><strong>{selectedTag || selectedSeries}</strong></span></div><button type="button" className="clear-filter" onClick={clearSelectedFilter} disabled={filterSummaryClosing}><X size={14} />清除筛选</button></div>}
      {view === "archive" ? <ArticleArchive posts={posts} stats={stats} onBack={toggleArchive} onStatsTargets={onStatsTargets} /> : <><div key={filterKey} ref={pagination.topRef} className={`article-grid paginated-view${pagination.leaving ? " is-leaving" : ""}${filterResultsLeaving ? " is-filter-leaving" : ""}`}>{pagination.pageItems.length ? pagination.pageItems.map((post) => <ArticleCard key={post.slug} post={post} stats={stats[post.slug]} />) : posts.length ? <div className="section-empty"><Funnel size={34} weight="duotone" /><h2>没有符合条件的文章</h2><p>换一种类型、标签或系列试试。</p></div> : <div className="section-empty"><BookOpenText size={34} weight="duotone" /><h2>暂无文章</h2></div>}</div><Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={pagination.changePage} /></>}
    </section>
    {filterOpen && view === "cards" && <ArticleFilterDialog tags={allTags} series={allSeries} selectedTag={selectedTag} selectedSeries={selectedSeries} onTag={selectTag} onSeries={selectSeries} onClose={closeFilter} />}
  </main>;
}

function ArticleFilterDialog({ tags, series, selectedTag, selectedSeries, onTag, onSeries, onClose }) {
  const [mode, setMode] = useState(selectedSeries ? "series" : "tag");
  const [phase, setPhase] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "open" : "entering");
  const closeTimerRef = useRef(0);
  const closeFinishedRef = useRef(false);
  const finishClose = useCallback(() => {
    if (closeFinishedRef.current) return;
    closeFinishedRef.current = true;
    window.clearTimeout(closeTimerRef.current);
    onClose();
  }, [onClose]);
  const requestClose = () => {
    if (phase === "closing") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finishClose();
      return;
    }
    setPhase("closing");
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(finishClose, 520);
  };
  useEffect(() => lockPageScroll(), []);
  useEffect(() => {
    if (phase !== "entering") return undefined;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => setPhase("open"));
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [phase]);
  useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);
  useEffect(() => { const onKey = (event) => event.key === "Escape" && requestClose(); window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); });
  const switchMode = (nextMode) => { if (nextMode === mode) return; if (nextMode === "tag") onSeries(""); else onTag(""); setMode(nextMode); };
  const handleTransitionEnd = (event) => {
    if (event.target === event.currentTarget && event.propertyName === "opacity" && phase === "closing") finishClose();
  };
  return <div className={`dialog-backdrop article-filter-backdrop is-${phase}`} onTransitionEnd={handleTransitionEnd} onMouseDown={(event) => event.target === event.currentTarget && requestClose()}><section className="article-filter-dialog" role="dialog" aria-modal="true" aria-labelledby="article-filter-title"><header><div><span className="eyebrow">ARTICLE FILTER</span><h2 id="article-filter-title">筛选文章</h2><p>选择即时生效，关闭后会保留当前状态。</p></div><button type="button" onClick={requestClose} aria-label="关闭筛选"><X size={20} /></button></header><div className="filter-mode-tabs" role="tablist" aria-label="筛选方式" data-mode={mode}><span aria-hidden="true" /><button type="button" role="tab" aria-selected={mode === "tag"} className={mode === "tag" ? "active" : ""} onClick={() => switchMode("tag")}><Hash size={17} />标签</button><button type="button" role="tab" aria-selected={mode === "series"} className={mode === "series" ? "active" : ""} onClick={() => switchMode("series")}><FolderOpen size={17} />系列</button></div>{mode === "tag" ? <div className="article-filter-section"><div><Hash size={20} weight="duotone" /><span><strong>按标签筛选</strong><small>从文章里共同出现的关键词进入</small></span></div><div className="article-filter-options"><button className={!selectedTag ? "active" : ""} onClick={() => onTag("")}>全部标签</button>{tags.map((tag) => <button className={selectedTag === tag ? "active" : ""} key={tag} onClick={() => onTag(selectedTag === tag ? "" : tag)}># {tag}</button>)}</div></div> : <div className="article-filter-section"><div><FolderOpen size={20} weight="duotone" /><span><strong>按系列筛选</strong><small>沿着连续篇章阅读</small></span></div><div className="article-filter-options"><button className={!selectedSeries ? "active" : ""} onClick={() => onSeries("")}>全部系列</button>{series.map((name) => <button className={selectedSeries === name ? "active" : ""} key={name} onClick={() => onSeries(selectedSeries === name ? "" : name)}>{name}</button>)}</div></div>}</section></div>;
}

function ArticleArchive({ posts: filteredPosts, stats = {}, onBack, onStatsTargets }) {
  const years = [...new Set(filteredPosts.map((post) => post.date.slice(0, 4)))].sort().reverse();
  const yearsKey = JSON.stringify(years);
  const filteredPostsKey = JSON.stringify(filteredPosts.map((post) => [post.slug, post.date]));
  const [year, setYear] = useState(years[0] || "");
  const yearPosts = filteredPosts.filter((post) => post.date.startsWith(year));
  const months = [...new Set(yearPosts.map((post) => post.date.slice(5, 7)))].sort().reverse();
  const [month, setMonth] = useState("");
  const [switching, setSwitching] = useState("");
  const [wrapHeight, setWrapHeight] = useState(null);
  const archiveTimer = useRef(0);
  const archiveWrapRef = useRef(null);
  useEffect(() => {
    const availableYears = JSON.parse(yearsKey);
    setYear((currentYear) => availableYears.includes(currentYear) ? currentYear : availableYears[0] || "");
    setMonth("");
  }, [filteredPostsKey, yearsKey]);
  useEffect(() => () => window.clearTimeout(archiveTimer.current), []);
  useEffect(() => {
    if (switching !== "entering") return undefined;
    const frame = window.requestAnimationFrame(() => {
      const timeline = archiveWrapRef.current?.firstElementChild;
      setWrapHeight(timeline?.getBoundingClientRect().height ?? archiveWrapRef.current?.scrollHeight ?? 0);
      archiveTimer.current = window.setTimeout(() => {
        setWrapHeight(null);
        setSwitching("");
      }, 300);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [switching, year, month]);
  const selectArchive = (nextYear, nextMonth) => {
    if (nextYear === year && nextMonth === month) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setYear(nextYear);
      setMonth(nextMonth);
      return;
    }
    window.clearTimeout(archiveTimer.current);
    const timeline = archiveWrapRef.current?.firstElementChild;
    const currentHeight = timeline?.getBoundingClientRect().height ?? archiveWrapRef.current?.scrollHeight ?? 0;
    setWrapHeight(currentHeight);
    setSwitching("leaving");
    archiveTimer.current = window.setTimeout(() => {
      setYear(nextYear);
      setMonth(nextMonth);
      setSwitching("entering");
    }, 190);
  };
  const visible = month ? yearPosts.filter((post) => post.date.slice(5, 7) === month) : yearPosts;
  const visibleStatsKey = JSON.stringify(visible.map((post) => post.slug));
  const visibleStatsTargets = useMemo(
    () => JSON.parse(visibleStatsKey).map((slug) => ({ type: "post", slug })),
    [visibleStatsKey],
  );
  useEffect(() => { onStatsTargets(visibleStatsTargets); }, [onStatsTargets, visibleStatsTargets]);
  if (!filteredPosts.length) return <div className="article-archive"><div className="archive-controls archive-controls--empty"><button type="button" className="archive-return" onClick={onBack}><ArrowLeft size={17} />返回文章</button></div><div className="section-empty"><FolderOpen size={34} weight="duotone" /><h2>归档中没有匹配项</h2></div></div>;
  return <div className="article-archive"><div className="archive-controls"><div className="archive-control-groups"><div><span>年份</span>{years.map((item) => <button className={year === item ? "active" : ""} key={item} onClick={() => selectArchive(item, "")}>{item}</button>)}</div><div><span>月份</span><button className={!month ? "active" : ""} onClick={() => selectArchive(year, "")}>全年</button>{months.map((item) => <button className={month === item ? "active" : ""} key={item} onClick={() => selectArchive(year, item)}>{item} 月</button>)}</div></div><button type="button" className="archive-return" onClick={onBack}><ArrowLeft size={17} />返回文章</button></div><div className="archive-timeline-wrap" ref={archiveWrapRef} style={wrapHeight == null ? undefined : { height: wrapHeight }}><div className={`archive-timeline${switching === "leaving" ? " is-leaving" : ""}${switching === "entering" ? " is-entering" : ""}`} key={`${year}-${month}`}>{visible.map((post) => <a href={`#/post/${post.slug}`} key={post.slug}><time>{post.date.slice(0, 10)}</time><i aria-hidden="true" /><div><span>{post.category}{post.series ? ` · ${post.series}` : ""}</span><strong>{post.title}</strong></div><small><Eye size={14} />{stats[post.slug]?.views || 0}<ChatCircleDots size={14} />{stats[post.slug]?.comments || 0}</small></a>)}</div></div></div>;
}
