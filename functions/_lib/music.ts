import Meting from "@meting/core";
import { ApiError, json } from "./community.ts";
import { isMetingLibraryTarget, isMetingSongTarget } from "../_generated/content-targets.js";

import type { RequestContext } from "../types.ts";
import type {
  MusicLibraryResult,
  MusicLibrarySource,
  MusicLibraryTarget,
  MusicLibraryTrack,
} from "../../src/musicTypes.ts";

const METADATA_CACHE_CONTROL = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";
const AUDIO_CACHE_CONTROL = "private, no-store";

type MetingSource = "netease" | "tencent";
type MetingTarget = { source: MetingSource; id: string };
type MetingSong = { url_id?: string | number; name?: string; pic_id?: string | number; artist?: string | string[] };
type MetingAudio = { url?: unknown } | null;
type ResolvedMetingSong = { source: MetingSource; id: string; title: string; artist: string; cover: string; src: string };

function configuredTarget(url: URL): MetingTarget {
  const source = url.searchParams.get("source");
  const id = url.searchParams.get("id") || "";
  const exactParameters = url.searchParams.size === 2
    && url.searchParams.getAll("source").length === 1
    && url.searchParams.getAll("id").length === 1;
  const validId = source === "netease" ? /^\d{1,20}$/u.test(id) : /^[A-Za-z0-9]{8,32}$/u.test(id);
  if (!exactParameters || !validId || (source !== "netease" && source !== "tencent")) {
    throw new ApiError(400, "音乐来源参数无效。", "invalid_music_source");
  }
  const targetSource = source as MetingSource;
  if (!isMetingSongTarget(targetSource, id)) {
    throw new ApiError(404, "没有找到这首文章配乐。", "music_not_configured");
  }
  return { source: targetSource, id };
}

function parseMetingJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new ApiError(502, "音乐平台返回了无效数据。", "music_provider_invalid");
  }
}

export async function resolveMetingSong(target: MetingTarget, MetingClient: typeof Meting = Meting): Promise<ResolvedMetingSong> {
  const client = new MetingClient(target.source).format(true);
  const songs = parseMetingJson(await client.song(target.id));
  const song = Array.isArray(songs) ? songs[0] as MetingSong | undefined : null;
  if (!song?.url_id || !song?.name) {
    throw new ApiError(404, "没有找到这首歌。", "music_not_found");
  }
  const picture = parseMetingJson(await client.pic(song.pic_id as string, 300)) as { url?: unknown } | null;
  return {
    source: target.source,
    id: String(song.url_id),
    title: String(song.name),
    artist: Array.isArray(song.artist) ? song.artist.map(String).filter(Boolean).join(" / ") : String(song.artist || ""),
    cover: typeof picture?.url === "string" ? picture.url : "",
    src: `/api/music/audio?source=${encodeURIComponent(target.source)}&id=${encodeURIComponent(String(song.url_id))}`,
  };
}

async function resolveNeteaseOuterAudioUrl(id: string, fetchImpl: typeof fetch): Promise<string> {
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
  if (!location) return endpoint.href;
  const redirect = new URL(location, endpoint);
  return redirect.pathname === "/404" ? endpoint.href : redirect.href;
}

