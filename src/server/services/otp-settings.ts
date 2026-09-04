// ============================================================
//  OTP relay settings. A single admin-controlled value — the "allowed
//  sender" (an SMS sender ID like `IVACBD`, or a phone number). The
//  Android app fetches it so sender filtering can change WITHOUT
//  shipping a new APK. Empty/unset means "no sender restriction".
// ============================================================
import { settings } from "@/server/db/collections";

const OTP_KEY = "otp_relay";

/** Normalize a sender for storage/compare: trim, drop nothing else. */
function clean(v: string | null | undefined): string {
  return (v || "").trim();
}

/** Read the configured allowed sender (or "" when none is set). */
export async function getAllowedSender(): Promise<string> {
  const col = await settings();
  const doc = await col.findOne({ key: OTP_KEY });
  return clean(doc?.allowedSender);
}

/** Admin sets/clears the allowed sender. Empty string clears the restriction. */
export async function setAllowedSender(
  value: string,
  adminId: string,
): Promise<string> {
  const allowedSender = clean(value).slice(0, 40);
  const col = await settings();
  await col.updateOne(
    { key: OTP_KEY },
    {
      $set: {
        allowedSender: allowedSender || null,
        updatedAt: new Date(),
        updatedBy: adminId,
      },
      $setOnInsert: { key: OTP_KEY },
    },
    { upsert: true },
  );
  return allowedSender;
}
