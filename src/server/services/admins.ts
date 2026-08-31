// ============================================================
//  Admin service (Phases 21, 22). Bootstrap the first admin with a
//  one-time env token; authenticate with username + scrypt password.
// ============================================================
import { ObjectId } from "mongodb";
import { admins } from "../db/collections";
import type { AdminDoc } from "@/shared/types";
import { AUDIT_ACTION } from "@/shared/constants";
import { AppError } from "../http";
import { hashPassword, verifyPassword } from "../auth/admin";
import { writeAudit } from "../audit";

export async function countAdmins(): Promise<number> {
  return (await admins()).countDocuments();
}

export async function findAdminById(id: string): Promise<AdminDoc | null> {
  if (!ObjectId.isValid(id)) return null;
  return (await admins()).findOne({ _id: new ObjectId(id) });
}

/** Create an admin, gated by the ADMIN_BOOTSTRAP_TOKEN env value. */
export async function bootstrapAdmin(input: {
  token: string;
  username: string;
  password: string;
}): Promise<AdminDoc> {
  const expected = process.env.ADMIN_BOOTSTRAP_TOKEN;
  if (!expected || expected.startsWith("CHANGE_ME") || input.token !== expected) {
    throw new AppError("UNAUTHORIZED", "Invalid bootstrap token");
  }
  const col = await admins();
  const doc: AdminDoc = {
    _id: new ObjectId(),
    username: input.username.toLowerCase(),
    passwordHash: hashPassword(input.password),
    createdAt: new Date(),
    lastLoginAt: null,
  };
  try {
    await col.insertOne(doc);
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw new AppError("DUPLICATE", "That username already exists");
    }
    throw err;
  }
  await writeAudit({ action: AUDIT_ACTION.ADMIN_CREATED, entityType: "admin", entityId: doc._id, adminId: doc._id });
  return doc;
}

/** Verify credentials. Returns the admin, or null on any mismatch. */
export async function authenticate(username: string, password: string): Promise<AdminDoc | null> {
  const admin = await (await admins()).findOne({ username: username.toLowerCase() });
  if (!admin) {
    // Still spend time hashing to blunt username-enumeration timing.
    verifyPassword(password, "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
    return null;
  }
  if (!verifyPassword(password, admin.passwordHash)) return null;

  await (await admins()).updateOne({ _id: admin._id }, { $set: { lastLoginAt: new Date() } });
  await writeAudit({ action: AUDIT_ACTION.ADMIN_LOGIN, entityType: "admin", entityId: admin._id, adminId: admin._id });
  return admin;
}
