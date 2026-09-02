const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const reviewController = require("../controllers/reviewController");
const { verifyToken } = require("../middlewares/auth");
const { reviewSubmitLimiter } = require("../middlewares/rateLimit");

router.get("/invite", asyncHandler(reviewController.getReviewInvite));
router.post("/", reviewSubmitLimiter, asyncHandler(reviewController.submitReview));

router.get(
  "/restaurants/:restaurantId",
  asyncHandler(reviewController.listRestaurantReviews)
);

router.get(
  "/admin/reviews",
  verifyToken,
  asyncHandler(reviewController.adminListReviews)
);
router.delete(
  "/admin/reviews/:reviewId",
  verifyToken,
  asyncHandler(reviewController.adminRemoveReview)
);

router.get(
  "/admin/email-deliveries",
  verifyToken,
  asyncHandler(reviewController.adminListEmailDeliveries)
);
router.post(
  "/admin/email-deliveries/:deliveryId/resend",
  verifyToken,
  asyncHandler(reviewController.adminResendEmail)
);

module.exports = router;
