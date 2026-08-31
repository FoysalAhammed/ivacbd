// ============================================================
//  secretbox (AES-256-GCM) round-trip + tamper/format safety.
//  Imported directly under Node's type-stripping (`node --test`):
//  secretbox.ts imports only node:crypto, so no bundler is needed.
//  We set the encryption secret in-process — the module reads it
//  lazily on each call, so tests are hermetic and never touch .env.
// ============================================================
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.LICENSE_KEY_ENC_SECRET = "test-secret-please-ignore-0123456789";

const { encryptSecret, decryptSecret } = await import("../src/server/crypto/secretbox.ts");

test("round-trips a license key unchanged", () => {
  const plain = "IVAC-ABCD-EFGH-JKLM-NPQR";
  const blob = encryptSecret(plain);
  assert.notEqual(blob, plain, "ciphertext must not equal plaintext");
  assert.match(blob, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(decryptSecret(blob), plain);
});

test("two encryptions of the same value differ (random IV)", () => {
  const a = encryptSecret("same-value");
  const b = encryptSecret("same-value");
  assert.notEqual(a, b, "IV reuse would make ciphertexts identical");
  assert.equal(decryptSecret(a), "same-value");
  assert.equal(decryptSecret(b), "same-value");
});

test("rejects tampered ciphertext (GCM auth tag)", () => {
  const blob = encryptSecret("do-not-tamper");
  const parts = blob.split(".");
  // Flip a character in the ciphertext segment.
  const ct = parts[3];
  parts[3] = (ct[0] === "A" ? "B" : "A") + ct.slice(1);
  assert.equal(decryptSecret(parts.join(".")), null);
});

test("returns null for malformed / empty input", () => {
  assert.equal(decryptSecret(null), null);
  assert.equal(decryptSecret(undefined), null);
  assert.equal(decryptSecret(""), null);
  assert.equal(decryptSecret("not-a-blob"), null);
  assert.equal(decryptSecret("v2.aaa.bbb.ccc"), null); // wrong version
});

test("wrong secret cannot decrypt (returns null, no throw)", async () => {
  const blob = encryptSecret("secret-under-key-A");
  // Re-import with a different secret via a fresh module query string so the
  // lazily-read env value changes for the second instance.
  process.env.LICENSE_KEY_ENC_SECRET = "a-completely-different-secret-value-xyz";
  const mod2 = await import("../src/server/crypto/secretbox.ts?v=2");
  assert.equal(mod2.decryptSecret(blob), null);
  // restore for any later tests
  process.env.LICENSE_KEY_ENC_SECRET = "test-secret-please-ignore-0123456789";
});
