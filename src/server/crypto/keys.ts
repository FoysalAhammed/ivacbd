// ============================================================
//  License keys (Phase 34). Cryptographically random, formatted
//  XXXX-XXXX-XXXX-XXXX in Crockford base32 (no I/L/O/U → less
//  ambiguity when typed). We store ONLY the SHA-256 hash; the
//  plaintext is shown to the admin exactly once at creation.
// ============================================================
import crypto from "node:crypto";

// Crockford base32 alphabet minus ambiguous letters (matches LICENSE_KEY_REGEX).
const ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTVWXYZ".replace(/[ILOU]/g, "");
// → "0123456789ABCDEFGHJKMNPQRSTVWXYZ" (32 chars)

function randomGroup(len = 4): string {
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

/** Generate a fresh plaintext activation key: XXXX-XXXX-XXXX-XXXX */
export function generateLicenseKey(): string {
  return [randomGroup(), randomGroup(), randomGroup(), randomGroup()].join("-");
}

/** SHA-256 hex of the (normalized) plaintext key — what we persist. */
export function hashLicenseKey(plaintext: string): string {
  const normalized = plaintext.trim().toUpperCase();
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/** Non-secret display form used for admin search/UI (never the full key). */
export function maskLicenseKey(plaintext: string): string {
  const clean = plaintext.trim().toUpperCase().replace(/-/g, "");
  if (clean.length < 8) return "••••";
  return `${clean.slice(0, 4)}••••••••${clean.slice(-4)}`;
}
