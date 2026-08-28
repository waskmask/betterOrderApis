const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const dineInController = require("../controllers/dineInController");
const { canManageMenuCategory, verifyToken } = require("../middlewares/auth");

const router = express.Router();

router.get(
  "/restaurants/:restaurantId/tables",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(dineInController.listTables)
);
router.post(
  "/restaurants/:restaurantId/tables",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(dineInController.createTable)
);
router.patch(
  "/restaurants/:restaurantId/tables/:tableId",
  verifyToken,
  canManageMenuCategory,
  asyncHandler(dineInController.updateTable)
);

router.get(
  "/public/tables/:qrToken/session",
  asyncHandler(dineInController.getOrCreateSessionByQr)
);
router.get(
  "/public/restaurants/:slug/tables/:tableRef/session",
  asyncHandler(dineInController.getOrCreateSessionByRestaurantTableRef)
);
router.post(
  "/public/sessions/:sessionId/join",
  asyncHandler(dineInController.joinSession)
);
router.post(
  "/public/sessions/:sessionId/orders",
  asyncHandler(dineInController.createSessionOrder)
);

module.exports = router;
