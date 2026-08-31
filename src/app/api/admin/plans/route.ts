import { planCreateSchema } from "@/shared/schemas";
import { requireAdmin } from "@/server/auth/admin";
import { listAllPlans, createPlan, planSummary } from "@/server/services/plans";
import { failFromError, ok, readJson } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    requireAdmin();
    const plans = await listAllPlans();
    return ok({ plans: plans.map((p) => planSummary(p, { admin: true })) });
  } catch (err) {
    return failFromError(err);
  }
}

export async function POST(req: Request) {
  try {
    const session = requireAdmin();
    const input = planCreateSchema.parse(await readJson(req));
    const plan = await createPlan(input, session.adminId);
    return ok({ plan: planSummary(plan, { admin: true }) });
  } catch (err) {
    return failFromError(err);
  }
}
