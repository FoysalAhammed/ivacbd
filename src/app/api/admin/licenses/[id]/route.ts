import { licenseActionSchema, type LicenseAction as ActionInput } from "@/shared/schemas";
import { requireAdmin } from "@/server/auth/admin";
import {
  applyLicenseAction,
  findById,
  lazyExpire,
  licenseSummary,
  type LicenseAction,
} from "@/server/services/licenses";
import { devicesForLicense } from "@/server/services/activations";
import { failFromError, fail, ok, readJson } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Map the validated request shape ({action, ...}) to the service union ({type, ...}).
function toServiceAction(a: ActionInput): LicenseAction {
  switch (a.action) {
    case "extend":
      return { type: "extend", days: a.days };
    case "setDeviceLimit":
      return { type: "setDeviceLimit", maxDevices: a.maxDevices };
    default:
      return { type: a.action };
  }
}

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  try {
    requireAdmin();
    let license = await findById(ctx.params.id);
    if (!license) return fail("NOT_FOUND", "License not found");
    license = await lazyExpire(license);
    const devices = await devicesForLicense(ctx.params.id);
    return ok({
      license: licenseSummary(license),
      devices: devices.map((d) => ({
        installationId: d.installationId,
        status: d.status,
        extensionVersion: d.extensionVersion ?? null,
        activatedAt: d.activatedAt.toISOString(),
        lastValidatedAt: d.lastValidatedAt.toISOString(),
        deactivatedAt: d.deactivatedAt ? d.deactivatedAt.toISOString() : null,
      })),
    });
  } catch (err) {
    return failFromError(err);
  }
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  try {
    const session = requireAdmin();
    const action = licenseActionSchema.parse(await readJson(req));
    const updated = await applyLicenseAction(ctx.params.id, toServiceAction(action), session.adminId);
    return ok({ license: licenseSummary(updated) });
  } catch (err) {
    return failFromError(err);
  }
}
