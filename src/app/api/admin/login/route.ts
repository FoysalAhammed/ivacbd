import { adminLoginSchema } from "@/shared/schemas";
import { authenticate } from "@/server/services/admins";
import { createSessionToken, sessionCookie } from "@/server/auth/admin";
import { failFromError, fail, ok, readJson } from "@/server/http";
import { check, clientKey } from "@/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const rl = check(clientKey(req, "admin-login"), 8, 60_000);
    if (!rl.allowed) return fail("RATE_LIMITED");
    const { username, password } = adminLoginSchema.parse(await readJson(req));
    const admin = await authenticate(username, password);
    if (!admin) return fail("UNAUTHORIZED", "Invalid username or password.");
    const token = createSessionToken(admin._id.toHexString(), admin.username);
    const res = ok({ admin: { username: admin.username } });
    const c = sessionCookie(token);
    res.cookies.set(c.name, c.value, c.options);
    return res;
  } catch (err) {
    return failFromError(err);
  }
}
