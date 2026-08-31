import { validateSchema } from "@/shared/schemas";
import { validate } from "@/server/services/activations";
import { failFromError, fail, ok, preflight, readJson, withCors } from "@/server/http";
import { check, clientKey } from "@/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

export async function POST(req: Request) {
  try {
    const rl = check(clientKey(req, "validate"), 40, 60_000);
    if (!rl.allowed) return withCors(fail("RATE_LIMITED"));
    const input = validateSchema.parse(await readJson(req));
    const result = await validate(input);
    return withCors(ok(result));
  } catch (err) {
    return withCors(failFromError(err));
  }
}
