const { enqueueEmail } = require("./enqueueEmail");
const { buildOrderEmailData, buildReviewInviteData } = require("./orderEmailData");
const { resolveEmailLang } = require("../../utils/resolveEmailLang");
const { Restaurant } = require("../../modals/Restaurant");

function customerEmail(order) {
  return String(order?.customer?.email || "").trim().toLowerCase();
}

async function resolveRestaurantNotificationEmail(restaurantId, snapshotEmail) {
  const restaurant = await Restaurant.findById(restaurantId).select(
    "email orderSettings.emailNotifications orderSettings.orderNotificationEmail"
  );
  if (!restaurant) return "";
  if (restaurant.orderSettings?.emailNotifications === false) return "";
  const override = String(restaurant.orderSettings?.orderNotificationEmail || "").trim();
  return (override || restaurant.email || snapshotEmail || "").trim().toLowerCase();
}

async function enqueueOrderPlacedEmails(order, { autoAccepted = false } = {}) {
  const lang = resolveEmailLang({ order });
  const restaurantId = order.restaurant?.restaurantId;
  const data = await buildOrderEmailData(order, lang);
  const correlation = {
    orderId: order._id,
    restaurantId,
    appUserId: order.customer?.appUserId || null,
  };

  const restaurantTo = await resolveRestaurantNotificationEmail(
    restaurantId,
    order.restaurant?.emailSnapshot
  );
  if (restaurantTo) {
    await enqueueEmail({
      template: "order.placed.restaurant",
      to: restaurantTo,
      lang,
      data,
      correlation,
      idempotencyKey: `email:order.placed.restaurant:${order._id}`,
    });
  }

  const to = customerEmail(order);
  if (!to) return;

  if (autoAccepted) {
    await enqueueEmail({
      template: "order.accepted.customer",
      to,
      lang,
      data,
      correlation,
      idempotencyKey: `email:order.accepted.customer:${order._id}`,
    });
    return;
  }

  await enqueueEmail({
    template: "order.placed.customer",
    to,
    lang,
    data,
    correlation,
    idempotencyKey: `email:order.placed.customer:${order._id}`,
  });
}

async function enqueueOrderAcceptedEmail(order) {
  const to = customerEmail(order);
  if (!to) return;
  const lang = resolveEmailLang({ order });
  const data = await buildOrderEmailData(order, lang);
  await enqueueEmail({
    template: "order.accepted.customer",
    to,
    lang,
    data,
    correlation: {
      orderId: order._id,
      restaurantId: order.restaurant?.restaurantId,
      appUserId: order.customer?.appUserId || null,
    },
    idempotencyKey: `email:order.accepted.customer:${order._id}`,
  });
}

async function enqueueOrderRejectedEmail(order, rejectReason = "") {
  const to = customerEmail(order);
  if (!to) return;
  const lang = resolveEmailLang({ order });
  const data = await buildOrderEmailData(order, lang, { rejectReason });
  await enqueueEmail({
    template: "order.rejected.customer",
    to,
    lang,
    data,
    correlation: {
      orderId: order._id,
      restaurantId: order.restaurant?.restaurantId,
      appUserId: order.customer?.appUserId || null,
    },
    idempotencyKey: `email:order.rejected.customer:${order._id}`,
  });
}

async function enqueueOrderRefundEmail(order) {
  const to = customerEmail(order);
  if (!to) return;
  const lang = resolveEmailLang({ order });
  const data = await buildOrderEmailData(order, lang);
  await enqueueEmail({
    template: "order.refund.customer",
    to,
    lang,
    data,
    correlation: {
      orderId: order._id,
      restaurantId: order.restaurant?.restaurantId,
      appUserId: order.customer?.appUserId || null,
    },
    idempotencyKey: `email:order.refund.customer:${order._id}`,
  });
}

async function enqueueReviewInviteEmail(order, rawToken, expiresAt) {
  const to = customerEmail(order);
  if (!to) return;
  const lang = resolveEmailLang({ order });
  const customerAppUrl = process.env.CUSTOMER_APP_URL || "http://localhost:4003";
  const reviewUrl = `${customerAppUrl}/${lang}/review?token=${rawToken}`;
  const data = buildReviewInviteData(order, lang, reviewUrl, expiresAt);
  const firstName = String(order.customer?.firstName || "").trim();
  data.name = data.name || firstName;

  await enqueueEmail({
    template: "review.invite",
    to,
    lang,
    data,
    correlation: {
      orderId: order._id,
      restaurantId: order.restaurant?.restaurantId,
      appUserId: order.customer?.appUserId || null,
    },
    idempotencyKey: `email:review.invite:${order._id}`,
  });
}

module.exports = {
  enqueueOrderPlacedEmails,
  enqueueOrderAcceptedEmail,
  enqueueOrderRejectedEmail,
  enqueueOrderRefundEmail,
  enqueueReviewInviteEmail,
};
