const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const restaurantController = require("../controllers/restaurantController");
const {
  verifyToken,
  isAdminSuperadminOrSales,
  allAdminUsers,
  isAdminOrSuperAdmin,
  isSuperAdmin,
  isRestaurantSelf,
  canManageMenuCategory,
  canViewRestaurant,
  canViewPlatformAudit,
  canManageRestaurantStaffForRestaurant,
} = require("../middlewares/auth");

// create / add restaurant
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

// admin quick search
router.get(
  "/quick-search",
  verifyToken,
  allAdminUsers,
  asyncHandler(restaurantController.quickSearchRestaurants)
);

// public customer discovery
router.get(
  "/discover",
  asyncHandler(restaurantController.discoverRestaurants)
);

// public filter metadata for discovery UI
router.get(
  "/discover/filters",
  asyncHandler(restaurantController.getDiscoverFilters)
);

// check username availability
router.post(
  "/check-username",
  asyncHandler(restaurantController.checkUsernameAvailability)
);

// restaurant self
router.get(
  "/me/self",
  verifyToken,
  isRestaurantSelf,
  restaurantController.getSelfRestaurant
);

// public customer menu
router.get(
  "/public/:restaurantId/menu/items/:itemId",
  asyncHandler(restaurantController.getPublicRestaurantMenuItem)
);
router.get(
  "/public/:restaurantId/menu",
  asyncHandler(restaurantController.getPublicRestaurantMenu)
);

// public checkout guard
router.post(
  "/public/:restaurantId/checkout/validate",
  asyncHandler(restaurantController.validatePublicCheckout)
);

// get menu
router.get(
  "/:restaurantId/menu",
  verifyToken,
  canViewRestaurant,
  restaurantController.getRestaurantMenu
);

// change username
router.patch(
  "/:restaurantId/change-username",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(restaurantController.changeUsername)
);

// toggle isActive
router.patch(
  "/:restaurantId/toggle-active",
  verifyToken,
  isAdminOrSuperAdmin,
  restaurantController.toggleRestaurantStatus
);

router.get(
  "/:restaurantId/deactivation-impact",
  verifyToken,
  isAdminOrSuperAdmin,
  asyncHandler(restaurantController.getDeactivationImpact)
);

// toggle visibility — platform admin / superadmin only
router.patch(
  "/:restaurantId/toggle-visibility",
  verifyToken,
  isAdminOrSuperAdmin,
  restaurantController.toggleRestaurantVisibility
);

router.get(
  "/:restaurantId/publish-readiness",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(restaurantController.getPublishReadiness)
);

router.post(
  "/:restaurantId/publish-request",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(restaurantController.requestRestaurantPublish)
);

router.patch(
  "/:restaurantId/publish-request/review",
  verifyToken,
  isAdminOrSuperAdmin,
  asyncHandler(restaurantController.reviewRestaurantPublish)
);

router.patch(
  "/:restaurantId/modules",
  verifyToken,
  isAdminOrSuperAdmin,
  asyncHandler(restaurantController.updateRestaurantModules)
);

// edit audit logs (cursor paginated) — before bare :restaurantId GET
router.get(
  "/:restaurantId/audit-logs/export",
  verifyToken,
  canViewPlatformAudit,
  asyncHandler(restaurantController.exportRestaurantAuditLogs)
);

router.get(
  "/:restaurantId/audit-logs",
  verifyToken,
  canViewPlatformAudit,
  asyncHandler(restaurantController.getRestaurantAuditLogs)
);

// get single restaurant
router.get(
  "/:restaurantId",
  verifyToken,
  canViewRestaurant,
  restaurantController.getSingleRestaurant
);

// update restaurant details
router.patch(
  "/:restaurantId",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(restaurantController.updateRestaurant)
);

module.exports = router;
