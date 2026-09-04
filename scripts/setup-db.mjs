// ============================================================
//  Provision MongoDB: create indexes and seed default plans.
//
//    node scripts/setup-db.mjs
//
//  Idempotent — safe to run repeatedly. Reads env from the shell,
//  falling back to .env.local then .env. Admin users are NOT created
//  here; create the first admin via POST /api/admin/bootstrap using
//  ADMIN_BOOTSTRAP_TOKEN after deployment.
// ============================================================
import fs from "node:fs";
import { MongoClient } from "mongodb";

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = raw.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
loadEnv(".env.local");
loadEnv(".env");

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "ivac_licensing";
if (!uri) {
  console.error("✗ MONGODB_URI is not set. Add it to .env.local or your shell env.");
  process.exit(1);
}

// Mirrors src/shared/constants.ts DEFAULT_PLANS (BDT).
const DEFAULT_PLANS = [
  { name: "1 PC", deviceLimit: 1, price: 1500, durationDays: 30, active: true },
  { name: "3 PC", deviceLimit: 3, price: 3500, durationDays: 30, active: true },
  { name: "5 PC", deviceLimit: 5, price: 5000, durationDays: 30, active: true },
];

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db(dbName);
  console.log(`→ Connected to "${dbName}"`);

  const created = [];
  const idx = async (label, coll, spec, opts) => {
    await db.collection(coll).createIndex(spec, opts);
    created.push(label);
  };

  // TrxID is now OPTIONAL → migrate any legacy non-partial unique index so
  // multiple requests without a TrxID are allowed. No-op on a fresh DB.
  // (Kept in sync with src/server/db/indexes.ts, which this script mirrors.)
  await db.collection("purchaseRequests").dropIndex("transactionId_1").catch(() => {});

  await Promise.all([
    idx("customers.phone", "customers", { phone: 1 }),
    idx("customers.createdAt", "customers", { createdAt: -1 }),
    idx("licenses.licenseKeyHash(unique)", "licenses", { licenseKeyHash: 1 }, { unique: true }),
    idx("licenses.customerId", "licenses", { customerId: 1 }),
    idx("licenses.status", "licenses", { status: 1 }),
    idx("licenses.expiresAt", "licenses", { expiresAt: 1 }),
    idx("licenses.licenseKeyMasked", "licenses", { licenseKeyMasked: 1 }),
    idx("activations.license+installation(unique)", "activations", { licenseId: 1, installationId: 1 }, { unique: true }),
    idx("activations.installationId", "activations", { installationId: 1 }),
    idx("activations.status", "activations", { status: 1 }),
    idx("subscriptions.customerId", "subscriptions", { customerId: 1 }),
    idx("subscriptions.licenseId", "subscriptions", { licenseId: 1 }),
    idx("subscriptions.status", "subscriptions", { status: 1 }),
    idx("purchaseRequests.transactionId(unique,partial)", "purchaseRequests", { transactionId: 1 }, { unique: true, name: "trxid_unique_partial", partialFilterExpression: { transactionId: { $type: "string" } } }),
    idx("purchaseRequests.status", "purchaseRequests", { status: 1 }),
    idx("purchaseRequests.submittedAt", "purchaseRequests", { submittedAt: -1 }),
    idx("auditLogs.createdAt", "auditLogs", { createdAt: -1 }),
    idx("auditLogs.entity", "auditLogs", { entityType: 1, entityId: 1 }),
    idx("admins.username(unique)", "admins", { username: 1 }, { unique: true }),
    idx("plans.active", "plans", { active: 1 }),
    idx("otps.phoneKey(unique)", "otps", { phoneKey: 1 }, { unique: true }),
    idx("otps.expiresAt(ttl)", "otps", { expiresAt: 1 }, { expireAfterSeconds: 0, name: "otp_ttl" }),
    idx("settings.key(unique)", "settings", { key: 1 }, { unique: true }),
  ]);
  console.log(`→ Ensured ${created.length} indexes`);

  const plans = db.collection("plans");
  const count = await plans.countDocuments();
  if (count === 0) {
    const now = new Date();
    await plans.insertMany(DEFAULT_PLANS.map((p) => ({ ...p, createdAt: now, updatedAt: now })));
    console.log(`→ Seeded ${DEFAULT_PLANS.length} default plans`);
  } else {
    console.log(`→ Plans already present (${count}) — not seeding`);
  }

  console.log("\n✓ Database setup complete.");
  console.log("  Next: create the first admin via POST /api/admin/bootstrap");
  console.log("        (body: { token: ADMIN_BOOTSTRAP_TOKEN, username, password })\n");
} catch (err) {
  console.error("✗ Setup failed:", err.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
