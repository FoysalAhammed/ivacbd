// ============================================================
//  Admin auth (Phases 21, 57). No extra deps:
//    • Passwords: scrypt with per-password salt, stored as
//      `scrypt$N$r$p$saltB64$hashB64`. Verified in constant time.
//    • Sessions: HMAC-SHA256-signed stateless cookie keyed by
//      ADMIN_AUTH_SECRET. Payload carries admin id + expiry.
//  Never logs passwords, secrets, or full cookie values.
// ============================================================
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { AppError } from "../http";

// ── password hashing ────────────────────────────────────────
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 32;

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(plain, salt, KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    hash.toString("base64"),
  ].join("$");
}

export function verifyPassword(plain: string, stored: string): boolean {
  try {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const salt = Buffer.from(parts[4]!, "base64");
    const expected = Buffer.from(parts[5]!, "base64");
    const actual = crypto.scryptSync(plain, salt, expected.length, { N, r, p });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// ── session cookie ──────────────────────────────────────────
export const SESSION_COOKIE = "ivac_admin";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

interface SessionPayload {
  sub: string; // admin id (hex)
  username: string;
  iat: number; // epoch seconds
  exp: number; // epoch seconds
}

export interface AdminSession {
  adminId: string;
  username: string;
}

function authSecret(): string {
  const s = process.env.ADMIN_AUTH_SECRET;
  if (!s || s.length < 16 || s.startsWith("CHANGE_ME")) {
    throw new Error("ADMIN_AUTH_SECRET is not configured (min 16 chars)");
  }
  return s;
}

function sign(dataB64: string): string {
  return crypto
    .createHmac("sha256", authSecret())
    .update(dataB64)
    .digest("base64url");
}

/** Build a signed session token for an authenticated admin. */
export function createSessionToken(adminId: string, username: string): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: adminId,
    username,
    iat: nowSec,
    exp: nowSec + Math.floor(SESSION_TTL_MS / 1000),
  };
  const dataB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${dataB64}.${sign(dataB64)}`;
}

/** Verify a session token's signature + expiry. Returns null if invalid. */
export function verifySessionToken(token: string | undefined | null): AdminSession | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const dataB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(dataB64);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(dataB64, "base64url").toString("utf8")) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) return null;
    if (!payload.sub || !payload.username) return null;
    return { adminId: payload.sub, username: payload.username };
  } catch {
    return null;
  }
}

export interface CookieSpec {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    secure: boolean;
    sameSite: "lax";
    path: string;
    maxAge: number;
  };
}

export function sessionCookie(token: string): CookieSpec {
  return {
    name: SESSION_COOKIE,
    value: token,
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    },
  };
}

export function clearedCookie(): CookieSpec {
  return {
    name: SESSION_COOKIE,
    value: "",
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    },
  };
}

/** Read + verify the current admin session from request cookies (server side). */
export function getAdminSession(): AdminSession | null {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

/** Throw UNAUTHORIZED unless a valid admin session is present. */
export function requireAdmin(): AdminSession {
  const session = getAdminSession();
  if (!session) throw new AppError("UNAUTHORIZED");
  return session;
}
