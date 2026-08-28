const Order = require("../modals/Order");
const { broadcastOrderEvent } = require("./orderRealtimeService");
const {
  KITCHEN_STALL_STATUSES,
  isPendingExpiryEligible,
  isKitchenExpiryEligible,
} = require("./orderShiftExpiryService");

let intervalHandle = null;

function serializeExpiredOrder(order) {
  return {
    ...order,
    _id: String(order._id),
    restaurant: {
      ...order.restaurant,
      restaurantId: String(order.restaurant.restaurantId),
    },
  };
}

async function expirePendingOrders() {
  const now = new Date();

  for (;;) {
    const candidate = await Order.findOne({
      status: "pending",
      pendingExpiresAt: { $lte: now },
      $or: [
        { "fulfillment.fulfillmentType": { $ne: "scheduled" } },
        { "fulfillment.kitchenReleasedAt": { $ne: null } },
        {
          "fulfillment.fulfillmentType": "scheduled",
          "fulfillment.releaseAt": { $lte: now },
        },
      ],
    }).lean();

    if (!candidate || !isPendingExpiryEligible(candidate, now)) break;

    const order = await Order.findOneAndUpdate(
      {
        _id: candidate._id,
        status: "pending",
        pendingExpiresAt: { $lte: now },
      },
      {
        $set: {
          status: "expired",
          expiredAt: now,
          expiredFromStatus: "pending",
          rejectReason: "pending_accept_timeout",
        },
        $push: {
          statusHistory: {
            status: "expired",
            at: now,
            actorType: "system",
            actorId: null,
            note: "pending_accept_timeout",
          },
        },
      },
      { new: true }
    ).lean();

    if (!order) continue;

    broadcastOrderEvent(order.restaurant.restaurantId, "order.expired", {
      order: serializeExpiredOrder(order),
      playTone: false,
    });
  }
}

async function expireKitchenOrders() {
  const now = new Date();

  for (;;) {
    const candidate = await Order.findOne({
      status: { $in: KITCHEN_STALL_STATUSES },
      shiftExpiresAt: { $lte: now },
      $or: [
        { "fulfillment.fulfillmentType": { $ne: "scheduled" } },
        { "fulfillment.kitchenReleasedAt": { $ne: null } },
      ],
    }).lean();

    if (!candidate || !isKitchenExpiryEligible(candidate, now)) break;

    const order = await Order.findOneAndUpdate(
      {
        _id: candidate._id,
        status: candidate.status,
        shiftExpiresAt: { $lte: now },
      },
      {
        $set: {
          status: "expired",
          expiredAt: now,
          expiredFromStatus: candidate.status,
          rejectReason: "shift_end_stalled",
        },
        $push: {
          statusHistory: {
            status: "expired",
            at: now,
            actorType: "system",
            actorId: null,
            note: "shift_end_stalled",
          },
        },
      },
      { new: true }
    ).lean();

    if (!order) continue;

    broadcastOrderEvent(order.restaurant.restaurantId, "order.expired", {
      order: serializeExpiredOrder(order),
      playTone: false,
    });
  }
}

async function runExpiryTick() {
  await expirePendingOrders();
  await expireKitchenOrders();
}

function startOrderExpiryService() {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    runExpiryTick().catch((error) => {
      console.warn("[order-expiry] tick failed:", error.message);
    });
  }, 60_000);

  runExpiryTick().catch((error) => {
    console.warn("[order-expiry] initial run failed:", error.message);
  });
}

module.exports = {
  expirePendingOrders,
  expireKitchenOrders,
  runExpiryTick,
  startOrderExpiryService,
};