export async function resolveMetingAudioUrl(source: MetingSource, id: string, MetingClient: typeof Meting = Meting, fetchImpl: typeof fetch = fetch): Promise<string> {
  const client = new MetingClient(source).format(true);
  let audio: MetingAudio;
  try {
    audio = parseMetingJson(await client.url(id, 320)) as MetingAudio;
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

export async function musicMetadata(_context: RequestContext, url: URL): Promise<Response> {
  const target = configuredTarget(url);
  return json(await resolveMetingSong(target), 200, { "Cache-Control": METADATA_CACHE_CONTROL });
}

export async function musicAudio(_context: RequestContext, url: URL): Promise<Response> {
  const { source, id } = configuredTarget(url);
  return new Response(null, {
    status: 302,
    headers: {
      "Cache-Control": AUDIO_CACHE_CONTROL,
      Location: await resolveMetingAudioUrl(source, id),
    },
  });
}

const LIBRARY_REQUEST_TIMEOUT_MS = 7000;
const LIBRARY_TIMEOUT_ERROR = "music_provider_timeout";
const MAX_LIBRARY_RESPONSE_BYTES = 8 * 1024 * 1024;
const NETEASE_DETAIL_BATCH_SIZE = 500;
const NETEASE_DETAIL_CONCURRENCY = 3;
const NETEASE_DETAIL_BUDGET_MS = 20_000;
const LIBRARY_CACHE_TTL_MS = 5 * 60 * 1000;
const LYRIC_CACHE_TTL_MS = 30 * 60 * 1000;
const COVER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_LIBRARY_CACHE_ENTRIES = 48;
const MAX_LYRIC_CACHE_ENTRIES = 256;
const MAX_COVER_CACHE_ENTRIES = 512;
const COVER_LOOKUP_CONCURRENCY = 4;
const COVER_LOOKUP_BUDGET_MS = 1500;
const MAX_IN_FLIGHT_LIBRARIES = 32;

type MetingLibrarySong = {
  id?: string | number;
  url_id?: string | number;
  lyric_id?: string | number;
  pic_id?: string | number;
  name?: string;
  artist?: string | string[];
  cover?: string;
  pic?: string;
  pic_url?: string;
  cover_url?: string;
};

type MetingLibraryClient = {
  format(enabled?: boolean): MetingLibraryClient;
  song(id: string): Promise<string>;
  album(id: string): Promise<string>;
  playlist(id: string): Promise<string>;
  pic(id: string, size?: number): Promise<string>;
  lyric(id: string): Promise<string>;
};

type MetingInternals = {
  header?: Record<string, string>;
  raw?: string | null;
  info?: unknown;
  error?: string | null;
  status?: string | null;
  provider?: {
    format?: (song: unknown) => unknown;
    song?: (id: string) => MetingRequest;
  };
  _exec?: (request: MetingRequest) => Promise<string>;
};

type MetingRequest = { body?: unknown; [key: string]: unknown };

type ResolvedMetingLibrary = {
  result: MusicLibraryResult;
  lyricIds: Map<string, string>;
};

type CachedValue<T> = { expiresAt: number; value: T };
type MusicApiDependencies = {
  MetingClient?: typeof Meting;
  isLibraryTarget?: typeof isMetingLibraryTarget;
  fetchImpl?: typeof fetch;
};

const libraryCache = new Map<string, CachedValue<ResolvedMetingLibrary>>();
const libraryRequests = new Map<string, Promise<ResolvedMetingLibrary>>();
const lyricCache = new Map<string, CachedValue<{ lyric: string; translation: string }>>();
const coverCache = new Map<string, CachedValue<string>>();
const coverRequests = new Map<string, Promise<string>>();

class BoundedMeting extends Meting {
  async _curl(requestUrl: string, body: unknown = null): Promise<this> {
    const state = this as unknown as MetingInternals;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LIBRARY_REQUEST_TIMEOUT_MS);
    const headers = new Headers(state.header as HeadersInit | undefined);
    const init: RequestInit = {
      method: body ? "POST" : "GET",
      headers,
      signal: controller.signal,
    };
    if (body) {
      if (typeof body === "string") init.body = body;
      else if (body instanceof URLSearchParams) init.body = body.toString();
      else if (typeof body === "object") {
        init.body = new URLSearchParams(body as Record<string, string>).toString();
        headers.set("Content-Type", "application/x-www-form-urlencoded");
      }
    }
    try {
      const response = await fetch(requestUrl, init);
      state.info = { statusCode: response.status, headers: Object.fromEntries(response.headers.entries()) };
      const raw = await readBoundedResponseText(response);
      state.raw = raw;
      state.error = null;
      state.status = "";
      if (!response.ok) throw new ApiError(502, "音乐平台暂时无法响应。", "music_provider_failed");
      return this;
    } catch (error) {
      state.error = error instanceof Error ? error.name : "music_provider_failed";
      state.status = error instanceof Error ? error.message : "音乐平台暂时无法响应。";
      if (error instanceof ApiError) throw error;
      if (controller.signal.aborted) {
        throw new ApiError(502, "音乐平台响应超时。", LIBRARY_TIMEOUT_ERROR);
      }
      throw new ApiError(502, "音乐平台暂时无法响应。", "music_provider_failed");
    } finally {
      clearTimeout(timer);
    }
  }
}

function isProviderTrackId(source: MusicLibrarySource, id: string): boolean {
  return source === "netease" ? /^\d{1,20}$/u.test(id) : /^[A-Za-z0-9]{8,32}$/u.test(id);
}

function isProviderLibraryId(source: MusicLibrarySource, type: MusicLibraryTarget["type"], id: string): boolean {
  if (source === "netease") return /^\d{1,20}$/u.test(id);
  if (type === "playlist") return /^(?:\d{6,32}|[A-Za-z0-9]{8,32})$/u.test(id);
  return /^[A-Za-z0-9]{8,32}$/u.test(id);
}

function libraryKey(target: MusicLibraryTarget): string {
  return `${target.source}:${target.type}:${target.id}`;
}

function readCache<T>(cache: Map<string, CachedValue<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

function writeCache<T>(cache: Map<string, CachedValue<T>>, key: string, value: T, ttl: number, limit: number): void {
  cache.delete(key);
  cache.set(key, { expiresAt: Date.now() + ttl, value });
  while (cache.size > limit) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

async function providerCall<T>(operation: () => Promise<T>, timeoutMs = LIBRARY_REQUEST_TIMEOUT_MS + 250): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new ApiError(502, "音乐平台响应超时。", LIBRARY_TIMEOUT_ERROR)), timeoutMs);
      }),
    ]);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, "音乐平台暂时无法响应。", "music_provider_failed");
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readBoundedResponseText(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_LIBRARY_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new ApiError(502, "音乐平台返回的数据过大。", "music_provider_response_too_large");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_LIBRARY_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {});
        throw new ApiError(502, "音乐平台返回的数据过大。", "music_provider_response_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function parseMetingTracks(value: string): MetingLibrarySong[] {
  const parsed = parseMetingJson(value);
  if (Array.isArray(parsed)) return parsed as MetingLibrarySong[];
  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    for (const key of ["songs", "tracks", "list", "songlist", "data"]) {
      if (Array.isArray(record[key])) return record[key] as MetingLibrarySong[];
      if (record[key] && typeof record[key] === "object") {
        const nested = record[key] as Record<string, unknown>;
        for (const nestedKey of ["songs", "tracks", "list", "songlist"]) {
          if (Array.isArray(nested[nestedKey])) return nested[nestedKey] as MetingLibrarySong[];
        }
      }
    }
  }
  throw new ApiError(502, "音乐平台返回了无效曲目列表。", "music_provider_invalid");
}

