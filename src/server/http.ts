// ============================================================
//  HTTP helpers — safe JSON responses (never leak stack traces or
//  internal errors, Phase 57), consistent error codes, and CORS.
// ============================================================
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type ErrorCode =
  | "INVALID_INPUT"
  | "INVALID_KEY"
  | "EXPIRED"
  | "DEVICE_LIMIT"
  | "REVOKED"
  | "BLOCKED"
  | "SUSPENDED"
  | "NOT_FOUND"
  | "DUPLICATE"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "SERVER_ERROR"
  | "UNAVAILABLE";

const STATUS_FOR: Record<ErrorCode, number> = {
  INVALID_INPUT: 400,
  INVALID_KEY: 401,
  EXPIRED: 403,
  DEVICE_LIMIT: 409,
  REVOKED: 403,
  BLOCKED: 403,
  SUSPENDED: 403,
  NOT_FOUND: 404,
  DUPLICATE: 409,
  UNAUTHORIZED: 401,
  RATE_LIMITED: 429,
  SERVER_ERROR: 500,
  UNAVAILABLE: 503,
};

// Customer-facing messages. Never expose internals.
const MESSAGE_FOR: Partial<Record<ErrorCode, string>> = {
  INVALID_KEY: "Invalid activation key.",
  EXPIRED: "Your subscription has expired.",
  DEVICE_LIMIT:
    "This activation key has reached its maximum number of active devices.",
  REVOKED: "This license is no longer active.",
  BLOCKED: "This license has been blocked.",
  SUSPENDED: "This license is temporarily suspended.",
  UNAUTHORIZED: "You are not authorized to perform this action.",
  RATE_LIMITED: "Too many attempts. Please try again shortly.",
  SERVER_ERROR: "Something went wrong. Please try again.",
  UNAVAILABLE: "License verification is temporarily unavailable. Please try again.",
};

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ success: true, ...data }, init);
}

export function fail(
  code: ErrorCode,
  message?: string,
  init?: ResponseInit,
): NextResponse {
  return NextResponse.json(
    { success: false, code, error: message || MESSAGE_FOR[code] || "Request failed." },
    { status: STATUS_FOR[code], ...init },
  );
}

/** Convert a thrown value into a safe response, logging the real error server-side. */
export function failFromError(err: unknown): NextResponse {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return fail("INVALID_INPUT", first ? first.message : "Invalid input.");
  }
  if (err instanceof AppError) {
    return fail(err.code, err.expose ? err.message : undefined);
  }
  // eslint-disable-next-line no-console
  console.error("[api] unhandled error:", err);
  return fail("SERVER_ERROR");
}

/** A domain error services can throw; route handlers map it to a safe response. */
export class AppError extends Error {
  code: ErrorCode;
  expose: boolean;
  constructor(code: ErrorCode, message?: string, expose = true) {
    super(message || code);
    this.code = code;
    this.expose = expose;
  }
}

// ── CORS ────────────────────────────────────────────────────
// License endpoints are credential-less (authenticated by key +
// installation id, not by cookie/origin), so a permissive origin is
// safe there. Admin/purchase are same-origin and set no CORS.

export function publicCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export function withHeaders(res: NextResponse, headers: Record<string, string>): NextResponse {
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

/** Parse a JSON request body, mapping malformed bodies to INVALID_INPUT. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError("INVALID_INPUT", "Request body must be valid JSON");
  }
}

/** Standard CORS preflight response for the public (extension) endpoints. */
export function preflight(): NextResponse {
  return withHeaders(new NextResponse(null, { status: 204 }), publicCorsHeaders());
}

/** Attach public CORS headers to a response (for the extension endpoints). */
export function withCors(res: NextResponse): NextResponse {
  return withHeaders(res, publicCorsHeaders());
}
