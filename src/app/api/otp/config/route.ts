import { otpConfigSchema } from "@/shared/schemas";
import { verifyAppKey } from "@/server/services/otp-core";
import { getAllowedSender } from "@/server/services/otp-settings";
import { failFromError, fail, ok, preflight, readJson, withCors } from "@/server/http";
import { check, clientKey } from "@/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

// Called by the Android app (on login / periodically) to learn which SMS
// sender to trust. App-key gated so only the real app can read it.
export async function POST(req: Request) {
  try {
    const rl = check(clientKey(req, "otp_config"), 60, 60_000);
    if (!rl.allowed) return withCors(fail("RATE_LIMITED"));
    const input = otpConfigSchema.parse(await readJson(req));
    if (!verifyAppKey(input.appKey)) return withCors(fail("UNAUTHORIZED"));
    const allowedSender = await getAllowedSender();
    return withCors(ok({ allowedSender }));
  } catch (err) {
    return withCors(failFromError(err));
  }
}
