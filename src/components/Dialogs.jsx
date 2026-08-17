import { BookOpenText } from "@phosphor-icons/react/BookOpenText";
import { Feather } from "@phosphor-icons/react/Feather";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { MusicNotes } from "@phosphor-icons/react/MusicNotes";
import { X } from "@phosphor-icons/react/X";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { musicReviews, poems, posts } from "../content/index.js";
import { lockPageScroll } from "../lockPageScroll.js";
import { go } from "../routeState.js";
import { formatContentDate } from "../siteUtils.js";

export function SearchDialog({ onClose }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef(0);
  const requestClose = useCallback((afterClose) => {
    if (closing) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      onClose();
      if (typeof afterClose === "function") window.requestAnimationFrame(afterClose);
    }, 240);
  }, [closing, onClose]);
  const navigateToResult = useCallback((event, href) => {
    event.preventDefault();
    requestClose(() => go(href));
  }, [requestClose]);
  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && requestClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  useEffect(() => lockPageScroll(), []);
  const searchItems = useMemo(() => [
    ...posts.map((post) => ({ id: `post-${post.slug}`, kind: "post", type: "文章", title: post.title, meta: post.category, date: post.date, href: `#/post/${post.slug}`, icon: BookOpenText })),
    ...poems.map((poem) => ({ id: `poem-${poem.slug}`, kind: "poem", type: "小诗", title: poem.title, meta: "", date: poem.date, href: `#/poem/${poem.slug}`, icon: Feather })),
    ...Object.entries(musicReviews).flatMap(([section, entries]) => entries.map((entry) => ({ id: `music-${section}-${entry.slug}`, kind: "music", type: "音乐", title: entry.title, meta: entry.kind, date: entry.date, href: `#/music/${section}/${entry.slug}`, icon: MusicNotes }))),
  ], []);
  const normalizedQuery = query.trim().toLowerCase();
  const results = useMemo(() => {
    const scopedItems = scope === "all" ? searchItems : searchItems.filter((item) => item.kind === scope);
    return normalizedQuery ? scopedItems.filter((item) => item.title.toLowerCase().includes(normalizedQuery)) : scopedItems;
  }, [normalizedQuery, scope, searchItems]);
  const scopeOptions = [
    ["all", "全部"],
    ["post", "文章"],
    ["poem", "小诗"],
    ["music", "音乐"],
  ];
  return <div className={`dialog-backdrop search-backdrop${closing ? " is-closing" : ""}`} onMouseDown={(e) => e.target === e.currentTarget && requestClose()}><section className="search-dialog" role="dialog" aria-modal="true" aria-label="搜索博客内容"><div className="search-input-wrap"><MagnifyingGlass size={22} /><input autoFocus type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索文章、小诗或音乐…" aria-controls="search-results" /><span className="search-count-badge" aria-live="polite" aria-label={`${results.length} 条搜索结果`}>{results.length}</span><button onClick={requestClose} aria-label="关闭搜索"><X size={20} /></button></div><div className="search-toolbar"><div className="search-scopes" aria-label="搜索范围">{scopeOptions.map(([value, label]) => <button type="button" key={value} className={scope === value ? "active" : ""} aria-pressed={scope === value} onClick={() => setScope(value)}>{label}</button>)}</div></div><div className="search-results" id="search-results">{results.length ? results.map((item) => { const Icon = item.icon; return <a id={`search-result-${item.id}`} className="search-result" key={item.id} href={item.href} onClick={(event) => navigateToResult(event, item.href)}><span className={`search-result-icon search-result-icon--${item.kind}`}><Icon size={20} weight="duotone" /></span><span className="search-result-copy"><strong>{item.title}</strong><small>{[item.type, item.meta, formatContentDate(item.date)].filter(Boolean).join(" · ")}</small></span></a>; }) : <div className="no-results">没有找到相关内容，换个词试试。</div>}</div></section></div>;
}

export function SettingsDialog({ glassEnabled, onGlassChange, onClose }) {
  const [closing, setClosing] = useState(false);
  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 260);
  }, [closing, onClose]);
  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && requestClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);
  useEffect(() => lockPageScroll(), []);
  return <div className={`dialog-backdrop settings-backdrop${closing ? " is-closing" : ""}`} onMouseDown={(event) => event.target === event.currentTarget && requestClose()}>
    <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title">
      <header>
        <span><small>SETTINGS</small><h2 id="settings-dialog-title">设置</h2></span>
        <button type="button" onClick={requestClose} aria-label="关闭设置"><X size={20} /></button>
      </header>
      <button type="button" className={`settings-toggle${glassEnabled ? " is-on" : ""}`} aria-pressed={glassEnabled} onClick={() => onGlassChange(!glassEnabled)}>
        <span><strong>全局磨砂玻璃</strong><small>让页面内容面板呈现柔和的半透明层次。</small></span>
        <i aria-hidden="true"><span /></i>
      </button>
    </section>
  </div>;
}
