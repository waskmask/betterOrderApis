const express = require("express");
const router = express.Router();
const {
  submitSuggestion,
  getAllSuggestions,
  getSuggestion,
  updateSuggestionStatus,
  deleteSuggestion,
  getSuggestionStats,
} = require("../controllers/suggestRestaurantController");
const { verifyToken, allAdminUsers } = require("../middlewares/auth");

// Public route - Submit restaurant suggestion
router.post("/", submitSuggestion);

// Admin routes (protected)
router.get("/stats", verifyToken, allAdminUsers, getSuggestionStats);
router.get("/", verifyToken, allAdminUsers, getAllSuggestions);
router.get("/:id", verifyToken, allAdminUsers, getSuggestion);
router.patch("/:id/status", verifyToken, allAdminUsers, updateSuggestionStatus);
router.delete("/:id", verifyToken, allAdminUsers, deleteSuggestion);

module.exports = router;
