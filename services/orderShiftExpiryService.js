const moment = require("moment-timezone");
const { Restaurant } = require("../modals/Restaurant");
const { getCurrentBusinessShift, BERLIN_TIMEZONE } = require("./businessShiftService");

const ASAP_PENDING_TIMEOUT_MINUTES = 60;

const KITCHEN_STALL_STATUSES = [
  "accepted",
  "preparing",
  "dispatch",
  "ready_for_pickup",
  "out_for_delivery",
];

function resolveAsapPendingExpiresAt(now = new Date()) {
  return new Date(now.getTime() + ASAP_PENDING_TIMEOUT_MINUTES * 60 * 1000);
}

function resolveShiftExpiresAt(openingHours, referenceDate = new Date()) {
  const ref = moment(referenceDate).tz(BERLIN_TIMEZONE);
  const { shiftEnd } = getCurrentBusinessShift(openingHours || {}, ref);
  return shiftEnd;
}

async function resolveShiftExpiresAtForRestaurant(restaurantId, referenceDate = new Date()) {
  const restaurant = await Restaurant.findById(restaurantId).select("opening_hours").lean();
  return resolveShiftExpiresAt(restaurant?.opening_hours, referenceDate);
}

function resolvePendingExpiresAt(fulfillment, now = new Date()) {
  if (fulfillment?.fulfillmentType === "scheduled" && fulfillment?.releaseAt) {
    const releaseAt = new Date(fulfillment.releaseAt);
    if (!Number.isNaN(releaseAt.getTime())) {
      return releaseAt;
    }
  }
  return resolveAsapPendingExpiresAt(now);
}

function isPendingExpiryEligible(order, now = new Date()) {
  if (!order || order.status !== "pending") return false;
  if (!order.pendingExpiresAt) return false;
  if (new Date(order.pendingExpiresAt).getTime() > now.getTime()) return false;

  if (order.fulfillment?.fulfillmentType !== "scheduled") return true;
  if (order.fulfillment?.kitchenReleasedAt) return true;
  if (
    order.fulfillment?.releaseAt &&
    new Date(order.fulfillment.releaseAt).getTime() <= now.getTime()
  ) {
    return true;
  }
  return false;
}

function isKitchenExpiryEligible(order, now = new Date()) {
  if (!order || !KITCHEN_STALL_STATUSES.includes(order.status)) return false;
  if (!order.shiftExpiresAt) return false;
  if (new Date(order.shiftExpiresAt).getTime() > now.getTime()) return false;

  if (order.fulfillment?.fulfillmentType === "scheduled" && !order.fulfillment?.kitchenReleasedAt) {
    return false;
  }
  return true;
}

function getEffectiveOrderStatus(order) {
  if (order?.status === "expired" && order?.expiredFromStatus) {
    return order.expiredFromStatus;
  }
  return order?.status || "";
}

function isExpiredPending(order) {
  return order?.status === "expired" && order?.expiredFromStatus === "pending";
}

function canAcceptOrReject(order) {
  return order?.status === "pending" || isExpiredPending(order);
}

module.exports = {
  ASAP_PENDING_TIMEOUT_MINUTES,
  KITCHEN_STALL_STATUSES,
  resolveAsapPendingExpiresAt,
  resolveShiftExpiresAt,
  resolveShiftExpiresAtForRestaurant,
  resolvePendingExpiresAt,
  isPendingExpiryEligible,
  isKitchenExpiryEligible,
  getEffectiveOrderStatus,
  isExpiredPending,
  canAcceptOrReject,
};
