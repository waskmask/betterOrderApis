const RestaurantReview = require("../modals/RestaurantReview");
const ReviewModerationLog = require("../modals/ReviewModerationLog");
const EmailDeliveryLog = require("../modals/EmailDeliveryLog");
const { getAppModuleConfig } = require("../services/moduleConfigService");
const {
  validateReviewToken,
  submitReview,
  recalculateRestaurantReviewSummary,
} = require("../services/reviewService");
const { enqueueEmail } = require("../services/email/enqueueEmail");
const crypto = require("crypto");

function isPlatformAdmin(role) {
  return role === "superadmin" || role === "admin";
}

exports.getReviewInvite = async (req, res) => {
  try {
    const modules = await getAppModuleConfig();
    if (!modules?.reviews) {
      return res.status(403).json({ success: false, message: "reviews_disabled" });
    }

    const validation = await validateReviewToken(req.query.token);
    if (!validation.ok) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    const order = validation.order;
    return res.json({
      success: true,
      invite: {
        orderNumber: order.orderNumber,
        restaurantName: order.restaurant?.nameSnapshot || "",
        customerName: [order.customer?.firstName, order.customer?.lastName]
          .filter(Boolean)
          .join(" "),
        expiresAt: order.reviewInviteExpiresAt,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to load review invite" });
  }
};

exports.submitReview = async (req, res) => {
  try {
    const modules = await getAppModuleConfig();
    if (!modules?.reviews) {
      return res.status(403).json({ success: false, message: "reviews_disabled" });
    }

    const forwardedFor = String(req.headers["x-forwarded-for"] || "")
      .split(",")[0]
      .trim();
    const ipAddress = forwardedFor || req.ip || "";

    const result = await submitReview({
      token: req.body?.token,
      rating: req.body?.rating,
      comment: req.body?.comment,
      locale: req.body?.lang,
      ipAddress,
    });

    if (!result.ok) {
      return res.status(400).json({ success: false, message: result.message });
    }

    return res.status(201).json({
      success: true,
      review: {
        _id: result.review._id,
        rating: result.review.rating,
        comment: result.review.comment,
        submittedAt: result.review.submittedAt,
      },
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: "review_already_submitted" });
    }
    return res.status(500).json({ success: false, message: "Failed to submit review" });
  }
};

exports.listRestaurantReviews = async (req, res) => {
  try {
    const restaurantId = req.params.restaurantId;
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      RestaurantReview.find({ restaurantId, status: "published" })
        .sort({ submittedAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("customerName rating comment submittedAt locale")
        .lean(),
      RestaurantReview.countDocuments({ restaurantId, status: "published" }),
    ]);

    return res.json({
      success: true,
      reviews: items,
      pagination: { page, limit, total },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to load reviews" });
  }
};

exports.adminListReviews = async (req, res) => {
  try {
    if (!isPlatformAdmin(req.user?.role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 30));
    const skip = (page - 1) * limit;
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.restaurantId) filter.restaurantId = req.query.restaurantId;

    const [items, total] = await Promise.all([
      RestaurantReview.find(filter)
        .sort({ submittedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      RestaurantReview.countDocuments(filter),
    ]);

    return res.json({ success: true, reviews: items, pagination: { page, limit, total } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to load reviews" });
  }
};

exports.adminRemoveReview = async (req, res) => {
  try {
    if (!isPlatformAdmin(req.user?.role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const reason = String(req.body?.reason || "").trim().slice(0, 500);
    if (!reason) {
      return res.status(400).json({ success: false, message: "removal_reason_required" });
    }

    const review = await RestaurantReview.findById(req.params.reviewId);
    if (!review || review.status === "removed") {
      return res.status(404).json({ success: false, message: "review_not_found" });
    }

    const snapshot = JSON.stringify({
      rating: review.rating,
      comment: review.comment,
      customerName: review.customerName,
    });
    const reviewSnapshotHash = crypto.createHash("sha256").update(snapshot).digest("hex");

    review.status = "removed";
    review.removedAt = new Date();
    review.removedBy = req.user._id;
    review.removedByRole = req.user.role;
    review.removalReason = reason;
    await review.save();

    await ReviewModerationLog.create({
      reviewId: review._id,
      restaurantId: review.restaurantId,
      orderId: review.orderId,
      action: "removed",
      reason,
      actorId: req.user._id,
      actorRole: req.user.role,
      reviewSnapshotHash,
    });

    await recalculateRestaurantReviewSummary(review.restaurantId);

    return res.json({ success: true, message: "review_removed" });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to remove review" });
  }
};

exports.adminListEmailDeliveries = async (req, res) => {
  try {
    if (!isPlatformAdmin(req.user?.role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.orderId) filter.orderId = req.query.orderId;

    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 30));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      EmailDeliveryLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      EmailDeliveryLog.countDocuments(filter),
    ]);

    return res.json({ success: true, deliveries: items, pagination: { page, limit, total } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to load email deliveries" });
  }
};

exports.adminResendEmail = async (req, res) => {
  try {
    if (!isPlatformAdmin(req.user?.role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const log = await EmailDeliveryLog.findById(req.params.deliveryId);
    if (!log) {
      return res.status(404).json({ success: false, message: "delivery_not_found" });
    }

    const outbox = await enqueueEmail({
      template: log.template,
      to: log.to,
      lang: log.lang,
      data: req.body?.data || {},
      correlation: {
        orderId: log.orderId,
        restaurantId: log.restaurantId,
        appUserId: log.appUserId,
      },
      idempotencyKey: `email:resend:${log._id}:${Date.now()}`,
    });

    return res.json({ success: true, outboxEventId: outbox?._id });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to resend email" });
  }
};
