// ============================================================
//  OTP relay service. The Android app POSTs a parsed OTP to /submit;
//  the extension POSTs to /poll while it waits on the OTP page. The OTP
//  is stored ENCRYPTED, is SINGLE-USE (cleared the moment the bound
//  device reads it), and expires fast (~180s, code-enforced). The raw
//  phone number is never stored — only its HMAC (see otp-core.ts).
//
//  Ownership: phone → extension is trust-on-first-use. Each new /submit
//  clears the binding, and the first /poll after it re-binds, so a fresh
//  install just works on the next login while a stranger polling a random
//  number gets nothing (it isn't the bound installation, and the submit
//  endpoint is app-key gated so they can't inject an OTP either).
// ============================================================
import { otps } from "@/server/db/collections";
import { encryptSecret, decryptSecret } from "@/server/crypto/secretbox";
import { AppError } from "@/server/http";
import type { OtpPollInput, OtpSubmitInput } from "@/shared/schemas";
import { normalizePhone, phoneKey, verifyAppKey } from "./otp-core";

const OTP_FRESH_MS = 180_000; // 3 min — covers IVAC's ~2-min window + clock skew
const DOC_TTL_MS = 7 * 24 * 60 * 60 * 1000; // abandoned rows self-delete after a week

function keyFor(phone: string): string {
  const norm = normalizePhone(phone);
  if (norm.length < 6) throw new AppError("INVALID_INPUT", "Invalid phone number");
  return phoneKey(phone);
}

/** Store the latest OTP for a phone (from the Android app). */
export async function submitOtp(input: OtpSubmitInput): Promise<void> {
  if (!verifyAppKey(input.appKey)) throw new AppError("UNAUTHORIZED", "Invalid app key");
  const key = keyFor(input.phone);
  const now = new Date();
  const col = await otps();
  await col.updateOne(
    { phoneKey: key },
    {
      $set: {
        otpEnc: encryptSecret(input.otp),
        rawEnc: input.raw ? encryptSecret(input.raw.slice(0, 400)) : null,
        otpExpiresAt: new Date(now.getTime() + OTP_FRESH_MS),
        // New login → drop any prior binding so the CURRENT extension re-binds.
        boundInstallationId: null,
        boundAt: null,
        consumedAt: null,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + DOC_TTL_MS),
      },
      $inc: { submitCount: 1 },
      $setOnInsert: { phoneKey: key, createdAt: now },
    },
    { upsert: true },
  );
}

/** Fetch-and-consume the OTP for a phone (from the extension). */
export async function pollOtp(input: OtpPollInput): Promise<{ otp: string | null }> {
  const key = keyFor(input.phone);
  const now = new Date();
  const col = await otps();
  const doc = await col.findOne({ phoneKey: key });
  if (!doc) return { otp: null };

  // Trust-on-first-use: the first device to poll after a submit claims the phone.
  let bound = doc.boundInstallationId || null;
  if (!bound) {
    const res = await col.updateOne(
      { phoneKey: key, boundInstallationId: null },
      { $set: { boundInstallationId: input.installationId, boundAt: now } },
    );
    if (res.modifiedCount === 1) {
      bound = input.installationId;
    } else {
      const fresh = await col.findOne(
        { phoneKey: key },
        { projection: { boundInstallationId: 1 } },
      );
      bound = (fresh && fresh.boundInstallationId) || null;
    }
  }
  // Another installation owns this phone right now → say nothing (no info leak).
  if (bound !== input.installationId) return { otp: null };

  // Only deliver a fresh, unconsumed OTP.
  if (!doc.otpEnc || !doc.otpExpiresAt || doc.otpExpiresAt.getTime() < now.getTime()) {
    return { otp: null };
  }

  // Single-use: exactly one poll flips otpEnc→null and gets the value.
  const consumed = await col.updateOne(
    { phoneKey: key, otpEnc: doc.otpEnc, boundInstallationId: input.installationId },
    { $set: { otpEnc: null, otpExpiresAt: null, consumedAt: now } },
  );
  if (consumed.modifiedCount !== 1) return { otp: null };

  const otp = decryptSecret(doc.otpEnc);
  return { otp: otp && /^\d{4,8}$/.test(otp) ? otp : null };
}
