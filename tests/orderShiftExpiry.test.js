const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveAsapPendingExpiresAt,
  resolvePendingExpiresAt,
  isPendingExpiryEligible,
  isKitchenExpiryEligible,
  getEffectiveOrderStatus,
  canAcceptOrReject,
} = require("../services/orderShiftExpiryService");

test("ASAP pending expires in one hour", () => {
  const now = new Date("2026-08-28T12:00:00.000Z");
  const expiresAt = resolveAsapPendingExpiresAt(now);
  assert.equal(expiresAt.getTime() - now.getTime(), 60 * 60 * 1000);
});

test("scheduled pending expires at releaseAt", () => {
  const releaseAt = new Date("2026-08-28T18:00:00.000Z");
  const expiresAt = resolvePendingExpiresAt(
    { fulfillmentType: "scheduled", releaseAt },
    new Date("2026-08-28T12:00:00.000Z")
  );
  assert.equal(expiresAt.toISOString(), releaseAt.toISOString());
});

test("scheduled pending is not expiry eligible before releaseAt", () => {
  const now = new Date("2026-08-28T12:00:00.000Z");
  const order = {
    status: "pending",
    pendingExpiresAt: new Date("2026-08-28T18:00:00.000Z"),
    fulfillment: {
      fulfillmentType: "scheduled",
      releaseAt: new Date("2026-08-28T18:00:00.000Z"),
      kitchenReleasedAt: null,
    },
  };
  assert.equal(isPendingExpiryEligible(order, now), false);
});

test("expired pending can still be accepted or rejected", () => {
  const order = { status: "expired", expiredFromStatus: "pending" };
  assert.equal(canAcceptOrReject(order), true);
  assert.equal(getEffectiveOrderStatus(order), "pending");
});

test("kitchen expiry requires shiftExpiresAt and released scheduled kitchen", () => {
  const now = new Date("2026-08-28T23:00:00.000Z");
  assert.equal(
    isKitchenExpiryEligible(
      {
        status: "accepted",
        shiftExpiresAt: new Date("2026-08-28T22:00:00.000Z"),
        fulfillment: { fulfillmentType: "asap" },
      },
      now
    ),
    true
  );
  assert.equal(
    isKitchenExpiryEligible(
      {
        status: "accepted",
        shiftExpiresAt: new Date("2026-08-28T22:00:00.000Z"),
        fulfillment: {
          fulfillmentType: "scheduled",
          kitchenReleasedAt: null,
        },
      },
      now
    ),
    false
  );
});
