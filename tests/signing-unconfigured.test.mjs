// ============================================================
//  Fail-closed configuration checks. Runs in its OWN process (node
//  --test isolates each file), so no signing keys are present in the
//  environment here — the opposite of signing.test.mjs.
//
//  A missing/placeholder private key must make signing THROW (never
//  emit an unsigned or half-signed token), and a missing public key
//  must make verification return null (never accept-by-default).
// ============================================================
import { test, before } from "node:test";
import assert from "node:assert/strict";

// Guarantee a clean slate even if the shell exported these.
delete process.env.LICENSE_SIGNING_PRIVATE_KEY;
delete process.env.LICENSE_SIGNING_PUBLIC_KEY;

let signLicense, verifyLicense;
before(async () => {
  const mod = await import("../src/server/crypto/signing.ts");
  ({ signLicense, verifyLicense } = mod);
});

const payload = {
  v: 1, keyId: "k1", licenseId: "a".repeat(24), status: "ACTIVE", maxDevices: 1,
  installationId: "00000000-0000-4000-8000-000000000000", planName: "1 PC",
  customerName: "X", issuedAt: "", startsAt: "", expiresAt: "", serverTime: "",
};

test("signLicense throws when no private key is configured", () => {
  assert.throws(() => signLicense(payload), /not configured/i);
});

test("signLicense throws for the .env.example placeholder value", () => {
  process.env.LICENSE_SIGNING_PRIVATE_KEY = "BASE64_ENCODED_PKCS8_PRIVATE_KEY_HERE";
  assert.throws(() => signLicense(payload), /not configured/i);
  delete process.env.LICENSE_SIGNING_PRIVATE_KEY;
});

test("verifyLicense returns null when no public key is configured", () => {
  assert.equal(verifyLicense("aaa.bbb"), null);
});
