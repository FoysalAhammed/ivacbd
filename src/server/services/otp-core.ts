// ============================================================
//  OTP relay — pure, security-critical helpers.
//  Dependency-light on purpose (only node:crypto) so it is unit-testable
//  under `node --test` (type-stripping, no bundler / `@/` alias). All the
//  DB work lives in ./otp.ts, which imports these.
// ============================================================
import crypto from "node:crypto";

/**
 * Normalize any phone format to a stable comparison key: the last 10 digits.
 * This makes "01712345678", "+8801712345678" and "8801712345678" all collapse
 * to the same value, so the app and the extension match even if the operator
 * typed the number differently in each place.
 */
export function normalizePhone(phone: string): string {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function hmacSecret(): string {
  const s = process.env.OTP_PHONE_HMAC_SECRET || process.env.ADMIN_AUTH_SECRET;
  if (!s || s.length < 16 || s.startsWith("CHANGE_ME")) {
    throw new Error(
      "OTP_PHONE_HMAC_SECRET / ADMIN_AUTH_SECRET is not configured (min 16 chars)",
    );
  }
  return s;
}

/**
 * Deterministic, non-reversible routing key for a phone number. The raw number
 * is never stored — a DB-only leak reveals no phone numbers. Both /submit and
 * /poll derive the same key for the same number.
 */
export function phoneKey(phone: string): string {
  const norm = normalizePhone(phone);
  if (norm.length < 6) throw new Error("phone number too short");
  return crypto.createHmac("sha256", hmacSecret()).update(norm).digest("base64url");
}

/**
 * Constant-time check of the mobile app's shared submit key. Fails CLOSED:
 * if OTP_APP_KEY is unset/placeholder, every submit is rejected (so a
 * misconfigured deploy can't silently accept spoofed OTPs).
 */
export function verifyAppKey(provided: string): boolean {
  const expected = process.env.OTP_APP_KEY || "";
  if (!expected || expected.length < 8 || expected.startsWith("CHANGE_ME")) return false;
  const a = Buffer.from(String(provided || ""), "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
