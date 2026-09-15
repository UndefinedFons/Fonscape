import assert from "node:assert/strict";
import test from "node:test";
import {
  AVATAR_MAX_BYTES as SERVER_AVATAR_MAX_BYTES,
  AVATAR_TOTAL_MAX_BYTES,
} from "../functions/api/[[path]].js";
import {
  AVATAR_INPUT_MAX_BYTES,
  AVATAR_MAX_BYTES,
  AVATAR_OUTPUT_SIZE,
  validateAvatarFile,
} from "../src/community/api.js";

test("avatar limits keep raw input separate from the stored WebP", () => {
  assert.equal(AVATAR_INPUT_MAX_BYTES, 10 * 1024 * 1024);
  assert.equal(AVATAR_MAX_BYTES, 100 * 1024);
  assert.equal(SERVER_AVATAR_MAX_BYTES, AVATAR_MAX_BYTES);
  assert.equal(AVATAR_TOTAL_MAX_BYTES, 100 * 1024 * 1024);
  assert.equal(AVATAR_OUTPUT_SIZE, 512);
});

test("avatar selection rejects files larger than 10 MB before decoding", async () => {
  const oversized = new Blob([
    new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
    new Uint8Array(AVATAR_INPUT_MAX_BYTES),
  ], { type: "image/webp" });

  await assert.rejects(validateAvatarFile(oversized), (error) => {
    assert.equal(error.status, 413);
    assert.equal(error.code, "avatar_input_too_large");
    return true;
  });
});

test("avatar selection still accepts supported image signatures within the input limit", async () => {
  const webp = new Blob([
    new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
  ], { type: "image/webp" });

  assert.equal(await validateAvatarFile(webp), "image/webp");
});
