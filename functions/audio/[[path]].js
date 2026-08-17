const AUDIO_CACHE_CONTROL = "public, max-age=86400";

export function parseRange(value, size) {
  if (!value?.startsWith("bytes=") || value.includes(",")) return null;
  const [startText, endText] = value.slice(6).split("-");
  if (!startText && !endText) return null;

  let start;
  let end;
  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(startText);
    end = endText ? Number(endText) : size - 1;
    if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  }

  if (start < 0 || start >= size || end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}

function audioHeaders(source, advertiseRanges = true) {
  const headers = new Headers(source);
  if (advertiseRanges) headers.set("Accept-Ranges", "bytes");
  else headers.delete("Accept-Ranges");
  headers.set("Cache-Control", AUDIO_CACHE_CONTROL);
  headers.set("Access-Control-Allow-Origin", "*");
  return headers;
}

export function rangedStream(body, start, end) {
  const reader = body.getReader();
  let offset = 0;
  let finished = false;
  return new ReadableStream({
    async pull(controller) {
      while (!finished) {
        const result = await reader.read();
        if (result.done) {
          finished = true;
          controller.close();
          return;
        }
        const value = result.value;
        const chunkStart = offset;
        offset += value.byteLength;
        if (offset <= start) continue;
        const from = Math.max(0, start - chunkStart);
        const to = Math.min(value.byteLength, end + 1 - chunkStart);
        if (from < to) controller.enqueue(value.slice(from, to));
        if (offset > end) {
          finished = true;
          await reader.cancel("requested audio range is complete").catch(() => {});
          controller.close();
        }
        return;
      }
    },
    cancel(reason) {
      finished = true;
      return reader.cancel(reason);
    },
  });
}

export async function onRequest(context) {
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return context.next();
  }

  const requestedRange = context.request.headers.get("Range");
  const assetResponse = await context.env.ASSETS.fetch(context.request);
  if (!assetResponse.ok) return assetResponse;

  const headers = audioHeaders(assetResponse.headers);
  if (context.request.method === "HEAD" || !requestedRange) {
    return new Response(context.request.method === "HEAD" ? null : assetResponse.body, {
      status: assetResponse.status,
      headers,
    });
  }

  if (assetResponse.status === 206) {
    return new Response(assetResponse.body, { status: 206, headers });
  }

  const size = Number(headers.get("Content-Length"));
  if (!Number.isSafeInteger(size) || size < 0 || !assetResponse.body) {
    return new Response(assetResponse.body, {
      status: assetResponse.status,
      headers: audioHeaders(headers, false),
    });
  }
  const range = parseRange(requestedRange, size);
  if (!range) {
    headers.set("Content-Range", `bytes */${size}`);
    headers.set("Content-Length", "0");
    await assetResponse.body.cancel("invalid audio range");
    return new Response(null, { status: 416, headers });
  }

  headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
  headers.set("Content-Length", String(range.end - range.start + 1));
  return new Response(rangedStream(assetResponse.body, range.start, range.end), {
    status: 206,
    headers,
  });
}
