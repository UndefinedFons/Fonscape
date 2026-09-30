import { Disc } from "@phosphor-icons/react/Disc";
import { MicrophoneStage } from "@phosphor-icons/react/MicrophoneStage";
import { Playlist } from "@phosphor-icons/react/Playlist";

export const musicSections = [
  { id: "songs", label: "歌曲", icon: Playlist },
  { id: "artists", label: "音乐人", icon: MicrophoneStage },
  { id: "albums", label: "专辑", icon: Disc },
] as const;

export function getMusicSectionIcon(section: string): (typeof musicSections)[number]["icon"] {
  return musicSections.find((item) => item.id === section)?.icon || Disc;
}
