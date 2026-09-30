import { BookOpenText } from "@phosphor-icons/react/BookOpenText";
import { Feather } from "@phosphor-icons/react/Feather";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { MusicNotes } from "@phosphor-icons/react/MusicNotes";
import { X } from "@phosphor-icons/react/X";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { loadSearchIndex, siteConfig } from "../content/index.ts";
import { go } from "../routeState.ts";
import { getSectionAvailability } from "../sectionAvailability.ts";
import { formatContentDate } from "../siteUtils.ts";
import { buildSearchItems, enabledSearchTypes, filterSearchItems, searchScopeOptions, searchScopeStyle } from "./searchModel.ts";
import type { ContentType, ContentSearchEntry } from "../types.ts";

type SearchScope = "all" | ContentType;
type SearchIndexState = { entries: readonly ContentSearchEntry[]; loading: boolean; error: string };

export function SearchDialog({ onClose }: { onClose: (callback?: (() => void) | MouseEvent<HTMLButtonElement>) => void }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("all");
  const navigateToResult = useCallback((event: MouseEvent<HTMLAnchorElement>, href: string) => {
    event.preventDefault();
    onClose(() => go(href));
  }, [onClose]);
  const availability = getSectionAvailability(siteConfig);
  const showPoems = availability.poems;
  const showMusic = availability.music;
  const enabledTypes = useMemo(() => enabledSearchTypes({ showPoems, showMusic }), [showMusic, showPoems]);
  const [searchIndex, setSearchIndex] = useState<SearchIndexState>({ entries: [], loading: true, error: "" });
  const [searchIndexAttempt, setSearchIndexAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setSearchIndex((current) => ({ ...current, loading: true, error: "" }));
    loadSearchIndex(enabledTypes).then(
      (entries) => { if (active) setSearchIndex({ entries, loading: false, error: "" }); },
      () => { if (active) setSearchIndex({ entries: [], loading: false, error: "搜索内容加载失败，请稍后重试。" }); },
    );
    return () => { active = false; };
  }, [enabledTypes, searchIndexAttempt]);
  const indexedContent = searchIndex.entries;
  const searchItems = useMemo(() => buildSearchItems(indexedContent), [indexedContent]);
  const results = useMemo(() => filterSearchItems(searchItems, scope, query), [query, scope, searchItems]);
  const scopeOptions = searchScopeOptions({ showPoems, showMusic });
  const activeScopeIndex = Math.max(0, scopeOptions.findIndex(([value]) => value === scope));
  const searchIcons: Record<ContentType, PhosphorIcon> = { post: BookOpenText, poem: Feather, music: MusicNotes };
  return <><div className="search-input-wrap"><MagnifyingGlass size={22} /><input autoFocus type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索内容" aria-controls="search-results" /><span className="search-count-badge" aria-live="polite" aria-label={searchIndex.loading ? "正在加载搜索内容" : `${results.length} 条搜索结果`}>{searchIndex.loading ? "…" : results.length}</span><button onClick={onClose} aria-label="关闭搜索"><X size={20} /></button></div><div className="search-toolbar"><div className="search-scopes" style={searchScopeStyle(scopeOptions.length, activeScopeIndex) as CSSProperties} aria-label="搜索范围">{scopeOptions.map(([value, label]) => <button type="button" key={value} className={scope === value ? "active" : ""} aria-pressed={scope === value} onClick={() => setScope(value as SearchScope)}>{label}</button>)}</div></div><div className="search-results" id="search-results">{searchIndex.loading ? <div className="no-results">正在加载搜索内容…</div> : searchIndex.error ? <div className="no-results search-load-error"><span>{searchIndex.error}</span><button type="button" onClick={() => setSearchIndexAttempt((attempt) => attempt + 1)}>重试</button></div> : results.length ? results.map((item) => { const Icon = searchIcons[item.kind]; return <a id={`search-result-${item.id}`} className="search-result" key={item.id} href={item.href} onClick={(event) => navigateToResult(event, item.href)}><span className={`search-result-icon search-result-icon--${item.kind}`}><Icon size={20} weight="duotone" /></span><span className="search-result-copy"><strong>{item.title}</strong><small>{[item.type, item.meta, formatContentDate(item.date)].filter(Boolean).join(" · ")}</small></span></a>; }) : <div className="no-results">没有找到相关内容，换个词试试。</div>}</div></>;
}

export function SettingsDialog({ glassEnabled, onGlassChange, onClose }: { glassEnabled: boolean; onGlassChange: (enabled: boolean) => void; onClose: () => void }) {
  return <>
      <header>
        <span><small>SETTINGS</small><h2 id="settings-dialog-title">设置</h2></span>
        <button type="button" onClick={onClose} aria-label="关闭设置"><X size={20} /></button>
      </header>
      <button type="button" className={`settings-toggle${glassEnabled ? " is-on" : ""}`} aria-pressed={glassEnabled} onClick={() => onGlassChange(!glassEnabled)}>
        <span><strong>全局磨砂玻璃</strong><small>让页面内容面板呈现柔和的半透明层次。</small></span>
        <i aria-hidden="true"><span /></i>
      </button>
  </>;
}
