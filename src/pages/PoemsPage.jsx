import { ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { CalendarBlank } from "@phosphor-icons/react/CalendarBlank";
import { ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { Eye } from "@phosphor-icons/react/Eye";
import { Feather } from "@phosphor-icons/react/Feather";
import { use, useEffect, useMemo } from "react";
import { Pagination } from "../components/Pagination.jsx";
import { PageHero } from "../components/PageHero.jsx";
import { loadCollection, siteConfig } from "../content/index.js";
import { usePagination, useResponsivePageSize } from "../hooks.js";
import { formatContentDate } from "../siteUtils.js";

export function PoemsPage({ stats, onStatsTargets }) {
  const poems = use(loadCollection("poem"));
  const pagination = usePagination(poems, useResponsivePageSize(6, 3), "all", "poems");
  const pageStatsKey = JSON.stringify(pagination.pageItems.map((poem) => poem.slug));
  const pageStatsTargets = useMemo(
    () => JSON.parse(pageStatsKey).map((slug) => ({ type: "poem", slug })),
    [pageStatsKey],
  );
  useEffect(() => { onStatsTargets(pageStatsTargets); }, [onStatsTargets, pageStatsTargets]);
  return <main><PageHero kicker="SMALL POEMS" title="小诗" description={siteConfig.pages.poemsDescription} icon={Feather} variant="poems" /><section className="listing page-width"><div ref={pagination.topRef} className={`poem-grid paginated-view${pagination.leaving ? " is-leaving" : ""}`}>{poems.length ? pagination.pageItems.map((poem) => <a className="poem-card" href={`#/poem/${poem.slug}`} key={poem.slug}><Feather size={24} /><h2>{poem.title}</h2>{poem.previewLines.slice(0, 3).map((line, index) => <p key={`${poem.slug}-${index}`}>{line}</p>)}{poem.lineCount > poem.previewLines.length && <p aria-hidden="true">……</p>}<div className="poem-card-footer"><span className="poem-card-stats"><span className="poem-card-date"><CalendarBlank size={14} /><time dateTime={poem.date}>{formatContentDate(poem.date)}</time></span><span><Eye size={14} />{stats[poem.slug]?.views || 0}</span><span><ChatCircleDots size={14} />{stats[poem.slug]?.comments || 0}</span></span><span className="poem-card-link">读完整首 <ArrowRight size={15} /></span></div></a>) : <div className="section-empty"><Feather size={34} weight="duotone" /><h2>暂无小诗</h2></div>}</div><Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={pagination.changePage} /></section></main>;
}
