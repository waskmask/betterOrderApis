const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const cuisineController = require("../controllers/cuisineController");
const cuisineIconController = require("../controllers/cuisineIconController");
const cuisineI18nController = require("../controllers/cuisineI18nController");
const {
  verifyToken,
  isSuperAdmin,
  allAdminUsersOrRestaurant,
} = require("../middlewares/auth");

// Authenticated admin staff or restaurant can list / view cuisines
router.get("/", verifyToken, allAdminUsersOrRestaurant, cuisineController.getAllCuisines);

// AI localize name/description for a target language (no persist)
router.post(
  "/i18n/translate",
  verifyToken,
  allAdminUsersOrRestaurant,
  asyncHandler(cuisineI18nController.translateCuisineFields)
);

// Icon preview (no persist) — must be before /:id
router.post(
  "/icon/preview-generate",
  verifyToken,
  isSuperAdmin,
  asyncHandler(cuisineIconController.previewGenerateCuisineIcon)
);

// Only superadmin can create, update, reorder, or delete
router.post(
  "/",
  verifyToken,
  isSuperAdmin,
  asyncHandler(cuisineController.createCuisine)
);
router.patch(
  "/reorder",
  verifyToken,
  isSuperAdmin,
  asyncHandler(cuisineController.reorderCuisines)
);
router.put(
  "/:id",
  verifyToken,
  isSuperAdmin,
  asyncHandler(cuisineController.updateCuisine)
);
router.patch(
  "/:id/status",
  verifyToken,
  isSuperAdmin,
  asyncHandler(cuisineController.updateCuisineStatus)
);

router.post(
  "/:id/icon",
  verifyToken,
  isSuperAdmin,
  asyncHandler(cuisineIconController.commitCuisineIcon)
);
router.delete(
  "/:id/icon",
  verifyToken,
  isSuperAdmin,
  asyncHandler(cuisineIconController.deleteCuisineIcon)
);

router.delete(
  "/:id",
  verifyToken,
  isSuperAdmin,
  asyncHandler(cuisineController.deleteCuisine)
);

module.exports = router;
