const express = require("express");
const router = express.Router();
const {
  submitOnboarding,
  getAllOnboardings,
  getOnboarding,
  updateOnboardingStatus,
  updateOnboarding,
  deleteOnboarding,
  getOnboardingStats,
} = require("../controllers/restaurantOnboardingController");
const { verifyToken, allAdminUsers, isAdminOrSuperAdmin } = require("../middlewares/auth");

// Public route - Submit restaurant onboarding request
router.post("/", submitOnboarding);

// Admin routes (protected)
router.get("/stats", verifyToken, allAdminUsers, getOnboardingStats);
router.get("/", verifyToken, allAdminUsers, getAllOnboardings);
router.get("/:id", verifyToken, allAdminUsers, getOnboarding);
router.patch("/:id/status", verifyToken, allAdminUsers, updateOnboardingStatus);
router.patch("/:id", verifyToken, allAdminUsers, updateOnboarding);
router.delete("/:id", verifyToken, isAdminOrSuperAdmin, deleteOnboarding);

module.exports = router;
