import assert from "node:assert/strict";
import test from "node:test";
import { parseMusicReview, parseMusicReviewMetadata } from "../src/content/frontmatter.ts";
import { acquireAudio, activateAudio, releaseAudio, primeArticleAudio, stopArticleAudio } from "../src/articleAudio.ts";
import { createMusicSession } from "../src/musicSession.ts";
import { parseMusicLyrics, activeLyricIndex, centerLyricLine } from "../src/musicLyrics.ts";

class AudioFixture {
  static instances = [];
  constructor(src) { this.src = src; this.paused = true; this.ended = false; this.currentTime = 0; this.duration = 90; this.volume = 1; this.loadCount = 0; this.listeners = new Map(); AudioFixture.instances.push(this); }
  load() { this.loadCount += 1; }
  removeAttribute(name) { if (name === "src") this.src = ""; }
  addEventListener(event, listener) { this.listeners.set(event, listener); }
  removeEventListener(event) { this.listeners.delete(event); }
  emit(event) { this.listeners.get(event)?.(); }
  async play() { this.paused = false; this.emit("play"); }
  pause() { this.paused = true; this.emit("pause"); }
}
class DeferredPlayAudio extends AudioFixture {
  static deferNextPlay = false;
  static rejectNextPlay = false;
  async play() {
    this.paused = false;
    if (DeferredPlayAudio.rejectNextPlay) {
      DeferredPlayAudio.rejectNextPlay = false;
      throw new Error("NotAllowedError");
    }
    if (!DeferredPlayAudio.deferNextPlay) return super.play();
    DeferredPlayAudio.deferNextPlay = false;
    return new Promise((resolve) => {
      this.finishPendingPlay = () => {
        this.emit("play");
        this.emit("playing");
        resolve();
      };
    });
  }
}
const entry = (id) => ({ title: `Song ${id}`, slug: id, kind: "歌曲", section: "songs", date: "2026-10-02", url: `https://music.163.com/song?id=${id}` });
const tracks = (id) => [0, 1].map((index) => ({ id: `${id}-${index}`, source: "netease", title: `Track ${index}`, artist: "Artist", cover: "", src: `/audio/${id}-${index}`, lyricUrl: `/lyrics/${id}-${index}` }));
const threeTracks = (id) => [0, 1, 2].map((index) => ({ id: `${id}-${index}`, source: "netease", title: `Track ${index}`, artist: "Artist", cover: "", src: `/audio/${id}-${index}`, lyricUrl: `/lyrics/${id}-${index}` }));

test("timed lyrics sort repeated timestamps, apply offset and pair translation", () => {
  const lines = parseMusicLyrics("[offset:-500]\n[00:20.00]Later\n[00:02.00][00:10.50]Early\n[ar:Artist]\n[00:30.00]", "[00:01.50]译文\n[00:19.50]稍后");
  assert.deepEqual(lines, [{ time: 1.5, text: "Early", translation: "译文" }, { time: 10, text: "Early" }, { time: 19.5, text: "Later", translation: "稍后" }]);
  assert.equal(activeLyricIndex(lines, 1), -1);
  assert.equal(activeLyricIndex(lines, 10.1), 1);
  assert.equal(activeLyricIndex(lines, 20), 2);
  assert.deepEqual(parseMusicLyrics("[ar:Artist]\n纯音乐"), []);
});

test("music queue advances, seeks, pauses, repeats and stops without waiting for lyrics", async () => {
  const previousAudio = globalThis.Audio;
  const previousFetch = globalThis.fetch;
  globalThis.Audio = AudioFixture;
  globalThis.fetch = async (url) => new Response(JSON.stringify(String(url).startsWith("/lyrics/") ? { lyric: "", translation: "" } : { tracks: tracks("1"), truncated: false }), { headers: { "Content-Type": "application/json" } });
  const session = createMusicSession();
  try {
    await session.load(entry("1"));
    assert.equal(session.getSnapshot().playing, true);
    const first = AudioFixture.instances.at(-1);
    first.emit("loadedmetadata");
    session.seek(120);
    assert.equal(first.currentTime, 90);
    session.setVolume(.25);
    assert.equal(first.volume, .25);
    session.toggle();
    assert.equal(session.getSnapshot().playing, false);
    first.emit("ended");
    assert.equal(session.getSnapshot().index, 1);
    assert.equal(first.listeners.size, 0);
    assert.equal(first.src, "", "switching tracks cancels the abandoned media download");
    const second = AudioFixture.instances.at(-1);
    assert.equal(second.volume, .25);
    session.toggleRepeat();
    second.currentTime = 90;
    second.emit("ended");
    assert.equal(second.currentTime, 0);
    assert.equal(session.getSnapshot().index, 1);
    session.toggleRepeat();
    second.emit("ended");
    assert.equal(session.getSnapshot().index, 0, "the last album track returns to the first");
    assert.equal(session.getSnapshot().playing, true);
    session.stop();
    assert.equal(second.paused, true);
    assert.equal(second.src, "", "leaving music releases its media resource");
    assert.equal(second.listeners.size, 0);
    assert.deepEqual(session.getSnapshot().tracks, []);
  } finally { session.stop(); globalThis.Audio = previousAudio; globalThis.fetch = previousFetch; }
});

