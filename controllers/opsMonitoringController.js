const Order = require("../modals/Order");
const PrintJob = require("../modals/PrintJob");
const OutboxEvent = require("../modals/OutboxEvent");
const { getRealtimeStats } = require("../services/orderRealtimeService");
const { getRestaurantIdFromUser, isRestaurantStaffRole } = require("../utils/restaurantRoles");

function canViewOpsMonitoring(user) {
  if (!user) return false;
  if (["superadmin", "admin", "moderator"].includes(user.role)) return true;
  return user.role === "restaurant" || user.role === "restaurant-admin";
}

exports.getOpsMonitoring = async (req, res) => {
  try {
    if (!canViewOpsMonitoring(req.user)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const isStaff = req.user?.role === "restaurant" || isRestaurantStaffRole(req.user?.role);
    let restaurantId = String(req.query.restaurantId || "").trim();
    if (isStaff) {
      restaurantId = getRestaurantIdFromUser(req.user) || restaurantId;
    }

    const now = new Date();
    const orderMatch = restaurantId ? { "restaurant.restaurantId": restaurantId } : {};
    const printMatch = restaurantId ? { restaurantId } : {};
    const outboxMatch = restaurantId ? { restaurantId } : {};

    const [
      overduePending,
      scheduledWaiting,
      paidRefundPending,
      printPending,
      printFailed,
      outboxPending,
      outboxFailed,
      acceptSamples,
    ] = await Promise.all([
      Order.countDocuments({
        ...orderMatch,
        status: "pending",
        pendingExpiresAt: { $lte: now },
      }),
      Order.countDocuments({
        ...orderMatch,
        status: { $in: ["pending", "accepted", "preparing"] },
        "fulfillment.fulfillmentType": "scheduled",
        "fulfillment.kitchenReleasedAt": null,
      }),
      Order.countDocuments({
        ...orderMatch,
        "payment.status": "refund_pending",
      }),
      PrintJob.countDocuments({ ...printMatch, status: "pending" }),
      PrintJob.countDocuments({ ...printMatch, status: "failed" }),
      OutboxEvent.countDocuments({ ...outboxMatch, status: "pending" }),
      OutboxEvent.countDocuments({ ...outboxMatch, status: "failed" }),
      Order.find({
        ...orderMatch,
        acceptedAt: { $ne: null },
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      })
        .select("createdAt acceptedAt")
        .limit(500)
        .lean(),
    ]);

    const latencies = acceptSamples
      .map((order) => (new Date(order.acceptedAt) - new Date(order.createdAt)) / 60000)
      .filter((value) => Number.isFinite(value) && value >= 0)
      .sort((a, b) => a - b);

    const percentile = (p) => {
      if (!latencies.length) return 0;
      const index = Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length));
      return Math.round(latencies[index] * 10) / 10;
    };

    return res.json({
      success: true,
      monitoring: {
        overduePending,
        scheduledWaiting,
        paidRefundPending,
        printQueue: { pending: printPending, failed: printFailed },
        outbox: { pending: outboxPending, failed: outboxFailed },
        acceptLatencyMinutes: {
          sampleSize: latencies.length,
          p50: percentile(50),
          p95: percentile(95),
        },
        realtime: getRealtimeStats(),
        at: now.toISOString(),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "monitoring_failed" });
  }
};
