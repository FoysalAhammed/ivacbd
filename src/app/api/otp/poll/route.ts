import { otpPollSchema } from "@/shared/schemas";
import { pollOtp } from "@/server/services/otp";
import { failFromError, fail, ok, preflight, readJson, withCors } from "@/server/http";
import { check, clientKey } from "@/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

// Polled by the extension (~1/tick) while it waits on the OTP page.
// Returns { success:true, otp:"123456" } once, then { success:true, otp:null }.
export async function POST(req: Request) {
  try {
    const rl = check(clientKey(req, "otp_poll"), 300, 60_000);
    if (!rl.allowed) return withCors(fail("RATE_LIMITED"));
    const input = otpPollSchema.parse(await readJson(req));
    const result = await pollOtp(input);
    return withCors(ok(result));
  } catch (err) {
    return withCors(failFromError(err));
  }
}
