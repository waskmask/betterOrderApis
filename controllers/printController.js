const crypto = require("crypto");
const PrintJob = require("../modals/PrintJob");
const Order = require("../modals/Order");
const { Restaurant } = require("../modals/Restaurant");
const {
  buildKitchenTicketPayload,
  enqueuePrintJob,
  hashPrintAgentToken,
  generatePrintAgentToken,
  isPrintAgentHealthy,
} = require("../services/orderPrintService");
const {
  normalizeRestaurantPrinters,
  findPrinterByKey,
  primaryPrinterConfig,
  normalizeDiscoveredPrinters,
  getDiscoveredEnabledPrinters,
} = require("../services/printerConfigService");
const {
  createRestaurantPairing,
  validateRestaurantPairing,
  issueAgentCredentials,
} = require("../services/printPairingService");
const { getRestaurantIdFromUser } = require("../utils/restaurantRoles");

function agentTokenFromRequest(req) {
  const header =
    req.headers["x-print-agent-token"] ||
    req.headers.authorization?.replace(/^Bearer\s+/i, "") ||
    "";
  return String(header).trim();
}

async function loadRestaurantForAgent(req, res, next) {
  try {
    const restaurantId =
      req.headers["x-restaurant-id"] ||
      req.params.restaurantId ||
      req.body?.restaurantId;
    const token = agentTokenFromRequest(req);

    if (!restaurantId || !token) {
      return res.status(401).json({ success: false, message: "print_agent_unauthorized" });
    }

    const restaurant = await Restaurant.findById(restaurantId).select(
      "printAgentTokenHash printAgentLastSeenAt printerConfig printers printAgentDiscoveredPrinters restaurant_name orderSettings"
    );
    if (!restaurant?.printAgentTokenHash) {
      return res.status(401).json({ success: false, message: "print_agent_not_configured" });
    }

    const tokenHash = hashPrintAgentToken(token);
    const storedHash = String(restaurant.printAgentTokenHash || "");
    const valid =
      storedHash.length > 0 &&
      tokenHash.length === storedHash.length &&
      crypto.timingSafeEqual(Buffer.from(tokenHash), Buffer.from(storedHash));

    if (!valid) {
      return res.status(401).json({ success: false, message: "print_agent_unauthorized" });
    }

    req.printAgentRestaurant = restaurant;
    return next();
  } catch (error) {
    return res.status(500).json({ success: false, message: "print_agent_auth_failed" });
  }
}

function canManageRestaurantOrder(user, restaurantId) {
  if (!user) return false;
  if (["superadmin", "admin", "moderator"].includes(user.role)) return true;
  return getRestaurantIdFromUser(user) === String(restaurantId);
}

async function touchPrintAgent(restaurant) {
  const now = new Date();
  await Restaurant.updateOne(
    { _id: restaurant._id },
    { $set: { printAgentLastSeenAt: now } }
  );
  restaurant.printAgentLastSeenAt = now;
}

exports.agentHeartbeat = async (req, res) => {
  try {
    const restaurant = req.printAgentRestaurant;
    const now = new Date();
    const heartbeatUpdate = { printAgentLastSeenAt: now };
    if (Array.isArray(req.body?.discoveredPrinters)) {
      heartbeatUpdate.printAgentDiscoveredPrinters = normalizeDiscoveredPrinters(
        req.body.discoveredPrinters
      );
    }

    await Restaurant.updateOne({ _id: restaurant._id }, { $set: heartbeatUpdate });
    restaurant.printAgentLastSeenAt = now;
    if (heartbeatUpdate.printAgentDiscoveredPrinters) {
      restaurant.printAgentDiscoveredPrinters = heartbeatUpdate.printAgentDiscoveredPrinters;
    }

    const failedCount = await PrintJob.countDocuments({
      restaurantId: restaurant._id,
      status: "failed",
    });
    const pendingCount = await PrintJob.countDocuments({
      restaurantId: restaurant._id,
      status: "pending",
    });

    const discoveredPrinters = getDiscoveredEnabledPrinters(restaurant);

    return res.json({
      success: true,
      restaurantName: restaurant.restaurant_name,
      pendingCount,
      failedCount,
      printer: primaryPrinterConfig(restaurant),
      printers: normalizeRestaurantPrinters(restaurant),
      discoveredPrinters,
      lastSeenAt: restaurant.printAgentLastSeenAt,
    });
  } catch (error) {
    console.error("print_agent_heartbeat_error", error);
    return res.status(500).json({ success: false, message: "heartbeat_failed" });
  }
};

