// ============================================================
//  Reversible secret storage (AES-256-GCM). Used to keep license
//  keys retrievable by an admin WITHOUT storing plaintext in the DB:
//  the ciphertext lives in Mongo, the key-encryption secret lives only
//  in the server env. A database-only leak therefore does not reveal
//  any license keys.
//
//  Key material is derived (scrypt) from LICENSE_KEY_ENC_SECRET, or
//  ADMIN_AUTH_SECRET as a fallback so a fresh deploy needs no extra
//  env var. Keep that secret STABLE — if it changes, previously
//  encrypted keys can no longer be decrypted (they must be re-issued).
//
//  Blob format:  v1.<iv>.<tag>.<ciphertext>   (each base64url)
// ============================================================
import crypto from "node:crypto";

const SALT = Buffer.from("ivac.license.key.enc.v1");

function encKey(): Buffer {
  const secret = process.env.LICENSE_KEY_ENC_SECRET || process.env.ADMIN_AUTH_SECRET;
  if (!secret || secret.length < 16 || secret.startsWith("CHANGE_ME")) {
    throw new Error("LICENSE_KEY_ENC_SECRET / ADMIN_AUTH_SECRET is not configured (min 16 chars)");
  }
  return crypto.scryptSync(secret, SALT, 32);
}

/** Encrypt a short secret (e.g. a license key) for at-rest storage. */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

/** Decrypt a blob from encryptSecret(). Returns null on any tampering/format error. */
export function decryptSecret(blob: string | null | undefined): string | null {
  if (!blob) return null;
  try {
    const [v, ivB, tagB, ctB] = blob.split(".");
    if (v !== "v1" || !ivB || !tagB || !ctB) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", encKey(), Buffer.from(ivB, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB, "base64url"));
    const pt = Buffer.concat([decipher.update(Buffer.from(ctB, "base64url")), decipher.final()]);
    return pt.toString("utf8");
  } catch {
    return null;
  }
}
