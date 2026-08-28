const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const platformSettingsController = require("../controllers/platformSettingsController");
const {
  verifyToken,
  isSuperAdmin,
} = require("../middlewares/auth");
const { isRestaurantAdminRole } = require("../utils/restaurantRoles");

const router = express.Router();

function canReadPlatformSettings(req, res, next) {
  if (["admin", "superadmin"].includes(req.user?.role)) {
    return next();
  }
  if (isRestaurantAdminRole(req.user?.role)) {
    return next();
  }
  return res.status(403).json({ message: "Access denied: Not authorized" });
}

router.get(
  "/public",
  asyncHandler(platformSettingsController.getPublicPlatformBrand)
);

router.get(
  "/",
  verifyToken,
  canReadPlatformSettings,
  asyncHandler(platformSettingsController.getPlatformSettings)
);

router.patch(
  "/",
  verifyToken,
  isSuperAdmin,
  asyncHandler(platformSettingsController.updatePlatformSettings)
);

module.exports = router;