function normalizeNeteaseTrack(song: unknown, provider?: MetingInternals["provider"]): MetingLibrarySong {
  if (provider?.format) {
    try {
      return provider.format(song) as MetingLibrarySong;
    } catch {
      // Keep track identity and title if the provider omits an optional metadata field.
    }
  }
  return song && typeof song === "object" ? song as MetingLibrarySong : {};
}

function providerTrackId(song: MetingLibrarySong): string {
  return String(song.url_id ?? song.id ?? "");
}

async function fetchNeteaseTrackDetails(
  client: MetingLibraryClient,
  ids: string[],
  internals: MetingInternals,
): Promise<MetingLibrarySong[]> {
  const provider = internals.provider;
  if (!provider?.song || !internals._exec) {
    throw new ApiError(502, "音乐平台未返回完整曲目列表。", "music_provider_incomplete");
  }
  const deadlineAt = Date.now() + NETEASE_DETAIL_BUDGET_MS;
  const requestChunks = async (requestedIds: string[]): Promise<MetingLibrarySong[]> => {
    const chunks: string[][] = [];
    for (let index = 0; index < requestedIds.length; index += NETEASE_DETAIL_BATCH_SIZE) {
      chunks.push(requestedIds.slice(index, index + NETEASE_DETAIL_BATCH_SIZE));
    }
    const batches = await mapWithConcurrency(chunks, NETEASE_DETAIL_CONCURRENCY, async (chunk) => {
      const remainingMs = deadlineAt - Date.now();
      if (remainingMs <= 0) {
        throw new ApiError(502, "音乐平台响应超时。", LIBRARY_TIMEOUT_ERROR);
      }
      const request = provider.song!(chunk[0]);
      if (!request.body || typeof request.body !== "object" || request.body instanceof URLSearchParams) {
        throw new ApiError(502, "音乐平台未返回完整曲目列表。", "music_provider_incomplete");
      }
      request.body = {
        ...(request.body as Record<string, unknown>),
        c: JSON.stringify(chunk.map((id) => ({ id, v: 0 }))),
      };
      const raw = await providerCall(
        () => internals._exec!.call(client, request),
        Math.min(LIBRARY_REQUEST_TIMEOUT_MS + 250, remainingMs),
      );
      const parsed = parseMetingJson(raw);
      if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as Record<string, unknown>).songs)) {
        throw new ApiError(502, "音乐平台返回了无效曲目列表。", "music_provider_invalid");
      }
      return ((parsed as { songs: unknown[] }).songs).map((song) => normalizeNeteaseTrack(song, provider));
    });
    return batches.flat();
  };

  const firstPass = await requestChunks(ids);
  const foundIds = new Set(firstPass.map(providerTrackId).filter((id) => isProviderTrackId("netease", id)));
  const missingIds = ids.filter((id) => !foundIds.has(id));
  if (!missingIds.length) return firstPass;
  if (deadlineAt <= Date.now()) throw new ApiError(502, "音乐平台响应超时。", LIBRARY_TIMEOUT_ERROR);

  // Some provider responses omit a subset of requested songs transiently.
  // Retry only those IDs once, within the same overall detail budget.
  return [...firstPass, ...await requestChunks(missingIds)];
}

