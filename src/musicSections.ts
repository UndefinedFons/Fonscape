import { Disc } from "@phosphor-icons/react/Disc";
import { MusicNote } from "@phosphor-icons/react/MusicNote";
import { Playlist } from "@phosphor-icons/react/Playlist";

export const musicSections = [
  { id: "songs", label: "歌曲", icon: MusicNote },
  { id: "albums", label: "专辑", icon: Disc },
  { id: "playlists", label: "歌单", icon: Playlist },
] as const;

export function getMusicSectionIcon(section: string): (typeof musicSections)[number]["icon"] {
  return musicSections.find((item) => item.id === section)?.icon || Disc;
}

export function getMusicSectionLabel(section: string): string {
  return musicSections.find((item) => item.id === section)?.label || "音乐";
}
