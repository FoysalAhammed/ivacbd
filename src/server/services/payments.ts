// ============================================================
//  Payment service (Phases 12, 30, 39). Manual bKash flow:
//    1. Customer submits sender number + transaction id → a
//       PENDING_VERIFICATION purchase request (no license yet).
//    2. Admin verifies → we create/reuse the customer, generate a
//       license + subscription, and reveal the plaintext key ONCE.
//    3. Or admin rejects with a reason.
//  We never auto-verify payments and never fabricate confirmations.
// ============================================================
import { ObjectId } from "mongodb";
import type { Filter } from "mongodb";
import { purchaseRequests, subscriptions } from "../db/collections";
import type { PurchaseRequestDoc, SubscriptionDoc } from "@/shared/types";
import type { PurchaseInput } from "@/shared/schemas";
import { AUDIT_ACTION, PURCHASE_STATUS, SUBSCRIPTION_STATUS, type PurchaseStatus } from "@/shared/constants";

const PURCHASE_STATUS_VALUES = Object.values(PURCHASE_STATUS) as PurchaseStatus[];
import { AppError } from "../http";
import { writeAudit } from "../audit";
import { addDays } from "../time";
import { findPlanById } from "./plans";
import { getOrCreateCustomer } from "./customers";
import { createLicense, licenseSummary } from "./licenses";

/** Customer submits a manual-payment claim. Returns the request id. */
export async function submitPurchase(input: PurchaseInput): Promise<{ requestId: string }> {
  const plan = await findPlanById(input.planId);
  if (!plan || !plan.active) throw new AppError("INVALID_INPUT", "Selected plan is unavailable");

  const doc: PurchaseRequestDoc = {
    _id: new ObjectId(),
    customerName: input.name,
    phone: input.phone,
    whatsapp: input.whatsapp,
    planId: plan._id,
    planName: plan.name,
    amount: plan.price,
    senderBkashNumber: input.senderBkashNumber,
    transactionId: input.transactionId ?? null,
    status: PURCHASE_STATUS.PENDING_VERIFICATION,
    submittedAt: new Date(),
    verifiedAt: null,
    verifiedBy: null,
    licenseId: null,
    customerId: null,
  };

  try {
    await (await purchaseRequests()).insertOne(doc);
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw new AppError("DUPLICATE", "This transaction ID has already been submitted.");
    }
    throw err;
  }

  await writeAudit({
    action: AUDIT_ACTION.PAYMENT_SUBMITTED,
    entityType: "purchaseRequest",
    entityId: doc._id,
    metadata: { planName: plan.name, amount: plan.price },
  });
  return { requestId: doc._id.toHexString() };
}

export async function listPurchases(status?: string): Promise<PurchaseRequestDoc[]> {
  const valid = status && PURCHASE_STATUS_VALUES.includes(status as PurchaseStatus);
  const filter: Filter<PurchaseRequestDoc> = valid ? { status: status as PurchaseStatus } : {};
  return (await purchaseRequests()).find(filter).sort({ submittedAt: -1 }).limit(500).toArray();
}

export async function getPurchase(id: string): Promise<PurchaseRequestDoc | null> {
  if (!ObjectId.isValid(id)) return null;
  return (await purchaseRequests()).findOne({ _id: new ObjectId(id) });
}

export interface VerifyOverrides {
  customerName?: string;
  phone?: string;
  whatsapp?: string;
  planId?: string;
  maxDevices?: number;
  durationDays?: number;
  startDate?: string; // yyyy-mm-dd
}

