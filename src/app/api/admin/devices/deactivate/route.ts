import { validateSchema } from "@/shared/schemas";
import { requireAdmin } from "@/server/auth/admin";
import { deactivateDevice } from "@/server/services/activations";
import { failFromError, ok, readJson } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin force-deactivates a device (frees a slot) by licenseId + installationId.
export async function POST(req: Request) {
  try {
    const session = requireAdmin();
    const input = validateSchema.parse(await readJson(req));
    const result = await deactivateDevice({
      licenseId: input.licenseId,
      installationId: input.installationId,
      adminId: session.adminId,
    });
    return ok(result);
  } catch (err) {
    return failFromError(err);
  }
}
