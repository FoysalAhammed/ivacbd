import { clearedCookie } from "@/server/auth/admin";
import { ok } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const res = ok({ loggedOut: true });
  const c = clearedCookie();
  res.cookies.set(c.name, c.value, c.options);
  return res;
}
