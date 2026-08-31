// ============================================================
//  Activation service (Phases 3, 6, 41, 42). This is where the
//  device-limit is enforced — atomically, so N concurrent activations
//  can never push activeDeviceCount past maxDevices.
//
//  The guard is a single-document conditional update:
//     findOneAndUpdate({ _id, status:ACTIVE, activeDeviceCount:{$lt:max} },
//                      { $inc:{ activeDeviceCount:1 } })
//  Because it targets one document, MongoDB serializes it — no
//  multi-document transaction required. If claiming a slot succeeds
//  but writing the activation row then fails (e.g. a duplicate-key
//  race), we compensate with $inc:-1.
// ============================================================
import { ObjectId } from "mongodb";
import { activations, licenses } from "../db/collections";
import type { ActivationDoc, LicenseActivationResult, LicenseDoc } from "@/shared/types";
import { ACTIVATION_STATUS, AUDIT_ACTION, LICENSE_STATUS } from "@/shared/constants";
import { hashLicenseKey } from "../crypto/keys";
import { AppError } from "../http";
import { writeAudit } from "../audit";
import {
  assertUsable,
  buildActivationResult,
  findByKeyHash,
  findById,
  lazyExpire,
} from "./licenses";

export interface ActivateInput {
  licenseKey: string;
  installationId: string;
  extensionVersion?: string;
}

async function decrementDevice(licenseId: ObjectId): Promise<void> {
  await (await licenses()).updateOne(
    { _id: licenseId, activeDeviceCount: { $gt: 0 } },
    { $inc: { activeDeviceCount: -1 }, $set: { updatedAt: new Date() } },
  );
}

/** First-time (or returning) activation of a device against a key. */
export async function activate(input: ActivateInput): Promise<LicenseActivationResult> {
  const hash = hashLicenseKey(input.licenseKey);
  let license = await findByKeyHash(hash);
  if (!license) throw new AppError("INVALID_KEY");
  license = await lazyExpire(license);
  assertUsable(license);

  const acts = await activations();
  const existing = await acts.findOne({
    licenseId: license._id,
    installationId: input.installationId,
  });

  // Already-active device on this key → re-activation, never re-counts.
  if (existing && existing.status === ACTIVATION_STATUS.ACTIVE) {
    await acts.updateOne(
      { _id: existing._id },
      { $set: { lastValidatedAt: new Date(), extensionVersion: input.extensionVersion } },
    );
    return buildActivationResult(license, input.installationId);
  }

  // Need to claim a slot atomically.
  const claimed = await (await licenses()).findOneAndUpdate(
    {
      _id: license._id,
      status: LICENSE_STATUS.ACTIVE,
      activeDeviceCount: { $lt: license.maxDevices },
    },
    { $inc: { activeDeviceCount: 1 }, $set: { updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!claimed) throw new AppError("DEVICE_LIMIT");

  try {
    if (existing) {
      // Re-activating a previously DEACTIVATED device.
      const flipped = await acts.findOneAndUpdate(
        { _id: existing._id, status: ACTIVATION_STATUS.DEACTIVATED },
        {
          $set: {
            status: ACTIVATION_STATUS.ACTIVE,
            activatedAt: new Date(),
            lastValidatedAt: new Date(),
            extensionVersion: input.extensionVersion,
            deactivatedAt: null,
          },
        },
        { returnDocument: "after" },
      );
      if (!flipped) {
        // A concurrent request already reactivated it → we over-claimed.
        await decrementDevice(license._id);
      }
    } else {
      const doc: ActivationDoc = {
        _id: new ObjectId(),
        licenseId: license._id,
        installationId: input.installationId,
        status: ACTIVATION_STATUS.ACTIVE,
        extensionVersion: input.extensionVersion,
        activatedAt: new Date(),
        lastValidatedAt: new Date(),
        deactivatedAt: null,
      };
      await acts.insertOne(doc);
    }
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      // Lost an insert race for the same (license, installation) → compensate.
      await decrementDevice(license._id);
    } else {
      await decrementDevice(license._id);
      throw err;
    }
  }

  await writeAudit({
    action: AUDIT_ACTION.DEVICE_ACTIVATED,
    entityType: "license",
    entityId: license._id,
    metadata: { installationId: input.installationId },
  });

  return buildActivationResult(claimed, input.installationId);
}

export interface ValidateInput {
  licenseId: string;
  installationId: string;
  extensionVersion?: string;
}

/**
 * Periodic (~24h) online re-check. Confirms the device is still an active
 * activation and the license still usable, then re-issues a fresh signed
 * license so the extension slides its offline window forward.
 */
export async function validate(input: ValidateInput): Promise<LicenseActivationResult> {
  let license = await findById(input.licenseId);
  if (!license) throw new AppError("INVALID_KEY");
  license = await lazyExpire(license);

  const acts = await activations();
  const act = await acts.findOne({
    licenseId: license._id,
    installationId: input.installationId,
  });
  if (!act || act.status !== ACTIVATION_STATUS.ACTIVE) {
    // This device was deactivated/reset by the admin → tell it to stop.
    throw new AppError("REVOKED", "This device is no longer authorized.");
  }

  assertUsable(license);

  await acts.updateOne(
    { _id: act._id },
    { $set: { lastValidatedAt: new Date(), extensionVersion: input.extensionVersion } },
  );

  return buildActivationResult(license, input.installationId);
}

export interface DeactivateInput {
  licenseId: string;
  installationId: string;
  adminId?: string | null;
}

/** Free a device slot. Idempotent. Used by the extension and by admin. */
export async function deactivateDevice(input: DeactivateInput): Promise<{ deactivated: boolean }> {
  const license = await findById(input.licenseId);
  if (!license) throw new AppError("NOT_FOUND", "License not found");

  const acts = await activations();
  const act = await acts.findOneAndUpdate(
    {
      licenseId: license._id,
      installationId: input.installationId,
      status: ACTIVATION_STATUS.ACTIVE,
    },
    { $set: { status: ACTIVATION_STATUS.DEACTIVATED, deactivatedAt: new Date() } },
    { returnDocument: "after" },
  );

  if (!act) return { deactivated: false }; // already inactive → idempotent success

  await decrementDevice(license._id);
  await writeAudit({
    action: AUDIT_ACTION.DEVICE_DEACTIVATED,
    entityType: "license",
    entityId: license._id,
    adminId: input.adminId ?? null,
    metadata: { installationId: input.installationId },
  });
  return { deactivated: true };
}

/** Lightweight status read (no new token issued). */
export async function statusSummary(licenseId: string, installationId: string) {
  let license = await findById(licenseId);
  if (!license) throw new AppError("INVALID_KEY");
  license = await lazyExpire(license);
  const act = await (await activations()).findOne({ licenseId: license._id, installationId });
  return {
    status: license.status,
    expiresAt: license.expiresAt.toISOString(),
    serverTime: new Date().toISOString(),
    deviceActive: !!act && act.status === ACTIVATION_STATUS.ACTIVE,
  };
}

/** Admin device listing for a license. */
export async function devicesForLicense(licenseId: string): Promise<ActivationDoc[]> {
  const _id = ObjectId.isValid(licenseId) ? new ObjectId(licenseId) : null;
  if (!_id) return [];
  return (await activations())
    .find({ licenseId: _id })
    .sort({ activatedAt: -1 })
    .toArray();
}
