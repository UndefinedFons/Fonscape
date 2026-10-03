import type { MusicLibraryTarget } from "./musicTypes.ts";

const NETEASE_HOSTS = new Set(["music.163.com", "y.music.163.com"]);
const TENCENT_HOSTS = new Set(["y.qq.com", "i.y.qq.com"]);

function fragmentParameters(url: URL): URLSearchParams {
  const queryIndex = url.hash.indexOf("?");
  return queryIndex >= 0 ? new URLSearchParams(url.hash.slice(queryIndex + 1)) : new URLSearchParams();
}

/**
 * Accept only direct NetEase Cloud Music and QQ Music song URLs. The returned
 * provider/id pair is safe to pass to Meting because no caller-controlled host
 * is fetched.
 *
 */
export function parseMetingSongUrl(value: unknown): { source: "netease" | "tencent"; id: string } | null {
  const input = String(value || "").trim();
  if (!input || input.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  const hostname = url.hostname.toLowerCase().replace(/^www\./u, "");

  if (NETEASE_HOSTS.has(hostname)) {
    const id = url.searchParams.get("id") || fragmentParameters(url).get("id") || "";
    const songRoute = url.pathname === "/song" || /(?:^|\/)song(?:[/?]|$)/u.test(url.hash.slice(1));
    return songRoute && /^\d{1,20}$/u.test(id) ? { source: "netease", id } : null;
  }

  if (TENCENT_HOSTS.has(hostname)) {
    const directPath = url.pathname.match(/\/(?:songDetail|song)\/([A-Za-z0-9]{8,32})(?:\.html)?\/?$/u);
    const id = directPath?.[1]
      || url.searchParams.get("songmid")
      || url.searchParams.get("songMid")
      || fragmentParameters(url).get("songmid")
      || "";
    return /^[A-Za-z0-9]{8,32}$/u.test(id) ? { source: "tencent", id } : null;
  }

  return null;
}

/**
 * Accept direct NetEase Cloud Music and QQ Music song, album, and playlist
 * pages. Artist pages and caller-controlled hosts remain outside the library
 * API because they cannot be mapped to this target shape.
 */
export function parseMetingLibraryUrl(value: unknown): MusicLibraryTarget | null {
  const input = String(value || "").trim();
  if (!input || input.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  const hostname = url.hostname.toLowerCase().replace(/^www\./u, "");

  if (NETEASE_HOSTS.has(hostname)) {
    const pathMatch = url.pathname.match(/^\/(song|album|playlist)(?:\/(\d{1,20}))?\/?$/u);
    const fragmentRoute = url.hash.slice(1).split("?", 1)[0].match(/^\/?(song|album|playlist)\/?$/u)?.[1];
    const route = pathMatch?.[1]
      || fragmentRoute
      || "";
    const id = pathMatch?.[2] || url.searchParams.get("id") || fragmentParameters(url).get("id") || "";
    return route && /^\d{1,20}$/u.test(id)
      ? { source: "netease", type: route as MusicLibraryTarget["type"], id }
      : null;
  }

  if (TENCENT_HOSTS.has(hostname)) {
    const directPath = url.pathname.match(/\/(?:n\/ryqq\/(songDetail|albumDetail|playlistDetail)|n\/yqq\/(song|album|playlist))\/([A-Za-z0-9]{6,32})(?:\.html)?\/?$/u);
    if (!directPath) return null;
    const route = directPath[1] || directPath[2];
    const type = route === "songDetail" || route === "song" ? "song"
      : route === "albumDetail" || route === "album" ? "album"
        : "playlist";
    const idPattern = type === "playlist" ? /^(?:\d{6,32}|[A-Za-z0-9]{8,32})$/u : /^[A-Za-z0-9]{8,32}$/u;
    if (!idPattern.test(directPath[3])) return null;
    return { source: "tencent", type: type as MusicLibraryTarget["type"], id: directPath[3] };
  }

  return null;
}
