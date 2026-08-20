import assert from "node:assert/strict";
import test from "node:test";
import { getMusicSectionIcon, musicSections } from "../src/musicSections.js";

test("songs, artists, and albums keep distinct shared icons", () => {
  assert.deepEqual(musicSections.map((section) => section.id), ["songs", "artists", "albums"]);
  assert.equal(new Set(musicSections.map((section) => section.icon)).size, 3);
  for (const section of musicSections) assert.equal(getMusicSectionIcon(section.id), section.icon);
  assert.equal(getMusicSectionIcon("unknown"), musicSections[2].icon);
});
