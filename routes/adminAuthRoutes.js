const express = require("express");
const passport = require("passport");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const adminAuthController = require("../controllers/adminAuthController");
const { verifyToken, isSuperAdmin } = require("../middlewares/auth");

// Only SuperAdmin can register new admin users
router.post(
  "/register",
  verifyToken,
  isSuperAdmin,
  asyncHandler(adminAuthController.register)
);

// Login is public
router.post("/login", (req, res, next) => {
  passport.authenticate("local", { session: false }, (err, user, info) => {
    if (err) return next(err);

    if (!user) {
      return res.status(401).json({ message: info.message || "Unauthorized" });
    }

    // attach user to req manually and call controller
    req.user = user;
    return adminAuthController.login(req, res, next);
  })(req, res, next);
});

// Change password route
router.post(
  "/change-password",
  verifyToken,
  asyncHandler(adminAuthController.changePassword)
);

module.exports = router;
