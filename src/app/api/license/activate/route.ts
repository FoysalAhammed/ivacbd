import { activateSchema } from "@/shared/schemas";
import { activate } from "@/server/services/activations";
import { failFromError, fail, ok, preflight, readJson, withCors } from "@/server/http";
import { check, clientKey } from "@/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

export async function POST(req: Request) {
  try {
    const rl = check(clientKey(req, "activate"), 12, 60_000);
    if (!rl.allowed) return withCors(fail("RATE_LIMITED"));
    const input = activateSchema.parse(await readJson(req));
    const result = await activate(input);
    return withCors(ok(result));
  } catch (err) {
    return withCors(failFromError(err));
  }
}
