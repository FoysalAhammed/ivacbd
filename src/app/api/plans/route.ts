import { listActivePlans, planSummary } from "@/server/services/plans";
import { failFromError, ok } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public: active plans for the pricing section of the sales site.
export async function GET() {
  try {
    const plans = await listActivePlans();
    return ok({ plans: plans.map((p) => planSummary(p)) });
  } catch (err) {
    return failFromError(err);
  }
}