test("autoplay track switches keep the playing state until playback starts, while pause cancels pending play", async () => {
  const previousAudio = globalThis.Audio;
  const previousFetch = globalThis.fetch;
  globalThis.Audio = DeferredPlayAudio;
  globalThis.fetch = async (url) => new Response(JSON.stringify(String(url).startsWith("/lyrics/") ? { lyric: "", translation: "" } : { tracks: tracks("switch"), truncated: false }));
  const session = createMusicSession();
  DeferredPlayAudio.deferNextPlay = false;
  DeferredPlayAudio.rejectNextPlay = false;
  try {
    await session.load(entry("5151"));
    assert.equal(session.getSnapshot().playing, true);

    DeferredPlayAudio.deferNextPlay = true;
    session.nextTrack();
    const pending = AudioFixture.instances.at(-1);
    assert.equal(session.getSnapshot().index, 1);
    assert.equal(session.getSnapshot().playing, true, "the previous playing state spans the audio handoff");
    assert.equal(session.getSnapshot().buffering, true);

    session.toggle();
    assert.equal(session.getSnapshot().playing, false, "an explicit pause collapses immediately");
    assert.equal(session.getSnapshot().buffering, false);
    assert.equal(pending.paused, true);
    pending.finishPendingPlay();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(session.getSnapshot().playing, false, "a canceled play promise cannot restore the playing state");

    session.selectTrack(0);
    assert.equal(session.getSnapshot().playing, true, "selecting a track while paused still autoplays");
    session.toggle();
    DeferredPlayAudio.rejectNextPlay = true;
    session.selectTrack(1);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(session.getSnapshot().playing, false, "a rejected autoplay clears the preserved playing state");
    assert.equal(session.getSnapshot().buffering, false);
  } finally {
    session.stop();
    globalThis.Audio = previousAudio;
    globalThis.fetch = previousFetch;
  }
});

test("a natural-end pause event does not collapse the active collection during auto-advance", async () => {
  const previousAudio = globalThis.Audio;
  const previousFetch = globalThis.fetch;
  globalThis.Audio = AudioFixture;
  globalThis.fetch = async (url) => new Response(JSON.stringify(String(url).startsWith("/lyrics/") ? { lyric: "", translation: "" } : { tracks: tracks("natural-end"), truncated: false }));
  const session = createMusicSession();
  try {
    await session.load(entry("5155"));
    const states = [];
    const unsubscribe = session.subscribe(() => states.push(session.getSnapshot()));
    const first = AudioFixture.instances.at(-1);
    first.ended = true;
    first.paused = true;
    first.emit("pause");
    first.emit("ended");

    assert.equal(session.getSnapshot().entry.slug, "5155");
    assert.equal(session.getSnapshot().index, 1);
    assert.equal(session.getSnapshot().playing, true);
    assert.ok(states.every((state) => state.playing), "a natural-end pause must not publish a collapsed state before the next track starts");
    unsubscribe();
  } finally { session.stop(); globalThis.Audio = previousAudio; globalThis.fetch = previousFetch; }
});

