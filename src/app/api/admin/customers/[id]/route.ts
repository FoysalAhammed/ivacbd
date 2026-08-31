import { requireAdmin } from "@/server/auth/admin";
import { findCustomerById, customerSummary } from "@/server/services/customers";
import { licensesForCustomer } from "@/server/services/stats";
import { failFromError, fail, ok } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  try {
    requireAdmin();
    const customer = await findCustomerById(ctx.params.id);
    if (!customer) return fail("NOT_FOUND", "Customer not found");
    const licenses = await licensesForCustomer(ctx.params.id);
    return ok({ customer: customerSummary(customer), licenses });
  } catch (err) {
    return failFromError(err);
  }
}
