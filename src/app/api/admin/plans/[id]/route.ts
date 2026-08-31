import { planUpdateSchema } from "@/shared/schemas";
import { requireAdmin } from "@/server/auth/admin";
import { updatePlan, planSummary } from "@/server/services/plans";
import { failFromError, ok, readJson } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  try {
    const session = requireAdmin();
    const patch = planUpdateSchema.parse(await readJson(req));
    const plan = await updatePlan(ctx.params.id, patch, session.adminId);
    return ok({ plan: planSummary(plan, { admin: true }) });
  } catch (err) {
    return failFromError(err);
  }
}