async function parseNeteasePlaylistTracks(client: MetingLibraryClient, response: string): Promise<MetingLibrarySong[]> {
  const parsed = parseMetingJson(response);
  if (!parsed || typeof parsed !== "object") return parseMetingTracks(response);
  const payload = parsed as Record<string, unknown>;
  const playlist = payload.playlist && typeof payload.playlist === "object"
    ? payload.playlist as Record<string, unknown>
    : null;
  if (!playlist || !Array.isArray(playlist.tracks) || !Array.isArray(playlist.trackIds)) {
    return parseMetingTracks(response);
  }

  const internals = client as unknown as MetingInternals;
  const tracks = playlist.tracks.map((song) => normalizeNeteaseTrack(song, internals.provider));
  const tracksById = new Map<string, MetingLibrarySong>();
  for (const song of tracks) {
    const id = providerTrackId(song);
    if (isProviderTrackId("netease", id)) tracksById.set(id, song);
  }

  const trackIds = playlist.trackIds
    .map((item) => item && typeof item === "object" ? String((item as Record<string, unknown>).id ?? "") : "");
  if (trackIds.some((id) => !isProviderTrackId("netease", id)) || (!trackIds.length && Number(playlist.trackCount) > 0)) {
    throw new ApiError(502, "音乐平台未返回完整曲目列表。", "music_provider_incomplete");
  }

  const requested = new Set<string>();
  const missingIds = trackIds.filter((id) => !tracksById.has(id) && !requested.has(id) && requested.add(id));
  if (missingIds.length) {
    const details = await fetchNeteaseTrackDetails(client, missingIds, internals);
    for (const song of details) {
      const id = providerTrackId(song);
      if (isProviderTrackId("netease", id)) tracksById.set(id, song);
    }
  }

  if (trackIds.some((id) => !tracksById.has(id))) {
    throw new ApiError(502, "音乐平台未返回完整曲目列表。", "music_provider_incomplete");
  }

  return trackIds.map((id) => tracksById.get(id)!);
}

function safeProviderImage(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048) return "";
  try {
    const image = new URL(value);
    if (image.protocol !== "https:" && image.protocol !== "http:") return "";
    if (image.protocol === "http:") image.protocol = "https:";
    return image.href;
  } catch {
    return "";
  }
}

function normalizeArtist(value: unknown): string {
  if (Array.isArray(value)) return value.map((artist) => typeof artist === "string" ? artist : "").filter(Boolean).join(" / ").slice(0, 500);
  return typeof value === "string" ? value.slice(0, 500) : "";
}

function libraryTrackEndpoint(endpoint: "audio" | "lyrics", target: MusicLibraryTarget, trackId: string): string {
  const query = new URLSearchParams({
    source: target.source,
    type: target.type,
    id: target.id,
    track: trackId,
  });
  return `/api/music/library/${endpoint}?${query.toString()}`;
}