exports.listPendingJobs = async (req, res) => {
  try {
    const restaurant = req.printAgentRestaurant;
    await Restaurant.updateOne(
      { _id: restaurant._id },
      { $set: { printAgentLastSeenAt: new Date() } }
    );

    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 10, 1), 25);
    const jobs = await PrintJob.find({
      restaurantId: restaurant._id,
      status: "pending",
      retryCount: { $lt: 5 },
    })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      jobs: jobs.map((job) => ({
        _id: String(job._id),
        orderId: String(job.orderId),
        orderNumber: job.orderNumber,
        payloadBase64: job.payloadBase64,
        copies: job.copies,
        printerKey: job.printerKey,
        printerName: job.printerName,
        printRole: job.printRole || "KITCHEN",
        printer:
          job.printerTarget ||
          findPrinterByKey(restaurant, job.printerKey) ||
          primaryPrinterConfig(restaurant),
        createdAt: job.createdAt,
      })),
      printer: primaryPrinterConfig(restaurant),
      printers: normalizeRestaurantPrinters(restaurant),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "list_pending_failed" });
  }
};

exports.ackPrintJob = async (req, res) => {
  try {
    const restaurant = req.printAgentRestaurant;
    const job = await PrintJob.findOneAndUpdate(
      {
        _id: req.params.jobId,
        restaurantId: restaurant._id,
        status: "pending",
      },
      {
        $set: {
          status: "sent",
          sentAt: new Date(),
          lastError: "",
        },
      },
      { new: true }
    );

    if (!job) {
      return res.status(404).json({ success: false, message: "print_job_not_found" });
    }

    await touchPrintAgent(restaurant);

    return res.json({ success: true, jobId: String(job._id), status: job.status });
  } catch (error) {
    return res.status(500).json({ success: false, message: "ack_failed" });
  }
};

exports.failPrintJob = async (req, res) => {
  try {
    const restaurant = req.printAgentRestaurant;
    const errorMessage = String(req.body?.error || "print_failed").slice(0, 500);

    const job = await PrintJob.findOne({
      _id: req.params.jobId,
      restaurantId: restaurant._id,
    });
    if (!job) {
      return res.status(404).json({ success: false, message: "print_job_not_found" });
    }

    job.retryCount += 1;
    job.lastError = errorMessage;
    if (job.retryCount >= job.maxRetries) {
      job.status = "failed";
      job.failedAt = new Date();
    } else {
      job.status = "pending";
    }
    await job.save();

    await touchPrintAgent(restaurant);

    return res.json({
      success: true,
      jobId: String(job._id),
      status: job.status,
      retryCount: job.retryCount,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "fail_report_failed" });
  }
};

exports.getPrintStatus = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    if (!canManageRestaurantOrder(req.user, restaurantId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const restaurant = await Restaurant.findById(restaurantId).select(
      "printerConfig printers printAgentLastSeenAt printAgentDiscoveredPrinters orderSettings printAgentTokenHash"
    );
    if (!restaurant) {
      return res.status(404).json({ message: "restaurant_not_found" });
    }

    const [pendingCount, failedCount, lastFailed] = await Promise.all([
      PrintJob.countDocuments({ restaurantId, status: "pending" }),
      PrintJob.countDocuments({ restaurantId, status: "failed" }),
      PrintJob.findOne({ restaurantId, status: "failed" }).sort({ updatedAt: -1 }).lean(),
    ]);

    const agentOnline = isPrintAgentHealthy(restaurant.printAgentLastSeenAt);

    const discoveredPrinters = getDiscoveredEnabledPrinters(restaurant);

    return res.json({
      success: true,
      agentOnline,
      printAgentLastSeenAt: restaurant.printAgentLastSeenAt,
      printerConfig: primaryPrinterConfig(restaurant),
      printers: normalizeRestaurantPrinters(restaurant),
      discoveredPrinters,
      autoDetectPrinters: restaurant.orderSettings?.autoDetectPrinters !== false,
      orderSettings: restaurant.orderSettings || {},
      pendingCount,
      failedCount,
      lastFailedAt: lastFailed?.failedAt || null,
      lastError: lastFailed?.lastError || "",
      hasAgentToken: Boolean(restaurant.printAgentTokenHash),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "print_status_failed" });
  }
};

