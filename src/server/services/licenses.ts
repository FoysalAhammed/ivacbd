// ============================================================
//  License service (Phases 13, 15, 32, 33, 42). Owns license
//  creation, the signed-result the extension receives, lazy expiry,
//  and the admin lifecycle actions (revoke/block/suspend/reactivate/
//  extend/device-limit/reset).
// ============================================================
import { ObjectId } from "mongodb";
import { licenses, activations, subscriptions } from "../db/collections";
import type { LicenseDoc, LicenseActivationResult, SignedLicensePayload } from "@/shared/types";
import {
  ACTIVATION_STATUS,
  AUDIT_ACTION,
  LICENSE_PAYLOAD_VERSION,
  LICENSE_STATUS,
  SUBSCRIPTION_STATUS,
} from "@/shared/constants";
import { signLicense, keyId } from "../crypto/signing";
import { generateLicenseKey, hashLicenseKey, maskLicenseKey } from "../crypto/keys";
import { encryptSecret, decryptSecret } from "../crypto/secretbox";
import { AppError, type ErrorCode } from "../http";
import { addDays, daysLeft, nowIso, offlineGraceMs, validationIntervalMs } from "../time";
import { writeAudit } from "../audit";

export interface CreateLicenseInput {
  customerId: ObjectId;
  customerName: string;
  planId: ObjectId | null;
  planName: string;
  maxDevices: number;
  durationDays: number;
  startsAt?: Date;
  note?: string;
  adminId?: string | null;
}

export interface CreatedLicense {
  license: LicenseDoc;
  /** Plaintext key — shown now, and re-revealable later via revealLicenseKey(). */
  plaintextKey: string;
}

/** Create a fresh ACTIVE license and its unique key. */
export async function createLicense(input: CreateLicenseInput): Promise<CreatedLicense> {
  const col = await licenses();

  // Retry a few times on the astronomically-unlikely key-hash collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const plaintextKey = generateLicenseKey();
    const licenseKeyHash = hashLicenseKey(plaintextKey);
    const startsAt = input.startsAt ?? new Date();
    const expiresAt = addDays(startsAt, input.durationDays);
    const doc: LicenseDoc = {
      _id: new ObjectId(),
      licenseKeyHash,
      licenseKeyMasked: maskLicenseKey(plaintextKey),
      licenseKeyEnc: encryptSecret(plaintextKey),
      customerId: input.customerId,
      customerName: input.customerName,
      planId: input.planId,
      planName: input.planName,
      status: LICENSE_STATUS.ACTIVE,
      maxDevices: input.maxDevices,
      activeDeviceCount: 0,
      startsAt,
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
      revokedAt: null,
      note: input.note,
    };
    try {
      await col.insertOne(doc);
      await writeAudit({
        action: AUDIT_ACTION.LICENSE_CREATED,
        entityType: "license",
        entityId: doc._id,
        adminId: input.adminId ?? null,
        metadata: { planName: input.planName, maxDevices: input.maxDevices },
      });
      return { license: doc, plaintextKey };
    } catch (err) {
      if ((err as { code?: number }).code === 11000) continue; // dup hash → retry
      throw err;
    }
  }
  throw new AppError("SERVER_ERROR", "Could not generate a unique license key");
}

export async function findByKeyHash(hash: string): Promise<LicenseDoc | null> {
  return (await licenses()).findOne({ licenseKeyHash: hash });
}

export async function findById(id: string | ObjectId): Promise<LicenseDoc | null> {
  const _id = id instanceof ObjectId ? id : ObjectId.isValid(id) ? new ObjectId(id) : null;
  if (!_id) return null;
  return (await licenses()).findOne({ _id });
}

/**
 * Decrypt and return the full plaintext key for an admin (e.g. to re-send it
 * to a customer). Returns null if the license doesn't exist or predates
 * at-rest key storage. Callers must be admin-authenticated + audited.
 */
