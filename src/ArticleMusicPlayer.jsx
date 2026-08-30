import { useEffect, useRef, useState } from "react";
import { Disc } from "@phosphor-icons/react/Disc";
import { MusicNotes } from "@phosphor-icons/react/MusicNotes";
import { Pause } from "@phosphor-icons/react/Pause";
import { Play } from "@phosphor-icons/react/Play";
import { SpeakerHigh } from "@phosphor-icons/react/SpeakerHigh";
import { X } from "@phosphor-icons/react/X";
import { acquireAudio, activateAudio, deactivateAudio, releaseAudio } from "./articleAudio.js";
import { responsiveImageProps } from "./responsiveImages.ts";

export { primeArticleAudio, stopArticleAudio } from "./articleAudio.js";

const formatAudioTime = (value) => {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
};

export function ArticleMusicPlayer({ track, autoplay = true }) {
  const audioRef = useRef(null);
  const seekingRef = useRef(false);
  const volumeRef = useRef(1);
  const trackSrc = track.src;
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [buffering, setBuffering] = useState(true);

  useEffect(() => {
    const audio = acquireAudio({ src: trackSrc });
    audioRef.current = audio;
    const updateDuration = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const updateTime = () => !seekingRef.current && setCurrentTime(audio.currentTime);
    const markSeeked = () => { seekingRef.current = false; setCurrentTime(audio.currentTime); };
    const markLoading = () => setBuffering(true);
    const markReady = () => setBuffering(false);
    const markPlaying = () => { activateAudio(audio); setPlaying(true); setBuffering(false); };
    const markPaused = () => { deactivateAudio(audio); setPlaying(false); };
    const markEnded = () => { audio.currentTime = 0; setCurrentTime(0); audio.play().catch(() => setPlaying(false)); };
    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("durationchange", updateDuration);
    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("seeked", markSeeked);
    audio.addEventListener("loadstart", markLoading);
    audio.addEventListener("waiting", markLoading);
    audio.addEventListener("stalled", markLoading);
    audio.addEventListener("canplay", markReady);
    audio.addEventListener("play", markPlaying);
    audio.addEventListener("playing", markPlaying);
    audio.addEventListener("pause", markPaused);
    audio.addEventListener("ended", markEnded);
    audio.volume = volumeRef.current;
    if (audio.readyState >= 1) updateDuration();
    if (audio.readyState >= 3) markReady();
    updateTime();
    setPlaying(!audio.paused);
    setAutoplayBlocked(false);
    if (autoplay) {
      activateAudio(audio);
      const playback = audio.paused ? audio.play() : Promise.resolve();
      playback.then(() => setPlaying(true)).catch(() => { setPlaying(false); setAutoplayBlocked(true); });
    } else {
      audio.pause();
      audio.currentTime = 0;
      setCurrentTime(0);
      setPlaying(false);
    }
    return () => {
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("durationchange", updateDuration);
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("seeked", markSeeked);
      audio.removeEventListener("loadstart", markLoading);
      audio.removeEventListener("waiting", markLoading);
      audio.removeEventListener("stalled", markLoading);
      audio.removeEventListener("canplay", markReady);
      audio.removeEventListener("play", markPlaying);
      audio.removeEventListener("playing", markPlaying);
      audio.removeEventListener("pause", markPaused);
      audio.removeEventListener("ended", markEnded);
      releaseAudio(audio);
      audioRef.current = null;
    };
  }, [trackSrc, autoplay]);

  useEffect(() => {
    volumeRef.current = volume;
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        activateAudio(audio);
        if (audio.ended) audio.currentTime = 0;
        await audio.play();
        setPlaying(true);
        setAutoplayBlocked(false);
      } catch { setPlaying(false); }
    } else {
      audio.pause();
      setPlaying(false);
    }
  };
  const seek = (event) => {
    const nextTime = Number(event.target.value);
    if (!audioRef.current || !Number.isFinite(nextTime)) return;
    const targetTime = Math.max(0, Math.min(nextTime, duration || nextTime));
    seekingRef.current = true;
    try { audioRef.current.currentTime = targetTime; } catch { seekingRef.current = false; return; }
    setCurrentTime(targetTime);
  };
  const changeVolume = (event) => {
    const nextVolume = Math.max(0, Math.min(1, Number(event.target.value)));
    if (!audioRef.current || !Number.isFinite(nextVolume)) return;
    audioRef.current.volume = nextVolume;
    setVolume(nextVolume);
  };
  const progress = duration ? Math.min(100, (currentTime / duration) * 100) : 0;
  const volumeProgress = volume * 100;

  return <section className={`article-music-player${volumeOpen ? " has-volume-open" : ""}`} aria-label={`文章配乐：${track.title}`}>
    <div className={`article-music-art${track.cover ? "" : " article-music-art--vinyl"}`}>{track.cover ? <img src={track.cover} {...responsiveImageProps(track.cover, "(max-width: 760px) 72px, 78px")} alt={`${track.title}的音乐封面`} /> : <Disc size={46} weight="duotone" aria-label="默认黑胶唱片封面" />}<button className={`article-music-toggle${playing ? " is-playing" : ""}`} type="button" onClick={togglePlayback} aria-label={playing ? "暂停文章配乐" : "播放文章配乐"} aria-pressed={playing}><span className="article-music-toggle-icon article-music-toggle-icon--play"><Play size={18} weight="fill" /></span><span className="article-music-toggle-icon article-music-toggle-icon--pause"><Pause size={18} weight="fill" /></span></button></div>
    <div className="article-music-copy"><span className="article-music-kicker"><MusicNotes size={14} weight="duotone" />文章配乐{autoplayBlocked ? <em>点击播放</em> : buffering && <em>正在加载</em>}</span><strong>{track.title}</strong><small>{track.artist}</small><div className="article-music-timeline"><time>{formatAudioTime(currentTime)}</time><input type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime, duration || 0)} onInput={seek} onChange={seek} aria-label="文章配乐播放进度" style={{ "--music-progress": `${progress}%` }} /><time>{formatAudioTime(duration)}</time></div></div>
    <div className={`article-music-volume${volumeOpen ? " is-open" : ""}`}><button type="button" onClick={() => setVolumeOpen((value) => !value)} aria-label={volumeOpen ? "收起文章配乐音量" : "调节文章配乐音量"} aria-expanded={volumeOpen}><span className="icon-swap article-music-volume-icon" key={volumeOpen ? "close" : "volume"}>{volumeOpen ? <X size={17} /> : <SpeakerHigh size={17} />}</span></button></div>
    <div className="article-music-volume-panel" aria-hidden={!volumeOpen}><SpeakerHigh size={17} /><input type="range" min="0" max="1" step="0.01" value={volume} onInput={changeVolume} onChange={changeVolume} aria-label="文章配乐音量" tabIndex={volumeOpen ? 0 : -1} style={{ "--music-volume": `${volumeProgress}%` }} /><span>{Math.round(volumeProgress)}%</span></div>
  </section>;
}
