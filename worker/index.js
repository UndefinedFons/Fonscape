import { onRequest as handleApiRequest } from "../functions/api/[[path]].js";
import { onRequest as handleAudioRequest } from "../functions/audio/[[path]].js";
import { cleanupRuntimeData, reconcileRuntimeCounters } from "../functions/_lib/abuse.js";
import { audioAssetSizes } from "../functions/_generated/content-targets.js";

export { audioAssetSizes };

export function canonicalAudioPathname(pathname) {
  try {
    return pathname.split("/").map((segment) => encodeURIComponent(decodeURIComponent(segment))).join("/");
  } catch {
    return pathname;
  }
}

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
      const size = audioAssetSizes[canonicalAudioPathname(new URL(request.url).pathname)];
      if (!response.ok || response.status !== 200 || !size || Number(response.headers.get("Content-Length")) > 0) {
        return response;
      }
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set("Content-Length", String(size));
      return new Response(response.body, { status: response.status, headers: responseHeaders });
    },
  };
}

function adminRouteRedirect(request) {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/u, "") || "/";
  if (pathname === "/admin/setup") return Response.redirect(new URL("/#/admin/setup", url), 302);
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return Response.redirect(new URL("/#/", url), 302);
  return null;
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
    const adminRedirect = adminRouteRedirect(request);
    if (adminRedirect) return adminRedirect;
    return env.ASSETS.fetch(request);
  },
  async scheduled(controller, env) {
    const now = controller.scheduledTime || Date.now();
    const cleanup = await cleanupRuntimeData(env.DB, now);
    const reconciliation = await reconcileRuntimeCounters(env.DB, now);
    console.log({ event: "runtime_maintenance_completed", ...cleanup, ...reconciliation });
  },
};
