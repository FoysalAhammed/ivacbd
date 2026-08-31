import { validateSchema } from "@/shared/schemas";
import { deactivateDevice } from "@/server/services/activations";
import { failFromError, fail, ok, preflight, readJson, withCors } from "@/server/http";
import { check, clientKey } from "@/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

// Extension self-service: release this device's slot so the key can be
// activated on another machine.
export async function POST(req: Request) {
  try {
    const rl = check(clientKey(req, "deactivate"), 12, 60_000);
    if (!rl.allowed) return withCors(fail("RATE_LIMITED"));
    const input = validateSchema.parse(await readJson(req));
    const result = await deactivateDevice({
      licenseId: input.licenseId,
      installationId: input.installationId,
    });
    return withCors(ok(result));
  } catch (err) {
    return withCors(failFromError(err));
  }
}
