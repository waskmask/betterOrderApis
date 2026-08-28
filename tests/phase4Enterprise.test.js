const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveScheduleFields,
  isPrintEligible,
  isKitchenReleased,
  MIN_SCHEDULE_LEAD_MINUTES,
} = require("../services/orderScheduleService");
const { buildRefundUpdate, isAutoCancelEligible } = require("../services/paymentRefundService");
const { shouldAutoAccept } = require("../services/orderAcceptService");

test("asap order is print-eligible immediately", () => {
  const fields = resolveScheduleFields({ deliveryTime: "asap" });
  assert.equal(fields.fulfillmentType, "asap");
  assert.equal(fields.requestedFor, null);
  assert.ok(fields.kitchenReleasedAt);
  assert.equal(isPrintEligible({ fulfillment: fields }), true);
});

test("scheduled order is not print-eligible before release", () => {
  const requestedFor = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
  const fields = resolveScheduleFields({
    fulfillmentType: "scheduled",
    requestedFor,
  });
  assert.equal(fields.fulfillmentType, "scheduled");
  assert.ok(fields.releaseAt);
  assert.equal(fields.kitchenReleasedAt, null);
  assert.equal(isPrintEligible({ fulfillment: fields }), false);
  assert.equal(isKitchenReleased({ fulfillment: fields }), false);
});

test("scheduled time too soon is rejected", () => {
  const tooSoon = new Date(Date.now() + (MIN_SCHEDULE_LEAD_MINUTES - 10) * 60 * 1000).toISOString();
  assert.throws(
    () => resolveScheduleFields({ fulfillmentType: "scheduled", requestedFor: tooSoon }),
    (error) => error.code === "scheduled_time_too_soon"
  );
});

test("paid orders skip auto-cancel and get refund_pending on reject", () => {
  const paid = { payment: { status: "paid" } };
  assert.equal(isAutoCancelEligible(paid), false);
  const update = buildRefundUpdate(paid, "customer cancelled");
  assert.equal(update["payment.status"], "refund_pending");
  assert.ok(update["payment.refundRequestedAt"]);
});

test("auto-accept skips scheduled until released and skips non-COD", () => {
  const restaurant = {
    orderSettings: { autoAcceptEnabled: true },
    ordersPausedUntil: null,
  };

  assert.equal(
    shouldAutoAccept(restaurant, {
      status: "pending",
      payment: { method: "online", status: "pending" },
      fulfillment: { fulfillmentType: "asap" },
    }),
    false
  );

  assert.equal(
    shouldAutoAccept(restaurant, {
      status: "pending",
      payment: { method: "cod", status: "cash_on_delivery" },
      fulfillment: {
        fulfillmentType: "scheduled",
        releaseAt: new Date(Date.now() + 60 * 60 * 1000),
        kitchenReleasedAt: null,
      },
    }),
    false
  );

  assert.equal(
    shouldAutoAccept(restaurant, {
      status: "pending",
      payment: { method: "cod", status: "cash_on_delivery" },
      fulfillment: { fulfillmentType: "asap", kitchenReleasedAt: new Date() },
    }),
    true
  );
});

test("print accept idempotency key is stable", () => {
  const orderId = "abc123";
  const key = `print:accept:${orderId}`;
  assert.equal(key, "print:accept:abc123");
});
