/** @typedef {{ src: string }} ArticleAudioTrack */

/** @type {HTMLAudioElement | null} */
let primedAudio = null;
let primedAudioSrc = "";
/** @type {HTMLAudioElement | null} */
let playingAudio = null;
/** @type {Set<HTMLAudioElement>} */
const audioPool = new Set();

/** @param {ArticleAudioTrack} track */
function createAudio(track) {
  const audio = new Audio(track.src);
  audio.preload = "auto";
  audio.volume = 1;
  audio.loop = true;
  audio.load();
  audioPool.add(audio);
  return audio;
}

/** @param {ArticleAudioTrack} track */
function acquireAudio(track) {
  if (primedAudio && primedAudioSrc === track.src) return primedAudio;
  return createAudio(track);
}

/** @param {HTMLAudioElement} audio */
function activateAudio(audio) {
  audioPool.forEach((item) => {
    if (item !== audio && !item.paused) item.pause();
  });
  playingAudio = audio;
}

/** @param {HTMLAudioElement} audio */
function releaseAudio(audio) {
  audio.pause();
  audio.currentTime = 0;
  audioPool.delete(audio);
  if (playingAudio === audio) playingAudio = null;
  if (primedAudio === audio) {
    primedAudio = null;
    primedAudioSrc = "";
  }
}

/** @param {HTMLAudioElement} audio */
function deactivateAudio(audio) {
  if (playingAudio === audio) playingAudio = null;
}

export function stopArticleAudio() {
  audioPool.forEach((audio) => {
    audio.pause();
    audio.currentTime = 0;
  });
  audioPool.clear();
  primedAudio = null;
  primedAudioSrc = "";
  playingAudio = null;
}

/** @param {ArticleAudioTrack} track */
export function primeArticleAudio(track) {
  if (!track || typeof Audio === "undefined") return;
  stopArticleAudio();
  primedAudio = createAudio(track);
  primedAudioSrc = track.src;
  primedAudio.currentTime = 0;
  activateAudio(primedAudio);
  primedAudio.play().catch(() => {});
}

export { acquireAudio, activateAudio, deactivateAudio, releaseAudio };
