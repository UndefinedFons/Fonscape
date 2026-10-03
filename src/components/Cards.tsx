import { siteConfig } from "../siteConfig.ts";
import { BookOpenText } from "@phosphor-icons/react/BookOpenText";
import { CalendarBlank } from "@phosphor-icons/react/CalendarBlank";
import { ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { Eye } from "@phosphor-icons/react/Eye";
import { FolderOpen } from "@phosphor-icons/react/FolderOpen";
import { Tag } from "@phosphor-icons/react/Tag";
import { TextAa } from "@phosphor-icons/react/TextAa";
import { getPostFirstParagraph } from "../richContent.ts";
import { contentRoute } from "../content/index.ts";
import { formatContentDate, getPostWordCount } from "../siteUtils.ts";
import { useResponsiveImage } from "../useResponsiveImage.ts";
import type { ContentStat, Post, PostMetadata } from "../types.ts";

type ImageLoading = "lazy" | "eager";
type MetadataEntry = Pick<Post, "date" | "wordCount"> & { tags?: string[] };

export function ArticleCover({ post, className, emptyClassName = "", imageClassName = "", placeholderClassName = "", iconSize = 34, loading = "lazy", fetchPriority, sizes = "(max-width: 760px) calc(100vw - 32px), (max-width: 1040px) calc(100vw - 64px), 540px" }: {
  post: Pick<PostMetadata, "image" | "cardPosition">;
  className: string;
  emptyClassName?: string;
  imageClassName?: string;
  placeholderClassName?: string;
  iconSize?: number;
  loading?: ImageLoading;
  fetchPriority?: "high" | "low" | "auto";
  sizes?: string;
}) {
  const mediaClassName = `${className}${!post.image && emptyClassName ? ` ${emptyClassName}` : ""}`;
  const imageSource = post.image;
  const responsiveImage = useResponsiveImage(imageSource, sizes);
  return <span className={mediaClassName}>
    {post.image
      ? <img className={imageClassName || undefined} {...responsiveImage} alt="" loading={loading} decoding="async" fetchPriority={fetchPriority || (loading === "lazy" ? "low" : undefined)} draggable="false" style={{ objectPosition: post.cardPosition || "center" }} />
      : placeholderClassName
        ? <span className={placeholderClassName}><BookOpenText size={iconSize} weight="duotone" /></span>
        : <BookOpenText size={iconSize} weight="duotone" />}
  </span>;
}
export function PostMeta({ post, showTags = true, stats }: { post: MetadataEntry; showTags?: boolean; stats?: ContentStat }) { return <div className="post-meta"><span><TextAa size={16} />{getPostWordCount(post as Partial<Post>)} 字</span><span><CalendarBlank size={16} />{formatContentDate(post.date)}</span><span><Eye size={16} />{stats?.views || 0}</span>{siteConfig.showCommunity && <span><ChatCircleDots size={16} />{stats?.comments || 0}</span>}{showTags && (post.tags?.length as number) > 0 && <span className="post-meta-tags"><Tag size={16} /><span>{post.tags!.join(" · ")}</span></span>}</div>; }
export function ArticleCard({ post, stats, featured = false, imageLoading = "lazy" }: { post: PostMetadata; stats?: ContentStat; featured?: boolean; imageLoading?: ImageLoading }) {
  const summary = post.excerpt || getPostFirstParagraph(post);
  return <a className={`article-card${post.image ? " has-image" : ""}${featured ? " is-featured" : ""}`} href={contentRoute("post", post)}><ArticleCover post={post} className="article-card-media" emptyClassName="article-card-media--placeholder" imageClassName="article-card-media-image" loading={imageLoading} fetchPriority={imageLoading === "eager" ? "high" : undefined} /><div className="article-card-copy"><div className="article-card-kickers"><span className="category">{post.category}</span></div><h2>{post.title}</h2>{(post.series || (post.tags?.length as number) > 0) && <div className="article-card-tags">{post.series && <span className="series-kicker"><FolderOpen size={13} />{post.series}</span>}{post.tags?.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}</div>}{summary && <div className="article-card-excerpt"><span>{post.excerpt ? "摘要" : "正文预览"}</span><p>{summary}</p></div>}<PostMeta post={post} showTags={false} stats={stats} /></div></a>;
}
