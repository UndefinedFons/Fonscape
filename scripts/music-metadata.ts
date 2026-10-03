import Meting from "@meting/core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MusicLibraryTarget } from "../src/musicTypes.ts";

export type MusicMetadata = { sourceTitle: string; sourceMeta: string; image: string };
type ProviderObject = Record<string, unknown>;
type MetadataClient = Pick<Meting, "song" | "album" | "playlist" | "pic">;

const object = (value: unknown): ProviderObject => value && typeof value === "object" && !Array.isArray(value) ? value as ProviderObject : {};
const first = (value: unknown): ProviderObject => object(Array.isArray(value) ? value[0] : value);
const text = (value: unknown): string => typeof value === "string" ? value.trim().slice(0, 500) : "";
const names = (value: unknown): string => Array.isArray(value) ? value.map((item) => text(object(item).name)).filter(Boolean).join(" / ") : text(value);

function safeImage(value: unknown): string {
  try {
    const url = new URL(text(value));
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
    url.protocol = "https:";
    return url.href;
  } catch { return ""; }
}

class MetadataMeting extends Meting {
  async _curl(requestUrl: string, body: unknown = null): Promise<this> {
    const state = this as unknown as { header: Record<string, string>; raw: string };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch(requestUrl.replace(/^http:/u, "https:"), {
        method: body ? "POST" : "GET",
        headers: state.header,
        ...(body ? { body: typeof body === "string" ? body : new URLSearchParams(body as Record<string, string>).toString() } : {}),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`音乐平台响应 ${response.status}`);
      const reader = response.body?.getReader();
      if (!reader) throw new Error("音乐平台返回空响应");
      const decoder = new TextDecoder();
      let bytes = 0;
      let raw = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 8 * 1024 * 1024) throw new Error("音乐平台响应过大");
          raw += decoder.decode(value, { stream: true });
        }
        state.raw = raw + decoder.decode();
      } finally { await reader.cancel(); }
      return this;
    } finally { clearTimeout(timeout); }
  }
}

export async function resolveMusicMetadata(target: MusicLibraryTarget, client: MetadataClient = new MetadataMeting(target.source).format(false)): Promise<MusicMetadata> {
  const response = object(JSON.parse(await client[target.type](target.id)));
  let sourceTitle = "";
  let sourceMeta = "";
  let image = "";
  if (target.source === "netease") {
    const item = target.type === "song" ? first(response.songs) : object(response[target.type]);
    const album = object(item.al);
    sourceTitle = text(item.name);
    sourceMeta = target.type === "playlist" ? text(object(item.creator).nickname) : names(item.ar || item.artists || [item.artist]);
    image = safeImage(item.coverImgUrl || item.picUrl || album.picUrl);
    const pictureId = album.pic_str || album.pic;
    if (!image && pictureId) image = safeImage(object(JSON.parse(await client.pic(String(pictureId), 600))).url);
  } else {
    const data = object(response.data);
    const item = target.type === "song" ? first(response.data)
      : target.type === "album" ? object(data.getAlbumInfo || data.albumInfo || data)
        : first(data.cdlist || response.cdlist);
    const album = object(item.album);
    sourceTitle = text(item.name || item.title || item.Falbum_name || item.dissname);
    sourceMeta = target.type === "playlist" ? text(item.nickname || object(item.creator).name)
      : names(item.singer || item.singerInfo || data.singerInfo || item.singername) || text(object(data.getSingerInfo).Fsinger_name);
    image = safeImage(item.logo || item.picUrl);
    const pictureId = target.type === "song" ? album.mid : target.type === "album" ? target.id : "";
    if (!image && pictureId) image = safeImage(object(JSON.parse(await client.pic(String(pictureId), 600))).url);
  }
  if (!sourceTitle) throw new Error("音乐平台未返回音乐名称");
  return { sourceTitle, sourceMeta, image };
}

function cachedMetadata(value: unknown): MusicMetadata | null {
  const record = object(value);
  if (!text(record.sourceTitle) || typeof record.sourceMeta !== "string" || typeof record.image !== "string") return null;
  return { sourceTitle: text(record.sourceTitle), sourceMeta: text(record.sourceMeta), image: safeImage(record.image) };
}

export function createMusicMetadataResolver(projectRoot: string, resolveMetadata = resolveMusicMetadata): (target: MusicLibraryTarget) => Promise<MusicMetadata> {
  const requests = new Map<string, Promise<MusicMetadata>>();
  return (target) => {
    const key = `${target.source}-${target.type}-${target.id}`;
    if (!requests.has(key)) requests.set(key, (async () => {
      const directory = join(projectRoot, ".fonscape-cache", "music-metadata");
      const path = join(directory, `${key}.json`);
      const cache = await readFile(path, "utf8").then(JSON.parse).catch(() => null);
      const metadata = object(cache).schemaVersion === 1 ? cachedMetadata(object(cache).metadata) : null;
      if (metadata && typeof object(cache).savedAt === "number" && Date.now() - Number(object(cache).savedAt) < 24 * 60 * 60 * 1000) return metadata;
      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const result = cachedMetadata(await resolveMetadata(target));
          if (!result) throw new Error("音乐平台未返回有效的音乐信息");
          await mkdir(directory, { recursive: true });
          await writeFile(path, `${JSON.stringify({ schemaVersion: 1, savedAt: Date.now(), metadata: result })}\n`);
          return result;
        } catch (error) { lastError = error; }
      }
      if (metadata) return metadata;
      throw lastError;
    })().catch((error) => { requests.delete(key); throw error; }));
    return requests.get(key)!;
  };
}
