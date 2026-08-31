// ============================================================
//  Audit logging (Phase 55). Records who did what to which entity.
//  Best-effort: a failed audit write must never break the action it
//  describes, so writes are guarded and only warn on failure.
// ============================================================
import { ObjectId } from "mongodb";
import { auditLogs } from "./db/collections";
import type { AuditAction } from "@/shared/constants";

export interface AuditInput {
  action: AuditAction;
  entityType: string;
  entityId?: string | ObjectId | null;
  adminId?: string | ObjectId | null;
  metadata?: Record<string, unknown>;
}

function toId(v: string | ObjectId | null | undefined): ObjectId | null {
  if (!v) return null;
  if (v instanceof ObjectId) return v;
  return ObjectId.isValid(v) ? new ObjectId(v) : null;
}

export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    const col = await auditLogs();
    await col.insertOne({
      _id: new ObjectId(),
      adminId: toId(input.adminId),
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ? String(input.entityId) : null,
      metadata: input.metadata,
      createdAt: new Date(),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[audit] write failed:", (err as Error)?.message);
  }
}
