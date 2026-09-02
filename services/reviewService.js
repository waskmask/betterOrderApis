const crypto = require("crypto");
const Order = require("../modals/Order");
const RestaurantReview = require("../modals/RestaurantReview");
const { Restaurant } = require("../modals/Restaurant");
const { enqueueReviewInviteEmail } = require("./email/orderEmailTriggers");
const { stripHtml } = require("./email/escapeHtml");

const REVIEW_INVITE_TTL_MS = 48 * 60 * 60 * 1000;

function hashToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function timingSafeEqualHex(a, b) {
  try {
    const bufA = Buffer.from(String(a || ""), "hex");
    const bufB = Buffer.from(String(b || ""), "hex");
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

async function issueReviewInvite(order) {
  const raw = crypto.randomBytes(32).toString("hex");
  const hash = hashToken(raw);
  const expiresAt = new Date(Date.now() + REVIEW_INVITE_TTL_MS);

  await Order.findByIdAndUpdate(order._id, {
    $set: {
      reviewInviteTokenHash: hash,
      reviewInviteExpiresAt: expiresAt,
    },
  });

  await enqueueReviewInviteEmail(order, raw, expiresAt);
  return { raw, expiresAt };
}

async function validateReviewToken(rawToken) {
  const token = String(rawToken || "").trim();
  if (!token) return { ok: false, message: "review_token_required" };

  const tokenHash = hashToken(token);
  const order = await Order.findOne({
    reviewInviteTokenHash: tokenHash,
    reviewInviteExpiresAt: { $gt: new Date() },
    reviewSubmittedAt: null,
    status: "delivered",
  });

  if (!order) {
    return { ok: false, message: "review_token_invalid_or_expired" };
  }

  if (!timingSafeEqualHex(order.reviewInviteTokenHash, tokenHash)) {
    return { ok: false, message: "review_token_invalid_or_expired" };
  }

  return { ok: true, order };
}

async function submitReview({ token, rating, comment, locale, ipAddress }) {
  const validation = await validateReviewToken(token);
  if (!validation.ok) return validation;

  const order = validation.order;
  const parsedRating = Number.parseInt(rating, 10);
  if (!Number.isFinite(parsedRating) || parsedRating < 1 || parsedRating > 5) {
    return { ok: false, message: "invalid_rating" };
  }

  const cleanComment = stripHtml(String(comment || "")).slice(0, 2000);
  const customerName = [order.customer?.firstName, order.customer?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  const review = await RestaurantReview.create({
    restaurantId: order.restaurant.restaurantId,
    orderId: order._id,
    appUserId: order.customer?.appUserId || null,
    customerName: customerName || "Customer",
    customerEmail: String(order.customer?.email || "").trim().toLowerCase(),
    rating: parsedRating,
    comment: cleanComment,
    status: "published",
    submittedAt: new Date(),
    locale: locale === "de" ? "de" : "en",
    submittedFromIp: ipAddress
      ? crypto.createHash("sha256").update(ipAddress).digest("hex")
      : "",
  });

  await Order.findByIdAndUpdate(order._id, {
    $set: {
      reviewSubmittedAt: new Date(),
      reviewId: review._id,
      reviewInviteTokenHash: null,
      reviewInviteExpiresAt: null,
    },
  });

  await recalculateRestaurantReviewSummary(order.restaurant.restaurantId);

  return { ok: true, review };
}

async function recalculateRestaurantReviewSummary(restaurantId) {
  const stats = await RestaurantReview.aggregate([
    { $match: { restaurantId, status: "published" } },
    {
      $group: {
        _id: null,
        averageRating: { $avg: "$rating" },
        reviewCount: { $sum: 1 },
        lastReviewAt: { $max: "$submittedAt" },
      },
    },
  ]);

  const row = stats[0] || { averageRating: 0, reviewCount: 0, lastReviewAt: null };
  await Restaurant.findByIdAndUpdate(restaurantId, {
    $set: {
      reviewSummary: {
        averageRating: Math.round((row.averageRating || 0) * 10) / 10,
        reviewCount: row.reviewCount || 0,
        lastReviewAt: row.lastReviewAt || null,
      },
    },
  });
}

async function anonymizeReviewsForAppUser(appUserId) {
  await RestaurantReview.updateMany(
    { appUserId, status: "published" },
    {
      $set: {
        customerName: "Deleted user",
        customerEmail: "",
      },
    }
  );
}

module.exports = {
  issueReviewInvite,
  validateReviewToken,
  submitReview,
  recalculateRestaurantReviewSummary,
  anonymizeReviewsForAppUser,
  REVIEW_INVITE_TTL_MS,
};
