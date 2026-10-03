import { acquireAudio, activateAudio, deactivateAudio, releaseAudio } from "./articleAudio.ts";
import { parseMetingLibraryUrl } from "./musicSources.ts";
import { parseMusicLyrics } from "./musicLyrics.ts";
import type { LyricLine } from "./musicLyrics.ts";
import type { MusicLibraryResult, MusicLibraryTrack } from "./musicTypes.ts";
import type { MusicReviewMetadata } from "./types.ts";

export interface MusicSessionState {
  entry: MusicReviewMetadata | null;
  tracks: MusicLibraryTrack[];
  index: number;
  status: "idle" | "loading" | "ready" | "error";
  playing: boolean;
  buffering: boolean;
  time: number;
  duration: number;
  volume: number;
  repeat: boolean;
  shuffle: boolean;
  error: string;
  lyrics: LyricLine[];
  lyricStatus: "idle" | "loading" | "ready" | "error";
  truncated: boolean;
}

const initialState = (): MusicSessionState => ({ entry: null, tracks: [], index: 0, status: "idle", playing: false, buffering: false, time: 0, duration: 0, volume: 1, repeat: false, shuffle: false, error: "", lyrics: [], lyricStatus: "idle", truncated: false });

/** One session for the music routes, sharing the site's single-audio ownership. */
export function createMusicSession() {
  let state = initialState();
  let audio: HTMLAudioElement | null = null;
  let detachAudio: (() => void) | null = null;
  let request: AbortController | null = null;
  let lyricRequest: AbortController | null = null;
  let generation = 0;
  let playbackIntent = 0;
  let wantsPlayback = false;
  let retrySource: (() => boolean) | null = null;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<MusicSessionState>) => { state = { ...state, ...patch }; listeners.forEach((notify) => notify()); };
  const clearAudio = () => {
    playbackIntent += 1;
    wantsPlayback = false;
    retrySource = null;
    detachAudio?.();
    detachAudio = null;
    if (audio) {
      releaseAudio(audio);
      audio.removeAttribute("src");
      audio.load();
    }
    audio = null;
    lyricRequest?.abort();
  };
  const play = async () => {
    const current = audio;
    if (!current) return;
    const currentIntent = ++playbackIntent;
    wantsPlayback = true;
    update({ error: "" });
    try {
      activateAudio(current);
      await current.play();
      if (current === audio && currentIntent === playbackIntent && wantsPlayback) {
        update({ playing: true, buffering: false, error: "" });
      }
    } catch {
      if (current === audio && currentIntent === playbackIntent) {
        if (current.error && retrySource?.()) return;
        wantsPlayback = false;
        deactivateAudio(current);
        update({ playing: false, buffering: false, error: current.error ? "这首歌暂时无法播放，可重试或前往音乐平台收听。" : "" });
      }
    }
  };
  const selectTrack = (index: number, autoplay = true, preservePlaying = state.playing) => {
    const track = state.tracks[index];
    if (!track) return;
    clearAudio();
    wantsPlayback = autoplay;
    update({ index, time: 0, duration: 0, playing: autoplay && preservePlaying, buffering: autoplay, error: "", lyrics: [], lyricStatus: "loading" });
    const installAudio = (sourceRefreshes: number) => {
      const current = acquireAudio({ src: track.src }, "music");
      audio = current;
      current.loop = false;
      current.volume = state.volume;
      retrySource = () => {
        if (current !== audio || sourceRefreshes >= 1) return false;
        const resumePlayback = wantsPlayback;
        // A media error and the rejected play() promise can describe the same
        // failed source. Detach that source before replacing it so late pause,
        // abort, error, or promise events cannot erase the resume intent or
        // count the same failure twice.
        detachAudio?.();
        detachAudio = null;
        audio = null;
        releaseAudio(current);
        current.removeAttribute("src");
        current.load();
        installAudio(sourceRefreshes + 1);
        update({ buffering: resumePlayback, error: "" });
        if (resumePlayback) void play();
        return true;
      };
      const events: Record<string, () => void> = {
        loadedmetadata: () => update({ duration: Number.isFinite(current.duration) ? current.duration : 0 }),
        durationchange: () => update({ duration: Number.isFinite(current.duration) ? current.duration : 0 }),
        timeupdate: () => update({ time: current.currentTime }),
        waiting: () => update({ buffering: true }),
        canplay: () => update({ buffering: false }),
        play: () => {
          if (!wantsPlayback) { current.pause(); return; }
          activateAudio(current);
          update({ playing: true, error: "" });
        },
        playing: () => {
          if (!wantsPlayback) { current.pause(); return; }
          update({ playing: true, buffering: false });
        },
        pause: () => {
          // Browsers can pause the media element as it reaches its natural
          // end before dispatching `ended`. Keep the session expanded until
          // the ended handler advances the track; explicit pauses clear the
          // playback intent before this event and still collapse immediately.
          if (current.ended && wantsPlayback) return;
          wantsPlayback = false;
          playbackIntent += 1;
          deactivateAudio(current);
          update({ playing: false, buffering: false });
        },
        error: () => {
          if (retrySource?.()) return;
          wantsPlayback = false;
          playbackIntent += 1;
          deactivateAudio(current);
          update({ playing: false, buffering: false, error: "这首歌暂时无法播放，可重试或前往音乐平台收听。" });
        },
        ended: () => {
          if (state.repeat || state.tracks.length === 1) { current.currentTime = 0; void play(); }
          else moveToNext(true);
        },
      };
      Object.entries(events).forEach(([name, listener]) => current.addEventListener(name, listener));
      detachAudio = () => Object.entries(events).forEach(([name, listener]) => current.removeEventListener(name, listener));
      if (autoplay) void play();
    };
    installAudio(0);
    const controller = new AbortController();
    lyricRequest = controller;
    fetch(track.lyricUrl, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      .then(async (response) => {
        if (!response.ok) throw new Error("lyrics unavailable");
        const result = await response.json() as { lyric: string; translation: string };
        if (controller.signal.aborted || state.tracks[index] !== track) return;
        update({ lyrics: parseMusicLyrics(result.lyric || "", result.translation || ""), lyricStatus: "ready" });
      }).catch(() => {
        if (!controller.signal.aborted && state.tracks[index] === track) update({ lyricStatus: "error" });
      });
  };
  const randomDifferentTrackIndex = (): number => {
    const length = state.tracks.length;
    if (length <= 1) return state.index;
    const candidate = Math.floor(Math.random() * (length - 1));
    return candidate >= state.index ? candidate + 1 : candidate;
  };
  const nextTrackIndex = (): number => state.shuffle
    ? randomDifferentTrackIndex()
    : state.tracks.length <= 1 ? state.index : (state.index + 1) % state.tracks.length;
  const previousTrackIndex = (): number => state.shuffle
    ? randomDifferentTrackIndex()
    : state.tracks.length <= 1 ? state.index : (state.index - 1 + state.tracks.length) % state.tracks.length;
  const moveToNext = (preservePlaying = state.playing) => {
    if (!state.tracks.length) return;
    selectTrack(nextTrackIndex(), true, preservePlaying);
  };
  const nextTrack = () => moveToNext();
  const previousTrack = () => {
    if (!state.tracks.length) return;
    selectTrack(previousTrackIndex(), true, state.playing);
  };
  const load = async (entry: MusicReviewMetadata) => {
    const target = parseMetingLibraryUrl(entry.url);
    if (!target) return;
    const currentGeneration = ++generation;
    request?.abort();
    clearAudio();
    const controller = new AbortController();
    request = controller;
    update({ entry, tracks: [], index: 0, status: "loading", playing: false, buffering: false, time: 0, duration: 0, error: "", lyrics: [], lyricStatus: "idle", truncated: false });
    try {
      const query = new URLSearchParams({ source: target.source, type: target.type, id: target.id });
      const response = await fetch(`/api/music/library?${query}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) });
      const result = await response.json() as MusicLibraryResult & { error?: string };
      if (!response.ok) throw new Error(result.error || "音乐暂时无法加载，请重试。");
      if (currentGeneration !== generation || controller.signal.aborted) return;
      if (!result.tracks?.length) throw new Error("这里暂时没有可播放的曲目。");
      update({ tracks: result.tracks, status: "ready", truncated: result.truncated });
      selectTrack(0);
    } catch (error) {
      if (currentGeneration === generation && !controller.signal.aborted) update({ status: "error", error: error instanceof Error && error.name !== "TimeoutError" ? error.message : "音乐加载超时，请重试。" });
    }
  };
  const stop = () => {
    generation += 1;
    request?.abort();
    clearAudio();
    update(initialState());
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load,
    selectTrack,
    nextTrack,
    previousTrack,
    toggle: () => {
      if (!audio) return;
      if (wantsPlayback || !audio.paused) {
        wantsPlayback = false;
        playbackIntent += 1;
        audio.pause();
        update({ playing: false, buffering: false });
      } else void play();
    },
    seek: (time: number) => {
      if (!audio || !Number.isFinite(time)) return;
      try { audio.currentTime = Math.max(0, Math.min(time, state.duration || time)); update({ time: audio.currentTime }); } catch { /* A pending media request may not yet be seekable. */ }
    },
    setVolume: (value: number) => {
      if (!Number.isFinite(value)) return;
      const volume = Math.max(0, Math.min(1, value));
      if (audio) audio.volume = volume;
      update({ volume });
    },
    toggleRepeat: () => {
      const repeat = !state.repeat;
      update({ repeat, ...(repeat ? { shuffle: false } : {}) });
    },
    toggleShuffle: () => {
      if (state.tracks.length < 2) return;
      const shuffle = !state.shuffle;
      update({ shuffle, ...(shuffle ? { repeat: false } : {}) });
    },
    stop,
  };
}

export const musicSession = createMusicSession();
