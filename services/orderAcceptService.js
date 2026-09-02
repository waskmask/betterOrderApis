const Order = require("../modals/Order");
const { Restaurant } = require("../modals/Restaurant");
const { broadcastOrderEvent } = require("./orderRealtimeService");
const { enqueueOutboxEvent } = require("./outboxService");
const { enqueueOrderAcceptedEmail } = require("./email/orderEmailTriggers");
const { isPrintEligible, isKitchenReleased } = require("./orderScheduleService");
const {
  canAcceptOrReject,
  resolveShiftExpiresAtForRestaurant,
} = require("./orderShiftExpiryService");

const VALID_ACCEPT_MINUTES = [30, 45, 60, 75, 90, 105, 120];

function normalizeAcceptMinutes(value) {
  const minutes = Number.parseInt(value, 10);
  if (!VALID_ACCEPT_MINUTES.includes(minutes)) return null;
  return minutes;
}

function resolveAcceptTiming(order, deliveryMinutes) {
  const requestedFor = order?.fulfillment?.requestedFor
    ? new Date(order.fulfillment.requestedFor)
    : null;

  if (
    order?.fulfillment?.fulfillmentType === "scheduled" &&
    requestedFor &&
    !Number.isNaN(requestedFor.getTime())
  ) {
    const minutes = Math.max(1, Math.ceil((requestedFor.getTime() - Date.now()) / 60_000));
    return {
      acceptedDeliveryMinutes: minutes,
      acceptedEtaAt: requestedFor,
    };
  }

  const minutes = normalizeAcceptMinutes(deliveryMinutes);
  if (!minutes) return null;

  return {
    acceptedDeliveryMinutes: minutes,
    acceptedEtaAt: new Date(Date.now() + minutes * 60 * 1000),
  };
}

function resolveAutoAcceptMinutes(restaurant, order) {
  const settings = restaurant?.orderSettings || {};
  const isTakeaway = order?.fulfillment?.mode === "takeaway";

  if (isTakeaway) {
    return normalizeAcceptMinutes(settings.autoAcceptTakeawayMinutes) || 30;
  }

  const configured = normalizeAcceptMinutes(settings.autoAcceptDeliveryMinutes) || 45;
  const zoneMinutes = Number(order?.fulfillment?.deliveryMinutes) || 0;
  const candidates = [configured, zoneMinutes].filter((value) => value > 0);
  const target = Math.max(...candidates, configured);

  return (
    VALID_ACCEPT_MINUTES.find((value) => value >= target) ||
    VALID_ACCEPT_MINUTES[VALID_ACCEPT_MINUTES.length - 1]
  );
}

function shouldAutoAccept(restaurant, order) {
  const settings = restaurant?.orderSettings || {};
  if (!settings.autoAcceptEnabled) return false;
  if (restaurant.ordersPausedUntil && new Date(restaurant.ordersPausedUntil).getTime() > Date.now()) {
    return false;
  }
  if (order.status !== "pending") return false;
  if (order.payment?.method && order.payment.method !== "cod") return false;
  if (order.payment?.status === "paid" || order.payment?.status === "refund_pending") return false;
  // Scheduled orders auto-accept only after kitchen release window.
  if (order.fulfillment?.fulfillmentType === "scheduled" && !isKitchenReleased(order)) {
    return false;
  }
  return true;
}

