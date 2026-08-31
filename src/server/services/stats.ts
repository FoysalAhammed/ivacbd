// ============================================================
//  Dashboard aggregates (Phase 25) + admin list helpers for
//  licenses and the audit trail.
// ============================================================
import { ObjectId } from "mongodb";
import {
  activations,
  auditLogs,
  customers,
  licenses,
  purchaseRequests,
} from "../db/collections";
import type { AuditLogDoc, LicenseDoc } from "@/shared/types";
import { ACTIVATION_STATUS, LICENSE_STATUS, PURCHASE_STATUS } from "@/shared/constants";
import { licenseSummary } from "./licenses";

export async function dashboardStats() {
  const c = await customers();
  const l = await licenses();
  const a = await activations();
  const pr = await purchaseRequests();

  const [
    totalCustomers,
    activeLicenses,
    expiredLicenses,
    pendingPayments,
    activeDevices,
    revenueAgg,
  ] = await Promise.all([
    c.countDocuments(),
    l.countDocuments({ status: LICENSE_STATUS.ACTIVE }),
    l.countDocuments({ status: LICENSE_STATUS.EXPIRED }),
    pr.countDocuments({ status: PURCHASE_STATUS.PENDING_VERIFICATION }),
    a.countDocuments({ status: ACTIVATION_STATUS.ACTIVE }),
    pr
      .aggregate<{ total: number }>([
        { $match: { status: PURCHASE_STATUS.VERIFIED } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
        { $project: { _id: 0, total: 1 } },
      ])
      .toArray(),
  ]);

  return {
    totalCustomers,
    activeLicenses,
    expiredLicenses,
    pendingPayments,
    activeDevices,
    revenue: revenueAgg[0]?.total ?? 0,
  };
}

export async function listLicenses(opts: { search?: string; status?: string }): Promise<LicenseDoc[]> {
  const filter: Record<string, unknown> = {};
  if (opts.status) filter.status = opts.status;
  if (opts.search) {
    filter.$or = [
      { customerName: { $regex: opts.search, $options: "i" } },
      { licenseKeyMasked: { $regex: opts.search, $options: "i" } },
      { planName: { $regex: opts.search, $options: "i" } },
    ];
  }
  return (await licenses()).find(filter).sort({ createdAt: -1 }).limit(500).toArray();
}

export async function listLicenseSummaries(opts: { search?: string; status?: string }) {
  return (await listLicenses(opts)).map(licenseSummary);
}

export async function licensesForCustomer(customerId: string) {
  if (!ObjectId.isValid(customerId)) return [];
  const docs = await (await licenses())
    .find({ customerId: new ObjectId(customerId) })
    .sort({ createdAt: -1 })
    .toArray();
  return docs.map(licenseSummary);
}

export async function listAudit(limit = 200): Promise<AuditLogDoc[]> {
  return (await auditLogs()).find({}).sort({ createdAt: -1 }).limit(limit).toArray();
}

export function auditSummary(a: AuditLogDoc) {
  return {
    id: a._id.toHexString(),
    action: a.action,
    entityType: a.entityType,
    entityId: a.entityId,
    adminId: a.adminId ? a.adminId.toHexString() : null,
    metadata: a.metadata ?? null,
    createdAt: a.createdAt.toISOString(),
  };
}
