const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const reviewController = require("../controllers/reviewController");
const { verifyToken } = require("../middlewares/auth");

// Submit review - can be authenticated or guest
router.post("/", verifyToken, asyncHandler(reviewController.submitReview));

// Get restaurant reviews - public
router.get("/restaurant/:restaurantId", asyncHandler(reviewController.getRestaurantReviews));

module.exports = router;


