import { BookOpenText } from "@phosphor-icons/react/BookOpenText";
import { CalendarBlank } from "@phosphor-icons/react/CalendarBlank";
import { ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { Disc } from "@phosphor-icons/react/Disc";
import { Eye } from "@phosphor-icons/react/Eye";
import { FolderOpen } from "@phosphor-icons/react/FolderOpen";
import { MicrophoneStage } from "@phosphor-icons/react/MicrophoneStage";
import { Playlist } from "@phosphor-icons/react/Playlist";
import { Tag } from "@phosphor-icons/react/Tag";
import { TextAa } from "@phosphor-icons/react/TextAa";
import { getPostFirstParagraph } from "../richContent.js";
import { formatContentDate, getPostWordCount } from "../siteUtils.js";

export function ArticleCover({ post, className, emptyClassName = "", imageClassName = "", placeholderClassName = "", iconSize = 34, loading = "lazy", fetchPriority }) {
  const mediaClassName = `${className}${!post.image && emptyClassName ? ` ${emptyClassName}` : ""}`;
  return <span className={mediaClassName}>
    {post.image
      ? <img className={imageClassName || undefined} src={post.image} alt="" loading={loading} decoding="async" fetchPriority={fetchPriority} draggable="false" style={{ objectPosition: post.cardPosition || post.coverPosition || "center" }} />
      : placeholderClassName
        ? <span className={placeholderClassName}><BookOpenText size={iconSize} weight="duotone" /></span>
        : <BookOpenText size={iconSize} weight="duotone" />}
  </span>;
}
export function PostMeta({ post, showTags = true, stats }) { return <div className="post-meta"><span><TextAa size={16} />{getPostWordCount(post)} 字</span><span><CalendarBlank size={16} />{formatContentDate(post.date)}</span><span><Eye size={16} />{stats?.views || 0}</span><span><ChatCircleDots size={16} />{stats?.comments || 0}</span>{showTags && post.tags?.length > 0 && <span className="post-meta-tags"><Tag size={16} /><span>{post.tags.join(" · ")}</span></span>}</div>; }
export function ArticleCard({ post, stats, featured = false }) {
  const summary = post.excerpt || getPostFirstParagraph(post);
  return <a className={`article-card${post.image ? " has-image" : ""}${featured ? " is-featured" : ""}`} href={`#/post/${post.slug}`}><ArticleCover post={post} className="article-card-media" emptyClassName="article-card-media--placeholder" imageClassName="article-card-media-image" /><div className="article-card-copy"><div className="article-card-kickers"><span className="category">{post.category}</span></div><h2>{post.title}</h2>{(post.series || post.tags?.length > 0) && <div className="article-card-tags">{post.series && <span className="series-kicker"><FolderOpen size={13} />{post.series}</span>}{post.tags?.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}</div>}{summary && <div className="article-card-excerpt"><span>{post.excerpt ? "摘要" : "正文预览"}</span><p>{summary}</p></div>}<PostMeta post={post} showTags={false} stats={stats} /></div></a>;
}

export function MusicReviewCard({ entry, section, stats }) {
  const summary = entry.excerpt || getPostFirstParagraph(entry);
  const CreditIcon = section === "songs" ? Playlist : section === "artists" ? MicrophoneStage : Disc;
  return <a className={`article-card music-review-card${entry.image ? " has-image" : ""}`} href={`#/music/${section}/${entry.slug}`}><div className="music-review-layout">{entry.image && <span className="article-card-media music-review-media"><img className="article-card-media-image" src={entry.image} alt="" loading="lazy" decoding="async" /></span>}<div className="article-card-copy"><span className="category">标题</span><h2>{entry.title}</h2>{summary && <div className="article-card-excerpt"><span>{entry.excerpt ? "摘要" : "正文预览"}</span><p>{summary}</p></div>}<div className="music-review-credits"><CreditIcon size={16} weight="duotone" /><span><strong>{entry.sourceTitle || entry.title}</strong>{(entry.sourceMeta || entry.kind) && <em>{entry.sourceMeta || entry.kind}</em>}</span></div><div className="post-meta"><span><TextAa size={16} />{getPostWordCount(entry)} 字</span><span><CalendarBlank size={16} />{formatContentDate(entry.date)}</span><span><Eye size={16} />{stats?.views || 0}</span><span><ChatCircleDots size={16} />{stats?.comments || 0}</span></div></div></div></a>;
}
