import { requireAdmin } from "@/server/auth/admin";
import { revealLicenseKey } from "@/server/services/licenses";
import { writeAudit } from "@/server/audit";
import { AUDIT_ACTION } from "@/shared/constants";
import { failFromError, fail, ok } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reveal the full plaintext license key to an authenticated admin (decrypted
// server-side from the at-rest ciphertext). Audited each time it's viewed.
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  try {
    const session = requireAdmin();
    const key = await revealLicenseKey(ctx.params.id);
    if (!key) return fail("NOT_FOUND", "The full key is not available for this license.");
    await writeAudit({
      action: AUDIT_ACTION.LICENSE_KEY_REVEALED,
      entityType: "license",
      entityId: ctx.params.id,
      adminId: session.adminId,
    });
    return ok({ key });
  } catch (err) {
    return failFromError(err);
  }
}
