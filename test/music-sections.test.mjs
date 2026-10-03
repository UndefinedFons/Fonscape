import assert from "node:assert/strict";
import test from "node:test";
import { getMusicSectionIcon, musicSections } from "../src/musicSections.ts";

test("songs, albums and playlists keep distinct shared icons", () => {
  assert.deepEqual(musicSections.map(({ id, label }) => ({ id, label })), [
    { id: "songs", label: "歌曲" },
    { id: "albums", label: "专辑" },
    { id: "playlists", label: "歌单" },
  ]);
  assert.equal(new Set(musicSections.map((section) => section.icon)).size, 3);
  for (const section of musicSections) assert.equal(getMusicSectionIcon(section.id), section.icon);
  assert.equal(getMusicSectionIcon("unknown"), musicSections[1].icon);
});
