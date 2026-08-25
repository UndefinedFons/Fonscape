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
  channels?: Record<string, ChannelConfig>;
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
  showPoems?: boolean;
  showMusic?: boolean;
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
  image?: string;
  cardImage?: string;
  cardPosition?: string;
  coverMode?: "wide" | "none";
  coverPosition?: string;
  [key: string]: unknown;
}

export interface Poem extends DatedEntry {
  title: string;
  lines: string[];
  [key: string]: unknown;
}

export interface MusicReview extends DatedEntry {
  title: string;
  kind: string;
  section: "songs" | "artists" | "albums";
  reading: string;
  content: string;
  [key: string]: unknown;
}
