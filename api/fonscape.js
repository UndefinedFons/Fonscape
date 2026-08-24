import { onRequest as onPagesApiRequest } from "../functions/api/[[path]].js";
import { waitUntil as vercelWaitUntil } from "@vercel/functions";
import { createTursoD1Database } from "../server/turso-d1.js";

let cachedDatabase = null;
let cachedDatabaseKey = null;

function tursoConfiguration(environment) {
  const url = String(environment?.TURSO_DATABASE_URL || "").trim();
  const authToken = String(environment?.TURSO_AUTH_TOKEN || "").trim();
  if (!url) return null;
  // Local file URLs are useful for the migration tool and local API checks.
  if (!authToken && !url.startsWith("file:") && url !== ":memory:") return null;
  return { url, authToken };
}

function databaseFor(environment) {
  const config = tursoConfiguration(environment);
  if (!config) return null;
  const key = `${config.url}\u0000${config.authToken}`;
  if (!cachedDatabase || cachedDatabaseKey !== key) {
    cachedDatabase = createTursoD1Database(config);
    cachedDatabaseKey = key;
  }
  return cachedDatabase;
}

export function vercelClientAddress(request) {
  const forwarded = request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for") || "";
  const address = forwarded.split(",")[0].trim();
  if (!address || address.length > 96 || !/^[0-9a-f:.]+$/iu.test(address)) return "";
  return address;
}

export function requestWithVercelClientAddress(request, environment = process.env) {
  if (environment?.VERCEL !== "1") return request;
  const headers = new Headers(request.headers);
  // Do not allow a visitor to supply a Cloudflare-specific header on Vercel.
  headers.delete("CF-Connecting-IP");
  const address = vercelClientAddress(request);
  if (address) headers.set("CF-Connecting-IP", address);
  return new Request(request, { headers });
}

export function vercelApiPath(request) {
  const url = new URL(request.url);
  const rewrittenPath = url.searchParams.get("path");
  if (rewrittenPath !== null) return rewrittenPath.split("/").filter(Boolean);
  const pathname = url.pathname;
  const suffix = pathname === "/api" ? "" : pathname.replace(/^\/api\/?/u, "");
  return suffix.split("/").filter(Boolean);
}

export function createVercelApiContext(request, environment = process.env) {
  const env = { ...environment };
  const database = databaseFor(environment);
  if (database) env.DB = database;
  return {
    request: requestWithVercelClientAddress(request, environment),
    env,
    params: { path: vercelApiPath(request) },
    data: {},
    // Keep non-critical maintenance inside Vercel's function lifetime instead
    // of leaving it as an unmanaged Promise after the response is sent.
    waitUntil(promise) {
      vercelWaitUntil(Promise.resolve(promise));
    },
  };
}

export async function handleVercelApiRequest(request, environment = process.env) {
  return onPagesApiRequest(createVercelApiContext(request, environment));
}

export default {
  async fetch(request) {
    return handleVercelApiRequest(request);
  },
};
