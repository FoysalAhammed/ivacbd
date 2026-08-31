import { requireAdmin } from "@/server/auth/admin";
import { listPurchases, purchaseSummary } from "@/server/services/payments";
import { failFromError, ok } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    requireAdmin();
    const status = new URL(req.url).searchParams.get("status") ?? undefined;
    const purchases = await listPurchases(status);
    return ok({ purchases: purchases.map(purchaseSummary) });
  } catch (err) {
    return failFromError(err);
  }
}
