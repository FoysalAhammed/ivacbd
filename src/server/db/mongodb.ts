// ============================================================
//  MongoDB connection — serverless-safe (Phase 45).
//  Vercel invokes functions in short-lived instances that may be
//  reused. We cache a single MongoClient connection PROMISE on the
//  global object so warm invocations reuse one pooled connection
//  instead of opening a new one per request.
// ============================================================
import { MongoClient, type Db } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "ivac_license";

if (!uri) {
  // Fail loud at first use, not at import time (keeps `next build` working
  // without secrets present in CI).
  // eslint-disable-next-line no-console
  console.warn("[db] MONGODB_URI is not set — database calls will fail.");
}

const options = {
  // Keep the pool small; Atlas free tier caps connections.
  maxPoolSize: 5,
  minPoolSize: 0,
  retryWrites: true,
};

// Reuse across hot reloads (dev) and warm lambdas (prod).
declare global {
  // eslint-disable-next-line no-var
  var __ivacMongoClientPromise: Promise<MongoClient> | undefined;
}

function clientPromise(): Promise<MongoClient> {
  if (!uri) throw new Error("MONGODB_URI is not configured");
  if (!global.__ivacMongoClientPromise) {
    const client = new MongoClient(uri, options);
    global.__ivacMongoClientPromise = client.connect();
  }
  return global.__ivacMongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise();
  return client.db(dbName);
}

export async function getClient(): Promise<MongoClient> {
  return clientPromise();
}
