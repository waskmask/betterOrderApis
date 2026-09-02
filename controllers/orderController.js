const crypto = require("crypto");
const Order = require("../modals/Order");
const Counter = require("../modals/Counter");
const { Restaurant } = require("../modals/Restaurant");
const {
  getRestaurantIdFromUser,
  isRestaurantOrderRole,
  isRestaurantStaffRole,
} = require("../utils/restaurantRoles");
const {
  OrderValidationError,
  normalizePostalCode,
  priceOrderPayload,
} = require("../services/orderPricingService");
const {
  addOrderStreamClient,
  broadcastOrderEvent,
} = require("../services/orderRealtimeService");
const { sendRestaurantOrderPushSafe } = require("../services/mobilePushService");
const { buildDiacriticInsensitiveRegex } = require("../utils/searchNormalize");
const { getCurrentBusinessShift } = require("../services/businessShiftService");
const {
  buildHistoryDateFilter,
  buildSearchFilter,
  getOrderAnalytics,
  resolveRestaurantOpeningHours,
} = require("../services/orderAnalyticsService");
const {
  performAcceptOrder,
  tryAutoAcceptOnCreate,
  normalizeAcceptMinutes,
} = require("../services/orderAcceptService");
const { resolveScheduleFields } = require("../services/orderScheduleService");
const { ensureCheckoutAppUser } = require("../services/checkoutAccountService");
const { buildRefundUpdate } = require("../services/paymentRefundService");
const { enqueueOutboxEvent } = require("../services/outboxService");
const { resolveEmailLang } = require("../utils/resolveEmailLang");
const { issueReviewInvite } = require("../services/reviewService");
const {
  enqueueOrderPlacedEmails,
  enqueueOrderRejectedEmail,
} = require("../services/email/orderEmailTriggers");
const {
  resolvePendingExpiresAt,
  getEffectiveOrderStatus,
  canAcceptOrReject,
  isExpiredPending,
  KITCHEN_STALL_STATUSES,
} = require("../services/orderShiftExpiryService");

const LIVE_ORDER_STATUSES = [
  "pending",
  "expired",
  "accepted",
  "preparing",
  "dispatch",
  "out_for_delivery",
  "ready_for_pickup",
];

const TERMINAL_ORDER_STATUSES = ["delivered", "rejected", "cancelled"];

const VALID_ACCEPT_MINUTES = [30, 45, 60, 75, 90, 105, 120];

function isTakeawayOrder(order) {
  return order?.fulfillment?.mode === "takeaway";
}

function getStatusTransitions(order) {
  if (isTakeawayOrder(order)) {
    return {
      accepted: ["preparing", "ready_for_pickup"],
      preparing: ["ready_for_pickup"],
      ready_for_pickup: ["delivered"],
    };
  }
  return {
    accepted: ["preparing", "dispatch", "out_for_delivery"],
    preparing: ["dispatch", "out_for_delivery"],
    dispatch: ["delivered", "out_for_delivery"],
    out_for_delivery: ["delivered"],
  };
}

function getKitchenAllowedStatuses(order) {
  if (isTakeawayOrder(order)) {
    return ["preparing", "ready_for_pickup", "delivered"];
  }
  return ["preparing", "dispatch", "out_for_delivery"];
}

function resolveAcceptTimeoutMinutes(restaurant) {
  const minutes = Number.parseInt(restaurant?.orderSettings?.acceptTimeoutMinutes, 10);
  if (Number.isFinite(minutes) && minutes >= 3 && minutes <= 30) return minutes;
  return 10;
}

function isKitchenRole(role) {
  return role === "restaurant-kitchen";
}

function redactOrderForRole(order, role, restaurantMeta = null, extra = {}) {
  const serialized = serializeOrder(order, restaurantMeta);
  const withMeta = { ...serialized, ...extra };
  if (!isKitchenRole(role)) return withMeta;

  return {
    ...withMeta,
    customer: {
      firstName: "Guest",
      lastName: "",
      email: "",
      phone: "",
    },
    fulfillment: {
      ...serialized.fulfillment,
      deliveryNote: "",
      postalCode: serialized.fulfillment?.mode === "delivery" ? "***" : "",
      address: serialized.fulfillment?.address
        ? {
            street: "",
            postalCode: "",
            city: "",
            floor: "",
            company: "",
          }
        : serialized.fulfillment?.address,
    },
    restaurant: {
      ...serialized.restaurant,
      phoneSnapshot: "",
      emailSnapshot: "",
      addressSnapshot: undefined,
    },
  };
}

