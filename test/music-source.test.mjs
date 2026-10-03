import assert from "node:assert/strict";
import test from "node:test";
import { isMetingLibraryTarget, isMetingSongTarget } from "../functions/_generated/content-targets.js";
import { ApiError } from "../functions/_lib/community.ts";
import {
  musicAudio,
  musicLibrary,
  musicLibraryAudio,
  musicLibraryLyrics,
  musicMetadata,
  resolveMetingAudioUrl,
  resolveMetingLibrary,
  resolveMetingSong,
} from "../functions/_lib/music.ts";
import { parseMetingLibraryUrl, parseMetingSongUrl } from "../src/musicSources.ts";

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
    assert.equal(size, 300);
    assert.ok(["cover-id", "album-cover"].includes(id));
    return JSON.stringify({ url: "https://images.example.test/cover.jpg" });
  }

  async url(id, bitrate) {
    assert.equal(bitrate, 320);
    const url = id === "unavailable" ? "" : id === "unsafe" ? "javascript:alert(1)" : "https://audio.example.test/song.mp3";
    return JSON.stringify({ url: url === "https://audio.example.test/song.mp3" ? "http://audio.example.test/song.mp3" : url });
  }

  async album(id) {
    assert.ok(["34720827", "34720828"].includes(id));
    return JSON.stringify([
      { name: "专辑曲目甲", artist: ["歌手甲"], pic_id: "album-cover", url_id: "27557102", lyric_id: "27557103" },
      { name: "专辑曲目乙", artist: ["歌手乙"], pic_id: "album-cover", url_id: "27557104", lyric_id: "27557104" },
    ]);
  }

  async playlist(id) {
    assert.ok(["34720827", "34720828", "34720829", "1234567"].includes(id));
    if (id === "34720829") {
      return JSON.stringify(Array.from({ length: 201 }, (_, index) => ({
        name: `歌单曲目 ${index}`,
        artist: ["歌手"],
        url_id: String(700000 + index),
        lyric_id: String(700000 + index),
      })));
    }
    return JSON.stringify([
      { name: "歌单曲目甲", artist: ["歌手甲"], url_id: "27557102", lyric_id: "27557102" },
      { name: "歌单曲目乙", artist: ["歌手乙"], url_id: "27557104", lyric_id: "27557104" },
    ]);
  }

  async lyric(id) {
    return JSON.stringify({ lyric: `[00:01.00]歌词 ${id}`, tlyric: `[00:01.00]译文 ${id}` });
  }
}

class PaginatedNeteaseMeting extends FakeMeting {
  static detailRequests = [];

  constructor(source) {
    super(source);
    this.isFormatted = true;
    this.provider = {
      format: (song) => ({
        id: song.id,
        url_id: song.id,
        lyric_id: song.id,
        pic_id: "album-cover",
        name: song.name,
        artist: [song.artist],
      }),
      song: (id) => ({ body: { c: JSON.stringify([{ id, v: 0 }]) } }),
    };
  }

  format(enabled = true) {
    this.isFormatted = enabled;
    return this;
  }

  async playlist() {
    if (this.isFormatted) return JSON.stringify([]);
    return JSON.stringify({
      code: 200,
      playlist: {
        trackCount: 3,
        trackIds: [{ id: 701 }, { id: 702 }, { id: 703 }],
        tracks: [{ id: 701, name: "曲目 701", artist: "歌手" }],
      },
    });
  }

