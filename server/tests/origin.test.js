import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedOrigin, isLocalDevOrigin } from "../src/utils/origin.js";

test("accepts localhost and 127.0.0.1 dev origins", () => {
  assert.equal(
    isAllowedOrigin("http://localhost:5173", ["http://localhost:5173"]),
    true,
  );
  assert.equal(
    isAllowedOrigin("http://127.0.0.1:5173", ["http://localhost:5173"]),
    true,
  );
  assert.equal(
    isAllowedOrigin("http://[::1]:5173", ["http://localhost:5173"]),
    true,
  );
});

test("isLocalDevOrigin allows any local dev HTTP port", () => {
  assert.equal(isLocalDevOrigin("http://localhost:5174"), true);
  assert.equal(isLocalDevOrigin("http://127.0.0.1:5174"), true);
  assert.equal(isLocalDevOrigin("http://[::1]:3000"), true);
  assert.equal(isLocalDevOrigin("https://localhost:5174"), false);
  assert.equal(isLocalDevOrigin("http://evil.com:5174"), false);
  assert.equal(isLocalDevOrigin(""), false);
  assert.equal(isLocalDevOrigin(null), false);
});

test("rejects untrusted origins", () => {
  assert.equal(
    isAllowedOrigin("https://evil.example", ["http://localhost:5173"]),
    false,
  );
  assert.equal(
    isAllowedOrigin("https://localhost:3000", ["http://localhost:5173"]),
    false,
  );
});

test('does not allow downgrading the configured production origin', () => {
  assert.equal(isAllowedOrigin('http://olympiad.example', ['https://olympiad.example']), false);
});
