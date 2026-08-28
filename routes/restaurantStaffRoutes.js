const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const restaurantStaffController = require("../controllers/restaurantStaffController");
const {
  verifyToken,
  canManageRestaurantStaffForRestaurant,
} = require("../middlewares/auth");

const router = express.Router();

router.get(
  "/:restaurantId",
  verifyToken,
  canManageRestaurantStaffForRestaurant,
  asyncHandler(restaurantStaffController.listStaff)
);

router.post(
  "/:restaurantId",
  verifyToken,
  canManageRestaurantStaffForRestaurant,
  asyncHandler(restaurantStaffController.createStaff)
);

router.patch(
  "/:restaurantId/:staffId",
  verifyToken,
  canManageRestaurantStaffForRestaurant,
  asyncHandler(restaurantStaffController.updateStaff)
);

router.post(
  "/:restaurantId/:staffId/reset-password",
  verifyToken,
  canManageRestaurantStaffForRestaurant,
  asyncHandler(restaurantStaffController.resetStaffPassword)
);

router.delete(
  "/:restaurantId/:staffId",
  verifyToken,
  canManageRestaurantStaffForRestaurant,
  asyncHandler(restaurantStaffController.deactivateStaff)
);

module.exports = router;
