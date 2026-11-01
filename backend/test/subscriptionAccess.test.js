import { test } from "node:test";
import assert from "node:assert/strict";
import { bestSubscription, subscriptionStatus } from "../src/utils/subscriptionAccess.js";
const now = Date.parse("2026-11-01T00:00:00Z");
const active = { id: "a", activated_at: "2026-01-01", expires_at: null, subscription_plans: { tier: "premium", daily_scan_limit: null } };
test("unlimited expiry stays active, including an admin grant", () => { assert.equal(subscriptionStatus(active, now), "active"); });
test("revoked or expired newer rows do not hide an active grant", () => {
  assert.equal(bestSubscription([{ ...active, id: "b", revoked_at: "2026-10-31" }, active], now).id, "a");
});
test("a malformed date never authorizes a subscription", () => {
  assert.equal(subscriptionStatus({ ...active, expires_at: "bad" }, now), "invalid");
});
test("premium is preferred over a longer-lived free subscription", () => {
  const paid = { ...active, expires_at: "2026-12-01" };
  const free = { ...active, id: "free", subscription_plans: { tier: "free", daily_scan_limit: 50 } };
  assert.equal(bestSubscription([free, paid], now).id, "a");
});
