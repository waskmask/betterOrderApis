const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const cuisineController = require("../controllers/cuisineController");
const {
  verifyToken,
  isSuperAdmin,
  isAdminOrSuperAdmin,
} = require("../middlewares/auth");

// Public route to list cuisines
router.get("/", verifyToken, cuisineController.getAllCuisines);

// Protected routes
router.post(
  "/",
  verifyToken,
  isAdminOrSuperAdmin,
  asyncHandler(cuisineController.createCuisine)
);
router.put(
  "/:id",
  verifyToken,
  isAdminOrSuperAdmin,
  asyncHandler(cuisineController.updateCuisine)
);
router.delete(
  "/:id",
  verifyToken,
  isSuperAdmin,
  asyncHandler(cuisineController.deleteCuisine)
);

module.exports = router;