function serializeOrder(order, restaurantMeta = null, viewerRole = null) {
  const doc = typeof order.toObject === "function" ? order.toObject() : order;
  const meta =
    restaurantMeta instanceof Map
      ? restaurantMeta.get(String(doc.restaurant?.restaurantId))
      : restaurantMeta;
  return {
    _id: String(doc._id),
    orderNumber: doc.orderNumber,
    customerAccessToken: doc.customerAccessToken,
    status: doc.status,
    restaurant: {
      ...doc.restaurant,
      logoSnapshot: doc.restaurant?.logoSnapshot || meta?.logo || "",
    },
    customer: doc.customer,
    fulfillment: doc.fulfillment,
    payment: doc.payment,
    items: doc.items,
    totals: doc.totals,
    statusHistory: doc.statusHistory,
    pendingExpiresAt: doc.pendingExpiresAt,
    shiftExpiresAt: doc.shiftExpiresAt,
    expiredAt: doc.expiredAt,
    expiredFromStatus: doc.expiredFromStatus || null,
    acceptedVia: doc.acceptedVia || null,
    kitchenReleased: Boolean(
      doc.fulfillment?.fulfillmentType !== "scheduled" || doc.fulfillment?.kitchenReleasedAt
    ),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function rangeToDateFilter(range, from, to) {
  const now = new Date();
  const filter = {};

  if (range === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    filter.$gte = start;
  } else if (range === "week") {
    filter.$gte = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (range === "month") {
    filter.$gte = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  if (from) {
    const parsedFrom = new Date(from);
    if (!Number.isNaN(parsedFrom.getTime())) filter.$gte = parsedFrom;
  }

  if (to) {
    const parsedTo = new Date(to);
    if (!Number.isNaN(parsedTo.getTime())) filter.$lte = parsedTo;
  }

  return Object.keys(filter).length ? filter : null;
}

async function restaurantFilterFromQuery(query) {
  if (query.restaurantId) return query.restaurantId;
  const search = String(query.restaurant || "").trim();
  if (search.length < 2) return null;

  const searchRegex = buildDiacriticInsensitiveRegex(search);
  if (!searchRegex) return null;

  const matches = await Restaurant.find({
    $or: [
      { restaurant_name: { $regex: searchRegex } },
      { username: { $regex: searchRegex } },
    ],
  })
    .select("_id")
    .limit(30)
    .lean();

  return { $in: matches.map((restaurant) => restaurant._id) };
}

async function restaurantMetaForOrders(orders) {
  const restaurantIds = [
    ...new Set(
      orders
        .map((order) => String(order.restaurant?.restaurantId || ""))
        .filter(Boolean)
    ),
  ];

  if (!restaurantIds.length) return new Map();

  const restaurants = await Restaurant.find({ _id: { $in: restaurantIds } })
    .select("_id images.logo restaurant_name")
    .lean();

  return new Map(
    restaurants.map((restaurant) => [
      String(restaurant._id),
      {
        logo: restaurant.images?.logo || "",
        name: restaurant.restaurant_name || "",
      },
    ])
  );
}

function serializePublicOrder(order) {
  const doc = typeof order.toObject === "function" ? order.toObject() : order;
  return {
    _id: String(doc._id),
    orderNumber: doc.orderNumber,
    status: doc.status,
    restaurant: {
      nameSnapshot: doc.restaurant?.nameSnapshot || "",
      phoneSnapshot: doc.restaurant?.phoneSnapshot || "",
      addressSnapshot: doc.restaurant?.addressSnapshot || null,
    },
    customer: {
      firstName: doc.customer?.firstName || "",
      lastName: doc.customer?.lastName || "",
      email: doc.customer?.email || "",
      phone: doc.customer?.phone || "",
    },
    fulfillment: doc.fulfillment,
    payment: doc.payment,
    items: doc.items,
    totals: doc.totals,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function actorFromUser(user) {
  if (!user) return { actorType: "guest", actorId: null };
  return {
    actorType: user.role || "user",
    actorId: user._id || null,
  };
}

function canManageOrder(user, order) {
  if (!user) return false;
  if (["superadmin", "admin", "moderator"].includes(user.role)) return true;
  if (!isRestaurantOrderRole(user.role)) return false;
  const userRestaurantId = getRestaurantIdFromUser(user);
  return userRestaurantId === String(order.restaurant?.restaurantId);
}

function canAcceptRejectOrder(user) {
  if (!user) return false;
  if (["superadmin", "admin", "moderator"].includes(user.role)) return true;
  return ["restaurant", "restaurant-admin", "restaurant-waiter"].includes(user.role);
}

function canKitchenUpdateStatus(user) {
  if (!user) return false;
  if (["superadmin", "admin", "moderator"].includes(user.role)) return true;
  return isRestaurantOrderRole(user.role);
}

function canViewOrderHistory(user) {
  if (!user) return false;
  if (["superadmin", "admin", "moderator"].includes(user.role)) return true;
  return user.role === "restaurant" || user.role === "restaurant-admin";
}

function canViewOrderAnalytics(user) {
  return canViewOrderHistory(user);
}

function randomOrderPrefix() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 4; index += 1) {
    code += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return code;
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
  return `BO${yearCode}${randomOrderPrefix()}`;
}

function normalizePaymentMethod(value, allowedMethods) {
  const method = String(value || "").toLowerCase();
  if (method === "cash" || method === "cod") return "cod";
  if (method === "paypal") return "paypal";
  if (method === "online" || method === "card") return "online";
  return allowedMethods?.[0] || "cod";
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function buildOrderDocument(payload, priced, orderNumber, appUser = null) {
  const restaurant = priced.restaurant;
  const paymentMethod = normalizePaymentMethod(
    payload?.paymentMethod,
    restaurant.payment_methods || ["cod"]
  );

  if (!(restaurant.payment_methods || ["cod"]).includes(paymentMethod)) {
    throw new OrderValidationError("payment_method_unavailable", "Payment method unavailable");
  }

  const customer = payload?.customer || {};
  const address = payload?.address || {};
  const customerEmail = normalizeEmail(
    customer.email || (appUser?.role === "app-user" ? appUser.email : "")
  ).slice(0, 160);

  const schedule = resolveScheduleFields(payload);
  const customerLocale = resolveEmailLang({
    explicit: payload?.lang || customer.locale,
    appUser,
  });

  return {
    orderNumber,
    idempotencyKey: String(payload?.idempotencyKey || "").trim().slice(0, 120),
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
      appUserId: appUser?.role === "app-user" ? appUser._id : null,
      firstName: String(customer.firstName || "").trim().slice(0, 80),
      lastName: String(customer.lastName || "").trim().slice(0, 80),
      email: customerEmail,
      phone: String(customer.phone || "").trim().slice(0, 60),
      locale: customerLocale,
    },
    fulfillment: {
      mode: priced.mode,
      fulfillmentType: schedule.fulfillmentType,
      postalCode: priced.postalCode,
      requestedTime: schedule.requestedTime,
      requestedFor: schedule.requestedFor,
      releaseAt: schedule.releaseAt,
      kitchenReleasedAt: schedule.kitchenReleasedAt,
      deliveryMinutes: priced.deliveryMinutes,
      deliveryNote: String(payload?.deliveryNote || "").trim().slice(0, 500),
      address: {
        street: String(address.street || "").trim().slice(0, 180),
        postalCode: normalizePostalCode(address.postalCode || priced.postalCode),
        city: String(address.city || "").trim().slice(0, 100),
        floor: String(address.floor || "").trim().slice(0, 80),
        company: String(address.company || "").trim().slice(0, 120),
      },
    },
    payment: {
      method: paymentMethod,
      status: paymentMethod === "cod" ? "cash_on_delivery" : "pending",
    },
    items: priced.items,
    totals: priced.totals,
    status: "pending",
    statusHistory: [
      {
        status: "pending",
        actorType: appUser?.role === "app-user" ? "app-user" : "guest",
        actorId: appUser?.role === "app-user" ? appUser._id : null,
        note: schedule.fulfillmentType === "scheduled" ? "Scheduled order placed" : "Order placed",
      },
    ],
  };
}

exports.createOrder = async (req, res) => {
  try {
    const idempotencyKey = String(req.body?.idempotencyKey || "").trim();
    const priced = await priceOrderPayload(req.body || {});

    if (idempotencyKey) {
      const existing = await Order.findOne({
        "restaurant.restaurantId": priced.restaurant._id,
        idempotencyKey,
      });
      if (existing) {
        return res.status(200).json({ success: true, order: serializeOrder(existing), reused: true });
      }
    }

    const payload = req.body || {};
    const paymentMethod = normalizePaymentMethod(
      payload.paymentMethod,
      priced.restaurant.payment_methods || ["cod"]
    );
    if (!(priced.restaurant.payment_methods || ["cod"]).includes(paymentMethod)) {
      throw new OrderValidationError("payment_method_unavailable", "Payment method unavailable");
    }
    resolveScheduleFields(payload);
    const { appUser, session } = await ensureCheckoutAppUser({
      req,
      res,
      payload,
      paymentMethod,
      existingUser: req.user,
    });

    const orderNumber = await generateOrderNumber();
    const orderDoc = buildOrderDocument(payload, priced, orderNumber, appUser);
    orderDoc.pendingExpiresAt = resolvePendingExpiresAt(orderDoc.fulfillment);
    const order = await Order.create(orderDoc);
    const autoAcceptedOrder = await tryAutoAcceptOnCreate(order);
    const effectiveOrder = autoAcceptedOrder || order;
    const eventType = autoAcceptedOrder ? "order.accepted" : "order.created";

    broadcastOrderEvent(effectiveOrder.restaurant.restaurantId, eventType, {
      order: serializeOrder(effectiveOrder),
      playTone: !autoAcceptedOrder,
    });
    sendRestaurantOrderPushSafe(effectiveOrder, eventType);

    void enqueueOrderPlacedEmails(effectiveOrder, {
      autoAccepted: Boolean(autoAcceptedOrder),
    }).catch((error) => {
      console.warn("[order] email enqueue failed:", error.message);
    });

    return res.status(201).json({
      success: true,
      order: serializeOrder(effectiveOrder),
      autoAccepted: Boolean(autoAcceptedOrder),
      accountCreated: Boolean(session),
      token: session?.token,
      user: session?.user,
    });
  } catch (error) {
    if (error?.code === "scheduled_time_required" || error?.code === "scheduled_time_too_soon" || error?.code === "scheduled_time_too_far") {
      return res.status(error.status || 400).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }
    if (error instanceof OrderValidationError) {
      return res.status(error.status).json({
        success: false,
        code: error.code,
        message: error.message,
        ...error.details,
      });
    }

    if (error?.code === 11000 && req.body?.idempotencyKey) {
      const existing = await Order.findOne({ idempotencyKey: req.body.idempotencyKey });
      if (existing) {
        return res.status(200).json({ success: true, order: serializeOrder(existing), reused: true });
      }
    }

    return res.status(500).json({ success: false, message: "Failed to create order" });
  }
};

exports.getPublicOrder = async (req, res) => {
  try {
    const token = String(req.query.token || "").trim();
    const order = await Order.findById(req.params.orderId);
    if (!order || !token || token !== order.customerAccessToken) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    return res.json({ success: true, order: serializePublicOrder(order) });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to load order" });
  }
};

exports.streamRestaurantOrders = async (req, res) => {
  const restaurantId = req.params.restaurantId;
  if (!canManageOrder(req.user, { restaurant: { restaurantId } })) {
    return res.status(403).json({ message: "Access denied" });
  }

  return startOrderStream(req, res, restaurantId);
};

function startOrderStream(req, res, restaurantId) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const cleanup = addOrderStreamClient(restaurantId, res);
  req.on("close", cleanup);
}

exports.streamOrders = async (req, res) => {
  if (isRestaurantStaffRole(req.user?.role)) {
    const restaurantId = getRestaurantIdFromUser(req.user);
    if (restaurantId) {
      return startOrderStream(req, res, restaurantId);
    }
  }

  if (!["superadmin", "admin", "moderator"].includes(req.user?.role)) {
    return res.status(403).json({ message: "Access denied" });
  }

  return startOrderStream(req, res, null);
};

exports.listRestaurantOrders = async (req, res) => {
  try {
    const restaurantId = req.params.restaurantId;
    const filter = { "restaurant.restaurantId": restaurantId };
    if (!canManageOrder(req.user, { restaurant: { restaurantId } })) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (req.query.status && req.query.status !== "all") {
      filter.status = String(req.query.status);
    }
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    return res.json({
      success: true,
      orders: orders.map((order) => redactOrderForRole(order, req.user?.role)),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to load orders" });
  }
};

exports.listOrders = async (req, res) => {
  try {
    const filter = {};
    const view = String(req.query.view || "").trim();
    const isStaff = req.user?.role === "restaurant" || isRestaurantStaffRole(req.user?.role);
    const effectiveView =
      view || (isStaff ? "live" : "");

    if (effectiveView === "history" && !canViewOrderHistory(req.user)) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (isStaff) {
      const restaurantId = getRestaurantIdFromUser(req.user);
      if (restaurantId) {
        filter["restaurant.restaurantId"] = restaurantId;
      }
    } else if (!["superadmin", "admin", "moderator"].includes(req.user?.role)) {
      return res.status(403).json({ message: "Access denied" });
    } else {
      const restaurantFilter = await restaurantFilterFromQuery(req.query);
      if (restaurantFilter) {
        filter["restaurant.restaurantId"] = restaurantFilter;
      }
    }

    if (effectiveView === "live") {
      filter.status = { $in: LIVE_ORDER_STATUSES };
    } else if (effectiveView === "history") {
      const status = String(req.query.status || "").trim();
      if (status === "expired") {
        filter.status = "expired";
      } else if (status === "cancelled") {
        filter.status = { $in: ["cancelled", "rejected"] };
      } else if (status) {
        filter.status = status;
      } else {
        filter.status = { $in: TERMINAL_ORDER_STATUSES };
      }
    } else if (req.query.status) {
      const status = String(req.query.status);
      filter.status = status === "cancelled" ? { $in: ["cancelled", "rejected"] } : status;
    }

    let openingHours = null;
    if (effectiveView === "history") {
      openingHours = await resolveRestaurantOpeningHours(
        req.user,
        filter["restaurant.restaurantId"] || req.query.restaurantId
      );
      const historyDateFilter = buildHistoryDateFilter(
        openingHours,
        String(req.query.range || "today"),
        req.query.from,
        req.query.to
      );
      if (historyDateFilter) filter.createdAt = historyDateFilter;
    } else {
      const createdAtFilter = rangeToDateFilter(
        String(req.query.range || "all"),
        req.query.from,
        req.query.to
      );
      if (createdAtFilter) filter.createdAt = createdAtFilter;
    }

    const searchFilter = buildSearchFilter(req.query.q || req.query.search);
    if (searchFilter) {
      Object.assign(filter, searchFilter);
    }

    if (req.query.cursor) {
      const cursorDate = new Date(String(req.query.cursor));
      if (!Number.isNaN(cursorDate.getTime())) {
        filter.createdAt = { ...(filter.createdAt || {}), $lt: cursorDate };
      }
    }

    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 25, 1), 100);
    const orders = await Order.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean();
    const hasMore = orders.length > limit;
    const visibleOrders = hasMore ? orders.slice(0, limit) : orders;
    const restaurantMeta = await restaurantMetaForOrders(visibleOrders);

    let shiftStart = null;
    if (effectiveView === "live" && isStaff) {
      const staffRestaurantId = getRestaurantIdFromUser(req.user);
      if (staffRestaurantId) {
        const restaurant = await Restaurant.findById(staffRestaurantId)
          .select("opening_hours")
          .lean();
        if (restaurant?.opening_hours) {
          shiftStart = getCurrentBusinessShift(restaurant.opening_hours).shiftStart;
        }
      }
    }

    const nextCursor = hasMore
      ? visibleOrders[visibleOrders.length - 1]?.createdAt?.toISOString?.() || null
      : null;

    return res.json({
      success: true,
      orders: visibleOrders.map((order) => {
        const carriedOver =
          shiftStart && order.createdAt
            ? new Date(order.createdAt).getTime() < new Date(shiftStart).getTime()
            : false;
        return redactOrderForRole(order, req.user?.role, restaurantMeta, { carriedOver });
      }),
      pageInfo: { hasMore, nextCursor },
      view: effectiveView || "all",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to load orders" });
  }
};

exports.getOrderAnalytics = async (req, res) => {
  try {
    if (!canViewOrderAnalytics(req.user)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const isStaff = req.user?.role === "restaurant" || isRestaurantStaffRole(req.user?.role);
    let restaurantId = String(req.query.restaurantId || "").trim();

    if (isStaff) {
      restaurantId = getRestaurantIdFromUser(req.user) || restaurantId;
    } else if (!["superadmin", "admin", "moderator"].includes(req.user?.role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const analytics = await getOrderAnalytics({
      user: req.user,
      restaurantId: restaurantId || null,
      range: String(req.query.range || "today"),
      from: req.query.from,
      to: req.query.to,
      status: req.query.status,
    });

    return res.json({ success: true, analytics });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to load analytics" });
  }
};

exports.getOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (!canManageOrder(req.user, order)) return res.status(403).json({ message: "Access denied" });
    return res.json({
      success: true,
      order: redactOrderForRole(order, req.user?.role),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to load order" });
  }
};

exports.acceptOrder = async (req, res) => {
  try {
    if (!canAcceptRejectOrder(req.user)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const existing = await Order.findById(req.params.orderId);
    if (!existing) return res.status(404).json({ message: "Order not found" });
    if (!canManageOrder(req.user, existing)) return res.status(403).json({ message: "Access denied" });

    const deliveryMinutes = Number.parseInt(req.body?.deliveryMinutes, 10);
    const isScheduled = existing.fulfillment?.fulfillmentType === "scheduled";
    if (!canAcceptOrReject(existing)) {
      return res.status(409).json({ message: "order_already_handled" });
    }
    if (!isScheduled && !normalizeAcceptMinutes(deliveryMinutes)) {
      return res.status(400).json({ message: "invalid_delivery_time" });
    }

    const result = await performAcceptOrder({
      orderId: req.params.orderId,
      deliveryMinutes: isScheduled ? null : deliveryMinutes,
      actor: actorFromUser(req.user),
      note: String(req.body?.note || "").trim().slice(0, 300),
      acceptedVia: "manual",
      playTone: false,
    });

    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }

    return res.json({
      success: true,
      order: serializeOrder(result.order),
      printJobId: result.printJob?._id ? String(result.printJob._id) : null,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to accept order" });
  }
};

exports.rejectOrder = async (req, res) => {
  try {
    if (!canAcceptRejectOrder(req.user)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const existing = await Order.findById(req.params.orderId);
    if (!existing) return res.status(404).json({ message: "Order not found" });
    if (!canManageOrder(req.user, existing)) return res.status(403).json({ message: "Access denied" });

    const reason = String(req.body?.reason || "").trim().slice(0, 300);
    const actor = actorFromUser(req.user);
    if (!canAcceptOrReject(existing)) {
      return res.status(409).json({ message: "order_already_handled" });
    }

    const dismissExpired = isExpiredPending(existing);
    const refundFields = buildRefundUpdate(existing, reason) || {};
    const order = await Order.findOneAndUpdate(
      {
        _id: req.params.orderId,
        $or: [{ status: "pending" }, { status: "expired", expiredFromStatus: "pending" }],
      },
      {
        $set: {
          status: dismissExpired ? "cancelled" : "rejected",
          rejectedAt: new Date(),
          rejectReason: reason || (dismissExpired ? "expired_cancelled" : ""),
          ...(dismissExpired ? { completedAt: new Date() } : {}),
          ...refundFields,
        },
        $unset: { pendingExpiresAt: "", expiredAt: "", expiredFromStatus: "" },
        $push: {
          statusHistory: {
            status: dismissExpired ? "cancelled" : "rejected",
            ...actor,
            note: reason || (dismissExpired ? "expired_cancelled" : ""),
          },
        },
      },
      { new: true }
    );

    if (!order) {
      return res.status(409).json({ message: "order_already_handled" });
    }

    if (refundFields["payment.status"] === "refund_pending") {
      await enqueueOutboxEvent({
        type: "customer.notify",
        restaurantId: order.restaurant.restaurantId,
        orderId: order._id,
        payload: { channel: "refund", reason },
        idempotencyKey: `notify:refund:${order._id}`,
      });
    }

    broadcastOrderEvent(
      order.restaurant.restaurantId,
      dismissExpired ? "order.cancelled" : "order.rejected",
      {
        order: serializeOrder(order),
        playTone: false,
      }
    );

    void enqueueOrderRejectedEmail(order, reason).catch((error) => {
      console.warn("[order] reject email failed:", error.message);
    });

    return res.json({ success: true, order: serializeOrder(order) });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to reject order" });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const nextStatus = String(req.body?.status || "").trim();
    const isKitchen = isKitchenRole(req.user?.role);

    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (!canManageOrder(req.user, order)) return res.status(403).json({ message: "Access denied" });

    if (isKitchen && !getKitchenAllowedStatuses(order).includes(nextStatus)) {
      return res.status(403).json({ message: "kitchen_status_forbidden" });
    }

    const effectiveStatus = getEffectiveOrderStatus(order);
    const allowedNext = getStatusTransitions(order)[effectiveStatus] || [];
    if (!allowedNext.includes(nextStatus)) {
      return res.status(409).json({ message: "invalid_status_transition" });
    }

    const actor = actorFromUser(req.user);
    const historyEntry = {
      status: nextStatus,
      ...actor,
      note: String(req.body?.note || "").trim().slice(0, 300),
    };

    const update = {
      $set: { status: nextStatus },
      $push: { statusHistory: historyEntry },
    };

    if (order.status === "expired") {
      update.$unset = { expiredAt: "", expiredFromStatus: "" };
      update.$set.rejectReason = "";
    }

    if (nextStatus === "delivered") {
      update.$set.completedAt = new Date();
    }

    if (nextStatus === "out_for_delivery") {
      const parsedDispatchMinutes = Number.parseInt(req.body?.dispatchEtaMinutes, 10);
      const dispatchMinutes = [10, 15].includes(parsedDispatchMinutes) ? parsedDispatchMinutes : null;
      update.$set["fulfillment.dispatchDeliveryMinutes"] = dispatchMinutes;
      update.$set["fulfillment.dispatchEtaAt"] = dispatchMinutes
        ? new Date(Date.now() + dispatchMinutes * 60 * 1000)
        : null;
      historyEntry.deliveryMinutes = dispatchMinutes;
    }

    const updated = await Order.findOneAndUpdate(
      {
        _id: req.params.orderId,
        $or: [{ status: order.status }, { status: "expired", expiredFromStatus: effectiveStatus }],
      },
      update,
      { new: true }
    );

    if (!updated) {
      return res.status(409).json({ message: "invalid_status_transition" });
    }

    broadcastOrderEvent(updated.restaurant.restaurantId, `order.${nextStatus}`, {
      order: serializeOrder(updated),
      playTone: false,
    });

    if (nextStatus === "delivered") {
      void issueReviewInvite(updated).catch((error) => {
        console.warn("[order] review invite failed:", error.message);
      });
    }

    return res.json({ success: true, order: serializeOrder(updated) });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to update order status" });
  }
};
