import { adminBootstrapSchema } from "@/shared/schemas";
import { bootstrapAdmin } from "@/server/services/admins";
import { createSessionToken, sessionCookie } from "@/server/auth/admin";
import { failFromError, fail, ok, readJson } from "@/server/http";
import { check, clientKey } from "@/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Create the first admin using the one-time ADMIN_BOOTSTRAP_TOKEN, then
// immediately establish a session.
export async function POST(req: Request) {
  try {
    const rl = check(clientKey(req, "admin-bootstrap"), 5, 60_000);
    if (!rl.allowed) return fail("RATE_LIMITED");
    const input = adminBootstrapSchema.parse(await readJson(req));
    const admin = await bootstrapAdmin(input);
    const token = createSessionToken(admin._id.toHexString(), admin.username);
    const res = ok({ admin: { username: admin.username } });
    const c = sessionCookie(token);
    res.cookies.set(c.name, c.value, c.options);
    return res;
  } catch (err) {
    return failFromError(err);
  }
}
