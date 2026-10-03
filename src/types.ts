import type { PublicComment, AccountComment } from "../functions/public-api.ts";
export type { UserRole, UserStatus, PublicCommentStatus, PublicUser, PublicCommentAuthor, PublicReplyUser, PublicComment, SessionResponse, CommentListResponse, CreateCommentResponse, AccountComment, DeleteCommentResponse, ApiErrorPayload } from "../functions/public-api.ts";

export interface HeroConfig {
  image: string;
  mobileImage?: string;
  glassImage?: string;
  position?: string;
  mobilePosition?: string;
  size?: string;
}

export type HeroVariant = "home" | "posts" | "poems" | "music" | "friends" | "about";

export interface ChannelConfig {
  url?: string;
}

export interface EmailChannelConfig {
  address?: string;
}

export interface AuthorConfig {
  name: string;
  avatar: string;
  avatarSmall?: string;
  avatarAlt: string;
  tagline: string;
  introduction: string;
  interests: string[];
  channels?: {
    github?: ChannelConfig;
    bilibili?: ChannelConfig;
    x?: ChannelConfig;
    email?: EmailChannelConfig;
  };
}

export interface SiteConfig {
  language: string;
  title: string;
  description: string;
  siteUrl?: string;
  postCategories?: string[];
  showPoems?: boolean;
  showMusic?: boolean;
  showCommunity?: boolean;
  home: {
    eyebrow: string;
    title: string;
    description: string;
  };
  author: AuthorConfig;
  about: {
    heroDescription: string;
    eyebrow: string;
    greeting: string;
    summary: string;
    paragraphs: string[];
  };
  pages: {
    postsDescription: string;
    poemsDescription: string;
    musicDescription: string;
    friendsDescription: string;
  };
  footer: {
    owner: string;
    themeName?: string;
    themeRepository?: string;
  };
  heroes: Record<HeroVariant, HeroConfig>;
}

export interface DatedEntry {
  slug: string;
  date: string;
  responsiveImages?: Record<string, ResponsiveImageMetadata | undefined>;
}

export type MusicSection = "songs" | "albums" | "playlists";

export interface LocalMusicTrack {
  src: string;
  url?: never;
  title: string;
  artist: string;
  cover?: string;
  autoplay?: boolean;
  id?: string;
}

export interface MetingMusicTrack {
  url: string;
  src?: never;
  autoplay?: boolean;
  id?: string;
}

export type MusicTrack = LocalMusicTrack | MetingMusicTrack;

export interface ArticleOutlineItem {
  id: string;
  number: string;
  title: string;
  line?: number;
  prologue?: boolean;
}

export interface Post extends DatedEntry {
  title: string;
  category: string;
  content: string;
  tags: string[];
  series: string | null;
  seriesOrder?: number;
  featured: boolean;
  featuredOrder?: number;
  excerpt?: string;
  firstParagraph: string;
  wordCount: number;
  outline: ArticleOutlineItem[];
  image?: string;
  cardPosition?: string;
  coverMode?: "wide" | "none";
  musicPlacement?: "inline";
  music?: MusicTrack;
  musicBlocks?: MusicTrack[];
}

export type PostMetadata = Omit<Post, "content">;

export interface Poem extends DatedEntry {
  title: string;
  lines: string[];
  previewLines: string[];
  lineCount: number;
  note?: string;
}

export type PoemMetadata = Omit<Poem, "lines">;

export interface MusicReview extends DatedEntry {
  title: string;
  kind: string;
  section: MusicSection;
  featured: boolean;
  featuredOrder?: number;
  content: string;
  firstParagraph: string;
  wordCount: number;
  image?: string;
  excerpt?: string;
  url?: string;
  sourceTitle?: string;
  sourceMeta?: string;
  action?: string;
}

export type MusicReviewMetadata = Omit<MusicReview, "content">;

export type ContentType = "post" | "poem" | "music";
export type ContentMetadata = PostMetadata | PoemMetadata | MusicReviewMetadata;
export type ContentEntry = Post | Poem | MusicReview;

export interface GenericContentMetadata extends DatedEntry {
  title: string;
  [field: string]: unknown;
}

export interface ContentMetadataByType {
  post: PostMetadata;
  poem: PoemMetadata;
  music: MusicReviewMetadata;
}

export type ContentLookup = ReadonlyMap<string, { title: string; category?: string; kind?: string }>;
export interface StatsTarget {
  type: ContentType;
  slug: string;
}
export type OnStatsTargets = (targets: StatsTarget[]) => void;
export type OnStatsChange = (type: ContentType, slug: string, comments?: number) => void;
export interface ContentEntryByType {
  post: Post;
  poem: Poem;
  music: MusicReview;
}