export async function revealLicenseKey(id: string): Promise<string | null> {
  const license = await findById(id);
  if (!license) return null;
  return decryptSecret(license.licenseKeyEnc);
}

/**
 * If an ACTIVE license has passed its expiry, flip it to EXPIRED and return
 * the updated view. This is our lazy expiry — no cron needed for correctness.
 */
export async function lazyExpire(license: LicenseDoc): Promise<LicenseDoc> {
  if (license.status === LICENSE_STATUS.ACTIVE && license.expiresAt.getTime() <= Date.now()) {
    await (await licenses()).updateOne(
      { _id: license._id, status: LICENSE_STATUS.ACTIVE },
      { $set: { status: LICENSE_STATUS.EXPIRED, updatedAt: new Date() } },
    );
    await (await subscriptions()).updateMany(
      { licenseId: license._id, status: SUBSCRIPTION_STATUS.ACTIVE },
      { $set: { status: SUBSCRIPTION_STATUS.EXPIRED, updatedAt: new Date() } },
    );
    return { ...license, status: LICENSE_STATUS.EXPIRED };
  }
  return license;
}

const STATUS_ERROR: Record<string, ErrorCode> = {
  [LICENSE_STATUS.EXPIRED]: "EXPIRED",
  [LICENSE_STATUS.REVOKED]: "REVOKED",
  [LICENSE_STATUS.BLOCKED]: "BLOCKED",
  [LICENSE_STATUS.SUSPENDED]: "SUSPENDED",
  [LICENSE_STATUS.PENDING]: "INVALID_KEY",
};

/** Throw the right domain error unless the license is currently usable. */
export function assertUsable(license: LicenseDoc): void {
  if (license.status === LICENSE_STATUS.ACTIVE) return;
  throw new AppError(STATUS_ERROR[license.status] ?? "INVALID_KEY");
}

/** Build the signed result the extension caches and verifies locally. */
export function buildActivationResult(
  license: LicenseDoc,
  installationId: string,
): LicenseActivationResult {
  const serverTime = nowIso();
  const payload: SignedLicensePayload = {
    v: LICENSE_PAYLOAD_VERSION,
    keyId: keyId(),
    licenseId: license._id.toHexString(),
    status: license.status,
    maxDevices: license.maxDevices,
    installationId,
    planName: license.planName,
    customerName: license.customerName,
    issuedAt: serverTime,
    startsAt: license.startsAt.toISOString(),
    expiresAt: license.expiresAt.toISOString(),
    serverTime,
  };
  return {
    success: true,
    license: {
      licenseId: payload.licenseId,
      status: license.status,
      expiresAt: payload.expiresAt,
      maxDevices: license.maxDevices,
      planName: license.planName,
      customerName: license.customerName,
    },
    serverTime,
    signedLicense: signLicense(payload),
    validationIntervalMs: validationIntervalMs(),
    graceMs: offlineGraceMs(),
  };
}

// ── admin lifecycle actions (Phase 16) ──────────────────────

async function deactivateAllDevices(licenseId: ObjectId): Promise<void> {
  await (await activations()).updateMany(
    { licenseId, status: ACTIVATION_STATUS.ACTIVE },
    { $set: { status: ACTIVATION_STATUS.DEACTIVATED, deactivatedAt: new Date() } },
  );
  await (await licenses()).updateOne(
    { _id: licenseId },
    { $set: { activeDeviceCount: 0, updatedAt: new Date() } },
  );
}

export type LicenseAction =
  | { type: "revoke" }
  | { type: "block" }
  | { type: "suspend" }
  | { type: "reactivate" }
  | { type: "extend"; days: number }
  | { type: "setDeviceLimit"; maxDevices: number }
  | { type: "resetDevices" };

