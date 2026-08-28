const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const menuController = require("../controllers/menuController");
const { verifyToken, canManageMenuCategory } = require("../middlewares/auth");
const { uploadImage, processImage } = require("../middlewares/uploadImage");
const { processMenuItemImage } = require("../utils/menuItemImage");
const { Restaurant } = require("../modals/Restaurant");
const { getAppModuleConfig } = require("../services/moduleConfigService");
const { effectiveRestaurantModules } = require("../utils/modules");

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

// Add Category
router.post(
  "/:restaurantId/category",
  verifyToken,
  canManageMenuCategory,
  uploadImage,
  processImage("categoryImagePath"),
  asyncHandler(menuController.addCategory)
);

// GET single category from menu
router.get(
  "/:restaurantId/category/:categoryId",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(menuController.getSingleCategory)
);

// sort by index to reoder
router.put(
  "/:restaurantId/category/sort",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(menuController.sortCategories)
);

// Update Category
router.patch(
  "/:restaurantId/category/:categoryId",
  verifyToken,
  canManageMenuCategory,
  uploadImage,
  processImage("categoryImagePath"),
  asyncHandler(menuController.updateCategory)
);

// 3️⃣ Toggle isActive (activate/deactivate category)
router.patch(
  "/:restaurantId/category/:categoryId/toggle",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(menuController.toggleCategoryActiveStatus)
);

// Delete Category
router.delete(
  "/:restaurantId/category/:categoryId",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(menuController.deleteCategory)
);

// Add menu item
router.post(
  "/:restaurantId/category/:categoryId/item",
  verifyToken,
  canManageMenuCategory,
  uploadImage,
  processMenuItemImage(),
  asyncHandler(menuController.addMenuItem)
);

// 1️⃣ Sort Menu Items
router.put(
  "/:restaurantId/category/:categoryId/items/sort",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(menuController.sortMenuItems)
);

// 2️⃣ Update Menu Item
router.put(
  "/:restaurantId/category/:categoryId/item/:itemId",
  verifyToken,
  canManageMenuCategory,
  uploadImage,
  processMenuItemImage(),
  asyncHandler(menuController.updateMenuItem)
);

// 3️⃣ Toggle isActive (activate/deactivate item)
router.patch(
  "/:restaurantId/category/:categoryId/item/:itemId/toggle",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(menuController.toggleItemActiveStatus)
);

router.get(
  "/:restaurantId/category/:categoryId/item/:itemId/food-info",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(requireFoodInfoModule),
  asyncHandler(menuController.getMenuItemFoodInfo)
);

router.patch(
  "/:restaurantId/category/:categoryId/item/:itemId/food-info",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(requireFoodInfoModule),
  asyncHandler(menuController.upsertMenuItemFoodInfo)
);

// add extra menu
router.post(
  "/:restaurantId/categories/:categoryId/extras",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(menuController.addExtraMenu)
);
// get extra menu
router.get(
  "/:restaurantId/categories/:categoryId/extras",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(menuController.getExtraMenu)
);

// update extra menu
router.patch(
  "/:restaurantId/categories/:categoryId/extras",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(menuController.updateExtraMenu)
);

// delete extra menu
router.delete(
  "/:restaurantId/categories/:categoryId/extras/:extraIndex",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(menuController.deleteExtraMenu)
);

// toggle extra menu status
router.patch(
  "/:restaurantId/categories/:categoryId/extras/:extraIndex/toggle",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(menuController.toggleExtraActiveStatus)
);

// deprecated Add dressing
// router.post(
//   "/:restaurantId/categories/:categoryId/dressing",
//   verifyToken,
//   canManageMenuCategory,
//   asyncHandler(menuController.addDressing)
// );

// Add / Update dressing
router.patch(
  "/:restaurantId/categories/:categoryId/dressing",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(menuController.upsertDressing)
);

// Get dressing
router.get(
  "/:restaurantId/categories/:categoryId/dressing",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(menuController.getAllDressings)
);

// Update dressing
// router.patch(
//   "/:restaurantId/categories/:categoryId/dressing",
//   verifyToken,
//   canManageMenuCategory,
//   asyncHandler(menuController.updateDressing)
// );

// Toggle dressing status
router.patch(
  "/:restaurantId/categories/:categoryId/dressing/toggle",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(menuController.toggleDressing)
);

// Toggle dressing option status
router.patch(
  "/:restaurantId/categories/:categoryId/dressing/options/:optionIndex/toggle",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(menuController.toggleDressingOption)
);

// Delete dressing option
router.delete(
  "/:restaurantId/categories/:categoryId/dressing/options/:optionIndex",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(menuController.deleteDressingOption)
);

// add addons
router.post(
  "/:restaurantId/categories/:categoryId/addons",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(menuController.addAddon)
);

//update addons
router.patch(
  "/:restaurantId/categories/:categoryId/addons/:index",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(menuController.updateAddon)
);

// toggle addon group status
router.patch(
  "/:restaurantId/categories/:categoryId/addons/:index/toggle",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(menuController.toggleAddon)
);

// delete addons
router.delete(
  "/:restaurantId/categories/:categoryId/addons/:index",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(menuController.deleteAddon)
);

// get all addons
router.get(
  "/:restaurantId/categories/:categoryId/addons",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(menuController.getAllAddons)
);

// Toggle Addon Option
router.patch(
  "/:restaurantId/categories/:categoryId/addons/:addonIndex/options/:optionIndex/toggle",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(menuController.toggleAddonOptionStatus)
);

// Delete Addon Option
router.delete(
  "/:restaurantId/categories/:categoryId/addons/:addonIndex/options/:optionIndex",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(menuController.deleteAddonOption)
);




module.exports = router;
