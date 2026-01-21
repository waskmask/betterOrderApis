const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const customerAuthController = require("../controllers/customerAuthController");
const { verifyToken } = require("../middlewares/auth");

// Public routes
router.post("/register", asyncHandler(customerAuthController.register));
router.post("/login", asyncHandler(customerAuthController.login));
router.post("/logout", asyncHandler(customerAuthController.logout));
router.post(
  "/request-password-reset",
  asyncHandler(customerAuthController.requestPasswordReset)
);
router.post(
  "/reset-password",
  asyncHandler(customerAuthController.resetPassword)
);
router.get(
  "/verify-email/:token",
  asyncHandler(customerAuthController.verifyEmail)
);

// Protected routes
router.get("/me", verifyToken, asyncHandler(customerAuthController.getMe));
router.post(
  "/change-password",
  verifyToken,
  asyncHandler(customerAuthController.changePassword)
);

module.exports = router;


