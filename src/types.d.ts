export interface HeroConfig {
  image: string;
  mobileImage?: string;
  glassImage?: string;
  position?: string;
  mobilePosition?: string;
  size?: string;
}

export interface ChannelConfig {
  label?: string;
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
  support?: {
    label: string;
    handle: string;
    image: string;
    imageAlt: string;
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
  heroes: Record<string, HeroConfig> & { home: HeroConfig };
}

export interface DatedEntry {
  slug: string;
  date: string;
}

export interface Post extends DatedEntry {
  title: string;
  category: string;
  content: string;
  tags: string[];
  series: string | null;
  featured: boolean;
  featuredOrder?: number;
  excerpt?: string;
  firstParagraph: string;
  wordCount: number;
  outline: ArticleOutlineItem[];
  image?: string;
  cardPosition?: string;
  coverMode?: "wide" | "none";
  [key: string]: unknown;
}

export interface ArticleOutlineItem {
  id: string;
  number: string;
  title: string;
  line?: number;
  prologue?: boolean;
}

export type PostMetadata = Omit<Post, "content">;

export interface Poem extends DatedEntry {
  title: string;
  lines: string[];
  previewLines: string[];
  lineCount: number;
  [key: string]: unknown;
}

export type PoemMetadata = Omit<Poem, "lines">;

export interface MusicReview extends DatedEntry {
  title: string;
  kind: string;
  section: "songs" | "artists" | "albums";
  content: string;
  firstParagraph: string;
  wordCount: number;
  image?: string;
  [key: string]: unknown;
}

export type MusicReviewMetadata = Omit<MusicReview, "content">;

export type UserRole = "member" | "admin";
export type UserStatus = "active" | "banned";

export interface PublicUser {
  id: string;
  username: string;
  nickname: string;
  role: UserRole;
  status: UserStatus;
  unreadReplies: number;
  unreadAdminComments: number;
  avatarUrl: string | null;
  avatarUpdatedAt: number | null;
  createdAt: number;
}

export interface PublicCommentAuthor {
  id: string;
  nickname: string | null;
  role: UserRole | null;
  avatarUrl: string | null;
  avatarUpdatedAt: number | null;
}

export interface PublicReplyUser {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  avatarUpdatedAt: number | null;
}

export interface PublicComment {
  id: string;
  parentId: string | null;
  replyTo: string | null;
  replyToUser: PublicReplyUser | null;
  body: string;
  status: string;
  createdAt: number;
  updatedAt: number | null;
  editedAt: number | null;
  canDelete: boolean;
  author: PublicCommentAuthor;
}

export interface SessionResponse {
  user: PublicUser | null;
  accountNotice?: string;
}

export interface CommentListResponse {
  comments: PublicComment[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CreateCommentResponse {
  comment: PublicComment;
  replayed?: boolean;
}
