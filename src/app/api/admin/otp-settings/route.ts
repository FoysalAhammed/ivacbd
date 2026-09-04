import { otpSettingsSchema } from "@/shared/schemas";
import { requireAdmin } from "@/server/auth/admin";
import { getAllowedSender, setAllowedSender } from "@/server/services/otp-settings";
import { failFromError, ok, readJson } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    requireAdmin();
    const allowedSender = await getAllowedSender();
    return ok({ allowedSender });
  } catch (err) {
    return failFromError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const session = requireAdmin();
    const input = otpSettingsSchema.parse(await readJson(req));
    const allowedSender = await setAllowedSender(input.allowedSender, session.adminId);
    return ok({ allowedSender });
  } catch (err) {
    return failFromError(err);
  }
}
