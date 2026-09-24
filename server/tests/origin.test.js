import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedOrigin } from "../src/utils/origin.js";

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