function serializeOrderForEvent(order) {
  const doc = typeof order.toObject === "function" ? order.toObject() : order;
  return {
    _id: String(doc._id),
    orderNumber: doc.orderNumber,
    status: doc.status,
    acceptedVia: doc.acceptedVia || null,
    restaurant: doc.restaurant,
    customer: doc.customer,
    fulfillment: doc.fulfillment,
    payment: doc.payment,
    items: doc.items,
    totals: doc.totals,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function performAcceptOrder({
  orderId,
  deliveryMinutes,
  actor = { actorType: "system", actorId: null },
  note = "",
  acceptedVia = "manual",
  playTone = false,
}) {
  const existing = await Order.findById(orderId);
  if (!existing) {
    return { ok: false, status: 404, message: "order_not_found" };
  }
  if (!canAcceptOrReject(existing)) {
    return { ok: false, status: 409, message: "order_already_handled" };
  }

  const timing = resolveAcceptTiming(existing, deliveryMinutes);
  if (!timing) {
    return { ok: false, status: 400, message: "invalid_delivery_time" };
  }

  const acceptedAt = new Date();
  const shiftExpiresAt = await resolveShiftExpiresAtForRestaurant(
    existing.restaurant.restaurantId,
    acceptedAt
  );
  const historyNote =
    acceptedVia === "auto" ? "Auto-accepted" : String(note || "").trim().slice(0, 300);

  const order = await Order.findOneAndUpdate(
    {
      _id: orderId,
      $or: [{ status: "pending" }, { status: "expired", expiredFromStatus: "pending" }],
    },
    {
      $set: {
        status: "accepted",
        acceptedAt,
        acceptedVia,
        shiftExpiresAt,
        "fulfillment.acceptedDeliveryMinutes": timing.acceptedDeliveryMinutes,
        "fulfillment.acceptedEtaAt": timing.acceptedEtaAt,
        rejectReason: "",
      },
      $unset: { pendingExpiresAt: "", expiredAt: "", expiredFromStatus: "" },
      $push: {
        statusHistory: {
          status: "accepted",
          ...actor,
          note: historyNote,
          deliveryMinutes: timing.acceptedDeliveryMinutes,
        },
      },
    },
    { new: true }
  );

  if (!order) {
    return { ok: false, status: 409, message: "order_already_handled" };
  }

  let printJobId = null;
  if (isPrintEligible(order)) {
    const printEvent = await enqueueOutboxEvent({
      type: "print.enqueue",
      restaurantId: order.restaurant.restaurantId,
      orderId: order._id,
      payload: { source: "accept" },
      idempotencyKey: `print:accept:${order._id}`,
    });
    printJobId = printEvent?._id ? String(printEvent._id) : null;
  }

  await enqueueOutboxEvent({
    type: "push.restaurant",
    restaurantId: order.restaurant.restaurantId,
    orderId: order._id,
    payload: { eventType: "order.accepted" },
    idempotencyKey: `push:accepted:${order._id}`,
  });

  broadcastOrderEvent(order.restaurant.restaurantId, "order.accepted", {
    order: serializeOrderForEvent(order),
    playTone,
    printDeferred: !isPrintEligible(order),
    printJobId,
  });

  if (acceptedVia !== "auto") {
    void enqueueOrderAcceptedEmail(order).catch((error) => {
      console.warn("[order] accept email failed:", error.message);
    });
  }

  return { ok: true, order, printJob: printJobId ? { _id: printJobId } : null };
}

async function tryAutoAcceptOnCreate(order) {
  const restaurant = await Restaurant.findById(order.restaurant.restaurantId).select(
    "orderSettings ordersPausedUntil printerConfig printAgentLastSeenAt"
  );
  if (!restaurant || !shouldAutoAccept(restaurant, order)) {
    return null;
  }

  const deliveryMinutes = resolveAutoAcceptMinutes(restaurant, order);
  const result = await performAcceptOrder({
    orderId: order._id,
    deliveryMinutes,
    actor: { actorType: "system", actorId: null },
    note: "Auto-accepted",
    acceptedVia: "auto",
    playTone: false,
  });

  return result.ok ? result.order : null;
}

module.exports = {
  VALID_ACCEPT_MINUTES,
  normalizeAcceptMinutes,
  resolveAcceptTiming,
  resolveAutoAcceptMinutes,
  shouldAutoAccept,
  performAcceptOrder,
  tryAutoAcceptOnCreate,
};
