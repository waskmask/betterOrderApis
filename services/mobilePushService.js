const MobileDevice = require("../modals/MobileDevice");
const { sendPushToTokens } = require("./firebaseMessagingService");

function formatEuroFromCents(value) {
  const cents = Number.isFinite(Number(value)) ? Number(value) : 0;
  return `€${(cents / 100).toFixed(2)}`;
}

function customerName(order) {
  const firstName = order.customer?.firstName || "";
  const lastName = order.customer?.lastName || "";
  return `${firstName} ${lastName}`.trim() || "Guest customer";
}

async function deactivateInvalidTokens(tokens) {
  if (!tokens?.length) return;
  await MobileDevice.updateMany(
    { token: { $in: tokens } },
    { $set: { isActive: false } }
  );
}

async function sendRestaurantOrderPush(order, eventType = "order.created") {
  const restaurantId = order.restaurant?.restaurantId;
  if (!restaurantId) return { sent: 0, failed: 0, skipped: true };

  const devices = await MobileDevice.find({
    restaurantId,
    isActive: true,
  })
    .select("token")
    .lean();

  const tokens = devices.map((device) => device.token);
  const result = await sendPushToTokens(tokens, {
    notification: {
      title: eventType === "order.created" ? "New order" : "Order updated",
      body: `${order.orderNumber} · ${customerName(order)} · ${formatEuroFromCents(
        order.totals?.totalCents
      )}`,
    },
    data: {
      type: eventType,
      orderId: String(order._id),
      orderNumber: String(order.orderNumber || ""),
      restaurantId: String(restaurantId),
      status: String(order.status || ""),
    },
  });

  await deactivateInvalidTokens(result.invalidTokens);
  return result;
}

function sendRestaurantOrderPushSafe(order, eventType) {
  sendRestaurantOrderPush(order, eventType).catch((error) => {
    console.error("Failed to send restaurant order push:", error.message);
  });
}

module.exports = {
  sendRestaurantOrderPush,
  sendRestaurantOrderPushSafe,
};
