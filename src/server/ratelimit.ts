// ============================================================
//  Rate limiting (Phase 44). In-memory fixed-window counter.
//
//  LIMITATION (documented deliberately): serverless functions do not
//  share memory, so this limits per warm instance, not globally. It
//  still meaningfully blunts brute-force from a single caller hitting
//  a warm instance, and adds zero infra. For strong global limits,
//  front the API with the platform's edge/WAF rate limiting or a
//  shared store (Upstash/Redis) — wire that in `check()` if needed.
// ============================================================

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Opportunistic cleanup so the map cannot grow unbounded on a long-lived
// warm instance. Runs at most once per sweep window.
let lastSweep = 0;
const SWEEP_MS = 5 * 60 * 1000;

function sweep(nowMs: number): void {
  if (nowMs - lastSweep < SWEEP_MS) return;
  lastSweep = nowMs;
  for (const [key, b] of buckets) {
    if (b.resetAt <= nowMs) buckets.delete(key);
  }
}

export interface RateResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * Fixed-window limit: at most `limit` hits per `windowMs` for a key.
 * Key should scope the action + caller, e.g. `activate:<ip>`.
 */
export function check(key: string, limit: number, windowMs: number): RateResult {
  const nowMs = Date.now();
  sweep(nowMs);

  const b = buckets.get(key);
  if (!b || b.resetAt <= nowMs) {
    buckets.set(key, { count: 1, resetAt: nowMs + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
  }

  if (b.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterMs: b.resetAt - nowMs };
  }

  b.count += 1;
  return { allowed: true, remaining: limit - b.count, retryAfterMs: 0 };
}

/** Best-effort client identifier from proxy headers (Vercel sets these). */
export function clientKey(req: Request, action: string): string {
  const h = req.headers;
  const ip =
    h.get("x-real-ip") ||
    (h.get("x-forwarded-for") || "").split(",")[0]?.trim() ||
    "unknown";
  return `${action}:${ip}`;
}
