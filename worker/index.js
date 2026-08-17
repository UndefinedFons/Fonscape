import { onRequest as handleApiRequest } from "../functions/api/[[path]].js";
import { onRequest as handleAudioRequest } from "../functions/audio/[[path]].js";
import { cleanupRuntimeData } from "../functions/_lib/abuse.js";

export const audioAssetSizes = Object.freeze({});

function routePath(pathname, prefix) {
  const value = pathname.slice(prefix.length).replace(/^\/+|\/+$/gu, "");
  return value ? value.split("/") : [];
}

function pagesContext(request, env, executionContext, prefix) {
  return {
    request,
    env,
    params: { path: routePath(new URL(request.url).pathname, prefix) },
    data: {},
    waitUntil(promise) {
      executionContext.waitUntil(promise);
    },
    async next(input, init) {
      if (input === undefined) return env.ASSETS.fetch(request);
      const target = typeof input === "string" ? new URL(input, request.url) : input;
      return env.ASSETS.fetch(new Request(target, init));
    },
  };
}

function audioAssetsBinding(assets) {
  return {
    async fetch(input, init) {
      const request = new Request(input, init);
      if (!request.headers.has("Range")) return assets.fetch(request);
      const headers = new Headers(request.headers);
      headers.delete("Range");
      const response = await assets.fetch(new Request(request.url, { method: request.method, headers }));
      const size = audioAssetSizes[new URL(request.url).pathname];
      if (!response.ok || response.status !== 200 || !size || Number(response.headers.get("Content-Length")) > 0) {
        return response;
      }
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set("Content-Length", String(size));
      return new Response(response.body, { status: response.status, headers: responseHeaders });
    },
  };
}

export default {
  async fetch(request, env, executionContext) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return handleApiRequest(pagesContext(request, env, executionContext, "/api"));
    }
    if (pathname === "/audio" || pathname.startsWith("/audio/")) {
      return handleAudioRequest(pagesContext(
        request,
        { ...env, ASSETS: audioAssetsBinding(env.ASSETS) },
        executionContext,
        "/audio",
      ));
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(controller, env) {
    const result = await cleanupRuntimeData(env.DB, controller.scheduledTime || Date.now());
    console.log({ event: "runtime_maintenance_completed", ...result });
  },
};
