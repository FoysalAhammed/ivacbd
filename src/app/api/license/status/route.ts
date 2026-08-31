import { validateSchema } from "@/shared/schemas";
import { statusSummary } from "@/server/services/activations";
import { failFromError, fail, ok, preflight, readJson, withCors } from "@/server/http";
import { check, clientKey } from "@/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

// Lightweight status read — does not issue a new signed license.
export async function POST(req: Request) {
  try {
    const rl = check(clientKey(req, "status"), 40, 60_000);
    if (!rl.allowed) return withCors(fail("RATE_LIMITED"));
    const input = validateSchema.parse(await readJson(req));
    const result = await statusSummary(input.licenseId, input.installationId);
    return withCors(ok(result));
  } catch (err) {
    return withCors(failFromError(err));
  }
}
