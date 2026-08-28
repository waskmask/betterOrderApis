const express = require("express");
const {
  acceptOrder,
  createOrder,
  getOrder,
  getOrderAnalytics,
  getPublicOrder,
  listOrders,
  listRestaurantOrders,
  rejectOrder,
  streamOrders,
  streamRestaurantOrders,
  updateOrderStatus,
} = require("../controllers/orderController");
const { optionalAppUserToken, verifyToken } = require("../middlewares/auth");

const router = express.Router();

router.post("/", optionalAppUserToken, createOrder);
router.get("/", verifyToken, listOrders);
router.get("/analytics", verifyToken, getOrderAnalytics);
router.get("/public/:orderId", getPublicOrder);
router.get("/stream", verifyToken, streamOrders);
router.get("/restaurant/:restaurantId/stream", verifyToken, streamRestaurantOrders);
router.get("/restaurant/:restaurantId", verifyToken, listRestaurantOrders);
router.get("/:orderId", verifyToken, getOrder);
router.patch("/:orderId/accept", verifyToken, acceptOrder);
router.patch("/:orderId/reject", verifyToken, rejectOrder);
router.patch("/:orderId/status", verifyToken, updateOrderStatus);

module.exports = router;
