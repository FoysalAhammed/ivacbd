// ============================================================
//  Shared domain types. DB document shapes use ObjectId (type-only
//  import — erased at build, so this file is still import-safe from
//  client components). API response DTOs use string ids.
// ============================================================
import type { ObjectId } from "mongodb";
import type {
  ActivationStatus,
  AuditAction,
  LicenseStatus,
  PurchaseStatus,
  SubscriptionStatus,
} from "./constants";

// ── DB documents ────────────────────────────────────────────

export interface CustomerDoc {
  _id: ObjectId;
  name: string;
  phone: string;
  whatsapp?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlanDoc {
  _id: ObjectId;
  name: string;
  deviceLimit: number;
  price: number;
  durationDays: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface LicenseDoc {
  _id: ObjectId;
  /** SHA-256 hex of the plaintext key. The plaintext is shown to admin once. */
  licenseKeyHash: string;
  /** First 4 + last 4 chars, for admin display/search only (never the key). */
  licenseKeyMasked: string;
  /** AES-256-GCM ciphertext of the plaintext key so an admin can re-reveal it. */
  licenseKeyEnc?: string;
  customerId: ObjectId;
  /** Denormalized for the signed payload + admin display (avoids a join). */
  customerName: string;
  planId: ObjectId | null;
  planName: string;
  status: LicenseStatus;
  maxDevices: number;
  /** Denormalized count of ACTIVE activations — the atomic device-limit guard. */
  activeDeviceCount: number;
  startsAt: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  revokedAt?: Date | null;
  note?: string;
}

export interface ActivationDoc {
  _id: ObjectId;
  licenseId: ObjectId;
  installationId: string;
  status: ActivationStatus;
  extensionVersion?: string;
  activatedAt: Date;
  lastValidatedAt: Date;
  deactivatedAt?: Date | null;
}

/**
 * One doc per phone number that relays OTPs. The raw phone is never stored —
 * only its HMAC (`phoneKey`). The OTP itself is encrypted at rest and cleared
 * the moment the bound extension reads it (single-use). `expiresAt` drives a
 * Mongo TTL index so abandoned rows self-delete.
 */
export interface OtpDoc {
  _id: ObjectId;
  /** HMAC-SHA256 of the normalized phone number. Unique. */
  phoneKey: string;
  /** AES-256-GCM blob of the OTP digits; null once consumed. */
  otpEnc: string | null;
  /** Optional encrypted raw SMS text (debugging). */
  rawEnc?: string | null;
  /** The OTP is only deliverable before this instant (code-enforced ~180s). */
  otpExpiresAt?: Date | null;
  /** Trust-on-first-use: reset to null on every submit; first poller re-binds. */
  boundInstallationId?: string | null;
  boundAt?: Date | null;
  consumedAt?: Date | null;
  submitCount?: number;
  createdAt?: Date;
  updatedAt: Date;
  /** TTL anchor — Mongo removes the row after this instant. */
  expiresAt: Date;
}

/**
 * Small key/value settings collection. Currently holds only the OTP relay's
 * admin-configured "allowed sender" (an alphanumeric sender ID like `IVACBD`
 * or a phone number). One doc per `key`.
 */
export interface SettingsDoc {
  _id: ObjectId;
  key: string;
  allowedSender?: string | null;
  updatedAt: Date;
  updatedBy?: string | null;
}

export interface SubscriptionDoc {
  _id: ObjectId;
  customerId: ObjectId;
  licenseId: ObjectId;
  planId: ObjectId | null;
  planName: string;
  startsAt: Date;
  expiresAt: Date;
  status: SubscriptionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface PurchaseRequestDoc {
  _id: ObjectId;
  customerName: string;
  phone: string;
  whatsapp?: string;
  planId: ObjectId;
  planName: string;
  amount: number;
  senderBkashNumber: string;
  /** Optional — bKash TrxID is no longer required to submit a request. */
  transactionId?: string | null;
  status: PurchaseStatus;
  submittedAt: Date;
  verifiedAt?: Date | null;
  verifiedBy?: ObjectId | null;
  rejectedReason?: string;
  /** Set once verified → the license this purchase produced. */
  licenseId?: ObjectId | null;
  customerId?: ObjectId | null;
}

export interface AdminDoc {
  _id: ObjectId;
  username: string;
  /** scrypt: `scrypt$N$r$p$saltB64$hashB64` — never a plaintext password. */
  passwordHash: string;
  createdAt: Date;
  lastLoginAt?: Date | null;
}

export interface AuditLogDoc {
  _id: ObjectId;
  adminId: ObjectId | null;
  action: AuditAction;
  entityType: string;
  entityId: string | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

// ── Signed license payload (verified inside the extension) ──────

export interface SignedLicensePayload {
  v: number;
  keyId: string;
  licenseId: string;
  status: LicenseStatus;
  maxDevices: number;
  installationId: string;
  planName: string;
  customerName: string;
  issuedAt: string; // ISO
  startsAt: string; // ISO
  expiresAt: string; // ISO
  serverTime: string; // ISO — authoritative "now" at issue
}

// ── API response DTOs ───────────────────────────────────────

export interface LicenseActivationResult {
  success: true;
  license: {
    licenseId: string;
    status: LicenseStatus;
    expiresAt: string;
    maxDevices: number;
    planName: string;
    customerName: string;
  };
  serverTime: string;
  /** Compact token: base64url(payloadJSON).base64url(signature). */
  signedLicense: string;
  /** How long (ms) the extension may trust this offline before re-validating. */
  validationIntervalMs: number;
  graceMs: number;
}

export interface ApiError {
  success: false;
  error: string;
  code: string;
}
