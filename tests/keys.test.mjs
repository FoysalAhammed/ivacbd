// ============================================================
//  License-key generation, hashing, and masking (server crypto/keys.ts).
//  These properties are what let the extension send a key in any
//  reasonable form and still match the stored hash, and what keep the
//  plaintext key out of the database and the admin UI.
// ============================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateLicenseKey, hashLicenseKey, maskLicenseKey } from "../src/server/crypto/keys.ts";
import { LICENSE_KEY_REGEX } from "../src/shared/constants.ts";

test("generateLicenseKey produces canonical XXXX-XXXX-XXXX-XXXX", () => {
  for (let i = 0; i < 200; i++) {
    const k = generateLicenseKey();
    assert.equal(k.length, 19);
    assert.equal(k.split("-").length, 4);
    assert.match(k, LICENSE_KEY_REGEX, `generated key ${k} must satisfy the validation regex`);
  }
});

test("generated keys avoid the ambiguous letters I, L, O, U", () => {
  for (let i = 0; i < 200; i++) {
    const body = generateLicenseKey().replace(/-/g, "");
    assert.doesNotMatch(body, /[ILOU]/, "Crockford alphabet excludes I/L/O/U");
  }
});

test("generateLicenseKey is effectively unique", () => {
  const seen = new Set();
  for (let i = 0; i < 5000; i++) seen.add(generateLicenseKey());
  assert.equal(seen.size, 5000, "collisions in 5000 draws");
});

test("hashLicenseKey is a 64-char hex SHA-256, deterministic", () => {
  const k = generateLicenseKey();
  const a = hashLicenseKey(k);
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.equal(a, hashLicenseKey(k), "same input → same hash");
});

test("hashLicenseKey normalizes case and surrounding whitespace", () => {
  const k = generateLicenseKey();
  assert.equal(hashLicenseKey(k), hashLicenseKey(k.toLowerCase()));
  assert.equal(hashLicenseKey(k), hashLicenseKey("   " + k + "  "));
  assert.equal(hashLicenseKey(k), hashLicenseKey(k.toLowerCase().trim()));
});

test("hashLicenseKey is hyphen-sensitive (canonical form is the stored form)", () => {
  // The stored hash is of the hyphenated key the schema validates and the
  // extension sends, so stripping hyphens deliberately does NOT collide.
  const k = generateLicenseKey();
  assert.notEqual(hashLicenseKey(k), hashLicenseKey(k.replace(/-/g, "")));
});

test("different keys hash differently", () => {
  assert.notEqual(hashLicenseKey(generateLicenseKey()), hashLicenseKey(generateLicenseKey()));
});

test("maskLicenseKey shows only first 4 + last 4, hides the rest", () => {
  const k = generateLicenseKey();
  const masked = maskLicenseKey(k);
  const clean = k.replace(/-/g, "");
  assert.ok(masked.startsWith(clean.slice(0, 4)));
  assert.ok(masked.endsWith(clean.slice(-4)));
  assert.match(masked, /•/, "middle must be bulleted");
  assert.doesNotMatch(masked, /-/, "mask has no hyphens");
  // the 8 hidden middle chars must not appear verbatim
  assert.ok(!masked.includes(clean.slice(4, 12)));
});

test("maskLicenseKey degrades safely on short input", () => {
  assert.equal(maskLicenseKey("AB"), "••••");
});
