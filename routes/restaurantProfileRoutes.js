const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const {
  verifyToken,
  allAdminUsers,
  canManageMenuCategory,
} = require("../middlewares/auth");
const { uploadImage, processImage } = require("../middlewares/uploadImage");
const restaurantProfileController = require("../controllers/restaurantProfileController");

// upload restaurant cover
router.post(
  "/upload-logo",
  verifyToken,
  canManageMenuCategory,
  uploadImage,
  processImage("restaurantImagePath"),
  asyncHandler(restaurantProfileController.uploadLogo)
);

router.post(
  "/upload-cover",
  verifyToken,
  canManageMenuCategory,
  uploadImage,
  processImage("restaurantImagePath"),
  asyncHandler(restaurantProfileController.uploadCover)
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
  allAdminUsers,
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
  canManageMenuCategory,
  asyncHandler(restaurantProfileController.getOpeningHours)
);

module.exports = router;