function parseStartDate(startDate?: string): Date {
  if (!startDate) return new Date();
  const d = new Date(`${startDate}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Verify a pending payment → create customer + license + subscription. */
export async function verifyPurchase(
  id: string,
  overrides: VerifyOverrides,
  adminId: string,
) {
  const req = await getPurchase(id);
  if (!req) throw new AppError("NOT_FOUND", "Purchase request not found");
  if (req.status !== PURCHASE_STATUS.PENDING_VERIFICATION) {
    throw new AppError("INVALID_INPUT", "This request has already been processed.");
  }

  const plan = await findPlanById(overrides.planId ?? req.planId);
  if (!plan) throw new AppError("INVALID_INPUT", "Plan not found");

  const customer = await getOrCreateCustomer(
    {
      name: overrides.customerName ?? req.customerName,
      phone: overrides.phone ?? req.phone,
      whatsapp: overrides.whatsapp ?? req.whatsapp,
    },
    adminId,
  );

  const startsAt = parseStartDate(overrides.startDate);
  const durationDays = overrides.durationDays ?? plan.durationDays;
  const maxDevices = overrides.maxDevices ?? plan.deviceLimit;

  const { license, plaintextKey } = await createLicense({
    customerId: customer._id,
    customerName: customer.name,
    planId: plan._id,
    planName: plan.name,
    maxDevices,
    durationDays,
    startsAt,
    adminId,
  });

  const sub: SubscriptionDoc = {
    _id: new ObjectId(),
    customerId: customer._id,
    licenseId: license._id,
    planId: plan._id,
    planName: plan.name,
    startsAt: license.startsAt,
    expiresAt: license.expiresAt,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await (await subscriptions()).insertOne(sub);

  await (await purchaseRequests()).updateOne(
    { _id: req._id },
    {
      $set: {
        status: PURCHASE_STATUS.VERIFIED,
        verifiedAt: new Date(),
        verifiedBy: new ObjectId(adminId),
        licenseId: license._id,
        customerId: customer._id,
      },
    },
  );

  await writeAudit({
    action: AUDIT_ACTION.PAYMENT_VERIFIED,
    entityType: "purchaseRequest",
    entityId: req._id,
    adminId,
    metadata: { licenseId: license._id.toHexString(), customerId: customer._id.toHexString() },
  });
  await writeAudit({
    action: AUDIT_ACTION.SUBSCRIPTION_CREATED,
    entityType: "subscription",
    entityId: sub._id,
    adminId,
  });

  return {
    license: licenseSummary(license),
    // Plaintext key — surfaced to the admin exactly once to hand to the customer.
    plaintextKey,
    customer: { id: customer._id.toHexString(), name: customer.name, phone: customer.phone },
  };
}

export async function rejectPurchase(id: string, reason: string | undefined, adminId: string) {
  const req = await getPurchase(id);
  if (!req) throw new AppError("NOT_FOUND", "Purchase request not found");
  if (req.status !== PURCHASE_STATUS.PENDING_VERIFICATION) {
    throw new AppError("INVALID_INPUT", "This request has already been processed.");
  }
  await (await purchaseRequests()).updateOne(
    { _id: req._id },
    { $set: { status: PURCHASE_STATUS.REJECTED, rejectedReason: reason ?? "", verifiedAt: new Date(), verifiedBy: new ObjectId(adminId) } },
  );
  await writeAudit({
    action: AUDIT_ACTION.PAYMENT_REJECTED,
    entityType: "purchaseRequest",
    entityId: req._id,
    adminId,
    metadata: { reason: reason ?? "" },
  });
  return { rejected: true };
}

export function purchaseSummary(p: PurchaseRequestDoc) {
  return {
    id: p._id.toHexString(),
    customerName: p.customerName,
    phone: p.phone,
    whatsapp: p.whatsapp ?? null,
    planName: p.planName,
    amount: p.amount,
    senderBkashNumber: p.senderBkashNumber,
    transactionId: p.transactionId ?? null,
    status: p.status,
    submittedAt: p.submittedAt.toISOString(),
    verifiedAt: p.verifiedAt ? p.verifiedAt.toISOString() : null,
    rejectedReason: p.rejectedReason ?? null,
    licenseId: p.licenseId ? p.licenseId.toHexString() : null,
  };
}

export interface ManualLicenseInput {
  customerName: string;
  phone: string;
  whatsapp?: string;
  planId: string;
  maxDevices?: number;
  durationDays?: number;
  startDate?: string;
}

/** Admin creates a license directly (e.g. cash/offline sale), no purchase row. */
export async function createManualLicense(input: ManualLicenseInput, adminId: string) {
  const plan = await findPlanById(input.planId);
  if (!plan) throw new AppError("INVALID_INPUT", "Plan not found");

  const customer = await getOrCreateCustomer(
    { name: input.customerName, phone: input.phone, whatsapp: input.whatsapp },
    adminId,
  );

  const startsAt = parseStartDate(input.startDate);
  const { license, plaintextKey } = await createLicense({
    customerId: customer._id,
    customerName: customer.name,
    planId: plan._id,
    planName: plan.name,
    maxDevices: input.maxDevices ?? plan.deviceLimit,
    durationDays: input.durationDays ?? plan.durationDays,
    startsAt,
    adminId,
  });

  const sub: SubscriptionDoc = {
    _id: new ObjectId(),
    customerId: customer._id,
    licenseId: license._id,
    planId: plan._id,
    planName: plan.name,
    startsAt: license.startsAt,
    expiresAt: license.expiresAt,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await (await subscriptions()).insertOne(sub);
  await writeAudit({ action: AUDIT_ACTION.SUBSCRIPTION_CREATED, entityType: "subscription", entityId: sub._id, adminId });

  return {
    license: licenseSummary(license),
    plaintextKey,
    customer: { id: customer._id.toHexString(), name: customer.name, phone: customer.phone },
  };
}
