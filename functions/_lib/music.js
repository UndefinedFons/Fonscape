import Meting from "@meting/core";
import { ApiError, json } from "./community.js";
import { isMetingSongTarget } from "../_generated/content-targets.js";

const METADATA_CACHE_CONTROL = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";
const AUDIO_CACHE_CONTROL = "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600";

/** @param {URL} url @returns {{ source: "netease" | "tencent", id: string }} */
function configuredTarget(url) {
  const source = url.searchParams.get("source");
  const id = url.searchParams.get("id") || "";
  const exactParameters = url.searchParams.size === 2
    && url.searchParams.getAll("source").length === 1
    && url.searchParams.getAll("id").length === 1;
  const validId = source === "netease" ? /^\d{1,20}$/u.test(id) : /^[A-Za-z0-9]{8,32}$/u.test(id);
  if (!exactParameters || !validId || (source !== "netease" && source !== "tencent")) {
    throw new ApiError(400, "音乐来源参数无效。", "invalid_music_source");
  }
  const targetSource = /** @type {"netease" | "tencent"} */ (source);
  if (!isMetingSongTarget(targetSource, id)) {
    throw new ApiError(404, "没有找到这首文章配乐。", "music_not_configured");
  }
  return { source: targetSource, id };
}

/** @param {string} value */
function parseMetingJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    throw new ApiError(502, "音乐平台返回了无效数据。", "music_provider_invalid");
  }
}

/**
 * @param {{ source: "netease" | "tencent", id: string }} target
 * @param {typeof Meting} [MetingClient]
 */
export async function resolveMetingSong(target, MetingClient = Meting) {
  const client = new MetingClient(target.source).format(true);
  const songs = parseMetingJson(await client.song(target.id));
  const song = Array.isArray(songs) ? songs[0] : null;
  if (!song?.url_id || !song?.name) {
    throw new ApiError(404, "没有找到这首歌。", "music_not_found");
  }
  const picture = parseMetingJson(await client.pic(song.pic_id, 300));
  return {
    source: target.source,
    id: String(song.url_id),
    title: String(song.name),
    artist: Array.isArray(song.artist) ? song.artist.map(String).filter(Boolean).join(" / ") : String(song.artist || ""),
    cover: typeof picture?.url === "string" ? picture.url : "",
    src: `/api/music/audio?source=${encodeURIComponent(target.source)}&id=${encodeURIComponent(String(song.url_id))}`,
  };
}

/** @param {string} id @param {typeof fetch} fetchImpl */
async function resolveNeteaseOuterAudioUrl(id, fetchImpl) {
  const endpoint = new URL("https://music.163.com/song/media/outer/url");
  endpoint.searchParams.set("id", `${id}.mp3`);
  let response;
  try {
    response = await fetchImpl(endpoint, {
      redirect: "manual",
      headers: {
        Accept: "audio/mpeg,*/*;q=0.8",
        Referer: "https://music.163.com/",
        "User-Agent": "Mozilla/5.0 (compatible; Fonscape/1.0)",
      },
    });
  } catch {
    throw new ApiError(502, "音乐平台暂时无法提供播放地址。", "music_provider_failed");
  }
  const location = response.status >= 300 && response.status < 400
    ? response.headers.get("Location")
    : "";
  if (!location) throw new ApiError(404, "这首歌当前无法播放。", "music_unavailable");
  return location;
}

/**
 * @param {"netease" | "tencent"} source
 * @param {string} id
 * @param {typeof Meting} [MetingClient]
 * @param {typeof fetch} [fetchImpl]
 */
export async function resolveMetingAudioUrl(source, id, MetingClient = Meting, fetchImpl = fetch) {
  const client = new MetingClient(source).format(true);
  let audio;
  try {
    audio = parseMetingJson(await client.url(id, 320));
  } catch (error) {
    if (source !== "netease") throw error;
    audio = null;
  }
  if ((!audio?.url || typeof audio.url !== "string") && source === "netease") {
    audio = { url: await resolveNeteaseOuterAudioUrl(id, fetchImpl) };
  }
  if (!audio?.url || typeof audio.url !== "string") {
    throw new ApiError(404, "这首歌当前无法播放。", "music_unavailable");
  }
  let audioUrl;
  try {
    audioUrl = new URL(audio.url);
  } catch {
    throw new ApiError(502, "音乐平台返回了无效播放地址。", "music_provider_invalid");
  }
  if (audioUrl.protocol !== "http:" && audioUrl.protocol !== "https:") {
    throw new ApiError(502, "音乐平台返回了无效播放地址。", "music_provider_invalid");
  }
  if (audioUrl.protocol === "http:") audioUrl.protocol = "https:";
  return audioUrl.href;
}

/** @param {import("../types").RequestContext} _context @param {URL} url */
export async function musicMetadata(_context, url) {
  const target = configuredTarget(url);
  return json(await resolveMetingSong(target), 200, { "Cache-Control": METADATA_CACHE_CONTROL });
}

/** @param {import("../types").RequestContext} _context @param {URL} url */
export async function musicAudio(_context, url) {
  const { source, id } = configuredTarget(url);
  return new Response(null, {
    status: 302,
    headers: {
      "Cache-Control": AUDIO_CACHE_CONTROL,
      Location: await resolveMetingAudioUrl(source, id),
    },
  });
}
