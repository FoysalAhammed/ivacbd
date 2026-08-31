// ============================================================
//  Zod schemas for every untrusted input boundary. Route handlers
//  parse with these before anything touches the database (Phase 38).
// ============================================================
import { z } from "zod";
import { INSTALLATION_ID_REGEX, LICENSE_KEY_REGEX } from "./constants";

const licenseKey = z
  .string()
  .trim()
  .toUpperCase()
  .regex(LICENSE_KEY_REGEX, "Invalid activation key format");

const installationId = z
  .string()
  .trim()
  .regex(INSTALLATION_ID_REGEX, "Invalid installation id");

const objectIdHex = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");

// ── License / device (extension-facing) ─────────────────────

export const activateSchema = z.object({
  licenseKey,
  installationId,
  extensionVersion: z.string().trim().max(20).optional(),
});
export type ActivateInput = z.infer<typeof activateSchema>;

export const validateSchema = z.object({
  licenseId: objectIdHex,
  installationId,
  extensionVersion: z.string().trim().max(20).optional(),
});
export type ValidateInput = z.infer<typeof validateSchema>;

// ── Customer purchase (website-facing) ──────────────────────

const bdPhone = z
  .string()
  .trim()
  .regex(/^01[0-9]{9}$/, "Enter a valid 11-digit Bangladeshi number");

export const purchaseSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: bdPhone,
  whatsapp: bdPhone.optional().or(z.literal("").transform(() => undefined)),
  planId: objectIdHex,
  senderBkashNumber: bdPhone,
  // Optional — bKash TrxID is no longer required. Empty string → undefined.
  transactionId: z
    .string()
    .trim()
    .toUpperCase()
    .min(6, "Transaction ID looks too short")
    .max(30)
    .regex(/^[A-Z0-9]+$/, "Transaction ID should be letters and numbers only")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
export type PurchaseInput = z.infer<typeof purchaseSchema>;

// ── Admin auth ──────────────────────────────────────────────

export const adminLoginSchema = z.object({
  username: z.string().trim().min(3).max(40),
  password: z.string().min(8).max(200),
});

export const adminBootstrapSchema = z.object({
  token: z.string().min(10),
  username: z.string().trim().min(3).max(40),
  password: z.string().min(10, "Use at least 10 characters").max(200),
});

// ── Admin: plans ────────────────────────────────────────────

export const planCreateSchema = z.object({
  name: z.string().trim().min(1).max(40),
  deviceLimit: z.number().int().min(1).max(100),
  price: z.number().min(0).max(10_000_000),
  durationDays: z.number().int().min(1).max(3650),
  active: z.boolean().default(true),
});

export const planUpdateSchema = planCreateSchema.partial();

// ── Admin: verify a payment → create customer + license ─────

export const verifyPaymentSchema = z.object({
  // Optional overrides; default to the purchase request's values.
  customerName: z.string().trim().min(2).max(80).optional(),
  phone: bdPhone.optional(),
  whatsapp: bdPhone.optional(),
  planId: objectIdHex.optional(),
  maxDevices: z.number().int().min(1).max(100).optional(),
  durationDays: z.number().int().min(1).max(3650).optional(),
  // ISO date (yyyy-mm-dd). Defaults to today.
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const rejectPaymentSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});

// ── Admin: license lifecycle actions ────────────────────────

export const licenseActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("revoke") }),
  z.object({ action: z.literal("block") }),
  z.object({ action: z.literal("suspend") }),
  z.object({ action: z.literal("reactivate") }),
  z.object({ action: z.literal("extend"), days: z.number().int().min(1).max(3650) }),
  z.object({
    action: z.literal("setDeviceLimit"),
    maxDevices: z.number().int().min(1).max(100),
  }),
  z.object({ action: z.literal("resetDevices") }),
]);
export type LicenseAction = z.infer<typeof licenseActionSchema>;

// ── Admin: manual license creation (without a purchase request) ──

export const manualLicenseSchema = z.object({
  customerName: z.string().trim().min(2).max(80),
  phone: bdPhone,
  whatsapp: bdPhone.optional(),
  planId: objectIdHex,
  maxDevices: z.number().int().min(1).max(100).optional(),
  durationDays: z.number().int().min(1).max(3650).optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