/** Apply an admin action to a license. Returns the updated document. */
export async function applyLicenseAction(
  licenseId: string,
  action: LicenseAction,
  adminId: string | null,
): Promise<LicenseDoc> {
  const col = await licenses();
  const license = await findById(licenseId);
  if (!license) throw new AppError("NOT_FOUND", "License not found");
  const _id = license._id;

  switch (action.type) {
    case "revoke": {
      await col.updateOne(
        { _id },
        { $set: { status: LICENSE_STATUS.REVOKED, revokedAt: new Date(), updatedAt: new Date() } },
      );
      await deactivateAllDevices(_id);
      await writeAudit({ action: AUDIT_ACTION.LICENSE_REVOKED, entityType: "license", entityId: _id, adminId });
      break;
    }
    case "block": {
      await col.updateOne({ _id }, { $set: { status: LICENSE_STATUS.BLOCKED, updatedAt: new Date() } });
      await deactivateAllDevices(_id);
      await writeAudit({ action: AUDIT_ACTION.LICENSE_BLOCKED, entityType: "license", entityId: _id, adminId });
      break;
    }
    case "suspend": {
      await col.updateOne({ _id }, { $set: { status: LICENSE_STATUS.SUSPENDED, updatedAt: new Date() } });
      await writeAudit({ action: AUDIT_ACTION.LICENSE_SUSPENDED, entityType: "license", entityId: _id, adminId });
      break;
    }
    case "reactivate": {
      const status = license.expiresAt.getTime() <= Date.now()
        ? LICENSE_STATUS.EXPIRED
        : LICENSE_STATUS.ACTIVE;
      await col.updateOne({ _id }, { $set: { status, revokedAt: null, updatedAt: new Date() } });
      await writeAudit({ action: AUDIT_ACTION.LICENSE_REACTIVATED, entityType: "license", entityId: _id, adminId, metadata: { status } });
      break;
    }
    case "extend": {
      const base = license.expiresAt.getTime() > Date.now() ? license.expiresAt : new Date();
      const expiresAt = addDays(base, action.days);
      const status = license.status === LICENSE_STATUS.EXPIRED ? LICENSE_STATUS.ACTIVE : license.status;
      await col.updateOne({ _id }, { $set: { expiresAt, status, updatedAt: new Date() } });
      await (await subscriptions()).updateMany(
        { licenseId: _id },
        { $set: { expiresAt, status: SUBSCRIPTION_STATUS.ACTIVE, updatedAt: new Date() } },
      );
      await writeAudit({ action: AUDIT_ACTION.LICENSE_EXTENDED, entityType: "license", entityId: _id, adminId, metadata: { days: action.days } });
      break;
    }
    case "setDeviceLimit": {
      await col.updateOne({ _id }, { $set: { maxDevices: action.maxDevices, updatedAt: new Date() } });
      await writeAudit({ action: AUDIT_ACTION.LICENSE_DEVICE_LIMIT_CHANGED, entityType: "license", entityId: _id, adminId, metadata: { maxDevices: action.maxDevices } });
      break;
    }
    case "resetDevices": {
      await deactivateAllDevices(_id);
      await writeAudit({ action: AUDIT_ACTION.DEVICE_RESET, entityType: "license", entityId: _id, adminId });
      break;
    }
  }

  const updated = await findById(licenseId);
  if (!updated) throw new AppError("NOT_FOUND", "License not found");
  return updated;
}

/** Admin-facing summary DTO (never includes the key hash). */
export function licenseSummary(l: LicenseDoc) {
  return {
    id: l._id.toHexString(),
    keyMasked: l.licenseKeyMasked,
    customerId: l.customerId.toHexString(),
    customerName: l.customerName,
    planName: l.planName,
    status: l.status,
    maxDevices: l.maxDevices,
    activeDeviceCount: l.activeDeviceCount,
    startsAt: l.startsAt.toISOString(),
    expiresAt: l.expiresAt.toISOString(),
    daysLeft: daysLeft(l.expiresAt),
    createdAt: l.createdAt.toISOString(),
    note: l.note ?? null,
  };
}
