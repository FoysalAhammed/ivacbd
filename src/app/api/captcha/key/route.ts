import { NextResponse } from "next/server";
import { validateSchema } from "@/shared/schemas";
import { assertActiveDevice } from "@/server/services/activations";
import { failFromError, fail, ok, preflight, readJson, withCors } from "@/server/http";
import { check, clientKey } from "@/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

// Server-only 2Captcha key. Fail-closed: unset/placeholder ⇒ "" ⇒ 503 below,
// and the extension behaves exactly as if no solver were configured.
function twoCaptchaKey(): string {
  const k = process.env.TWOCAPTCHA_API_KEY || "";
  if (k.length < 8 || k.startsWith("CHANGE_ME")) return "";
  return k;
}

// The extension's service worker fetches this ONCE per browser session, caches
// it in chrome.storage.session, and then calls 2Captcha directly — so solving
// stays fast and the key never ships inside the extension bundle. Gated by
// { licenseId, installationId } exactly like /api/license/validate, so only a
// paid, active, non-revoked device can read it.
export async function POST(req: Request) {
  try {
    const rl = check(clientKey(req, "captcha_key"), 60, 60_000);
    if (!rl.allowed) return withCors(fail("RATE_LIMITED"));

    // Check config BEFORE auth so a not-configured deployment answers cheaply
    // and uniformly (never leaks whether a given license/device is valid).
    const key = twoCaptchaKey();
    if (!key) {
      return withCors(
        NextResponse.json(
          { success: false, code: "UNAVAILABLE", error: "CAPTCHA solving is not configured.", configured: false },
          { status: 503 },
        ),
      );
    }

    const input = validateSchema.parse(await readJson(req));
    await assertActiveDevice(input.licenseId, input.installationId);
    return withCors(ok({ apiKey: key }));
  } catch (err) {
    return withCors(failFromError(err));
  }
}
