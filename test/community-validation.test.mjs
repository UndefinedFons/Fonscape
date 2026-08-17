import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, normalizeNickname, normalizeUsername, validatePassword } from "../functions/_lib/community.js";

function rejected(fn, ...args) {
  assert.throws(() => fn(...args), ApiError);
}

test("usernames accept letters and digits in any combination with a length limit", () => {
  assert.equal(normalizeUsername("abc"), "abc");
  assert.equal(normalizeUsername("123"), "123");
  assert.equal(normalizeUsername("a1b2C3"), "a1b2C3");
  assert.equal(normalizeUsername("  Alice2026  "), "Alice2026");
  rejected(normalizeUsername, "ab");
  rejected(normalizeUsername, "abc_def");
  rejected(normalizeUsername, "abc!@#");
  rejected(normalizeUsername, "中文123");
  rejected(normalizeUsername, "a".repeat(21));
});

test("nicknames accept letters from any language plus digits and spaces", () => {
  assert.equal(normalizeNickname("丰"), "丰");
  assert.equal(normalizeNickname("中文"), "中文");
  assert.equal(normalizeNickname("A中文2026"), "A中文2026");
  assert.equal(normalizeNickname("Alice  中文"), "Alice 中文");
  rejected(normalizeNickname, "中文!");
  rejected(normalizeNickname, "中文🙂");
  rejected(normalizeNickname, "丰".repeat(11));
});

test("passwords accept letters and digits only with a length limit", () => {
  assert.equal(validatePassword("abc123"), "abc123");
  assert.equal(validatePassword("1234567890"), "1234567890");
  rejected(validatePassword, "abc12");
  rejected(validatePassword, "abc_123456");
  rejected(validatePassword, "abc123!");
  rejected(validatePassword, "a".repeat(21));
});
