/**
 * Payment refund stub — gateway wiring is a separate project.
 * Marks paid orders as refund_pending on reject/cancel and logs intent.
 */

function isPaidOrder(order) {
  return order?.payment?.status === "paid";
}

function isAutoCancelEligible(order) {
  const status = order?.payment?.status;
  return status === "pending" || status === "cash_on_delivery";
}

async function requestRefundIfNeeded(order, { reason = "", actorType = "system" } = {}) {
  if (!order || !isPaidOrder(order)) {
    return { refundRequested: false, order };
  }

  order.payment = order.payment || {};
  order.payment.status = "refund_pending";
  order.payment.refundRequestedAt = new Date();
  order.payment.refundNote = String(reason || "order_cancelled_refund").slice(0, 300);

  if (typeof order.save === "function") {
    await order.save();
  }

  console.info(
    `[payment-refund] stub refund_pending order=${order.orderNumber || order._id} actor=${actorType}`
  );

  return {
    refundRequested: true,
    order,
    // Hook for future Stripe/PayPal adapter:
    // await gateway.createRefund({ orderId: order._id, amountCents: order.totals.totalCents })
  };
}

function buildRefundUpdate(order, reason = "") {
  if (!isPaidOrder(order)) return null;
  return {
    "payment.status": "refund_pending",
    "payment.refundRequestedAt": new Date(),
    "payment.refundNote": String(reason || "order_cancelled_refund").slice(0, 300),
  };
}

module.exports = {
  isPaidOrder,
  isAutoCancelEligible,
  requestRefundIfNeeded,
  buildRefundUpdate,
};
