const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const orderController = require("../controllers/orderController");
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

// Place order - can be guest or authenticated
router.post("/", optionalAuth, asyncHandler(orderController.placeOrder));

// Get customer orders - requires authentication
router.get("/", verifyToken, asyncHandler(orderController.getCustomerOrders));

// Get order details - optional auth (guests can view their orders)
router.get("/:orderId", optionalAuth, asyncHandler(orderController.getOrderDetails));

// Cancel order - optional auth
router.patch("/:orderId/cancel", optionalAuth, asyncHandler(orderController.cancelOrder));

module.exports = router;

