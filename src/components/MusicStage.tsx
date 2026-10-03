import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { ArrowUpRight } from "@phosphor-icons/react/ArrowUpRight";
import { Disc } from "@phosphor-icons/react/Disc";
import { MusicNotes } from "@phosphor-icons/react/MusicNotes";
import { Pause } from "@phosphor-icons/react/Pause";
import { Play } from "@phosphor-icons/react/Play";
import { Repeat } from "@phosphor-icons/react/Repeat";
import { Shuffle } from "@phosphor-icons/react/Shuffle";
import { RepeatOnce } from "@phosphor-icons/react/RepeatOnce";
import { SkipBack } from "@phosphor-icons/react/SkipBack";
import { SkipForward } from "@phosphor-icons/react/SkipForward";
import { SpeakerHigh } from "@phosphor-icons/react/SpeakerHigh";
import { SpeakerSlash } from "@phosphor-icons/react/SpeakerSlash";
import { MusicQueueDialog } from "./MusicQueueDialog.tsx";
import { musicSession } from "../musicSession.ts";
import { useMusicSession } from "../useMusicSession.ts";
import { activeLyricIndex, centerLyricLine, formatMusicTime } from "../musicLyrics.ts";
import { contentRoute } from "../routes.ts";
import { parseMetingLibraryUrl } from "../musicSources.ts";
import { useResponsiveImage } from "../useResponsiveImage.ts";
import type { MusicReviewMetadata } from "../types.ts";

function TrackListIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 4.5v5l4-2.5Z" fill="currentColor" /><path d="M11 7h10M3 12.5h18M3 18h18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
}

