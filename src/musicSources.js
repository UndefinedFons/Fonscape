const NETEASE_HOSTS = new Set(["music.163.com", "y.music.163.com"]);
const TENCENT_HOSTS = new Set(["y.qq.com", "i.y.qq.com"]);

/** @param {URL} url */
function fragmentParameters(url) {
  const queryIndex = url.hash.indexOf("?");
  return queryIndex >= 0 ? new URLSearchParams(url.hash.slice(queryIndex + 1)) : new URLSearchParams();
}

/**
 * Accept only direct NetEase Cloud Music and QQ Music song URLs. The returned
 * provider/id pair is safe to pass to Meting because no caller-controlled host
 * is fetched.
 *
 * @param {unknown} value
 * @returns {{ source: "netease" | "tencent", id: string } | null}
 */
export function parseMetingSongUrl(value) {
  const input = String(value || "").trim();
  if (!input || input.length > 2048) return null;
  let url;
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
