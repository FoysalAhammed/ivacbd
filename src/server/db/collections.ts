// ============================================================
//  Typed collection accessors. One place that names collections
//  and binds their document types, so services never stringly-type
//  a collection name.
// ============================================================
import type { Collection } from "mongodb";
import { getDb } from "./mongodb";
import type {
  ActivationDoc,
  AdminDoc,
  AuditLogDoc,
  CustomerDoc,
  LicenseDoc,
  PlanDoc,
  PurchaseRequestDoc,
  SubscriptionDoc,
} from "@/shared/types";

export const COLLECTIONS = {
  customers: "customers",
  admins: "admins",
  plans: "plans",
  licenses: "licenses",
  activations: "activations",
  subscriptions: "subscriptions",
  purchaseRequests: "purchaseRequests",
  auditLogs: "auditLogs",
} as const;

export async function customers(): Promise<Collection<CustomerDoc>> {
  return (await getDb()).collection<CustomerDoc>(COLLECTIONS.customers);
}
export async function admins(): Promise<Collection<AdminDoc>> {
  return (await getDb()).collection<AdminDoc>(COLLECTIONS.admins);
}
export async function plans(): Promise<Collection<PlanDoc>> {
  return (await getDb()).collection<PlanDoc>(COLLECTIONS.plans);
}
export async function licenses(): Promise<Collection<LicenseDoc>> {
  return (await getDb()).collection<LicenseDoc>(COLLECTIONS.licenses);
}
export async function activations(): Promise<Collection<ActivationDoc>> {
  return (await getDb()).collection<ActivationDoc>(COLLECTIONS.activations);
}
export async function subscriptions(): Promise<Collection<SubscriptionDoc>> {
  return (await getDb()).collection<SubscriptionDoc>(COLLECTIONS.subscriptions);
}
export async function purchaseRequests(): Promise<
  Collection<PurchaseRequestDoc>
> {
  return (await getDb()).collection<PurchaseRequestDoc>(
    COLLECTIONS.purchaseRequests,
  );
}
export async function auditLogs(): Promise<Collection<AuditLogDoc>> {
  return (await getDb()).collection<AuditLogDoc>(COLLECTIONS.auditLogs);
}
