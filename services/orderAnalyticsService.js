const moment = require("moment-timezone");
const Order = require("../modals/Order");
const { Restaurant } = require("../modals/Restaurant");
const {
  BERLIN_TIMEZONE,
  resolveHistoryDateRange,
} = require("./businessShiftService");
const { buildDiacriticInsensitiveRegex } = require("../utils/searchNormalize");

function buildOrderScopeFilter(user, restaurantIdFromQuery) {
  const filter = {};
  if (restaurantIdFromQuery) {
    filter["restaurant.restaurantId"] = restaurantIdFromQuery;
  }
  return filter;
}

async function resolveRestaurantOpeningHours(user, restaurantIdFromQuery) {
  let restaurantId = restaurantIdFromQuery;
  if (!restaurantId && user?.restaurantId) {
    restaurantId = String(user.restaurantId);
  }
  if (!restaurantId) return null;
  const restaurant = await Restaurant.findById(restaurantId).select("opening_hours").lean();
  return restaurant?.opening_hours || null;
}

function buildHistoryDateFilter(openingHours, range, from, to) {
  const { from: rangeFrom, to: rangeTo } = resolveHistoryDateRange(
    range,
    openingHours || {},
    from,
    to
  );
  if (!rangeFrom && !rangeTo) return null;
  const createdAt = {};
  if (rangeFrom) createdAt.$gte = rangeFrom;
  if (rangeTo) createdAt.$lte = rangeTo;
  return createdAt;
}

function buildSearchFilter(query) {
  const search = String(query || "").trim();
  if (search.length < 2) return null;

  const phoneDigits = search.replace(/\D/g, "");
  const or = [];

  if (search.startsWith("#")) {
    or.push({ orderNumber: { $regex: buildDiacriticInsensitiveRegex(search.slice(1)), $options: "i" } });
  } else {
    or.push({ orderNumber: { $regex: buildDiacriticInsensitiveRegex(search), $options: "i" } });
  }

  if (phoneDigits.length >= 4) {
    or.push({ "customer.phone": { $regex: phoneDigits } });
  }

  return or.length ? { $or: or } : null;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeAnalyticsFromOrders(orders) {
  const delivered = orders.filter((order) => order.status === "delivered");
  const rejected = orders.filter((order) => ["rejected", "cancelled"].includes(order.status));
  const acceptedOrders = orders.filter((order) =>
    ["accepted", "preparing", "dispatch", "out_for_delivery", "ready_for_pickup", "delivered"].includes(
      order.status
    )
  );

  const revenueCents = delivered.reduce((sum, order) => sum + Number(order.totals?.totalCents || 0), 0);
  const orderCount = orders.length;
  const deliveredCount = delivered.length;

  const acceptLatencies = [];
  const fulfillmentLatencies = [];
  const peakHours = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  const modeSplit = { delivery: 0, takeaway: 0 };
  const cancelReasons = new Map();
  const revenueByDayMap = new Map();

  for (const order of orders) {
    const mode = order.fulfillment?.mode === "takeaway" ? "takeaway" : "delivery";
    modeSplit[mode] += 1;

    const createdAt = order.createdAt ? new Date(order.createdAt) : null;
    if (createdAt && !Number.isNaN(createdAt.getTime())) {
      const hour = moment(createdAt).tz(BERLIN_TIMEZONE).hour();
      peakHours[hour].count += 1;
      const dayKey = moment(createdAt).tz(BERLIN_TIMEZONE).format("YYYY-MM-DD");
      const current = revenueByDayMap.get(dayKey) || { date: dayKey, orders: 0, revenueCents: 0 };
      current.orders += 1;
      if (order.status === "delivered") {
        current.revenueCents += Number(order.totals?.totalCents || 0);
      }
      revenueByDayMap.set(dayKey, current);
    }

    if (order.acceptedAt && createdAt) {
      acceptLatencies.push(
        (new Date(order.acceptedAt).getTime() - createdAt.getTime()) / 60000
      );
    }

    if (order.acceptedAt && order.completedAt) {
      fulfillmentLatencies.push(
        (new Date(order.completedAt).getTime() - new Date(order.acceptedAt).getTime()) / 60000
      );
    }

    if (["rejected", "cancelled"].includes(order.status)) {
      const reason = String(order.rejectReason || order.statusHistory?.slice(-1)?.[0]?.note || order.status).trim();
      cancelReasons.set(reason, (cancelReasons.get(reason) || 0) + 1);
    }
  }

  const handledCount = acceptedOrders.length + rejected.length;
  const acceptanceRate = handledCount ? acceptedOrders.length / handledCount : 0;

  return {
    orderCount,
    deliveredCount,
    rejectedCount: rejected.length,
    revenueCents,
    averageOrderValueCents: deliveredCount ? Math.round(revenueCents / deliveredCount) : 0,
    acceptanceRate: Math.round(acceptanceRate * 1000) / 10,
    avgAcceptLatencyMinutes: Math.round(average(acceptLatencies) * 10) / 10,
    avgPrepLatencyMinutes: Math.round(average(fulfillmentLatencies) * 10) / 10,
    modeSplit,
    peakHours,
    cancelReasons: [...cancelReasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    revenueByDay: [...revenueByDayMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

async function getOrderAnalytics({ user, restaurantId, range = "today", from, to, status }) {
  const openingHours = await resolveRestaurantOpeningHours(user, restaurantId);
  const filter = {
    status: { $in: ["delivered", "rejected", "cancelled"] },
  };

  if (restaurantId) {
    filter["restaurant.restaurantId"] = restaurantId;
  }

  if (status && status !== "all") {
    filter.status = status === "cancelled" ? { $in: ["cancelled", "rejected"] } : status;
  }

  const createdAtFilter = buildHistoryDateFilter(openingHours, range, from, to);
  if (createdAtFilter) filter.createdAt = createdAtFilter;

  const orders = await Order.find(filter)
    .select(
      "orderNumber status totals fulfillment createdAt acceptedAt completedAt updatedAt rejectReason statusHistory restaurant"
    )
    .sort({ createdAt: -1 })
    .limit(5000)
    .lean();

  const analytics = computeAnalyticsFromOrders(orders);
  const dateRange = resolveHistoryDateRange(range, openingHours || {}, from, to);

  return {
    ...analytics,
    range: {
      key: range,
      from: dateRange.from || null,
      to: dateRange.to || null,
      timezone: BERLIN_TIMEZONE,
    },
  };
}

module.exports = {
  buildHistoryDateFilter,
  buildSearchFilter,
  computeAnalyticsFromOrders,
  getOrderAnalytics,
  resolveRestaurantOpeningHours,
};
