const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const restaurantAuth = require("../controllers/restaurantAuthController");
const { verifyToken, isSuperAdmin } = require("../middlewares/auth");

// Login
router.post("/login", asyncHandler(restaurantAuth.login));

// Allow only self (restaurant) or superadmin
router.post(
  "/change-password",
  verifyToken,
  asyncHandler(restaurantAuth.changePassword)
);

// Reset password (only by superadmin)
router.post(
  "/reset-password",
  verifyToken,
  isSuperAdmin,
  asyncHandler(restaurantAuth.resetPassword)
);

module.exports = router;
