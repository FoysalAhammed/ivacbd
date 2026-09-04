// ============================================================
//  OTP relay pure helpers — phone normalization, routing-key HMAC,
//  and the app-key gate. Imported directly under `node --test`
//  type-stripping (otp-core.ts depends only on node:crypto, no `@/`).
//  Secrets are set in-process; the module reads them lazily per call.
// ============================================================
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.OTP_PHONE_HMAC_SECRET = "otp-hmac-secret-please-ignore-0123456789";
process.env.OTP_APP_KEY = "test-app-key-abcdef123456";

const { normalizePhone, phoneKey, verifyAppKey } = await import(
  "../src/server/services/otp-core.ts"
);

test("normalizePhone collapses country-code / format differences", () => {
  assert.equal(normalizePhone("01712345678"), "1712345678");
  assert.equal(normalizePhone("+8801712345678"), "1712345678");
  assert.equal(normalizePhone("8801712345678"), "1712345678");
  assert.equal(normalizePhone(" 017-1234 5678 "), "1712345678");
});

test("phoneKey is deterministic and matches across formats", () => {
  const a = phoneKey("01712345678");
  const b = phoneKey("+8801712345678");
  assert.equal(a, b, "same number in different formats must map to one key");
  assert.match(a, /^[A-Za-z0-9_-]+$/, "base64url only");
});

test("phoneKey differs for different numbers and never contains the raw number", () => {
  const a = phoneKey("01712345678");
  const c = phoneKey("01812345678");
  assert.notEqual(a, c);
  assert.ok(!a.includes("1712345678"), "key must not leak the phone digits");
});

test("phoneKey rejects a number with too few digits", () => {
  assert.throws(() => phoneKey("12"));
});

test("verifyAppKey accepts the exact key and rejects everything else", () => {
  assert.equal(verifyAppKey("test-app-key-abcdef123456"), true);
  assert.equal(verifyAppKey("wrong-key"), false);
  assert.equal(verifyAppKey(""), false);
  assert.equal(verifyAppKey("test-app-key-abcdef12345"), false); // one char short
});

test("verifyAppKey fails closed when OTP_APP_KEY is unset or placeholder", () => {
  const saved = process.env.OTP_APP_KEY;
  try {
    delete process.env.OTP_APP_KEY;
    assert.equal(verifyAppKey("anything"), false);
    process.env.OTP_APP_KEY = "CHANGE_ME_random_value";
    assert.equal(verifyAppKey("CHANGE_ME_random_value"), false);
  } finally {
    process.env.OTP_APP_KEY = saved;
  }
});