async function coverUrl(
  source: MusicLibrarySource,
  song: MetingLibrarySong,
  client: MetingLibraryClient,
  deadlineAt: number,
): Promise<string> {
  const direct = safeProviderImage(song.cover_url || song.pic_url || song.cover || song.pic);
  if (direct) return direct;
  if (song.pic_id === undefined || song.pic_id === null || String(song.pic_id).length > 120) return "";
  const cacheKey = `${source}:${String(song.pic_id)}`;
  const cached = readCache(coverCache, cacheKey);
  if (cached !== null) return cached;
  const pending = coverRequests.get(cacheKey);
  if (pending) return pending;
  const remainingMs = deadlineAt - Date.now();
  if (remainingMs <= 0) return "";
  const request = (async () => {
    let image = "";
    try {
      const response = await providerCall(() => client.pic(String(song.pic_id), 300), remainingMs);
      const picture = parseMetingJson(response) as { url?: unknown } | null;
      image = safeProviderImage(picture?.url);
    } catch {
      image = "";
    }
    if (image) writeCache(coverCache, cacheKey, image, COVER_CACHE_TTL_MS, MAX_COVER_CACHE_ENTRIES);
    return image;
  })();
  coverRequests.set(cacheKey, request);
  try {
    return await request;
  } finally {
    if (coverRequests.get(cacheKey) === request) coverRequests.delete(cacheKey);
  }
}

async function mapWithConcurrency<T, Result>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T, workerIndex: number) => Promise<Result>,
): Promise<Result[]> {
  const results = new Array<Result>(values.length);
  let nextIndex = 0;
  const worker = async (workerIndex: number) => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await operation(values[index], workerIndex);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, (_, workerIndex) => worker(workerIndex)));
  return results;
}

export async function resolveMetingLibrary(
  target: MusicLibraryTarget,
  MetingClient: typeof Meting = BoundedMeting,
): Promise<ResolvedMetingLibrary> {
  const isNeteasePlaylist = target.source === "netease" && target.type === "playlist";
  const client = new MetingClient(target.source).format(!isNeteasePlaylist) as unknown as MetingLibraryClient;
  let response: string;
  try {
    response = target.type === "song"
      ? await providerCall(() => client.song(target.id))
      : target.type === "album"
        ? await providerCall(() => client.album(target.id))
        : await providerCall(() => client.playlist(target.id));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, "音乐平台暂时无法响应。", "music_provider_failed");
  }
  const songs = isNeteasePlaylist
    ? await parseNeteasePlaylistTracks(client, response)
    : parseMetingTracks(response);
  const lyricIds = new Map<string, string>();
  const coverClients = Array.from({ length: COVER_LOOKUP_CONCURRENCY }, () => (
    new MetingClient(target.source).format(true) as unknown as MetingLibraryClient
  ));
  const coverDeadlineAt = Date.now() + COVER_LOOKUP_BUDGET_MS;
  const tracks = await mapWithConcurrency(songs, COVER_LOOKUP_CONCURRENCY, async (song, workerIndex): Promise<MusicLibraryTrack | null> => {
    const id = String(song.url_id ?? song.id ?? "");
    if (!isProviderTrackId(target.source, id)) return null;
    const rawLyricId = String(song.lyric_id ?? id);
    lyricIds.set(id, isProviderTrackId(target.source, rawLyricId) ? rawLyricId : id);
    return {
      id,
      source: target.source,
      title: String(song.name || "未知曲目").trim().slice(0, 300),
      artist: normalizeArtist(song.artist),
      cover: await coverUrl(target.source, song, coverClients[workerIndex], coverDeadlineAt),
      src: libraryTrackEndpoint("audio", target, id),
      lyricUrl: libraryTrackEndpoint("lyrics", target, id),
    };
  });
  const normalized = tracks.filter((track): track is MusicLibraryTrack => track !== null);
  return { result: { tracks: normalized, truncated: false }, lyricIds };
}

function configuredLibraryTarget(
  url: URL,
  withTrack: boolean,
  isConfigured: typeof isMetingLibraryTarget,
): { target: MusicLibraryTarget; trackId?: string } {
  const source = url.searchParams.get("source") || "";
  const type = url.searchParams.get("type") || "";
  const id = url.searchParams.get("id") || "";
  const trackId = url.searchParams.get("track") || "";
  const expectedSize = withTrack ? 4 : 3;
  const exactParameters = url.searchParams.size === expectedSize
    && ["source", "type", "id", ...(withTrack ? ["track"] : [])].every((name) => url.searchParams.getAll(name).length === 1);
  if (!exactParameters
    || (source !== "netease" && source !== "tencent")
    || (type !== "song" && type !== "album" && type !== "playlist")
    || !isProviderLibraryId(source, type as MusicLibraryTarget["type"], id)
    || (withTrack && !isProviderTrackId(source, trackId))) {
    throw new ApiError(400, "音乐库来源参数无效。", "invalid_music_library");
  }
  const target: MusicLibraryTarget = { source, type, id };
  if (!isConfigured(target.source, target.type, target.id)) {
    throw new ApiError(404, "没有找到这项音乐库内容。", "music_library_not_configured");
  }
  return { target, ...(withTrack ? { trackId } : {}) };
}

