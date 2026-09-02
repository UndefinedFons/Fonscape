import { ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { getVisiblePaginationPages } from "../pagination.js";

export function Pagination({ page, totalPages, onChange, ariaLabel = "内容分页", className = "" }) {
  if (totalPages <= 1) return null;
  const pages = getVisiblePaginationPages(page, totalPages);
  return <nav className={`pagination${className ? ` ${className}` : ""}`} aria-label={ariaLabel}><button type="button" onClick={() => onChange(page - 1)} disabled={page === 1} aria-label="上一页"><ArrowLeft size={16} /></button><span className="pagination-pages">{pages.map((item, index) => <span className="pagination-slot" key={item}>{index > 0 && item - pages[index - 1] > 1 && <i aria-hidden="true">…</i>}<button type="button" className={item === page ? "active" : ""} aria-current={item === page ? "page" : undefined} aria-label={`第 ${item} 页`} onClick={() => onChange(item)}>{item}</button></span>)}</span><button type="button" onClick={() => onChange(page + 1)} disabled={page === totalPages} aria-label="下一页"><ArrowRight size={16} /></button></nav>;
}
