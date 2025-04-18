const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const menuController = require("../controllers/menuController");
const { verifyToken, canManageMenuCategory } = require("../middlewares/auth");
const { uploadImage, processImage } = require("../middlewares/uploadImage");

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
  asyncHandler(menuController.updateMenuItem)
);

// 3️⃣ Toggle isActive (activate/deactivate item)
router.patch(
  "/:restaurantId/category/:categoryId/item/:itemId/toggle",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(menuController.toggleItemActiveStatus)
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

// add dressings
router.post(
  "/:restaurantId/categories/:categoryId/dressings",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(menuController.addDressing)
);

// get all dressings
router.get(
  "/:restaurantId/categories/:categoryId/dressings",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(menuController.getAllDressings)
);

// update dressings
router.patch(
  "/:restaurantId/categories/:categoryId/dressings/:index",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(menuController.updateDressing)
);

// toggle dressing status
router.patch(
  "/:restaurantId/categories/:categoryId/dressings/:index/toggle",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(menuController.toggleDressing)
);

// delete dressing
router.delete(
  "/:restaurantId/categories/:categoryId/dressings/:index",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(menuController.deleteDressing)
);

// Toggle dressing option status
router.patch(
  "/:restaurantId/categories/:categoryId/dressings/:dressingIndex/options/:optionIndex/toggle",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(menuController.toggleDressingOption)
);

// Delete dressing option
router.delete(
  "/:restaurantId/categories/:categoryId/dressings/:dressingIndex/options/:optionIndex",
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
