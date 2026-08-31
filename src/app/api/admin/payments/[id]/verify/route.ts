import { verifyPaymentSchema } from "@/shared/schemas";
import { requireAdmin } from "@/server/auth/admin";
import { verifyPurchase } from "@/server/services/payments";
import { failFromError, ok, readJson } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Verify a pending payment → create customer + license + subscription.
// Returns the plaintext key ONCE for the admin to hand to the customer.
export async function POST(req: Request, ctx: { params: { id: string } }) {
  try {
    const session = requireAdmin();
    const overrides = verifyPaymentSchema.parse(await readJson(req));
    const result = await verifyPurchase(ctx.params.id, overrides, session.adminId);
    return ok(result);
  } catch (err) {
    return failFromError(err);
  }
}
