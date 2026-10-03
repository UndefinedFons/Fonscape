import { Pause } from "@phosphor-icons/react/Pause";
import { Play } from "@phosphor-icons/react/Play";
import { Repeat } from "@phosphor-icons/react/Repeat";
import { RepeatOnce } from "@phosphor-icons/react/RepeatOnce";
import { SkipBack } from "@phosphor-icons/react/SkipBack";
import { SkipForward } from "@phosphor-icons/react/SkipForward";
import { Shuffle } from "@phosphor-icons/react/Shuffle";
import { SpeakerHigh } from "@phosphor-icons/react/SpeakerHigh";
import { SpeakerSlash } from "@phosphor-icons/react/SpeakerSlash";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { formatMusicTime } from "../musicLyrics.ts";
import { contentRoute } from "../routes.ts";
import { useResponsiveImage } from "../useResponsiveImage.ts";
import { musicSession } from "../musicSession.ts";
import { useMusicSession } from "../useMusicSession.ts";
import "../styles/music-mini-player.css";

export function MusicMiniPlayer() {
  const state = useMusicSession();
  const track = state.tracks[state.index];
  const image = useResponsiveImage(track?.cover || state.entry?.image, "52px");
  const root = useRef<HTMLDivElement>(null);
  const [dismissed, setDismissed] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  useEffect(() => {
    const musicNav = root.current?.closest(".main-nav-music");
    if (!musicNav) return;
    const trigger = musicNav.querySelector<HTMLAnchorElement>(":scope>a");
    const reopen = () => setDismissed(false);
    const focus = (event: Event) => { if (event.target === trigger && trigger?.matches(":focus-visible")) reopen(); };
    trigger?.addEventListener("pointerenter", reopen);
    musicNav.addEventListener("focusin", focus);
    return () => {
      trigger?.removeEventListener("pointerenter", reopen);
      musicNav.removeEventListener("focusin", focus);
    };
  }, [state.entry]);
  if (!state.entry) return null;

  const title = track?.title || state.entry.sourceTitle;
  const detail = state.error || track?.artist || state.entry.sourceMeta || (state.status === "loading" ? "正在加载曲目" : "");
  const hasTracks = state.tracks.length > 0;
  const canChangeTrack = state.tracks.length > 1;
  const playbackMode = state.repeat ? "repeat" : state.shuffle ? "shuffle" : "sequence";
  const playbackModeLabel = state.repeat ? "单曲循环" : state.shuffle ? "随机播放" : "顺序播放";

  const controls = <>
    <button className="music-mini-player__button" type="button" aria-label="上一首" disabled={!canChangeTrack} onClick={musicSession.previousTrack}>
      <SkipBack size={17} weight="fill" />
    </button>
    <button className="music-mini-player__button music-mini-player__button--play" type="button" aria-label={state.playing ? "暂停全局音乐" : "播放全局音乐"} aria-pressed={state.playing} aria-busy={state.buffering} disabled={!hasTracks} onClick={musicSession.toggle}>
      <span className="music-mini-player__control-icon" key={String(state.playing)}>{state.playing ? <Pause size={17} weight="fill" /> : <Play size={17} weight="fill" />}</span>
    </button>
    <button className="music-mini-player__button" type="button" aria-label="下一首" disabled={!canChangeTrack} onClick={musicSession.nextTrack}>
      <SkipForward size={17} weight="fill" />
    </button>
  </>;

  return <div ref={root} className={`music-mini-player${dismissed ? " is-dismissed" : ""}`}>
    <section className="music-mini-player__desktop" aria-label="全局音乐播放器" aria-hidden={dismissed || undefined} inert={dismissed}>
      <div className="music-mini-player__card material-panel">
        <div className="music-mini-player__desktop-track">
          {image.src && <a className="music-mini-player__art-link" href={contentRoute("music", state.entry)} aria-label="查看正在播放的音乐详情" onClick={() => { setDismissed(true); setShowVolume(false); }}><img className="music-mini-player__art" {...image} alt={`${track?.title || state.entry.sourceTitle}的封面`} decoding="async" /></a>}
          <span className="music-mini-player__copy" aria-live="polite">
            <strong title={title}>{title}</strong>
            {detail && <small title={detail}>{detail}</small>}
          </span>
        </div>
        <div className="music-mini-player__timeline"><time>{formatMusicTime(state.time)}</time><input type="range" aria-label="全局音乐播放进度" min="0" max={state.duration || 0} step=".1" value={Math.min(state.time, state.duration || 0)} disabled={!state.duration} onChange={(event) => musicSession.seek(Number(event.target.value))} style={{ "--music-mini-progress": `${state.duration ? state.time / state.duration * 100 : 0}%` } as CSSProperties} /><time>{formatMusicTime(state.duration)}</time></div>
        <div className={`music-mini-player__desktop-controls${showVolume ? " volume-open" : ""}`}>
          <div className="music-mini-player__options">
            {canChangeTrack && <button className="music-mini-player__button music-mini-player__mode" type="button" aria-label={`${playbackModeLabel}，切换播放模式`} title={playbackModeLabel} aria-pressed={state.repeat || state.shuffle} onClick={() => { if (state.repeat || state.shuffle) musicSession.toggleShuffle(); else musicSession.toggleRepeat(); }}>
              <span className="music-mini-player__mode-icon" key={playbackMode}>{state.repeat ? <RepeatOnce size={17} /> : state.shuffle ? <Shuffle size={17} /> : <Repeat size={17} />}</span>
            </button>}
          </div>
          <div className="music-mini-player__transport" inert={showVolume}>{controls}</div>
          <div className={`music-mini-player__volume${showVolume ? " is-open" : ""}`}>
            <button className="music-mini-player__button" type="button" aria-label="调节音量" aria-expanded={showVolume} aria-controls="music-mini-volume" onClick={() => setShowVolume((value) => !value)}>
              <span className="music-mini-player__control-icon" key={String(state.volume === 0)}>{state.volume === 0 ? <SpeakerSlash size={17} /> : <SpeakerHigh size={17} />}</span>
            </button>
            <div className="music-mini-player__volume-slider" id="music-mini-volume" aria-hidden={!showVolume} inert={!showVolume}>
              <input type="range" aria-label="音乐音量" min="0" max="1" step=".01" value={state.volume} onChange={(event) => musicSession.setVolume(Number(event.currentTarget.value))} style={{ "--music-mini-volume": `${state.volume * 100}%` } as CSSProperties} />
            </div>
          </div>
        </div>
      </div>
    </section>
    <section className="music-mini-player__mobile" aria-label="全局音乐播放器">
      <div className="music-mini-player__mobile-actions">
        <button className="music-mini-player__button music-mini-player__button--play music-mini-player__button--compact" type="button" aria-label={state.playing ? "暂停全局音乐" : "播放全局音乐"} aria-pressed={state.playing} aria-busy={state.buffering} disabled={!hasTracks} onClick={musicSession.toggle}>
          {state.playing ? <Pause size={15} weight="fill" /> : <Play size={15} weight="fill" />}
        </button>
      </div>
    </section>
  </div>;
}