  async _exec(request) {
    const ids = JSON.parse(request.body.c).map(({ id }) => String(id));
    PaginatedNeteaseMeting.detailRequests.push(ids);
    return JSON.stringify({
      code: 200,
      songs: ids.map((id) => ({ id: Number(id), name: `曲目 ${id}`, artist: "歌手" })),
    });
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

test("Meting library URLs accept direct songs, albums, and playlists while leaving artists external", () => {
  assert.deepEqual(parseMetingLibraryUrl("https://music.163.com/album?id=34720827"), {
    source: "netease",
    type: "album",
    id: "34720827",
  });
  assert.deepEqual(parseMetingLibraryUrl("http://music.163.com/album/372627075/?userid=6406251957"), {
    source: "netease",
    type: "album",
    id: "372627075",
  });
  assert.deepEqual(parseMetingLibraryUrl("https://music.163.com/#/playlist?id=34720828"), {
    source: "netease",
    type: "playlist",
    id: "34720828",
  });
  assert.deepEqual(parseMetingLibraryUrl("https://y.qq.com/n/ryqq/albumDetail/0039MnYb0qxYhV"), {
    source: "tencent",
    type: "album",
    id: "0039MnYb0qxYhV",
  });
  assert.deepEqual(parseMetingLibraryUrl("https://y.qq.com/n/ryqq/playlistDetail/0039MnYb0qxYhV"), {
    source: "tencent",
    type: "playlist",
    id: "0039MnYb0qxYhV",
  });
  assert.deepEqual(parseMetingLibraryUrl("https://y.qq.com/n/ryqq/playlistDetail/1234567"), {
    source: "tencent",
    type: "playlist",
    id: "1234567",
  });
  assert.deepEqual(parseMetingLibraryUrl("https://y.qq.com/n/ryqq/songDetail/0039MnYb0qxYhV"), {
    source: "tencent",
    type: "song",
    id: "0039MnYb0qxYhV",
  });
  assert.equal(parseMetingLibraryUrl("https://music.163.com/artist?id=34720827"), null);
  assert.equal(parseMetingLibraryUrl("https://example.com/playlist?id=34720827"), null);
  assert.equal(parseMetingLibraryUrl("https://user@music.163.com/playlist?id=34720827"), null);
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

test("NetEase playback falls back to the public outer URL at restricted runtimes", async () => {
  class FailingMeting extends FakeMeting {
    async url() {
      throw new Error("provider blocked");
    }
  }
  const audioUrl = await resolveMetingAudioUrl("netease", "unavailable", FailingMeting, async (url, init) => {
    assert.equal(url.href, "https://music.163.com/song/media/outer/url?id=unavailable.mp3");
    assert.equal(init.redirect, "manual");
    return new Response(null, {
      status: 302,
      headers: { Location: "http://m801.music.126.net/example.mp3" },
    });
  });
  assert.equal(audioUrl, "https://m801.music.126.net/example.mp3");

  const browserResolvedUrl = await resolveMetingAudioUrl("netease", "unavailable", FailingMeting, async () => new Response(null, {
    status: 302,
    headers: { Location: "/404" },
  }));
  assert.equal(browserResolvedUrl, "https://music.163.com/song/media/outer/url?id=unavailable.mp3");
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

test("music library routes normalize albums, keep full returned playlists, and bind child URLs to their parent", async () => {
  const dependencies = { MetingClient: FakeMeting, isLibraryTarget: () => true };
  const album = await musicLibrary({}, new URL("https://example.test/api/music/library?source=netease&type=album&id=34720827"), dependencies);
  assert.equal(album.status, 200);
  const albumData = await album.json();
  assert.equal(albumData.truncated, false);
  assert.deepEqual(albumData.tracks.map(({ id, title }) => [id, title]), [
    ["27557102", "专辑曲目甲"],
    ["27557104", "专辑曲目乙"],
  ]);
  for (const track of albumData.tracks) {
    const src = new URL(track.src, "https://example.test");
    const lyricUrl = new URL(track.lyricUrl, "https://example.test");
    for (const childUrl of [src, lyricUrl]) {
      assert.equal(childUrl.searchParams.get("source"), "netease");
      assert.equal(childUrl.searchParams.get("type"), "album");
      assert.equal(childUrl.searchParams.get("id"), "34720827");
      assert.equal(childUrl.searchParams.get("track"), track.id);
    }
  }

  const playlist = await musicLibrary({}, new URL("https://example.test/api/music/library?source=netease&type=playlist&id=34720829"), dependencies);
  const playlistData = await playlist.json();
  assert.equal(playlistData.tracks.length, 201);
  assert.equal(playlistData.truncated, false);
  assert.equal(playlistData.tracks[200].title, "歌单曲目 200");

  const shortTencentId = await musicLibrary({}, new URL("https://example.test/api/music/library?source=tencent&type=playlist&id=1234567"), dependencies);
  assert.equal(shortTencentId.status, 200);
});

test("NetEase playlists load provider track IDs beyond the first 1,000-item response in order", async () => {
  PaginatedNeteaseMeting.detailRequests = [];
  const library = await resolveMetingLibrary({ source: "netease", type: "playlist", id: "34720900" }, PaginatedNeteaseMeting);
  assert.deepEqual(library.result.tracks.map(({ id, title }) => [id, title]), [
    ["701", "曲目 701"],
    ["702", "曲目 702"],
    ["703", "曲目 703"],
  ]);
  assert.equal(library.result.truncated, false);
  assert.deepEqual(PaginatedNeteaseMeting.detailRequests, [["702", "703"]]);
});

test("NetEase playlist IDs remain authoritative when trackCount metadata is higher than the enumerated list", async () => {
  class LargePaginatedNeteaseMeting extends PaginatedNeteaseMeting {
    static detailRequests = [];

    async playlist() {
      if (this.isFormatted) return JSON.stringify([]);
      return JSON.stringify({
        code: 200,
        playlist: {
          trackCount: 1430,
          trackIds: Array.from({ length: 1427 }, (_, index) => ({ id: 800000000 + index })),
          tracks: Array.from({ length: 1000 }, (_, index) => ({ id: 800000000 + index, name: `曲目 ${index}`, artist: "歌手" })),
        },
      });
    }

    async _exec(request) {
      const ids = JSON.parse(request.body.c).map(({ id }) => String(id));
      LargePaginatedNeteaseMeting.detailRequests.push(ids);
      return JSON.stringify({ code: 200, songs: ids.map((id) => ({ id: Number(id), name: `曲目 ${Number(id) - 800000000}`, artist: "歌手" })) });
    }
  }

  const response = await musicLibrary({}, new URL("https://example.test/api/music/library?source=netease&type=playlist&id=34720902"), {
    MetingClient: LargePaginatedNeteaseMeting,
    isLibraryTarget: () => true,
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.tracks.length, 1427);
  assert.equal(result.tracks[0].id, "800000000");
  assert.equal(result.tracks[999].title, "曲目 999");
  assert.equal(result.tracks[1000].title, "曲目 1000");
  assert.equal(result.tracks.at(-1).title, "曲目 1426");
  assert.equal(result.truncated, false);
  assert.deepEqual(LargePaginatedNeteaseMeting.detailRequests, [Array.from({ length: 427 }, (_, index) => String(800001000 + index))]);
});

test("NetEase playlist retries only omitted detail IDs once and rejects persistent missing data", async () => {
  class PartialDetailNeteaseMeting extends PaginatedNeteaseMeting {
    static detailRequests = [];
    static recover = true;

    async playlist() {
      if (this.isFormatted) return JSON.stringify([]);
      return JSON.stringify({
        code: 200,
        playlist: {
          trackCount: 4,
          trackIds: [{ id: 701 }, { id: 702 }, { id: 703 }],
          tracks: [{ id: 701, name: "曲目 701", artist: "歌手" }],
        },
      });
    }

    async _exec(request) {
      const ids = JSON.parse(request.body.c).map(({ id }) => String(id));
      PartialDetailNeteaseMeting.detailRequests.push(ids);
      const shouldOmit = !PartialDetailNeteaseMeting.recover || PartialDetailNeteaseMeting.detailRequests.length === 1;
      return JSON.stringify({
        code: 200,
        songs: ids.filter((id) => !(shouldOmit && id === "703")).map((id) => ({ id: Number(id), name: `曲目 ${id}`, artist: "歌手" })),
      });
    }
  }

  PartialDetailNeteaseMeting.recover = true;
  PartialDetailNeteaseMeting.detailRequests = [];
  const recovered = await resolveMetingLibrary({ source: "netease", type: "playlist", id: "34720903" }, PartialDetailNeteaseMeting);
  assert.deepEqual(recovered.result.tracks.map(({ id }) => id), ["701", "702", "703"]);
  assert.deepEqual(PartialDetailNeteaseMeting.detailRequests, [["702", "703"], ["703"]]);

  PartialDetailNeteaseMeting.recover = false;
  PartialDetailNeteaseMeting.detailRequests = [];
  await assert.rejects(
    resolveMetingLibrary({ source: "netease", type: "playlist", id: "34720904" }, PartialDetailNeteaseMeting),
    (error) => error instanceof ApiError && error.status === 502 && error.code === "music_provider_incomplete",
  );
  assert.deepEqual(PartialDetailNeteaseMeting.detailRequests, [["702", "703"], ["703"]]);
});

test("NetEase playlists reject non-enumerable track IDs rather than silently dropping them", async () => {
  class MissingTrackIdNeteaseMeting extends PaginatedNeteaseMeting {
    async playlist() {
      if (this.isFormatted) return JSON.stringify([]);
      return JSON.stringify({ code: 200, playlist: { trackCount: 2, trackIds: [{ id: 701 }, {}], tracks: [{ id: 701, name: "曲目 701" }] } });
    }
  }

  await assert.rejects(
    resolveMetingLibrary({ source: "netease", type: "playlist", id: "34720905" }, MissingTrackIdNeteaseMeting),
    (error) => error instanceof ApiError && error.status === 502 && error.code === "music_provider_incomplete",
  );
});

test("music provider response byte bounds reject oversized bodies and cancel the stream", async () => {
  const originalFetch = globalThis.fetch;
  let cancelled = false;
  globalThis.fetch = async (_input, init) => {
    assert.ok(init.signal instanceof AbortSignal);
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(8 * 1024 * 1024 + 1));
      },
      cancel() {
        cancelled = true;
      },
    }), { status: 200 });
  };
  try {
    await assert.rejects(
      resolveMetingLibrary({ source: "netease", type: "playlist", id: "34720901" }),
      (error) => error instanceof ApiError && error.status === 502 && error.code === "music_provider_response_too_large",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(cancelled, true);
});

test("slow cover lookups expire within the artwork budget while valid tracks still return", { timeout: 4000 }, async () => {
  class SlowCoverMeting extends FakeMeting {
    async playlist() {
      return JSON.stringify([
        { name: "曲目甲", artist: ["歌手甲"], pic_id: "slow-cover-1", url_id: "27557102", lyric_id: "27557102" },
        { name: "曲目乙", artist: ["歌手乙"], pic_id: "slow-cover-2", url_id: "27557104", lyric_id: "27557104" },
      ]);
    }

    async pic() {
      return new Promise(() => {});
    }
  }

  const startedAt = Date.now();
  const library = await resolveMetingLibrary({ source: "netease", type: "playlist", id: "987654321" }, SlowCoverMeting);
  assert.ok(Date.now() - startedAt < 2500);
  assert.deepEqual(library.result.tracks.map(({ title, cover }) => [title, cover]), [
    ["曲目甲", ""],
    ["曲目乙", ""],
  ]);
});

test("library audio and lyric routes reject tracks outside an allowlisted parent and serve listed tracks", async () => {
  const dependencies = { MetingClient: FakeMeting, isLibraryTarget: () => true };
  for (const parent of [
    { type: "song", id: "27557102" },
    { type: "album", id: "34720828" },
    { type: "playlist", id: "34720827" },
  ]) {
    const query = new URLSearchParams({ source: "netease", type: parent.type, id: parent.id, track: "27557199" });
    await assert.rejects(
      musicLibraryAudio({}, new URL(`https://example.test/api/music/library/audio?${query}`, "https://example.test"), dependencies),
      (error) => error instanceof ApiError && error.status === 404 && error.code === "music_track_not_found",
      `audio track outside ${parent.type} should be denied`,
    );
    await assert.rejects(
      musicLibraryLyrics({}, new URL(`https://example.test/api/music/library/lyrics?${query}`, "https://example.test"), dependencies),
      (error) => error instanceof ApiError && error.status === 404 && error.code === "music_track_not_found",
      `lyrics track outside ${parent.type} should be denied`,
    );
  }

  const query = "source=netease&type=album&id=34720828";

  const audio = await musicLibraryAudio({}, new URL(`https://example.test/api/music/library/audio?${query}&track=27557102`), dependencies);
  assert.equal(audio.status, 302);
  assert.equal(audio.headers.get("Location"), "https://audio.example.test/song.mp3");

  const lyrics = await musicLibraryLyrics({}, new URL(`https://example.test/api/music/library/lyrics?${query}&track=27557102`), dependencies);
  assert.deepEqual(await lyrics.json(), {
    lyric: "[00:01.00]歌词 27557103",
    translation: "[00:01.00]译文 27557103",
  });
});

test("library API rejects unlisted and malformed parents before calling Meting", async () => {
  for (const type of ["song", "album", "playlist"]) {
    let id = type === "song" ? "900000001" : type === "album" ? "900000002" : "900000003";
    while (isMetingLibraryTarget("netease", type, id)) id = String(Number(id) + 10);
    await assert.rejects(
      musicLibrary({}, new URL(`https://example.test/api/music/library?source=netease&type=${type}&id=${id}`)),
      (error) => error instanceof ApiError && error.status === 404 && error.code === "music_library_not_configured",
      `unlisted ${type} target should be denied`,
    );
  }
  await assert.rejects(
    musicLibrary({}, new URL("https://example.test/api/music/library?source=netease&type=artist&id=34720827"), { isLibraryTarget: () => true }),
    (error) => error instanceof ApiError && error.status === 400 && error.code === "invalid_music_library",
  );
  await assert.rejects(
    musicLibrary({}, new URL("https://example.test/api/music/library?source=netease&type=album&id=34720827&extra=1"), { isLibraryTarget: () => true }),
    (error) => error instanceof ApiError && error.status === 400 && error.code === "invalid_music_library",
  );
});
