import { otpSubmitSchema } from "@/shared/schemas";
import { submitOtp } from "@/server/services/otp";
import { failFromError, fail, ok, preflight, readJson, withCors } from "@/server/http";
import { check, clientKey } from "@/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

// Called by the Android app when it reads an OTP SMS.
export async function POST(req: Request) {
  try {
    const rl = check(clientKey(req, "otp_submit"), 30, 60_000);
    if (!rl.allowed) return withCors(fail("RATE_LIMITED"));
    const input = otpSubmitSchema.parse(await readJson(req));
    await submitOtp(input);
    return withCors(ok({}));
  } catch (err) {
    return withCors(failFromError(err));
  }
}
