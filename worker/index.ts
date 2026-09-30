/// <reference types="@cloudflare/workers-types" />

import { onRequest as handleApiRequest } from "../functions/api/[[path]].ts";
import { onRequest as handleAudioRequest } from "../functions/audio/[[path]].ts";
import { cleanupRuntimeData, reconcileRuntimeCounters } from "../functions/_lib/abuse.ts";
import { audioAssetSizes } from "../functions/_generated/content-targets.js";

import type { AppEnv, AssetsBinding, Database, RequestContext } from "../functions/types.ts";

interface WorkerEnv extends AppEnv {
  DB: Database;
  ASSETS: AssetsBinding;
}

export { audioAssetSizes };

export function canonicalAudioPathname(pathname: string): string {
  try {
    return pathname.split("/").map((segment) => encodeURIComponent(decodeURIComponent(segment))).join("/");
  } catch {
    return pathname;
  }
}

function routePath(pathname: string, prefix: string): string[] {
  const value = pathname.slice(prefix.length).replace(/^\/+|\/+$/gu, "");
  return value ? value.split("/") : [];
}

function pagesContext(request: Request, env: WorkerEnv, executionContext: ExecutionContext, prefix: string): RequestContext & { env: WorkerEnv } {
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

function audioAssetsBinding(assets: AssetsBinding): AssetsBinding {
  return {
    async fetch(input: RequestInfo | URL, init?: RequestInit) {
      const request = new Request(input, init);
      if (!request.headers.has("Range")) return assets.fetch(request);
      const headers = new Headers(request.headers);
      headers.delete("Range");
      const response = await assets.fetch(new Request(request.url, { method: request.method, headers }));
      const size = (audioAssetSizes as Readonly<Record<string, number>>)[canonicalAudioPathname(new URL(request.url).pathname)];
      if (!response.ok || response.status !== 200 || !size || Number(response.headers.get("Content-Length")) > 0) {
        return response;
      }
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set("Content-Length", String(size));
      return new Response(response.body, { status: response.status, headers: responseHeaders });
    },
  };
}

function adminRouteRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/u, "") || "/";
  if (pathname === "/admin") return Response.redirect(new URL("/", url), 302);
  return null;
}

export default {
  async fetch(request: Request, env: WorkerEnv, executionContext: ExecutionContext): Promise<Response> {
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
  async scheduled(controller: ScheduledController, env: WorkerEnv): Promise<void> {
    const now = controller.scheduledTime || Date.now();
    const cleanup = await cleanupRuntimeData(env.DB, now);
    const reconciliation = await reconcileRuntimeCounters(env.DB, now);
    console.log({ event: "runtime_maintenance_completed", ...cleanup, ...reconciliation });
  },
};
