const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const restaurantController = require("../controllers/restaurantController");
const {
  verifyToken,
  isAdminSuperadminOrSales,
  allAdminUsers,
  isAdminOrSuperAdmin,
  isRestaurantSelf,
  canManageMenuCategory,
} = require("../middlewares/auth");

//create / add restaurant
router.post(
  "/",
  verifyToken,
  isAdminSuperadminOrSales,
  restaurantController.createRestaurant
);

router.get(
  "/all",
  verifyToken,
  allAdminUsers,
  restaurantController.getAllRestaurants
);

// 📄 Get single
router.get(
  "/:restaurantId",
  verifyToken,
  allAdminUsers,
  restaurantController.getSingleRestaurant
);

// 🔁 Toggle isActive (with log)
router.patch(
  "/:restaurantId/toggle-active",
  verifyToken,
  isAdminOrSuperAdmin,
  restaurantController.toggleRestaurantStatus
);

// 🍽️ Get menu
router.get(
  "/:restaurantId/menu",
  verifyToken,
  allAdminUsers,
  restaurantController.getRestaurantMenu
);

// me for restaurant itself
router.get(
  "/me/self",
  verifyToken,
  isRestaurantSelf,
  restaurantController.getSelfRestaurant
);

// update restaurant details
router.patch(
  "/:restaurantId",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(restaurantController.updateRestaurant)
);

// check username availability
router.post(
  "/check-username",
  asyncHandler(restaurantController.checkUsernameAvailability)
);

// change username
router.patch(
  "/:restaurantId/change-username",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(restaurantController.changeUsername)
);

module.exports = router;
