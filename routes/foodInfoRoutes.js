const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { verifyToken, canManageMenuCategory } = require("../middlewares/auth");
const foodInfoAiController = require("../controllers/foodInfoAiController");
const { Restaurant } = require("../modals/Restaurant");
const { getAppModuleConfig } = require("../services/moduleConfigService");
const { effectiveRestaurantModules } = require("../utils/modules");

const router = express.Router();

function bindRestaurantIdFromBody(req, res, next) {
  const restaurantId = req.body?.restaurantId;

  if (!restaurantId) {
    return res.status(400).json({
      success: false,
      message: "restaurantId_categoryId_itemId_required",
    });
  }

  req.params.restaurantId = restaurantId;
  next();
}

async function requireFoodInfoModule(req, res, next) {
  const restaurant = await Restaurant.findById(req.params.restaurantId)
    .select("_id modules delivery take_away")
    .lean();
  if (!restaurant) {
    return res.status(404).json({ success: false, message: "restaurant_not_found" });
  }
  const appModules = await getAppModuleConfig();
  const modules = effectiveRestaurantModules(restaurant, appModules);
  if (!modules.foodInfo) {
    return res.status(403).json({ success: false, message: "food_info_unavailable" });
  }
  return next();
}

router.post(
  "/ai/generate",
  verifyToken,
  bindRestaurantIdFromBody,
  canManageMenuCategory,
  asyncHandler(requireFoodInfoModule),
  asyncHandler(foodInfoAiController.generateFoodInfo)
);

module.exports = router;
