import test from "node:test";
import assert from "node:assert/strict";
import { verifyEmailOtp } from "../src/services/emailOtp.js";

test("verifyEmailOtp rejects invalid email and OTP format before database query", async () => {
  await assert.rejects(verifyEmailOtp("", "123456"), (err) => err.status === 400);
  await assert.rejects(verifyEmailOtp("invalid-email", "123456"), (err) => err.status === 400);
  await assert.rejects(verifyEmailOtp("test@example.com", ""), (err) => err.status === 400);
  await assert.rejects(verifyEmailOtp("test@example.com", "123"), (err) => err.status === 400);
  await assert.rejects(verifyEmailOtp("test@example.com", "abcdef"), (err) => err.status === 400);
  await assert.rejects(verifyEmailOtp("test@example.com", "1234567"), (err) => err.status === 400);
});
