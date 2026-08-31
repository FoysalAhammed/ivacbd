import { manualLicenseSchema } from "@/shared/schemas";
import { requireAdmin } from "@/server/auth/admin";
import { listLicenseSummaries } from "@/server/services/stats";
import { createManualLicense } from "@/server/services/payments";
import { failFromError, ok, readJson } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    requireAdmin();
    const sp = new URL(req.url).searchParams;
    const licenses = await listLicenseSummaries({
      search: sp.get("search") ?? undefined,
      status: sp.get("status") ?? undefined,
    });
    return ok({ licenses });
  } catch (err) {
    return failFromError(err);
  }
}

// Manual license creation (offline/cash sale) — returns plaintext key once.
export async function POST(req: Request) {
  try {
    const session = requireAdmin();
    const input = manualLicenseSchema.parse(await readJson(req));
    const result = await createManualLicense(input, session.adminId);
    return ok(result);
  } catch (err) {
    return failFromError(err);
  }
}
