import { requireAdmin } from "@/server/auth/admin";
import { dashboardStats } from "@/server/services/stats";
import { failFromError, ok } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    requireAdmin();
    const stats = await dashboardStats();
    return ok({ stats });
  } catch (err) {
    return failFromError(err);
  }
}