export function MusicStage({ seed }: { seed: MusicReviewMetadata }) {
  const state = useMusicSession();
  const sameEntry = state.entry?.section === seed.section && state.entry?.slug === seed.slug;
  const entry = sameEntry ? state.entry! : seed;
  const track = sameEntry ? state.tracks[state.index] : undefined;
  const target = parseMetingLibraryUrl(seed.url);
  const image = useResponsiveImage(track?.cover || entry.image, "(max-width: 760px) 240px, 340px");
  const [showQueue, setShowQueue] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 760px)").matches);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const update = () => setCompact(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const closeQueue = useCallback(() => setShowQueue(false), []);
  const queuePressed = useRef(false);
  const pressQueue = (button: HTMLButtonElement, pressed: boolean) => {
    if (queuePressed.current === pressed) return;
    queuePressed.current = pressed;
    const icon = button.querySelector<HTMLElement>(".music-queue-icon");
    if (!icon || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const transform = window.getComputedStyle(icon).transform;
    icon.getAnimations?.().forEach((animation) => animation.cancel());
    icon.animate?.([
      { transform },
      { transform: pressed ? "scale(.8)" : "scale(1)" },
    ], { duration: pressed ? 90 : 180, easing: "ease-out", fill: pressed ? "forwards" : "none" });
  };
  const openQueue = (event: MouseEvent<HTMLButtonElement>) => {
    pressQueue(event.currentTarget, false);
    setShowQueue(true);
  };
  const lyricScroll = useRef<HTMLDivElement>(null);
  const startedEntry = useRef("");
  const activeLine = activeLyricIndex(state.lyrics, state.time);
  useEffect(() => {
    const key = contentRoute("music", seed);
    if (window.location.pathname !== key || startedEntry.current === key) return;
    startedEntry.current = key;
    const current = musicSession.getSnapshot();
    if (parseMetingLibraryUrl(seed.url) && (current.entry?.section !== seed.section || current.entry?.slug !== seed.slug || current.status === "idle")) void musicSession.load(seed);
  }, [seed]);
  useEffect(() => {
    const container = lyricScroll.current;
    const current = container?.querySelector<HTMLElement>(`[data-line="${activeLine}"]`);
    if (current && container) centerLyricLine(container, current, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, [activeLine, state.lyrics]);
  const lyricMessage = !track ? target ? state.status === "error" ? "曲目暂时无法加载" : "正在加载曲目…" : "暂无可播放曲目" : state.lyricStatus === "loading" ? "正在加载歌词…" : state.lyricStatus === "error" ? "歌词暂时无法加载" : "暂无同步歌词";
  const progress = state.duration ? state.time / state.duration * 100 : 0;
  const playbackMode = state.repeat ? "repeat" : state.shuffle ? "shuffle" : "sequence";
  return <section className={`music-stage material-panel${state.playing ? " is-playing" : ""}`} aria-label="音乐播放器" aria-busy={sameEntry && state.status === "loading"}>
    <div className="music-stage-content">
      <div className="music-stage-record">
        <span className="music-stage-kicker"><MusicNotes size={16} />NOW PLAYING</span>
        <div className="music-stage-art">{image.src ? <img {...image} alt={`${track?.title || entry.sourceTitle}的封面`} decoding="async" /> : <Disc size={96} weight="duotone" />}</div>
        <h2>{track?.title || entry.sourceTitle}</h2>
        <p className="music-stage-artist">{track?.artist || entry.sourceMeta || ""}</p>
        {!track && <div className="music-stage-start">{target && state.status === "error" && <button className="music-play-primary" onClick={() => void musicSession.load(seed)}><Play size={17} weight="fill" />重试加载</button>}{!target && entry.url && <a href={entry.url} target="_blank" rel="noreferrer">{entry.action || "查看来源"}<ArrowUpRight size={15} /></a>}</div>}
      </div>
      <div className="music-stage-story">
        <header><span>歌词</span></header>
        {track && state.lyrics.length ? <div className="music-lyrics" ref={lyricScroll} aria-label="同步歌词">
          {state.lyrics.map((line, index) => <button key={`${line.time}-${index}`} data-line={index} className={index === activeLine ? "is-current" : ""} aria-current={index === activeLine ? "true" : undefined} aria-label={`跳到 ${formatMusicTime(line.time)}：${line.text}`} onClick={() => musicSession.seek(line.time)}><span>{line.text}</span>{line.translation && <small>{line.translation}</small>}</button>)}
        </div> : <div className="music-stage-quiet"><p>{lyricMessage}</p></div>}
        {sameEntry && state.error && <p className="music-playback-notice" role="status">{state.error}</p>}
      </div>
    </div>
    {track && <div className={`music-stage-controls${showVolume ? " volume-open" : ""}`}>
      <div className="music-stage-transport"><button aria-label="上一首" disabled={state.tracks.length < 2} onClick={musicSession.previousTrack}><SkipBack size={22} weight="fill" /></button><button className="music-play-primary" aria-label={state.playing ? "暂停音乐" : "播放音乐"} aria-pressed={state.playing} aria-busy={state.buffering} onClick={musicSession.toggle}><span className="music-control-icon" key={String(state.playing)}>{state.playing ? <Pause size={23} weight="fill" /> : <Play size={23} weight="fill" />}</span></button><button aria-label="下一首" disabled={state.tracks.length < 2} onClick={musicSession.nextTrack}><SkipForward size={22} weight="fill" /></button></div>
      <div className="music-stage-timeline"><time>{formatMusicTime(state.time)}</time><input aria-label="音乐播放进度" type="range" min="0" max={state.duration || 0} step=".1" value={Math.min(state.time, state.duration || 0)} disabled={!state.duration} onChange={(event) => musicSession.seek(Number(event.target.value))} style={{ "--music-progress": `${progress}%` } as CSSProperties} /><time>{formatMusicTime(state.duration)}</time></div>
      <div className="music-stage-options">{state.tracks.length > 1 && <><button className="music-repeat" aria-label={`${state.repeat ? "单曲循环" : state.shuffle ? "随机播放" : "顺序播放"}，切换播放模式`} title={state.repeat ? "单曲循环" : state.shuffle ? "随机播放" : "顺序播放"} aria-pressed={state.repeat || state.shuffle} onClick={() => { if (state.repeat || state.shuffle) musicSession.toggleShuffle(); else musicSession.toggleRepeat(); }}><span className="music-mode-icon" key={playbackMode}>{state.repeat ? <RepeatOnce size={22} /> : state.shuffle ? <Shuffle size={22} /> : <Repeat size={22} />}</span></button><button className="music-queue-toggle" aria-label={`选择曲目，当前第 ${state.index + 1} 首，共 ${state.tracks.length} 首`} title="选择曲目" aria-haspopup="dialog" aria-expanded={showQueue} aria-controls="music-stage-queue" onPointerDown={(event) => event.button === 0 && pressQueue(event.currentTarget, true)} onPointerUp={(event) => pressQueue(event.currentTarget, false)} onPointerCancel={(event) => pressQueue(event.currentTarget, false)} onPointerLeave={(event) => pressQueue(event.currentTarget, false)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") pressQueue(event.currentTarget, true); }} onKeyUp={(event) => { if (event.key === "Enter" || event.key === " ") pressQueue(event.currentTarget, false); }} onBlur={(event) => pressQueue(event.currentTarget, false)} onClick={openQueue}><span className="music-queue-icon"><TrackListIcon /></span></button></>}</div>
      <div className={`music-stage-volume${showVolume ? " is-open" : ""}`}><button aria-label={compact ? "调节音量" : state.volume ? "静音" : "恢复满音量"} aria-expanded={compact ? showVolume : undefined} aria-controls={compact ? "music-volume" : undefined} aria-pressed={compact ? undefined : state.volume === 0} onClick={() => { if (compact) setShowVolume((value) => !value); else musicSession.setVolume(state.volume ? 0 : 1); }}><span className="music-control-icon" key={String(state.volume === 0)}>{state.volume === 0 ? <SpeakerSlash size={22} /> : <SpeakerHigh size={22} />}</span></button><div id="music-volume"><input aria-label="音乐音量" type="range" min="0" max="1" step=".01" value={state.volume} onChange={(event) => musicSession.setVolume(Number(event.target.value))} /></div></div>
    </div>}
    {showQueue && track && <MusicQueueDialog state={state} onClose={closeQueue} />}
  </section>;
}
