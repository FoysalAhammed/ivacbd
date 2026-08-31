import { requireAdmin } from "@/server/auth/admin";
import { listAudit, auditSummary } from "@/server/services/stats";
import { failFromError, ok } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    requireAdmin();
    const limit = Number(new URL(req.url).searchParams.get("limit") ?? 200);
    const logs = await listAudit(Number.isFinite(limit) ? Math.min(limit, 500) : 200);
    return ok({ logs: logs.map(auditSummary) });
  } catch (err) {
    return failFromError(err);
  }
}
