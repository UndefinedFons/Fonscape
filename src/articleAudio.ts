interface ArticleAudioTrack {
  src: string;
}

let primedAudio: HTMLAudioElement | null = null;
let primedAudioSrc = "";
let playingAudio: HTMLAudioElement | null = null;
const audioPool = new Set<HTMLAudioElement>();
const globalMusicAudio = new WeakSet<HTMLAudioElement>();

function createAudio(track: ArticleAudioTrack, owner: "article" | "music" = "article"): HTMLAudioElement {
  const audio = new Audio(track.src);
  audio.preload = "auto";
  audio.volume = 1;
  audio.loop = true;
  audio.load();
  audioPool.add(audio);
  if (owner === "music") globalMusicAudio.add(audio);
  return audio;
}

function acquireAudio(track: ArticleAudioTrack, owner: "article" | "music" = "article"): HTMLAudioElement {
  if (owner === "article" && primedAudio && primedAudioSrc === track.src) return primedAudio;
  return createAudio(track, owner);
}

function activateAudio(audio: HTMLAudioElement): void {
  audioPool.forEach((item) => {
    if (item !== audio && !item.paused) item.pause();
  });
  playingAudio = audio;
}

function releaseAudio(audio: HTMLAudioElement): void {
  audio.pause();
  audio.currentTime = 0;
  audioPool.delete(audio);
  if (playingAudio === audio) playingAudio = null;
  if (primedAudio === audio) {
    primedAudio = null;
    primedAudioSrc = "";
  }
}

function deactivateAudio(audio: HTMLAudioElement): void {
  if (playingAudio === audio) playingAudio = null;
}

export function stopArticleAudio(): void {
  audioPool.forEach((audio) => {
    if (globalMusicAudio.has(audio)) return;
    audio.pause();
    audio.currentTime = 0;
    audioPool.delete(audio);
    if (playingAudio === audio) playingAudio = null;
  });
  primedAudio = null;
  primedAudioSrc = "";
}

export function primeArticleAudio(track: ArticleAudioTrack): void {
  if (!track || typeof Audio === "undefined") return;
  stopArticleAudio();
  primedAudio = createAudio(track);
  primedAudioSrc = track.src;
  primedAudio.currentTime = 0;
  activateAudio(primedAudio);
  primedAudio.play().catch(() => {});
}

export { acquireAudio, activateAudio, deactivateAudio, releaseAudio };
