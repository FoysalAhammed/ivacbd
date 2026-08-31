// ============================================================
//  Shared constants — the validation regexes and enums that both the
//  server and the extension depend on. These guard the untrusted input
//  boundary (activate/validate payloads) and the "is this license
//  usable?" decision.
// ============================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  LICENSE_KEY_REGEX,
  INSTALLATION_ID_REGEX,
  USABLE_LICENSE_STATUSES,
  LICENSE_STATUS,
  LICENSE_PAYLOAD_VERSION,
  DEFAULT_PLANS,
} from "../src/shared/constants.ts";

test("LICENSE_KEY_REGEX accepts canonical keys, rejects malformed ones", () => {
  assert.match("A1B2-C3D4-E5F6-G7H8", LICENSE_KEY_REGEX);
  assert.doesNotMatch("A1B2-C3D4-E5F6", LICENSE_KEY_REGEX); // too few groups
  assert.doesNotMatch("A1B2C3D4E5F6G7H8", LICENSE_KEY_REGEX); // no hyphens
  assert.doesNotMatch("a1b2-c3d4-e5f6-g7h8", LICENSE_KEY_REGEX); // lowercase (schema uppercases first)
  assert.doesNotMatch("A1B2-C3D4-E5F6-G7H", LICENSE_KEY_REGEX); // short group
  assert.doesNotMatch("A1I2-C3D4-E5F6-G7H8", LICENSE_KEY_REGEX); // contains I
});

test("INSTALLATION_ID_REGEX matches a real crypto.randomUUID()", () => {
  for (let i = 0; i < 50; i++) {
    assert.match(crypto.randomUUID(), INSTALLATION_ID_REGEX);
  }
  assert.doesNotMatch("not-a-uuid", INSTALLATION_ID_REGEX);
  assert.doesNotMatch("", INSTALLATION_ID_REGEX);
});

test("only ACTIVE is a usable license status (matches extension isUsable)", () => {
  assert.deepEqual(USABLE_LICENSE_STATUSES, [LICENSE_STATUS.ACTIVE]);
  for (const s of ["PENDING", "EXPIRED", "REVOKED", "BLOCKED", "SUSPENDED"]) {
    assert.ok(!USABLE_LICENSE_STATUSES.includes(s), `${s} must NOT be usable`);
  }
});

test("payload version is 1 (extension src/license.js PAYLOAD_VERSION must match)", () => {
  assert.equal(LICENSE_PAYLOAD_VERSION, 1);
});

test("default plans are the 1 / 3 / 5 device tiers", () => {
  const limits = DEFAULT_PLANS.map((p) => p.deviceLimit).sort((a, b) => a - b);
  assert.deepEqual(limits, [1, 3, 5]);
  for (const p of DEFAULT_PLANS) {
    assert.ok(p.durationDays >= 1);
    assert.ok(p.price >= 0);
  }
});
