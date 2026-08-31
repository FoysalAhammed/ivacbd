import { rejectPaymentSchema } from "@/shared/schemas";
import { requireAdmin } from "@/server/auth/admin";
import { rejectPurchase } from "@/server/services/payments";
import { failFromError, ok, readJson } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: { id: string } }) {
  try {
    const session = requireAdmin();
    const { reason } = rejectPaymentSchema.parse(await readJson(req));
    const result = await rejectPurchase(ctx.params.id, reason, session.adminId);
    return ok(result);
  } catch (err) {
    return failFromError(err);
  }
}
