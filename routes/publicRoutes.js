const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const publicController = require("../controllers/publicController");

// All public routes - no authentication required
router.get(
  "/restaurants",
  asyncHandler(publicController.getRestaurantsByPostalCode)
);
router.get(
  "/restaurant/:restaurantId",
  asyncHandler(publicController.getRestaurantDetails)
);
router.get(
  "/restaurant/:restaurantId/menu",
  asyncHandler(publicController.getRestaurantMenu)
);
router.get("/cuisines", asyncHandler(publicController.getAllCuisines));

module.exports = router;


