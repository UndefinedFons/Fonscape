import { BookOpenText } from "@phosphor-icons/react/BookOpenText";
import { Feather } from "@phosphor-icons/react/Feather";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { MusicNotes } from "@phosphor-icons/react/MusicNotes";
import { X } from "@phosphor-icons/react/X";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadSearchIndex, siteConfig } from "../content/index.js";
import { lockPageScroll } from "../lockPageScroll.js";
import { go } from "../routeState.js";
import { formatContentDate } from "../siteUtils.js";
import { buildSearchItems, enabledSearchTypes, filterSearchItems, searchScopeOptions, searchScopeStyle } from "./searchModel.js";

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
  const showPoems = siteConfig.showPoems === true;
  const showMusic = siteConfig.showMusic === true;
  const enabledTypes = useMemo(() => enabledSearchTypes({ showPoems, showMusic }), [showMusic, showPoems]);
  const [searchIndex, setSearchIndex] = useState({ entries: [], loading: true, error: "" });
  useEffect(() => {
    let active = true;
    setSearchIndex((current) => ({ ...current, loading: true, error: "" }));
    loadSearchIndex(enabledTypes).then(
      (entries) => { if (active) setSearchIndex({ entries, loading: false, error: "" }); },
      () => { if (active) setSearchIndex({ entries: [], loading: false, error: "搜索内容加载失败，请稍后重试。" }); },
    );
    return () => { active = false; };
  }, [enabledTypes]);
  const indexedContent = searchIndex.entries;
  const searchItems = useMemo(() => buildSearchItems(indexedContent), [indexedContent]);
  const results = useMemo(() => filterSearchItems(searchItems, scope, query), [query, scope, searchItems]);
  const scopeOptions = searchScopeOptions({ showPoems, showMusic });
  const activeScopeIndex = Math.max(0, scopeOptions.findIndex(([value]) => value === scope));
  const searchableTypes = ["文章", showPoems && "小诗", showMusic && "音乐"].filter(Boolean).join("、");
  const searchIcons = { post: BookOpenText, poem: Feather, music: MusicNotes };
  return <div className={`dialog-backdrop search-backdrop${closing ? " is-closing" : ""}`} onMouseDown={(e) => e.target === e.currentTarget && requestClose()}><section className="search-dialog" role="dialog" aria-modal="true" aria-label="搜索博客内容"><div className="search-input-wrap"><MagnifyingGlass size={22} /><input autoFocus type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`搜索${searchableTypes}…`} aria-controls="search-results" /><span className="search-count-badge" aria-live="polite" aria-label={searchIndex.loading ? "正在加载搜索内容" : `${results.length} 条搜索结果`}>{searchIndex.loading ? "…" : results.length}</span><button onClick={requestClose} aria-label="关闭搜索"><X size={20} /></button></div><div className="search-toolbar"><div className="search-scopes" style={searchScopeStyle(scopeOptions.length, activeScopeIndex)} aria-label="搜索范围">{scopeOptions.map(([value, label]) => <button type="button" key={value} className={scope === value ? "active" : ""} aria-pressed={scope === value} onClick={() => setScope(value)}>{label}</button>)}</div></div><div className="search-results" id="search-results">{searchIndex.loading ? <div className="no-results">正在加载搜索内容…</div> : searchIndex.error ? <div className="no-results">{searchIndex.error}</div> : results.length ? results.map((item) => { const Icon = searchIcons[item.kind]; return <a id={`search-result-${item.id}`} className="search-result" key={item.id} href={item.href} onClick={(event) => navigateToResult(event, item.href)}><span className={`search-result-icon search-result-icon--${item.kind}`}><Icon size={20} weight="duotone" /></span><span className="search-result-copy"><strong>{item.title}</strong><small>{[item.type, item.meta, formatContentDate(item.date)].filter(Boolean).join(" · ")}</small></span></a>; }) : <div className="no-results">没有找到相关内容，换个词试试。</div>}</div></section></div>;
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
