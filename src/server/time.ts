// ============================================================
//  Time helpers. One place for "now", date math, and the two
//  policy windows the extension is told at activation:
//    • validation interval — how often to re-check online (~24h)
//    • offline grace — how long a cached license survives with no
//      network before the extension refuses to run.
// ============================================================

export function now(): Date {
  return new Date();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function addDays(from: Date, days: number): Date {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function addMs(from: Date, ms: number): Date {
  return new Date(from.getTime() + ms);
}

export function isPast(date: Date): boolean {
  return date.getTime() <= Date.now();
}

/** Whole days remaining until `expiresAt` (never negative); 0 once expired. */
export function daysLeft(expiresAt: Date, from: Date = new Date()): number {
  const ms = expiresAt.getTime() - from.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

const HOUR_MS = 60 * 60 * 1000;

function envHours(name: string, fallbackHours: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallbackHours;
}

/** How long the extension may trust a cached license before re-validating. */
export function validationIntervalMs(): number {
  return envHours("LICENSE_VALIDATION_INTERVAL_HOURS", 24) * HOUR_MS;
}

/** How long a cached license survives with no successful online check. */
export function offlineGraceMs(): number {
  return envHours("OFFLINE_GRACE_PERIOD_HOURS", 72) * HOUR_MS;
}
