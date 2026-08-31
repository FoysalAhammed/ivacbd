// ============================================================
//  Customer service (Phase 14). Customers are keyed by phone; a
//  repeat purchase from the same phone reuses the existing record.
// ============================================================
import { ObjectId } from "mongodb";
import { customers, licenses } from "../db/collections";
import type { CustomerDoc } from "@/shared/types";
import { AUDIT_ACTION } from "@/shared/constants";
import { writeAudit } from "../audit";

export async function findCustomerByPhone(phone: string): Promise<CustomerDoc | null> {
  return (await customers()).findOne({ phone });
}

export async function findCustomerById(id: string | ObjectId): Promise<CustomerDoc | null> {
  const _id = id instanceof ObjectId ? id : ObjectId.isValid(id) ? new ObjectId(id) : null;
  if (!_id) return null;
  return (await customers()).findOne({ _id });
}

export interface CustomerInput {
  name: string;
  phone: string;
  whatsapp?: string;
}

/** Reuse an existing customer by phone, or create one. */
export async function getOrCreateCustomer(
  input: CustomerInput,
  adminId: string | null,
): Promise<CustomerDoc> {
  const existing = await findCustomerByPhone(input.phone);
  if (existing) {
    // Keep name/whatsapp fresh; propagate the display name to their licenses.
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name && input.name !== existing.name) set.name = input.name;
    if (input.whatsapp && input.whatsapp !== existing.whatsapp) set.whatsapp = input.whatsapp;
    if (Object.keys(set).length > 1) {
      await (await customers()).updateOne({ _id: existing._id }, { $set: set });
      if (set.name) {
        await (await licenses()).updateMany(
          { customerId: existing._id },
          { $set: { customerName: input.name, updatedAt: new Date() } },
        );
      }
    }
    return { ...existing, ...set } as CustomerDoc;
  }

  const doc: CustomerDoc = {
    _id: new ObjectId(),
    name: input.name,
    phone: input.phone,
    whatsapp: input.whatsapp,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await (await customers()).insertOne(doc);
  await writeAudit({ action: AUDIT_ACTION.CUSTOMER_CREATED, entityType: "customer", entityId: doc._id, adminId });
  return doc;
}

export async function listCustomers(search?: string): Promise<CustomerDoc[]> {
  const filter = search
    ? { $or: [{ name: { $regex: search, $options: "i" } }, { phone: { $regex: search, $options: "i" } }] }
    : {};
  return (await customers()).find(filter).sort({ createdAt: -1 }).limit(500).toArray();
}

export function customerSummary(c: CustomerDoc) {
  return {
    id: c._id.toHexString(),
    name: c.name,
    phone: c.phone,
    whatsapp: c.whatsapp ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}
