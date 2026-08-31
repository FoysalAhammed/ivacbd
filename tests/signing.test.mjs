// ============================================================
//  The signing ↔ verification contract — the single most important
//  cross-boundary guarantee in the whole system. If this breaks,
//  every activation the extension performs silently fails its
//  signature check.
//
//  We prove that a token produced by the server's signLicense():
//    1) has the exact wire format  base64url(payload).base64url(sig),
//    2) verifies with the server's own verifyLicense(), AND
//    3) verifies via Web Crypto (crypto.subtle) using the SAME steps
//       the extension's src/license.js runs — importKey('spki', …,
//       ECDSA P-256) + subtle.verify(SHA-256). This is what actually
//       runs in the browser, so it's what we assert against.
//    4) rejects any tampering of the payload or the signature, and
//       rejects verification under a different public key.
// ============================================================
import { test, before } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

// A throwaway P-256 keypair for the test process only. We wire it into
// the env the server module reads, then import the module lazily.
const kp = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
const PRIV_B64 = kp.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
const PUB_B64 = kp.publicKey.export({ type: "spki", format: "der" }).toString("base64");

process.env.LICENSE_SIGNING_PRIVATE_KEY = PRIV_B64;
process.env.LICENSE_SIGNING_PUBLIC_KEY = PUB_B64;
process.env.LICENSE_SIGNING_KEY_ID = "k1";

// A second, unrelated keypair — a token signed by kp must NOT verify here.
const other = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
const OTHER_PUB_B64 = other.publicKey.export({ type: "spki", format: "der" }).toString("base64");

let signLicense, verifyLicense, keyId;
before(async () => {
  const mod = await import("../src/server/crypto/signing.ts");
  ({ signLicense, verifyLicense, keyId } = mod);
});

function makePayload(over = {}) {
  const now = new Date();
  const exp = new Date(now.getTime() + 30 * 86400000);
  return {
    v: 1,
    keyId: "k1",
    licenseId: "a".repeat(24),
    status: "ACTIVE",
    maxDevices: 3,
    installationId: crypto.randomUUID(),
    planName: "3 PC",
    customerName: "Test User",
    issuedAt: now.toISOString(),
    startsAt: now.toISOString(),
    expiresAt: exp.toISOString(),
    serverTime: now.toISOString(),
    ...over,
  };
}

// Mirror of extension/src/license.js verifyToken(), byte-for-byte.
async function extensionVerify(token, pubB64 = PUB_B64) {
  const parts = String(token).split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  const data = Buffer.from(parts[0], "base64url");
  const sig = Buffer.from(parts[1], "base64url");
  const key = await crypto.subtle.importKey(
    "spki",
    Buffer.from(pubB64, "base64"),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, sig, data);
}

test("keyId() reflects the configured id", () => {
  assert.equal(keyId(), "k1");
});

test("token has the exact base64url(payload).base64url(sig) wire format", () => {
  const token = signLicense(makePayload());
  const parts = token.split(".");
  assert.equal(parts.length, 2);
  // base64url: no '+', '/', or '=' padding
  for (const p of parts) {
    assert.ok(p.length > 0);
    assert.doesNotMatch(p, /[+/=]/, "segment must be base64url (url-safe, unpadded)");
  }
  // the first segment decodes back to the exact JSON we signed
  const decoded = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  assert.equal(decoded.status, "ACTIVE");
  assert.equal(decoded.v, 1);
});

test("server verifyLicense() round-trips the payload", () => {
  const p = makePayload({ customerName: "Round Trip", maxDevices: 5 });
  const token = signLicense(p);
  const back = verifyLicense(token);
  assert.ok(back, "verifyLicense returned null for a valid token");
  assert.equal(back.customerName, "Round Trip");
  assert.equal(back.maxDevices, 5);
  assert.equal(back.installationId, p.installationId);
});

test("extension Web Crypto path accepts a genuine token", async () => {
  const token = signLicense(makePayload());
  assert.equal(await extensionVerify(token), true);
});

test("a tampered payload is rejected by BOTH verifiers", async () => {
  const token = signLicense(makePayload({ maxDevices: 1 }));
  const [p, s] = token.split(".");
  // forge maxDevices → re-encode a different payload, keep the old signature
  const forged = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  forged.maxDevices = 99;
  const forgedSeg = Buffer.from(JSON.stringify(forged), "utf8").toString("base64url");
  const forgedToken = `${forgedSeg}.${s}`;
  assert.equal(verifyLicense(forgedToken), null);
  assert.equal(await extensionVerify(forgedToken), false);
});

test("a tampered signature is rejected by BOTH verifiers", async () => {
  const token = signLicense(makePayload());
  const [p, s] = token.split(".");
  // flip the last byte of the signature
  const sigBytes = Buffer.from(s, "base64url");
  sigBytes[sigBytes.length - 1] ^= 0xff;
  const badToken = `${p}.${sigBytes.toString("base64url")}`;
  assert.equal(verifyLicense(badToken), null);
  assert.equal(await extensionVerify(badToken), false);
});

test("a genuine token does NOT verify under a different public key", async () => {
  const token = signLicense(makePayload());
  assert.equal(await extensionVerify(token, OTHER_PUB_B64), false);
});

test("malformed tokens are rejected, never throw", () => {
  assert.equal(verifyLicense("not-a-token"), null);
  assert.equal(verifyLicense("only.one.extra"), null);
  assert.equal(verifyLicense(""), null);
});
