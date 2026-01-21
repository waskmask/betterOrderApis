const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const cartController = require("../controllers/cartController");
const { verifyToken } = require("../middlewares/auth");

// Optional auth middleware - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies?.token;
  
  let token;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } else if (cookieToken) {
    token = cookieToken;
  }
  
  // If token exists, try to verify it, but continue even if it fails
  if (token) {
    try {
      const jwt = require("jsonwebtoken");
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const Customer = require("../modals/Customer");
      const customer = await Customer.findById(decoded.id);
      if (customer && customer.isActive && decoded.tokenVersion === customer.tokenVersion) {
        req.user = {
          ...customer.toObject(),
          role: "customer",
          tokenVersion: decoded.tokenVersion,
        };
      }
    } catch (error) {
      // Token invalid or expired, continue as guest
    }
  }
  next();
};

// All cart routes - can be accessed by guests or authenticated customers
router.post("/add", optionalAuth, asyncHandler(cartController.addToCart));
router.get("/", optionalAuth, asyncHandler(cartController.getCart));
router.delete("/:itemId", optionalAuth, asyncHandler(cartController.removeCartItem));
router.delete("/", optionalAuth, asyncHandler(cartController.clearCart));
router.get("/count", optionalAuth, asyncHandler(cartController.getCartCount));
router.patch("/:itemId/quantity", optionalAuth, asyncHandler(cartController.updateCartItemQuantity));

module.exports = router;

