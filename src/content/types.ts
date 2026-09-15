import type { ArticleOutlineItem, DatedEntry, MusicReview, Poem, Post } from "../types.js";

export type MusicSection = "songs" | "artists" | "albums";

export interface ResponsiveImageCandidate {
  src: string;
  width: number;
}

export interface ResponsiveImageDescription {
  width: number;
  height: number;
  candidates: readonly ResponsiveImageCandidate[];
  lqip?: string;
}

export type ResponsiveImageMap = Readonly<Record<string, ResponsiveImageDescription>>;

/** Metadata shared by every generated page entry, including future collections. */
export interface CollectionPageEntry extends DatedEntry {
  title: string;
  key: string;
  source: string;
  body: string;
  responsiveImages?: ResponsiveImageMap;
  [key: string]: unknown;
}

/** Concrete post metadata for generated pages; keep this explicit instead of deriving it with Omit<Post, ...>. */
export interface PostPageEntry extends CollectionPageEntry {
  category: string;
  tags: string[];
  series: string | null;
  seriesOrder?: number;
  featured: boolean;
  featuredOrder?: number;
  excerpt?: string;
  firstParagraph: string;
  wordCount: number;
  image?: string;
  cardPosition?: string;
  coverMode?: "wide" | "none";
}

export interface PoemPageEntry extends CollectionPageEntry {
  previewLines: string[];
  lineCount: number;
}

export interface MusicPageEntry extends CollectionPageEntry {
  kind: string;
  section: MusicSection;
  firstParagraph: string;
  wordCount: number;
  image?: string;
}

/** The minimum home-card shape produced for an arbitrary repository collection. */
export interface CollectionHomeEntry extends DatedEntry {
  title: string;
  responsiveImages?: ResponsiveImageMap;
  [key: string]: unknown;
}

export interface PostHomeEntry extends CollectionHomeEntry {
  category: string;
  featured: boolean;
  featuredOrder?: number;
  excerpt?: string;
  firstParagraph?: string;
  wordCount: number;
  image?: string;
  cardPosition?: string;
}

export interface PoemHomeEntry extends CollectionHomeEntry {
  previewLines: string[];
  lineCount: number;
}

export interface MusicHomeEntry extends CollectionHomeEntry {
  kind: string;
  section: MusicSection;
}

export interface ContentFacetEntry {
  key: string;
  page: number;
  title: string;
  date: string;
  [key: string]: unknown;
}

export interface PostFacetEntry extends ContentFacetEntry {
  category: string;
  tags: string[];
  series: string | null;
  seriesOrder: number;
}

export type PoemFacetEntry = ContentFacetEntry;

export interface MusicFacetEntry extends ContentFacetEntry {
  section: MusicSection;
  kind: string;
}

export interface ContentSearchEntry {
  type: string;
  key: string;
  title: string;
  date: string;
  [key: string]: unknown;
}

export interface PostSearchEntry extends ContentSearchEntry {
  type: "post";
  category: string;
}

export interface PoemSearchEntry extends ContentSearchEntry {
  type: "poem";
}

export interface MusicSearchEntry extends ContentSearchEntry {
  type: "music";
  section: MusicSection;
  kind: string;
}

export interface CollectionHome<TEntry extends CollectionHomeEntry = CollectionHomeEntry> {
  latest: readonly TEntry[];
  featured?: readonly TEntry[];
}

export interface CollectionDescriptor<
  THome extends CollectionHomeEntry = CollectionHomeEntry,
> {
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
  home: CollectionHome<THome>;
}

export type PostCollectionDescriptor = CollectionDescriptor<PostHomeEntry>;
export type PoemCollectionDescriptor = CollectionDescriptor<PoemHomeEntry>;
export type MusicCollectionDescriptor = CollectionDescriptor<MusicHomeEntry>;

/** Built-in collections retain concrete fields while arbitrary collection names remain supported. */
export type CollectionDescriptors = Record<string, CollectionDescriptor> & {
  post?: PostCollectionDescriptor;
  poem?: PoemCollectionDescriptor;
  music?: MusicCollectionDescriptor;
};

export interface ContentManifest {
  schemaVersion: number;
  basePath: string;
  collections: CollectionDescriptors;
}

export interface GenericContentEntry extends DatedEntry {
  title: string;
  content?: string;
  [key: string]: unknown;
}

export type ContentParser<T extends GenericContentEntry = GenericContentEntry> = (path: string, source: string) => T;

export interface ContentRouteEntry {
  slug?: string;
  key?: string;
  section?: string;
  [key: string]: unknown;
}

export interface FriendLink {
  name: string;
  url: string;
  description: string;
  owner?: string;
  avatar?: string;
  color?: string;
  userId?: string;
  [key: string]: unknown;
}

export interface HomeContent {
  featuredPosts: readonly PostHomeEntry[];
  featuredCount: number;
  featuredChunkSize: number;
  recentPosts: readonly PostHomeEntry[];
  latestPoems: readonly PoemHomeEntry[];
  latestMusic: readonly MusicHomeEntry[];
  counts: Readonly<Record<string, number>>;
}

export type { ArticleOutlineItem, DatedEntry, MusicReview, Poem, Post };
