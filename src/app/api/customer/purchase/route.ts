import { purchaseSchema } from "@/shared/schemas";
import { submitPurchase } from "@/server/services/payments";
import { failFromError, fail, ok, readJson } from "@/server/http";
import { check, clientKey } from "@/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public: customer submits a manual bKash payment claim (creates a
// PENDING_VERIFICATION request; no license is issued until an admin verifies).
export async function POST(req: Request) {
  try {
    const rl = check(clientKey(req, "purchase"), 6, 60_000);
    if (!rl.allowed) return fail("RATE_LIMITED");
    const input = purchaseSchema.parse(await readJson(req));
    const result = await submitPurchase(input);
    return ok(result);
  } catch (err) {
    return failFromError(err);
  }
}
