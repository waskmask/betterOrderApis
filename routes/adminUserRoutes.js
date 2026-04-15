const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const adminUserController = require("../controllers/adminUserController");
const {
  verifyToken,
  isAdminOrSuperAdmin,
  allAdminUsers,
  loggedInAdmin,
} = require("../middlewares/auth");

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

// Get a single admin user
router.get(
  "/:id",
  verifyToken,
  allAdminUsers,
  asyncHandler(adminUserController.getSingleAdminUser)
);

module.exports = router;
