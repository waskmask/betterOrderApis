const Order = require("../modals/Order");
const { broadcastOrderEvent } = require("./orderRealtimeService");
const { enqueueOutboxEvent } = require("./outboxService");
const { isPrintEligible } = require("./orderScheduleService");
const {
  resolveAsapPendingExpiresAt,
  resolveShiftExpiresAtForRestaurant,
} = require("./orderShiftExpiryService");

let intervalHandle = null;

async function releaseScheduledOrders() {
  const now = new Date();

  for (;;) {
    const order = await Order.findOneAndUpdate(
      {
        "fulfillment.fulfillmentType": "scheduled",
        "fulfillment.releaseAt": { $lte: now },
        "fulfillment.kitchenReleasedAt": null,
        status: { $in: ["pending", "accepted", "preparing"] },
      },
      {
        $set: { "fulfillment.kitchenReleasedAt": now },
        $push: {
          statusHistory: {
            status: "pending",
            at: now,
            actorType: "system",
            actorId: null,
            note: "kitchen_released",
          },
        },
      },
      { new: true }
    );

    if (!order) break;

    if (order.status === "pending") {
      const shiftExpiresAt = await resolveShiftExpiresAtForRestaurant(
        order.restaurant.restaurantId,
        now
      );
      await Order.updateOne(
        { _id: order._id, status: "pending" },
        {
          $set: {
            pendingExpiresAt: new Date(
              Math.max(shiftExpiresAt.getTime(), resolveAsapPendingExpiresAt(now).getTime())
            ),
          },
        }
      );
      order.pendingExpiresAt = new Date(
        Math.max(shiftExpiresAt.getTime(), resolveAsapPendingExpiresAt(now).getTime())
      );
    }

    broadcastOrderEvent(order.restaurant.restaurantId, "order.released", {
      order: {
        _id: String(order._id),
        orderNumber: order.orderNumber,
        status: order.status,
        fulfillment: order.fulfillment,
        payment: order.payment,
        restaurant: order.restaurant,
        customer: order.customer,
        items: order.items,
        totals: order.totals,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        acceptedVia: order.acceptedVia || null,
        pendingExpiresAt: order.pendingExpiresAt || null,
      },
      playTone: order.status === "pending",
    });

    if (["accepted", "preparing"].includes(order.status) && isPrintEligible(order, now)) {
      await enqueueOutboxEvent({
        type: "print.enqueue",
        restaurantId: order.restaurant.restaurantId,
        orderId: order._id,
        payload: { source: "accept" },
        idempotencyKey: `print:accept:${order._id}`,
      });
    }
  }
}

function startScheduledReleaseService() {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    releaseScheduledOrders().catch((error) => {
      console.warn("[scheduled-release] tick failed:", error.message);
    });
  }, 30_000);

  releaseScheduledOrders().catch((error) => {
    console.warn("[scheduled-release] initial run failed:", error.message);
  });
}

module.exports = {
  releaseScheduledOrders,
  startScheduledReleaseService,
};
