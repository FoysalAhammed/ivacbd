import { requireAdmin } from "@/server/auth/admin";
import { listCustomers, customerSummary } from "@/server/services/customers";
import { failFromError, ok } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    requireAdmin();
    const search = new URL(req.url).searchParams.get("search") ?? undefined;
    const customers = await listCustomers(search);
    return ok({ customers: customers.map(customerSummary) });
  } catch (err) {
    return failFromError(err);
  }
}
