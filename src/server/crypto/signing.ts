// ============================================================
//  License signing (Phase 18). Asymmetric ECDSA P-256 / ES256.
//    • The PRIVATE key lives only here (env), never in the extension.
//    • Signatures use IEEE-P1363 (r‖s, 64 bytes) so the extension's
//      Web Crypto `verify` accepts them directly.
//    • Token format:  base64url(payloadJSON) + "." + base64url(sig)
//  The extension splits on ".", verifies the signature over the
//  payload bytes with the embedded PUBLIC key, then JSON.parses.
// ============================================================
import crypto from "node:crypto";
import type { SignedLicensePayload } from "@/shared/types";

let cachedKey: crypto.KeyObject | null = null;

function privateKey(): crypto.KeyObject {
  if (cachedKey) return cachedKey;
  const b64 = process.env.LICENSE_SIGNING_PRIVATE_KEY;
  if (!b64 || b64.startsWith("BASE64_")) {
    throw new Error("LICENSE_SIGNING_PRIVATE_KEY is not configured");
  }
  cachedKey = crypto.createPrivateKey({
    key: Buffer.from(b64, "base64"),
    format: "der",
    type: "pkcs8",
  });
  return cachedKey;
}

export function keyId(): string {
  return process.env.LICENSE_SIGNING_KEY_ID || "k1";
}

/** Produce the compact signed-license token the extension verifies. */
export function signLicense(payload: SignedLicensePayload): string {
  const json = JSON.stringify(payload);
  const data = Buffer.from(json, "utf8");
  const sig = crypto.sign("sha256", data, {
    key: privateKey(),
    dsaEncoding: "ieee-p1363",
  });
  return `${data.toString("base64url")}.${sig.toString("base64url")}`;
}

/**
 * Verify a token server-side (used only by tests / diagnostics; the extension
 * verifies independently with the public key via Web Crypto).
 */
export function verifyLicense(token: string): SignedLicensePayload | null {
  const b64 = process.env.LICENSE_SIGNING_PUBLIC_KEY;
  if (!b64) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  try {
    const pub = crypto.createPublicKey({
      key: Buffer.from(b64, "base64"),
      format: "der",
      type: "spki",
    });
    const data = Buffer.from(parts[0]!, "base64url");
    const sig = Buffer.from(parts[1]!, "base64url");
    const ok = crypto.verify("sha256", data, { key: pub, dsaEncoding: "ieee-p1363" }, sig);
    if (!ok) return null;
    return JSON.parse(data.toString("utf8")) as SignedLicensePayload;
  } catch {
    return null;
  }
}
