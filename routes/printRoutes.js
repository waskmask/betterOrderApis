const express = require("express");
const { verifyToken } = require("../middlewares/auth");
const printController = require("../controllers/printController");

const router = express.Router();

router.post("/pairing/claim", printController.claimPairingCode);

router.post(
  "/agent/heartbeat",
  printController.loadRestaurantForAgent,
  printController.agentHeartbeat
);
router.get(
  "/agent/pending",
  printController.loadRestaurantForAgent,
  printController.listPendingJobs
);
router.post(
  "/agent/jobs/:jobId/ack",
  printController.loadRestaurantForAgent,
  printController.ackPrintJob
);
router.post(
  "/agent/jobs/:jobId/fail",
  printController.loadRestaurantForAgent,
  printController.failPrintJob
);

router.get("/restaurant/:restaurantId/status", verifyToken, printController.getPrintStatus);
router.post(
  "/restaurant/:restaurantId/pairing-code",
  verifyToken,
  printController.createPairingCode
);
router.post(
  "/restaurant/:restaurantId/agent-token",
  verifyToken,
  printController.generatePrintAgentToken
);
router.get("/orders/:orderId/payload", verifyToken, printController.getOrderPrintPayload);
router.post("/orders/:orderId/reprint", verifyToken, printController.reprintOrder);

module.exports = router;