exports.getOrderPrintPayload = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (!canManageRestaurantOrder(req.user, order.restaurant.restaurantId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const restaurant = await Restaurant.findById(order.restaurant.restaurantId).select(
      "images.logo restaurant_name phoneNumber email address vat_number"
    );
    const payload = await buildKitchenTicketPayload(order, restaurant);
    return res.json({ success: true, ...payload, orderNumber: order.orderNumber });
  } catch (error) {
    return res.status(500).json({ success: false, message: "print_payload_failed" });
  }
};

exports.reprintOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (!canManageRestaurantOrder(req.user, order.restaurant.restaurantId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!["accepted", "preparing", "dispatch", "out_for_delivery", "ready_for_pickup"].includes(order.status)) {
      return res.status(409).json({ message: "order_not_printable" });
    }

    const restaurant = await Restaurant.findById(order.restaurant.restaurantId).select(
      "orderSettings printerConfig printers images.logo restaurant_name phoneNumber email address vat_number"
    );
    if (!restaurant) {
      return res.status(404).json({ message: "restaurant_not_found" });
    }

    const printJob = await enqueuePrintJob(order, restaurant, { source: "reprint", force: true });
    return res.json({
      success: true,
      printJobId: printJob?._id ? String(printJob._id) : null,
      status: printJob?.status || null,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "reprint_failed" });
  }
};

exports.createPairingCode = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    if (!canManageRestaurantOrder(req.user, restaurantId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "restaurant_not_found" });
    }

    const pairing = createRestaurantPairing(restaurant);
    await restaurant.save();

    return res.json({
      success: true,
      pairingCode: pairing.code,
      expiresAt: pairing.expiresAt,
      message: "Enter this code on the kitchen PC running print-agent.",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "create_pairing_failed" });
  }
};

exports.claimPairingCode = async (req, res) => {
  try {
    const code = String(req.body?.code || "").trim();
    const deviceName = String(req.body?.deviceName || req.hostname || "kitchen-pc")
      .trim()
      .slice(0, 120);

    const restaurants = await Restaurant.find({
      printAgentPairingExpiresAt: { $gt: new Date() },
      printAgentPairingCodeHash: { $ne: "" },
    }).select("restaurant_name printAgentPairingCodeHash printAgentPairingExpiresAt");

    let matched = null;
    for (const restaurant of restaurants) {
      const validation = validateRestaurantPairing(restaurant, code);
      if (validation.ok) {
        matched = restaurant;
        break;
      }
    }

    if (!matched) {
      return res.status(404).json({ success: false, message: "invalid_or_expired_pairing_code" });
    }

    const credentials = issueAgentCredentials(matched);
    await matched.save();

    return res.json({
      success: true,
      ...credentials,
      deviceName,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "claim_pairing_failed" });
  }
};

exports.generatePrintAgentToken = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    if (!canManageRestaurantOrder(req.user, restaurantId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "restaurant_not_found" });
    }

    const token = generatePrintAgentToken();
    restaurant.printAgentTokenHash = hashPrintAgentToken(token);
    restaurant.printAgentLastSeenAt = null;
    await restaurant.save();

    return res.json({
      success: true,
      token,
      message: "Store this token securely in the print agent environment.",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "generate_token_failed" });
  }
};

exports.loadRestaurantForAgent = loadRestaurantForAgent;
