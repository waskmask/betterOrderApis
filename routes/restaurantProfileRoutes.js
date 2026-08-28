const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const {
  verifyToken,
  canManageMenuCategory,
  canViewRestaurant,
  bindRestaurantIdFromBody,
} = require("../middlewares/auth");
const { uploadImage, uploadLargeImage, processImage } = require("../middlewares/uploadImage");
const restaurantProfileController = require("../controllers/restaurantProfileController");
const restaurantCoverAiController = require("../controllers/restaurantCoverAiController");

// upload restaurant cover
router.post(
  "/upload-logo",
  verifyToken,
  uploadImage,
  bindRestaurantIdFromBody,
  canManageMenuCategory,
  processImage("restaurantImagePath"),
  asyncHandler(restaurantProfileController.uploadLogo)
);

router.post(
  "/upload-cover",
  verifyToken,
  uploadLargeImage,
  bindRestaurantIdFromBody,
  canManageMenuCategory,
  processImage({
    fieldName: "restaurantImagePath",
    maxWidth: 1600,
    webpQuality: 90,
  }),
  asyncHandler(restaurantProfileController.uploadCover)
);

router.post(
  "/:restaurantId/cover-ai/generate",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(restaurantCoverAiController.generateCoverAi)
);

router.get(
  "/:restaurantId/cover-ai/assets",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(restaurantCoverAiController.listCoverAiAssets)
);

router.get(
  "/:restaurantId/cover-ai/assets/:index/data",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(restaurantCoverAiController.getCoverAiAssetData)
);

// toggle delivery and take-away
router.patch(
  "/:restaurantId/toggle-service",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(restaurantProfileController.toggleDeliveryOrTakeaway)
);

// add delivery zones
router.post(
  "/:restaurantId/delivery-zones",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(restaurantProfileController.addDeliveryZone)
);

// get all delivery zones
router.get(
  "/:restaurantId/delivery-zones",
  verifyToken,
  canViewRestaurant,
  asyncHandler(restaurantProfileController.getAllDeliveryZones)
);

// update delivery zones
router.patch(
  "/:restaurantId/delivery-zones",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(restaurantProfileController.updateDeliveryZone)
);

// delete delivery zones
router.delete(
  "/:restaurantId/delivery-zones/:index",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(restaurantProfileController.deleteDeliveryZone)
);

// Set Opening Hours
router.put(
  "/:restaurantId/opening-hours",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(restaurantProfileController.setOpeningHours)
);

// Get Opening Hours
router.get(
  "/:restaurantId/opening-hours",
  verifyToken,
  canViewRestaurant,
  asyncHandler(restaurantProfileController.getOpeningHours)
);

router.get(
  "/:restaurantId/order-settings",
  verifyToken,
  canViewRestaurant,
  asyncHandler(restaurantProfileController.getOrderSettings)
);

router.patch(
  "/:restaurantId/order-settings",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(restaurantProfileController.updateOrderSettings)
);

router.patch(
  "/:restaurantId/orders-pause",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(restaurantProfileController.pauseOrders)
);

router.patch(
  "/:restaurantId/orders-resume",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(restaurantProfileController.resumeOrders)
);

module.exports = router;
