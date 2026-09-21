import assert from "node:assert/strict";
import test from "node:test";
import { isMetingSongTarget } from "../functions/_generated/content-targets.js";
import { ApiError } from "../functions/_lib/community.js";
import { musicAudio, musicMetadata, resolveMetingAudioUrl, resolveMetingSong } from "../functions/_lib/music.js";
import { parseMetingSongUrl } from "../src/musicSources.js";

class FakeMeting {
  constructor(source) {
    this.source = source;
  }

  format() {
    return this;
  }

  async song(id) {
    return JSON.stringify([{ name: "测试歌曲", artist: ["歌手甲", "歌手乙"], pic_id: "cover-id", url_id: id, source: this.source }]);
  }

  async pic(id, size) {
    assert.equal(id, "cover-id");
    assert.equal(size, 300);
    return JSON.stringify({ url: "https://images.example.test/cover.jpg" });
  }

  async url(id, bitrate) {
    assert.equal(bitrate, 320);
    const url = id === "unavailable" ? "" : id === "unsafe" ? "javascript:alert(1)" : "https://audio.example.test/song.mp3";
    return JSON.stringify({ url: url === "https://audio.example.test/song.mp3" ? "http://audio.example.test/song.mp3" : url });
  }
}

test("Meting song URLs accept direct NetEase and QQ Music links only", () => {
  assert.deepEqual(
    parseMetingSongUrl("https://music.163.com/song?id=27557102&uct2=value"),
    { source: "netease", id: "27557102" },
  );
  assert.deepEqual(
    parseMetingSongUrl("https://music.163.com/#/song?id=123456"),
    { source: "netease", id: "123456" },
  );
  assert.deepEqual(
    parseMetingSongUrl("https://y.qq.com/n/ryqq/songDetail/0039MnYb0qxYhV"),
    { source: "tencent", id: "0039MnYb0qxYhV" },
  );
  assert.equal(parseMetingSongUrl("https://music.163.com/album?id=34720827"), null);
  assert.equal(parseMetingSongUrl("https://example.com/song?id=27557102"), null);
});

test("Meting normalization produces the existing local-track contract", async () => {
  const track = await resolveMetingSong({ source: "netease", id: "27557102" }, FakeMeting);
  assert.deepEqual(track, {
    source: "netease",
    id: "27557102",
    title: "测试歌曲",
    artist: "歌手甲 / 歌手乙",
    cover: "https://images.example.test/cover.jpg",
    src: "/api/music/audio?source=netease&id=27557102",
  });
  assert.equal(await resolveMetingAudioUrl("netease", "27557102", FakeMeting), "https://audio.example.test/song.mp3");
  await assert.rejects(
    resolveMetingAudioUrl("tencent", "unavailable", FakeMeting),
    (error) => error instanceof ApiError && error.status === 404 && error.code === "music_unavailable",
  );
  await assert.rejects(
    resolveMetingAudioUrl("tencent", "unsafe", FakeMeting),
    (error) => error instanceof ApiError && error.status === 502 && error.code === "music_provider_invalid",
  );
});

test("public music endpoints reject songs that are not referenced by content", async () => {
  let unconfiguredId = "1";
  while (isMetingSongTarget("netease", unconfiguredId)) unconfiguredId = String(Number(unconfiguredId) + 1);
  await assert.rejects(
    musicMetadata({}, new URL(`https://example.test/api/music/resolve?source=netease&id=${unconfiguredId}`)),
    (error) => error instanceof ApiError && error.status === 404 && error.code === "music_not_configured",
  );
  await assert.rejects(
    musicAudio({}, new URL(`https://example.test/api/music/audio?source=netease&id=${unconfiguredId}`)),
    (error) => error instanceof ApiError && error.status === 404 && error.code === "music_not_configured",
  );
  await assert.rejects(
    musicMetadata({}, new URL("https://example.test/api/music/resolve?source=netease&id=27557102&cacheBust=1")),
    (error) => error instanceof ApiError && error.status === 400 && error.code === "invalid_music_source",
  );
});
