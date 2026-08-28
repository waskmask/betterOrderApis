const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const adminUserController = require("../controllers/adminUserController");
const {
  verifyToken,
  isAdminOrSuperAdmin,
  isSuperAdmin,
  allAdminUsers,
  loggedInAdmin,
} = require("../middlewares/auth");
const { uploadImage, processImage } = require("../middlewares/uploadImage");

// ✅ Get all admin users (protected)
router.get(
  "/all",
  verifyToken,
  isAdminOrSuperAdmin,
  asyncHandler(adminUserController.getAllAdmins)
);

// Update admin user (only admin/superadmin)
router.put(
  "/update/:id",
  verifyToken,
  isAdminOrSuperAdmin,
  asyncHandler(adminUserController.updateAdminUser)
);

//loggedIn admin user
router.get(
  "/me",
  verifyToken,
  loggedInAdmin, // ✅ use here
  asyncHandler(adminUserController.getLoggedInAdminUser)
);

router.patch(
  "/me",
  verifyToken,
  loggedInAdmin,
  asyncHandler(adminUserController.updateLoggedInAdminUser)
);

router.post(
  "/me/avatar",
  verifyToken,
  loggedInAdmin,
  uploadImage,
  processImage({
    fieldName: "adminAvatarPath",
    maxWidth: 512,
    webpQuality: 90,
  }),
  asyncHandler(adminUserController.uploadAvatar)
);

router.get(
  "/me/security-activity",
  verifyToken,
  loggedInAdmin,
  asyncHandler(adminUserController.getLoggedInSecurityActivity)
);

router.get(
  "/:id/security-activity",
  verifyToken,
  isSuperAdmin,
  asyncHandler(adminUserController.getAdminUserSecurityActivity)
);

// Get a single admin user
router.get(
  "/:id",
  verifyToken,
  allAdminUsers,
  asyncHandler(adminUserController.getSingleAdminUser)
);

module.exports = router;
