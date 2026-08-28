const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const DiningTable = require("../modals/DiningTable");
const DiningSession = require("../modals/DiningSession");
const Order = require("../modals/Order");
const Counter = require("../modals/Counter");
const { Restaurant } = require("../modals/Restaurant");
const {
  OrderValidationError,
  priceOrderPayload,
} = require("../services/orderPricingService");
const { broadcastOrderEvent } = require("../services/orderRealtimeService");
const { sendRestaurantOrderPushSafe } = require("../services/mobilePushService");
const { getAppModuleConfig } = require("../services/moduleConfigService");
const { effectiveRestaurantModules } = require("../utils/modules");

const SESSION_STATUS_OPEN = "open";

function randomQrToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function randomGuestId() {
  return crypto.randomBytes(16).toString("hex");
}

function randomPasscode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function customerAppBaseUrl() {
  return process.env.CUSTOMER_APP_URL || "http://localhost:4003";
}

function tableQrUrl(table, restaurant) {
  const slug = restaurant?.username || restaurant?._id || table.restaurantId;
  return `${customerAppBaseUrl()}/r/${encodeURIComponent(String(slug))}/table/${encodeURIComponent(table.qrToken)}`;
}

function generalTableMenuUrl(restaurant) {
  const slug = restaurant?.username || restaurant?._id;
  return `${customerAppBaseUrl()}/r/${encodeURIComponent(String(slug))}/table`;
}

function signGuestToken(session, guestId, role) {
  return jwt.sign(
    {
      type: "dining-session",
      sessionId: String(session._id),
      restaurantId: String(session.restaurantId),
      tableId: String(session.tableId),
      guestId,
      role,
    },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  );
}

function readBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
}

async function verifyGuestToken(req, expectedSessionId = null) {
  const token = readBearerToken(req);
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded?.type !== "dining-session") return null;
    if (expectedSessionId && String(decoded.sessionId) !== String(expectedSessionId)) return null;

    const session = await DiningSession.findById(decoded.sessionId);
    if (!session || session.status !== SESSION_STATUS_OPEN) return null;

    const guest = session.guests.find((entry) => entry.guestId === decoded.guestId);
    if (!guest) return null;
    guest.lastSeenAt = new Date();
    session.lastActivityAt = new Date();
    await session.save();

    return { session, guestId: decoded.guestId, role: decoded.role || guest.role || "guest" };
  } catch {
    return null;
  }
}

