export type MusicLibrarySource = "netease" | "tencent";
export type MusicLibraryType = "song" | "album" | "playlist";

export interface MusicLibraryTarget {
  source: MusicLibrarySource;
  type: MusicLibraryType;
  id: string;
}

export interface MusicLibraryTrack {
  id: string;
  source: MusicLibrarySource;
  title: string;
  artist: string;
  cover: string;
  src: string;
  lyricUrl: string;
}

export interface MusicLibraryResult {
  tracks: MusicLibraryTrack[];
  truncated: boolean;
}