test("a media retry ignores delayed reset events and coalesces one error with its play rejection", async () => {
  const previousAudio = globalThis.Audio;
  const previousFetch = globalThis.fetch;
  class OrderedFailureAudio extends AudioFixture {
    static deferNextPlay = false;
    constructor(src) { super(src); this.emitResetEventsOnLoad = false; }
    load() {
      this.loadCount += 1;
      if (this.emitResetEventsOnLoad) setImmediate(() => { this.emit("pause"); this.emit("abort"); });
    }
    pause() {
      this.paused = true;
      if (this.emitResetEventsOnLoad) setImmediate(() => this.emit("pause"));
      else this.emit("pause");
    }
    async play() {
      this.paused = false;
      if (!OrderedFailureAudio.deferNextPlay) return super.play();
      OrderedFailureAudio.deferNextPlay = false;
      return new Promise((resolve, reject) => {
        this.rejectPendingPlay = () => reject(new Error("NotSupportedError"));
      });
    }
  }
  globalThis.Audio = OrderedFailureAudio;
  globalThis.fetch = async (url) => new Response(JSON.stringify(String(url).startsWith("/lyrics/") ? { lyric: "", translation: "" } : { tracks: tracks("retry"), truncated: false }));
  try {
    for (const errorEventFirst of [true, false]) {
      const session = createMusicSession();
      const before = AudioFixture.instances.length;
      OrderedFailureAudio.deferNextPlay = true;
      try {
        await session.load(entry(errorEventFirst ? "5153" : "5154"));
        const failedAudio = AudioFixture.instances.at(-1);
        failedAudio.error = { code: 2 };
        failedAudio.emitResetEventsOnLoad = true;

        if (errorEventFirst) {
          failedAudio.emit("error");
          failedAudio.rejectPendingPlay();
        } else {
          failedAudio.rejectPendingPlay();
          await new Promise((resolve) => setImmediate(resolve));
          failedAudio.emit("error");
        }
        await new Promise((resolve) => setImmediate(resolve));

        const retryAudio = AudioFixture.instances.at(-1);
        assert.notEqual(retryAudio, failedAudio, "retry uses a fresh media element");
        assert.equal(AudioFixture.instances.length, before + 2, "the paired error and play rejection start only one retry");
        assert.equal(failedAudio.listeners.size, 0, "late pause, abort, and error events are detached from the failed attempt");
        assert.equal(session.getSnapshot().playing, true, "reset pause events do not discard the playback intent");
        assert.equal(session.getSnapshot().error, "");

        failedAudio.emit("error");
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(AudioFixture.instances.length, before + 2, "a late duplicate error cannot trigger another retry");
        retryAudio.error = { code: 2 };
        retryAudio.emit("error");
        assert.equal(session.getSnapshot().playing, false);
        assert.equal(session.getSnapshot().error, "这首歌暂时无法播放，可重试或前往音乐平台收听。");
      } finally { session.stop(); }
    }
  } finally { globalThis.Audio = previousAudio; globalThis.fetch = previousFetch; }
});

test("shuffle advances in both directions without selecting the current track and excludes repeat", async () => {
  const previousAudio = globalThis.Audio;
  const previousFetch = globalThis.fetch;
  const previousRandom = Math.random;
  globalThis.Audio = AudioFixture;
  globalThis.fetch = async (url) => new Response(JSON.stringify(String(url).startsWith("/lyrics/") ? { lyric: "", translation: "" } : { tracks: threeTracks("shuffle"), truncated: false }));
  const session = createMusicSession();
  try {
    await session.load(entry("5152"));
    session.toggleRepeat();
    assert.equal(session.getSnapshot().repeat, true);
    session.toggleShuffle();
    assert.equal(session.getSnapshot().repeat, false);
    assert.equal(session.getSnapshot().shuffle, true);

    Math.random = () => 0.999;
    session.nextTrack();
    assert.equal(session.getSnapshot().index, 2, "next chooses a different track while shuffling");

    Math.random = () => 0;
    session.previousTrack();
    assert.equal(session.getSnapshot().index, 0, "previous also chooses a different track while shuffling");

    Math.random = () => 0.999;
    AudioFixture.instances.at(-1).emit("ended");
    assert.equal(session.getSnapshot().index, 2, "ended uses the same shuffle selection as manual next");

    session.toggleRepeat();
    assert.equal(session.getSnapshot().repeat, true);
    assert.equal(session.getSnapshot().shuffle, false, "repeat and shuffle stay mutually exclusive");
    session.toggleRepeat();
    session.nextTrack();
    assert.equal(session.getSnapshot().index, 0, "manual next keeps sequential order when shuffle is off");
    session.previousTrack();
    assert.equal(session.getSnapshot().index, 2, "manual previous wraps in sequential order when shuffle is off");
  } finally {
    session.stop();
    Math.random = previousRandom;
    globalThis.Audio = previousAudio;
    globalThis.fetch = previousFetch;
  }
});

