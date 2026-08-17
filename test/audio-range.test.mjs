import assert from "node:assert/strict";
import test from "node:test";
import { onRequest, parseRange } from "../functions/audio/[[path]].js";

const encoder = new TextEncoder();

test("audio range parsing covers bounded, open, and suffix requests", () => {
  assert.deepEqual(parseRange("bytes=2-5", 10), { start: 2, end: 5 });
  assert.deepEqual(parseRange("bytes=7-", 10), { start: 7, end: 9 });
  assert.deepEqual(parseRange("bytes=-3", 10), { start: 7, end: 9 });
  assert.equal(parseRange("bytes=10-11", 10), null);
  assert.equal(parseRange("bytes=1-2,4-5", 10), null);
});

test("audio range fallback streams only the requested bytes and cancels upstream", async () => {
  let cancelled = false;
  const context = {
    request: new Request("https://example.test/audio/example.mp3", {
      headers: { Range: "bytes=2-5" },
    }),
    env: {
      ASSETS: {
        async fetch(request) {
          assert.equal(request.headers.get("Range"), "bytes=2-5");
          let index = 0;
          const chunks = [encoder.encode("012"), encoder.encode("3456789")];
          return new Response(new ReadableStream({
            pull(controller) {
              if (index < chunks.length) controller.enqueue(chunks[index++]);
              else controller.close();
            },
            cancel() {
              cancelled = true;
            },
          }, { highWaterMark: 0 }), {
            headers: {
              "Content-Length": "10",
              "Content-Type": "audio/mpeg",
            },
          });
        },
      },
    },
  };

  const response = await onRequest(context);
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("Content-Range"), "bytes 2-5/10");
  assert.equal(response.headers.get("Content-Length"), "4");
  assert.equal(await response.text(), "2345");
  assert.equal(cancelled, true);
});

test("audio handler passes through a native asset range response", async () => {
  const context = {
    request: new Request("https://example.test/audio/example.mp3", {
      headers: { Range: "bytes=2-3" },
    }),
    env: {
      ASSETS: {
        async fetch() {
          return new Response("23", {
            status: 206,
            headers: {
              "Content-Length": "2",
              "Content-Range": "bytes 2-3/10",
            },
          });
        },
      },
    },
  };

  const response = await onRequest(context);
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("Content-Range"), "bytes 2-3/10");
  assert.equal(await response.text(), "23");
});

test("invalid audio ranges return 416 without buffering the asset", async () => {
  let cancelled = false;
  const context = {
    request: new Request("https://example.test/audio/example.mp3", {
      headers: { Range: "bytes=99-100" },
    }),
    env: {
      ASSETS: {
        async fetch() {
          return new Response(new ReadableStream({
            cancel() {
              cancelled = true;
            },
          }), { headers: { "Content-Length": "10" } });
        },
      },
    },
  };

  const response = await onRequest(context);
  assert.equal(response.status, 416);
  assert.equal(response.headers.get("Content-Range"), "bytes */10");
  assert.equal(await response.text(), "");
  assert.equal(cancelled, true);
});
