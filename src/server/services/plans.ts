// ============================================================
//  Plan service (Phase 13). Plans define device limit, price, and
//  duration. The public site reads active plans; admin manages them.
// ============================================================
import { ObjectId } from "mongodb";
import { plans } from "../db/collections";
import type { PlanDoc } from "@/shared/types";
import { AUDIT_ACTION } from "@/shared/constants";
import { AppError } from "../http";
import { writeAudit } from "../audit";

export interface PlanInput {
  name: string;
  deviceLimit: number;
  price: number;
  durationDays: number;
  active?: boolean;
}

export async function listActivePlans(): Promise<PlanDoc[]> {
  return (await plans()).find({ active: true }).sort({ price: 1 }).toArray();
}

export async function listAllPlans(): Promise<PlanDoc[]> {
  return (await plans()).find({}).sort({ price: 1 }).toArray();
}

export async function findPlanById(id: string | ObjectId): Promise<PlanDoc | null> {
  const _id = id instanceof ObjectId ? id : ObjectId.isValid(id) ? new ObjectId(id) : null;
  if (!_id) return null;
  return (await plans()).findOne({ _id });
}

export async function createPlan(input: PlanInput, adminId: string | null): Promise<PlanDoc> {
  const doc: PlanDoc = {
    _id: new ObjectId(),
    name: input.name,
    deviceLimit: input.deviceLimit,
    price: input.price,
    durationDays: input.durationDays,
    active: input.active ?? true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await (await plans()).insertOne(doc);
  await writeAudit({ action: AUDIT_ACTION.PLAN_CREATED, entityType: "plan", entityId: doc._id, adminId });
  return doc;
}

export async function updatePlan(
  id: string,
  patch: Partial<PlanInput>,
  adminId: string | null,
): Promise<PlanDoc> {
  const _id = ObjectId.isValid(id) ? new ObjectId(id) : null;
  if (!_id) throw new AppError("NOT_FOUND", "Plan not found");
  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) set[k] = v;
  const res = await (await plans()).findOneAndUpdate(
    { _id },
    { $set: set },
    { returnDocument: "after" },
  );
  if (!res) throw new AppError("NOT_FOUND", "Plan not found");
  await writeAudit({ action: AUDIT_ACTION.PLAN_UPDATED, entityType: "plan", entityId: _id, adminId });
  return res;
}

export function planSummary(p: PlanDoc, opts?: { admin?: boolean }) {
  return {
    id: p._id.toHexString(),
    name: p.name,
    deviceLimit: p.deviceLimit,
    price: p.price,
    durationDays: p.durationDays,
    ...(opts?.admin ? { active: p.active, createdAt: p.createdAt.toISOString() } : {}),
  };
}