export interface ResponsiveImageCandidate {
  src: string;
  width: number;
}

export interface ResponsiveImageMetadata {
  width: number;
  height: number;
  candidates: ResponsiveImageCandidate[];
  lqip?: string;
}

export interface HomePost extends DatedEntry {
  title: string;
  category: string;
  featured: boolean;
  featuredOrder?: number;
  excerpt?: string;
  firstParagraph?: string;
  wordCount: number;
  image?: string;
  cardPosition?: string;
  responsiveImages?: Record<string, ResponsiveImageMetadata | undefined>;
}

export interface HomePoem extends DatedEntry {
  title: string;
  previewLines: string[];
  lineCount: number;
  responsiveImages?: Record<string, ResponsiveImageMetadata | undefined>;
}

export interface HomeMusic extends DatedEntry {
  url?: string;
  image?: string;
  sourceTitle?: string;
  sourceMeta?: string;
  title: string;
  section: MusicSection;
  kind: string;
  featured: boolean;
  featuredOrder?: number;
  responsiveImages?: Record<string, ResponsiveImageMetadata | undefined>;
}

export interface PostFacet {
  key: string;
  page: number;
  title: string;
  date: string;
  category: string;
  tags: string[];
  series: string | null;
  seriesOrder: number;
}

export interface PoemFacet {
  key: string;
  page: number;
  title: string;
  date: string;
}

export interface MusicFacet {
  key: string;
  page: number;
  title: string;
  date: string;
  section: MusicSection;
  kind: string;
}

export type ContentFacet = PostFacet | PoemFacet | MusicFacet;
export interface ContentFacetByType {
  post: PostFacet;
  poem: PoemFacet;
  music: MusicFacet;
}

export interface PostSearchEntry {
  type: "post";
  key: string;
  title: string;
  date: string;
  category: string;
}

export interface PoemSearchEntry {
  type: "poem";
  key: string;
  title: string;
  date: string;
}

export interface MusicSearchEntry {
  sourceTitle?: string;
  type: "music";
  key: string;
  title: string;
  date: string;
  section: MusicSection;
  kind: string;
}

export type ContentSearchEntry = PostSearchEntry | PoemSearchEntry | MusicSearchEntry;

export interface SearchItem {
  sourceTitle?: string;
  id: string;
  slug: string;
  kind: ContentType;
  type: string;
  title: string;
  meta: string;
  date: string;
  href: string;
}

export interface CollectionDescriptor<TLatest = DatedEntry & { title: string }, TFeatured = DatedEntry & { title: string }> {
  count: number;
  pageChunkSize: number;
  pageChunkCount: number;
  facetChunkSize: number;
  facetChunkCount: number;
  searchChunkSize: number;
  searchChunkCount: number;
  featuredChunkSize: number;
  featuredChunkCount: number;
  featuredCount: number;
  home: {
    latest: TLatest[];
    featured?: TFeatured[];
  };
}

export interface ContentManifest {
  schemaVersion: number;
  basePath: string;
  collections: Record<string, CollectionDescriptor>;
}

export interface HomeContent {
  featuredPosts: readonly HomePost[];
  featuredCount: number;
  featuredChunkSize: number;
  recentPosts: readonly HomePost[];
  latestPoems: readonly HomePoem[];
  latestMusic: readonly HomeMusic[];
  counts: Record<string, number>;
}

export interface AccountCommentFeed<Item = AccountComment> {
  items: Item[];
}

export interface CommentThread {
  comment: PublicComment;
  replies: PublicComment[];
}

export interface FriendApplicationData {
  site: string;
  url: string;
  desc: string;
  color: string;
}

export interface FriendApplication {
  valid: boolean;
  errors: string[];
  data: FriendApplicationData;
}

export interface FriendEntry {
  name: string;
  url: string;
  description: string;
  owner: string;
  userId: string;
  color: string;
}

export interface ContentStat {
  views?: number;
  comments?: number;
}

export type ContentStats = Record<string, ContentStat>;
export type RouteStats = Partial<Record<ContentType, ContentStats>>;


declare module "react" {
  interface CSSProperties {
    [property: `--${string}`]: string | number | undefined;
  }
}

export interface PublishedFriend {
  name: string;
  url: string;
  description: string;
  owner?: string;
  userId?: string;
  color?: string;
  avatar?: string;
}
export type { PublicProfile } from "../functions/public-api.ts";
