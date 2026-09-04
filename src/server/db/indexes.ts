// ============================================================
//  Index creation (Phase 9). Idempotent — safe to run repeatedly
//  via `npm run setup:db`. createIndex is a no-op if the index
//  already exists with the same spec.
// ============================================================
import {
  activations,
  admins,
  auditLogs,
  customers,
  licenses,
  otps,
  plans,
  purchaseRequests,
  settings,
  subscriptions,
} from "./collections";

export async function ensureIndexes(): Promise<string[]> {
  const created: string[] = [];
  const note = (label: string, p: Promise<unknown>) =>
    p.then(() => created.push(label));

  const c = await customers();
  const l = await licenses();
  const a = await activations();
  const s = await subscriptions();
  const pr = await purchaseRequests();
  const al = await auditLogs();
  const ad = await admins();
  const pl = await plans();
  const ot = await otps();
  const st = await settings();

  // TrxID is now optional → migrate any legacy non-partial unique index so
  // multiple requests without a TrxID are allowed. No-op on a fresh DB.
  await pr.dropIndex("transactionId_1").catch(() => {});

  await Promise.all([
    // customers — look up by phone
    note("customers.phone", c.createIndex({ phone: 1 })),
    note("customers.createdAt", c.createIndex({ createdAt: -1 })),

    // licenses — activation looks up by key hash (unique); admin by status/expiry
    note(
      "licenses.licenseKeyHash(unique)",
      l.createIndex({ licenseKeyHash: 1 }, { unique: true }),
    ),
    note("licenses.customerId", l.createIndex({ customerId: 1 })),
    note("licenses.status", l.createIndex({ status: 1 })),
    note("licenses.expiresAt", l.createIndex({ expiresAt: 1 })),
    note("licenses.licenseKeyMasked", l.createIndex({ licenseKeyMasked: 1 })),

    // activations — one activation doc per (license, installation)
    note(
      "activations.license+installation(unique)",
      a.createIndex({ licenseId: 1, installationId: 1 }, { unique: true }),
    ),
    note("activations.installationId", a.createIndex({ installationId: 1 })),
    note("activations.status", a.createIndex({ status: 1 })),

    // subscriptions
    note("subscriptions.customerId", s.createIndex({ customerId: 1 })),
    note("subscriptions.licenseId", s.createIndex({ licenseId: 1 })),
    note("subscriptions.status", s.createIndex({ status: 1 })),

    // purchase requests — enforce TrxID uniqueness ONLY when one is provided
    note(
      "purchaseRequests.transactionId(unique,partial)",
      pr.createIndex(
        { transactionId: 1 },
        {
          unique: true,
          name: "trxid_unique_partial",
          partialFilterExpression: { transactionId: { $type: "string" } },
        },
      ),
    ),
    note("purchaseRequests.status", pr.createIndex({ status: 1 })),
    note("purchaseRequests.submittedAt", pr.createIndex({ submittedAt: -1 })),

    // audit logs
    note("auditLogs.createdAt", al.createIndex({ createdAt: -1 })),
    note("auditLogs.entity", al.createIndex({ entityType: 1, entityId: 1 })),

    // admins — unique username
    note(
      "admins.username(unique)",
      ad.createIndex({ username: 1 }, { unique: true }),
    ),

    // plans
    note("plans.active", pl.createIndex({ active: 1 })),

    // otp relay — one row per phone (unique), TTL cleans abandoned rows
    note("otps.phoneKey(unique)", ot.createIndex({ phoneKey: 1 }, { unique: true })),
    note(
      "otps.expiresAt(ttl)",
      ot.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "otp_ttl" }),
    ),

    // settings — one row per key
    note("settings.key(unique)", st.createIndex({ key: 1 }, { unique: true })),
  ]);

  return created;
}