test("abandoned library requests cannot replace a newer selection; failed lyrics do not hide playback", async () => {
  const previousAudio = globalThis.Audio;
  const previousFetch = globalThis.fetch;
  globalThis.Audio = AudioFixture;
  let finishFirst;
  let firstSignal;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("/lyrics/")) return new Response(null, { status: 502 });
    if (String(url).endsWith("id=1")) { firstSignal = init.signal; return new Promise((resolve) => { finishFirst = resolve; }); }
    return new Response(JSON.stringify({ tracks: tracks("2"), truncated: false }));
  };
  const session = createMusicSession();
  try {
    const abandoned = session.load(entry("1"));
    await session.load(entry("2"));
    assert.equal(firstSignal.aborted, true);
    finishFirst(new Response(JSON.stringify({ tracks: tracks("1"), truncated: false })));
    await abandoned;
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(session.getSnapshot().entry.slug, "2");
    assert.equal(session.getSnapshot().tracks[0].id, "2-0");
    assert.equal(session.getSnapshot().playing, true);
    assert.equal(session.getSnapshot().lyricStatus, "error");
  } finally { session.stop(); globalThis.Audio = previousAudio; globalThis.fetch = previousFetch; }
});


test("a pure listening entry publishes without a note body", () => {
  const raw = ['---', 'title: "A song"', 'kind: "歌曲"', 'date: "2026-10-02"', 'url: "https://music.163.com/song?id=123"', '---', ''].join("\n");
  const entry = parseMusicReview("src/content/music/a-song.md", raw);
  assert.equal(entry.content, "");
  assert.equal(entry.wordCount, 0);
  assert.equal(parseMusicReviewMetadata("src/content/music/a-song.md", raw).title, "A song");
  assert.throws(() => parseMusicReview("invalid.md", raw.replace('title: "A song"', '')), /title/u);
});


test("lyric centering stays relative to its viewport after document scrolling", () => {
  const scrolls = [];
  const container = { scrollTop: 360, clientHeight: 250, getBoundingClientRect: () => ({ top: -120 }), scrollTo: (options) => scrolls.push(options) };
  const line = { clientHeight: 62, getBoundingClientRect: () => ({ top: 130 }) };
  centerLyricLine(container, line, false);
  assert.deepEqual(scrolls, [{ top: 516, behavior: "smooth" }]);
  container.getBoundingClientRect = () => ({ top: 500 });
  line.getBoundingClientRect = () => ({ top: 750 });
  centerLyricLine(container, line, true);
  assert.deepEqual(scrolls[1], { top: 516, behavior: "instant" });
});

test("a single song restarts after ending and autoplay rejection stays silent", async () => {
  const previousAudio = globalThis.Audio;
  const previousFetch = globalThis.fetch;
  globalThis.Audio = AudioFixture;
  globalThis.fetch = async (url) => new Response(JSON.stringify(String(url).startsWith("/lyrics/") ? { lyric: "", translation: "" } : { tracks: [tracks("1")[0]], truncated: false }));
  const session = createMusicSession();
  try {
    await session.load(entry("1"));
    const audio = AudioFixture.instances.at(-1);
    session.toggleShuffle();
    assert.equal(session.getSnapshot().shuffle, false, "single-track queues cannot enable shuffle");
    audio.currentTime = 90;
    audio.emit("ended");
    assert.equal(audio.currentTime, 0);
    assert.equal(session.getSnapshot().playing, true);
    session.toggle();
    audio.play = async () => { throw new Error("NotAllowedError"); };
    session.toggle();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(session.getSnapshot().error, "");
    assert.equal(session.getSnapshot().playing, false);
  } finally { session.stop(); globalThis.Audio = previousAudio; globalThis.fetch = previousFetch; }
});


test("global music and article accompaniment stay mutually exclusive across repeated switches", async () => {
  const previousAudio = globalThis.Audio;
  globalThis.Audio = AudioFixture;
  const music = acquireAudio({ src: "/global.mp3" }, "music");
  try {
    activateAudio(music);
    await music.play();
    music.currentTime = 35;
    primeArticleAudio({ src: "/article.mp3" });
    const article = AudioFixture.instances.at(-1);
    assert.equal(music.paused, true);
    assert.equal(music.currentTime, 35, "article autoplay preserves the global position");
    assert.equal(article.paused, false);
    activateAudio(music);
    await music.play();
    assert.equal(article.paused, true);
    activateAudio(article);
    await article.play();
    assert.equal(music.paused, true, "the global player remains registered after article priming");
    activateAudio(music);
    await music.play();
    stopArticleAudio();
    assert.equal(music.paused, false, "leaving an article does not stop global music");
  } finally { releaseAudio(music); stopArticleAudio(); globalThis.Audio = previousAudio; }
});