function serializeTable(table, restaurant = null) {
  const doc = typeof table.toObject === "function" ? table.toObject() : table;
  return {
    _id: String(doc._id),
    restaurantId: String(doc.restaurantId),
    tableNumber: doc.tableNumber,
    label: doc.label || "",
    area: doc.area || "",
    qrToken: doc.qrToken,
    qrUrl: tableQrUrl(doc, restaurant),
    isActive: Boolean(doc.isActive),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function serializeSession(session, table = null, restaurant = null) {
  const doc = typeof session.toObject === "function" ? session.toObject() : session;
  return {
    _id: String(doc._id),
    restaurantId: String(doc.restaurantId),
    tableId: String(doc.tableId),
    tableNumber: doc.tableNumberSnapshot,
    tableLabel: table?.label || "",
    restaurantSlug: restaurant?.username || "",
    restaurantName: restaurant?.restaurant_name || "",
    status: doc.status,
    guestCount: doc.guests?.length || 0,
    openedAt: doc.openedAt,
    lastActivityAt: doc.lastActivityAt,
  };
}

async function nextOrderSerial() {
  const year = new Date().getFullYear();
  const counter = await Counter.findOneAndUpdate(
    { key: `orderShortNumber:${year}` },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return Number(counter?.seq || 1);
}

async function generateOrderNumber() {
  const year = new Date().getFullYear();
  const yearCode = String(year).slice(-2);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const serial = await nextOrderSerial();
    const orderNumber = `BO${yearCode}${String(serial).padStart(2, "0")}`;
    const exists = await Order.exists({ orderNumber });
    if (!exists) return orderNumber;
  }
  return `BO${yearCode}${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function buildDineInOrderDocument({ priced, orderNumber, session, table, guestId }) {
  const restaurant = priced.restaurant;
  return {
    orderNumber,
    idempotencyKey: "",
    customerAccessToken: crypto.randomBytes(24).toString("hex"),
    restaurant: {
      restaurantId: restaurant._id,
      usernameSnapshot: restaurant.username || "",
      nameSnapshot: restaurant.restaurant_name || "",
      phoneSnapshot: restaurant.phoneNumber || "",
      emailSnapshot: restaurant.email || "",
      addressSnapshot: {
        street: restaurant.address?.street || "",
        houseNumber: restaurant.address?.houseNumber || "",
        postalCode: restaurant.address?.postalCode || "",
        city: restaurant.address?.city || "",
        country: restaurant.address?.country || "",
      },
    },
    customer: {
      appUserId: null,
      firstName: "Table",
      lastName: table.tableNumber,
      email: "",
      phone: "",
    },
    fulfillment: {
      mode: "dine_in",
      diningSessionId: session._id,
      tableId: table._id,
      tableNumberSnapshot: table.tableNumber,
      postalCode: "",
      requestedTime: "asap",
      deliveryMinutes: 0,
      deliveryNote: "",
      address: {},
    },
    payment: {
      method: "cod",
      status: "cash_on_delivery",
    },
    items: priced.items,
    totals: priced.totals,
    status: "pending",
    statusHistory: [
      {
        status: "pending",
        actorType: "dine-in-guest",
        actorId: null,
        note: `Dine-in order from table ${table.tableNumber}`,
      },
    ],
    dineInGuestId: guestId,
  };
}

async function getRestaurantForTable(table) {
  return Restaurant.findById(table.restaurantId)
    .select("_id restaurant_name username modules delivery take_away")
    .lean();
}

async function findRestaurantBySlug(slug) {
  const value = String(slug || "").trim();
  if (!value) return null;

  const query = [{ username: value }];
  if (/^[a-f\d]{24}$/i.test(value)) query.push({ _id: value });

  return Restaurant.findOne({ $or: query })
    .select("_id restaurant_name username modules delivery take_away")
    .lean();
}

async function getOrCreateSessionForTable({ req, res, table, restaurant }) {
  const appModules = await getAppModuleConfig();
  const modules = effectiveRestaurantModules(restaurant, appModules);
  if (!modules.dineIn || !modules.tableQr) {
    return res.status(403).json({ success: false, message: "dine_in_unavailable" });
  }

  const joined = await verifyGuestToken(req);
  let session = await DiningSession.findOne({ tableId: table._id, status: SESSION_STATUS_OPEN })
    .sort({ openedAt: -1 });

  if (session) {
    const isJoined = joined && String(joined.session._id) === String(session._id);
    return res.json({
      success: true,
      status: "active",
      requiresPasscode: !isJoined,
      joined: Boolean(isJoined),
      guestToken: isJoined ? readBearerToken(req) : undefined,
      role: isJoined ? joined.role : undefined,
      session: serializeSession(session, table, restaurant),
    });
  }

  const passcode = randomPasscode();
  const guestId = randomGuestId();
  session = await DiningSession.create({
    restaurantId: table.restaurantId,
    tableId: table._id,
    tableNumberSnapshot: table.tableNumber,
    passcodeHash: await bcrypt.hash(passcode, 10),
    hostGuestId: guestId,
    guests: [{ guestId, role: "host" }],
  });

  const guestToken = signGuestToken(session, guestId, "host");
  return res.status(201).json({
    success: true,
    status: "created",
    requiresPasscode: false,
    joined: true,
    role: "host",
    passcode,
    guestToken,
    session: serializeSession(session, table, restaurant),
  });
}

exports.listTables = async (req, res, next) => {
  try {
    const { restaurantId } = req.params;
    const restaurant = await Restaurant.findById(restaurantId)
      .select("_id restaurant_name username modules delivery take_away")
      .lean();
    if (!restaurant) return res.status(404).json({ success: false, message: "restaurant_not_found" });
    const appModules = await getAppModuleConfig();
    const modules = effectiveRestaurantModules(restaurant, appModules);
    if (!modules.dineIn || !modules.tableQr) {
      return res.status(403).json({ success: false, message: "dine_in_unavailable" });
    }

    const tables = await DiningTable.find({ restaurantId }).sort({ tableNumber: 1 }).lean();
    res.json({
      success: true,
      generalMenuUrl: generalTableMenuUrl(restaurant),
      tables: tables.map((table) => serializeTable(table, restaurant)),
    });
  } catch (error) {
    next(error);
  }
};

exports.createTable = async (req, res, next) => {
  try {
    const { restaurantId } = req.params;
    const tableNumber = String(req.body.tableNumber || "").trim();
    if (!tableNumber) {
      return res.status(400).json({ success: false, message: "table_number_required" });
    }

    const restaurant = await Restaurant.findById(restaurantId)
      .select("_id restaurant_name username modules delivery take_away")
      .lean();
    if (!restaurant) return res.status(404).json({ success: false, message: "restaurant_not_found" });
    const appModules = await getAppModuleConfig();
    const modules = effectiveRestaurantModules(restaurant, appModules);
    if (!modules.dineIn || !modules.tableQr) {
      return res.status(403).json({ success: false, message: "dine_in_unavailable" });
    }

    const table = await DiningTable.create({
      restaurantId,
      tableNumber,
      label: String(req.body.label || "").trim(),
      area: String(req.body.area || "").trim(),
      qrToken: randomQrToken(),
    });

    res.status(201).json({ success: true, table: serializeTable(table, restaurant) });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: "table_number_already_exists" });
    }
    next(error);
  }
};

exports.updateTable = async (req, res, next) => {
  try {
    const { restaurantId, tableId } = req.params;
    const table = await DiningTable.findOne({ _id: tableId, restaurantId });
    if (!table) return res.status(404).json({ success: false, message: "table_not_found" });

    const restaurantForGuard = await getRestaurantForTable(table);
    const appModules = await getAppModuleConfig();
    const modules = effectiveRestaurantModules(restaurantForGuard, appModules);
    if (!modules.dineIn || !modules.tableQr) {
      return res.status(403).json({ success: false, message: "dine_in_unavailable" });
    }

    if (req.body.tableNumber !== undefined) {
      const tableNumber = String(req.body.tableNumber || "").trim();
      if (!tableNumber) return res.status(400).json({ success: false, message: "table_number_required" });
      table.tableNumber = tableNumber;
    }
    if (req.body.label !== undefined) table.label = String(req.body.label || "").trim();
    if (req.body.area !== undefined) table.area = String(req.body.area || "").trim();
    if (req.body.isActive !== undefined) table.isActive = Boolean(req.body.isActive);
    if (req.body.regenerateQr === true) table.qrToken = randomQrToken();
    await table.save();

    res.json({ success: true, table: serializeTable(table, restaurantForGuard) });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: "table_number_already_exists" });
    }
    next(error);
  }
};

exports.getOrCreateSessionByQr = async (req, res, next) => {
  try {
    const table = await DiningTable.findOne({ qrToken: req.params.qrToken, isActive: true });
    if (!table) return res.status(404).json({ success: false, message: "table_not_found" });

    const restaurant = await getRestaurantForTable(table);
    if (!restaurant) return res.status(404).json({ success: false, message: "restaurant_not_found" });

    return getOrCreateSessionForTable({ req, res, table, restaurant });
  } catch (error) {
    next(error);
  }
};

exports.getOrCreateSessionByRestaurantTableRef = async (req, res, next) => {
  try {
    const restaurant = await findRestaurantBySlug(req.params.slug);
    if (!restaurant) return res.status(404).json({ success: false, message: "restaurant_not_found" });

    const tableRef = String(req.params.tableRef || "").trim();
    const table = await DiningTable.findOne({
      restaurantId: restaurant._id,
      isActive: true,
      $or: [{ qrToken: tableRef }, { tableNumber: tableRef }],
    });
    if (!table) return res.status(404).json({ success: false, message: "table_not_found" });

    return getOrCreateSessionForTable({ req, res, table, restaurant });
  } catch (error) {
    next(error);
  }
};

exports.joinSession = async (req, res, next) => {
  try {
    const session = await DiningSession.findById(req.params.sessionId);
    if (!session || session.status !== SESSION_STATUS_OPEN) {
      return res.status(404).json({ success: false, message: "session_not_found" });
    }

    const passcode = String(req.body.passcode || "").trim();
    if (!/^\d{6}$/.test(passcode)) {
      return res.status(400).json({ success: false, message: "passcode_required" });
    }

    const matches = await bcrypt.compare(passcode, session.passcodeHash);
    if (!matches) {
      return res.status(403).json({ success: false, message: "invalid_passcode" });
    }

    const guestId = randomGuestId();
    session.guests.push({ guestId, role: "guest" });
    session.lastActivityAt = new Date();
    await session.save();

    res.json({
      success: true,
      guestToken: signGuestToken(session, guestId, "guest"),
      role: "guest",
      session: serializeSession(session),
    });
  } catch (error) {
    next(error);
  }
};

exports.createSessionOrder = async (req, res, next) => {
  try {
    const joined = await verifyGuestToken(req, req.params.sessionId);
    if (!joined) return res.status(401).json({ success: false, message: "session_join_required" });

    const session = joined.session;
    const table = await DiningTable.findById(session.tableId);
    if (!table || !table.isActive) {
      return res.status(404).json({ success: false, message: "table_not_found" });
    }

    const priced = await priceOrderPayload({
      restaurantId: String(session.restaurantId),
      mode: "dine_in",
      cart: Array.isArray(req.body.cart) ? req.body.cart : [],
      tipCents: req.body.tipCents || 0,
    });
    const orderNumber = await generateOrderNumber();
    const order = await Order.create(
      buildDineInOrderDocument({
        priced,
        orderNumber,
        session,
        table,
        guestId: joined.guestId,
      })
    );

    session.orderIds.push(order._id);
    session.lastActivityAt = new Date();
    await session.save();

    broadcastOrderEvent(order.restaurant.restaurantId, "order.created", {
      order,
      playTone: true,
      dineIn: {
        sessionId: String(session._id),
        tableNumber: table.tableNumber,
      },
    });
    sendRestaurantOrderPushSafe(order, "order.created");

    res.status(201).json({ success: true, order });
  } catch (error) {
    if (error instanceof OrderValidationError) {
      return res.status(error.status).json({
        success: false,
        code: error.code,
        message: error.message,
        ...error.details,
      });
    }
    next(error);
  }
};
