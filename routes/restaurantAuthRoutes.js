const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const restaurantAuth = require("../controllers/restaurantAuthController");
const { verifyToken, isRestaurantSelf, isSuperAdmin } = require("../middlewares/auth");
const { authLoginLimiter, passwordChangeLimiter } = require("../middlewares/rateLimit");

// Login
router.post("/login", authLoginLimiter, asyncHandler(restaurantAuth.login));
router.get("/me", verifyToken, isRestaurantSelf, asyncHandler(restaurantAuth.me));

// Allow only self (restaurant) or superadmin
router.post(
  "/change-password",
  verifyToken,
  passwordChangeLimiter,
  asyncHandler(restaurantAuth.changePassword)
);

// Reset password (only by superadmin)
router.post(
  "/reset-password",
  verifyToken,
  isSuperAdmin,
  passwordChangeLimiter,
  asyncHandler(restaurantAuth.resetPassword)
);

module.exports = router;
