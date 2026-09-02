const OutboxEvent = require("../modals/OutboxEvent");
const Order = require("../modals/Order");
const { Restaurant } = require("../modals/Restaurant");
const { enqueuePrintJob } = require("./orderPrintService");
const { sendRestaurantOrderPushSafe } = require("./mobilePushService");
const { broadcastOrderEventLocal } = require("./orderRealtimeService");
const { isPrintEligible } = require("./orderScheduleService");
const { sendTransactionalEmail } = require("./email/transactionalEmailService");

let intervalHandle = null;

async function enqueueOutboxEvent({
  type,
  restaurantId = null,
  orderId = null,
  payload = {},
  idempotencyKey = "",
  availableAt = new Date(),
}) {
  try {
    return await OutboxEvent.create({
      type,
      restaurantId,
      orderId,
      payload,
      idempotencyKey: String(idempotencyKey || "").slice(0, 180),
      availableAt,
      status: "pending",
    });
  } catch (error) {
    if (error?.code === 11000 && idempotencyKey) {
      return OutboxEvent.findOne({ idempotencyKey });
    }
    throw error;
  }
}

async function processOutboxEvent(event) {
  if (event.type === "print.enqueue") {
    const order = await Order.findById(event.orderId);
    if (!order) return;
    if (!isPrintEligible(order)) {
      event.availableAt = order.fulfillment?.releaseAt || new Date(Date.now() + 60_000);
      event.status = "pending";
      event.attempts = Math.max(0, event.attempts - 1);
      await event.save();
      return;
    }
    const restaurant = await Restaurant.findById(order.restaurant.restaurantId).select(
      "orderSettings printerConfig printers images.logo restaurant_name phoneNumber email address vat_number"
    );
    if (!restaurant) return;
    const source = event.payload?.source || "accept";
    const force = Boolean(event.payload?.force);
    const printJob = await enqueuePrintJob(order, restaurant, { source, force });
    if (printJob) {
      broadcastOrderEventLocal(order.restaurant.restaurantId, "print.job.created", {
        printJobId: String(printJob._id),
        orderId: String(order._id),
        orderNumber: order.orderNumber,
      });
    }
    return;
  }

  if (event.type === "push.restaurant") {
    const order = await Order.findById(event.orderId);
    if (!order) return;
    await sendRestaurantOrderPushSafe(order, event.payload?.eventType || "order.updated");
    return;
  }

  if (event.type === "sse.broadcast") {
    broadcastOrderEventLocal(
      event.restaurantId || event.payload?.restaurantId,
      event.payload?.event || "order.updated",
      event.payload?.data || {}
    );
    return;
  }

  if (event.type === "customer.notify") {
    const channel = event.payload?.channel || "";
    if (channel === "refund" && event.orderId) {
      const { enqueueOrderRefundEmail } = require("./email/orderEmailTriggers");
      const order = await Order.findById(event.orderId);
      if (order) await enqueueOrderRefundEmail(order);
    }
    return;
  }

  if (event.type === "email.send") {
    const { template, lang, to, data, correlation = {} } = event.payload || {};
    if (!template || !to) {
      throw new Error("email_send_missing_fields");
    }
    await sendTransactionalEmail({
      to,
      lang: lang || "en",
      template,
      data: data || {},
      correlation: {
        orderId: correlation.orderId || event.orderId,
        restaurantId: correlation.restaurantId || event.restaurantId,
        appUserId: correlation.appUserId || null,
      },
      outboxEventId: event._id,
    });
    return;
  }
}

async function claimNextOutboxEvent() {
  const now = new Date();
  return OutboxEvent.findOneAndUpdate(
    {
      status: "pending",
      availableAt: { $lte: now },
      attempts: { $lt: 8 },
    },
    {
      $set: { status: "processing" },
      $inc: { attempts: 1 },
    },
    { sort: { availableAt: 1, createdAt: 1 }, new: true }
  );
}

async function processOutboxBatch(limit = 20) {
  for (let i = 0; i < limit; i += 1) {
    const event = await claimNextOutboxEvent();
    if (!event) break;

    try {
      await processOutboxEvent(event);
      if (event.status === "pending") {
        // deferred (e.g. print not eligible yet)
        continue;
      }
      event.status = "done";
      event.processedAt = new Date();
      event.lastError = "";
      await event.save();
    } catch (error) {
      const retryDelayMs = Math.min(30 * 60 * 1000, 2000 * 2 ** Math.min(event.attempts, 6));
      event.status = event.attempts >= event.maxAttempts ? "failed" : "pending";
      event.availableAt = new Date(Date.now() + retryDelayMs);
      event.lastError = String(error.message || "outbox_failed").slice(0, 500);
      await event.save();
      console.warn(`[outbox] ${event.type} failed:`, error.message);
    }
  }
}

function startOutboxWorker() {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    processOutboxBatch().catch((error) => {
      console.warn("[outbox] tick failed:", error.message);
    });
  }, 3000);

  processOutboxBatch().catch((error) => {
    console.warn("[outbox] initial run failed:", error.message);
  });
}

module.exports = {
  enqueueOutboxEvent,
  processOutboxBatch,
  startOutboxWorker,
};
