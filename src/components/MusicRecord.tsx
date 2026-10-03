import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { Disc } from "@phosphor-icons/react/Disc";
import { Play } from "@phosphor-icons/react/Play";
import { Pause } from "@phosphor-icons/react/Pause";
import { SpinnerGap } from "@phosphor-icons/react/SpinnerGap";
import { PushPin } from "@phosphor-icons/react/PushPin";
import { parseMetingLibraryUrl } from "../musicSources.ts";
import { musicSession } from "../musicSession.ts";
import { useMusicSession } from "../useMusicSession.ts";
import { activeLyricIndex, centerLyricLine } from "../musicLyrics.ts";
import { contentRoute } from "../routes.ts";
import { useResponsiveImage } from "../useResponsiveImage.ts";
import type { MusicReviewMetadata } from "../types.ts";

export function MusicRecord({ entry, eager = false, order = 0 }: { entry: MusicReviewMetadata; eager?: boolean; order?: number }) {
  const state = useMusicSession();
  const active = state.entry?.section === entry.section && state.entry?.slug === entry.slug;
  const playing = active && state.playing;
  const track = playing ? state.tracks[state.index] : undefined;
  const loading = active && state.status === "loading";
  const activeLine = activeLyricIndex(state.lyrics, state.time);
  const lyricScroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = lyricScroll.current;
    const line = container?.querySelector<HTMLElement>(`[data-line="${activeLine}"]`);
    if (playing && container && line) centerLyricLine(container, line, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, [playing, activeLine, state.lyrics]);
  const progress = active && state.duration ? state.time / state.duration * 100 : 0;
  const toggle = () => {
    if (active && state.status === "ready") musicSession.toggle();
    else if (!loading) void musicSession.load(entry);
  };
  const album = entry.section === "albums";
  const artwork = track?.cover && parseMetingLibraryUrl(entry.url)?.type === "playlist" ? track.cover : entry.image;
  const image = useResponsiveImage(artwork, "(max-width: 760px) 44vw, (max-width: 1040px) 30vw, 280px");
  const href = contentRoute("music", entry);
  return <article className={`music-record${album ? " music-record--album" : ""}${active ? " is-active" : ""}${playing ? " is-playing" : ""}`} style={{ "--music-order": order } as CSSProperties}>
    <a className="music-record-art" href={href} aria-label={`聆听 ${entry.sourceTitle || entry.title}`}>
      {image.src ? <img key={image.src} {...image} alt={`${entry.sourceTitle || entry.title}的封面`} loading={eager ? "eager" : "lazy"} decoding="async" /> : <Disc className="music-record-fallback" size={68} weight="duotone" />}
      {playing && state.lyrics.length > 0 && <div className="music-record-lyric" ref={lyricScroll} aria-label="同步歌词">{state.lyrics.map((line, index) => <p key={`${line.time}-${index}`} data-line={index} className={index === activeLine ? "is-current" : ""}><span>{line.text}</span>{line.translation && <small>{line.translation}</small>}</p>)}</div>}
      <span className="music-record-kind">{entry.kind}</span>{entry.featured && <span className="music-record-pinned"><PushPin size={12} weight="fill" />置顶</span>}<div className="music-record-copy" key={track?.id || "collection"}><h3>{track?.title || entry.sourceTitle || entry.title}</h3><p>{track?.artist || entry.sourceMeta || ""}</p></div>
    </a>
    <button aria-label={`${playing ? "暂停" : "播放"} ${entry.sourceTitle || entry.title}`} aria-pressed={playing} aria-busy={loading} onClick={toggle}><span className={`music-control-icon${loading ? " is-loading" : ""}`} key={loading ? "loading" : String(playing)}>{loading ? <SpinnerGap size={20} /> : playing ? <Pause size={20} weight="fill" /> : <Play size={20} weight="fill" />}</span></button>
    {playing && <div className="music-record-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>}
  </article>;
}