async function configuredLibrary(
  target: MusicLibraryTarget,
  dependencies: MusicApiDependencies,
): Promise<ResolvedMetingLibrary> {
  const key = libraryKey(target);
  const cached = readCache(libraryCache, key);
  if (cached) return cached;
  const pending = libraryRequests.get(key);
  if (pending) return pending;
  if (libraryRequests.size >= MAX_IN_FLIGHT_LIBRARIES) {
    throw new ApiError(503, "音乐库请求较多，请稍后重试。", "music_provider_busy");
  }
  const request = resolveMetingLibrary(target, dependencies.MetingClient || BoundedMeting);
  libraryRequests.set(key, request);
  try {
    const value = await request;
    writeCache(libraryCache, key, value, LIBRARY_CACHE_TTL_MS, MAX_LIBRARY_CACHE_ENTRIES);
    return value;
  } finally {
    libraryRequests.delete(key);
  }
}

function configuredTrack(library: ResolvedMetingLibrary, trackId: string): string {
  const lyricId = library.lyricIds.get(trackId);
  if (!lyricId) throw new ApiError(404, "这首歌不属于当前音乐库。", "music_track_not_found");
  return lyricId;
}

async function configuredLibraryTrack(
  url: URL,
  dependencies: MusicApiDependencies,
): Promise<{ target: MusicLibraryTarget; trackId: string; lyricId: string }> {
  const { target, trackId } = configuredLibraryTarget(url, true, dependencies.isLibraryTarget || isMetingLibraryTarget);
  const library = await configuredLibrary(target, dependencies);
  return { target, trackId: trackId!, lyricId: configuredTrack(library, trackId!) };
}

export async function musicLibrary(
  _context: RequestContext,
  url: URL,
  dependencies: MusicApiDependencies = {},
): Promise<Response> {
  const { target } = configuredLibraryTarget(url, false, dependencies.isLibraryTarget || isMetingLibraryTarget);
  const library = await configuredLibrary(target, dependencies);
  return json(library.result, 200, { "Cache-Control": METADATA_CACHE_CONTROL });
}

export async function musicLibraryAudio(
  _context: RequestContext,
  url: URL,
  dependencies: MusicApiDependencies = {},
): Promise<Response> {
  const { target, trackId } = await configuredLibraryTrack(url, dependencies);
  const fetchImpl = dependencies.fetchImpl || (async (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LIBRARY_REQUEST_TIMEOUT_MS);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  });
  return new Response(null, {
    status: 302,
    headers: {
      "Cache-Control": AUDIO_CACHE_CONTROL,
      Location: await resolveMetingAudioUrl(target.source, trackId!, dependencies.MetingClient || BoundedMeting, fetchImpl),
    },
  });
}

export async function musicLibraryLyrics(
  _context: RequestContext,
  url: URL,
  dependencies: MusicApiDependencies = {},
): Promise<Response> {
  const { target, trackId, lyricId } = await configuredLibraryTrack(url, dependencies);
  const cacheKey = `${libraryKey(target)}:${trackId}`;
  let lyrics = readCache(lyricCache, cacheKey);
  if (!lyrics) {
    const client = new (dependencies.MetingClient || BoundedMeting)(target.source).format(true) as unknown as MetingLibraryClient;
    const response = await providerCall(() => client.lyric(lyricId));
    const parsed = parseMetingJson(response) as { lyric?: unknown; translation?: unknown; tlyric?: unknown } | null;
    lyrics = {
      lyric: typeof parsed?.lyric === "string" ? parsed.lyric : "",
      translation: typeof parsed?.translation === "string" ? parsed.translation : typeof parsed?.tlyric === "string" ? parsed.tlyric : "",
    };
    writeCache(lyricCache, cacheKey, lyrics, LYRIC_CACHE_TTL_MS, MAX_LYRIC_CACHE_ENTRIES);
  }
  return json(lyrics, 200, { "Cache-Control": METADATA_CACHE_CONTROL });
}
