import { ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { CalendarBlank } from "@phosphor-icons/react/CalendarBlank";
import { ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { Eye } from "@phosphor-icons/react/Eye";
import { Feather } from "@phosphor-icons/react/Feather";
import { use, useEffect } from "react";
import { CommentsSection } from "../community/CommentsSection.jsx";
import { loadPoem } from "../content/index.js";
import { go } from "../routeState.js";
import { formatContentDate } from "../siteUtils.js";
import { NotFound } from "./NotFound.jsx";

export function PoemPage({ slug, stats, onView, onStatsTargets }) {
  const poem = use(loadPoem(slug));
  const detailPoem = poem;
  useEffect(() => { if (poem?.slug) onView("poem", poem.slug); }, [poem?.slug, onView]);
  useEffect(() => { if (poem?.slug) onStatsTargets([{ type: "poem", slug: poem.slug }]); }, [poem?.slug, onStatsTargets]);
  if (!poem) return <NotFound />;
  return <main className="poem-page page-width"><button className="back-button" onClick={() => history.length > 1 ? history.back() : go("/poems")}><ArrowLeft size={17} />返回</button><article><Feather size={30} /><span className="eyebrow">SMALL POEM</span><h1>{poem.title}</h1><div className="post-meta poem-detail-meta"><span><CalendarBlank size={16} /><time dateTime={poem.date}>{formatContentDate(poem.date)}</time></span><span><Eye size={16} />{stats[poem.slug]?.views || 0}</span><span><ChatCircleDots size={16} />{stats[poem.slug]?.comments || 0}</span></div><div className="poem-lines">{detailPoem.lines.map((line, index) => <p key={`${poem.slug}-${index}`}>{line}</p>)}</div>{poem.note && <p className="poem-note">{poem.note}</p>}</article><div className="poem-comments material-panel comments-material-panel"><CommentsSection targetType="poem" slug={poem.slug} /></div></main>;
}
