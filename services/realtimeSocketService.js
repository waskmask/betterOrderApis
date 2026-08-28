const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const AdminUser = require("../modals/AdminUser");
const RestaurantStaff = require("../modals/RestaurantStaff");
const { Restaurant } = require("../modals/Restaurant");
const {
  isRestaurantAdminRole,
  isRestaurantStaffRole,
} = require("../utils/restaurantRoles");

/** @type {import("socket.io").Server | null} */
let io = null;

const PLATFORM_ROOM = "platform:ops";

function restaurantRoom(restaurantId) {
  return `restaurant:${String(restaurantId)}`;
}

async function resolveSocketPrincipal(token) {
  if (!token || !process.env.JWT_SECRET) return null;

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }

  if (decoded.principalType === "admin" || ["superadmin", "admin", "moderator", "sales"].includes(decoded.role)) {
    const admin = await AdminUser.findById(decoded.sub || decoded.id);
    if (!admin || !admin.isActive) return null;
    if (decoded.tokenVersion !== admin.tokenVersion) return null;
    return {
      principalType: "admin",
      role: admin.role,
      adminId: String(admin._id),
      restaurantId: null,
    };
  }

  if (decoded.principalType === "restaurant-staff") {
    const staff = await RestaurantStaff.findById(decoded.sub || decoded.id);
    if (!staff || !staff.isActive) return null;
    if (decoded.tokenVersion !== staff.tokenVersion) return null;

    const restaurant = await Restaurant.findById(staff.restaurantId).select("isActive");
    if (!restaurant || !restaurant.isActive) return null;

    return {
      principalType: "restaurant-staff",
      restaurantId: String(staff.restaurantId),
      staffId: String(staff._id),
      role: staff.role,
    };
  }

  if (decoded.role === "restaurant" || decoded.principalType === "restaurant-legacy") {
    const restaurant = await Restaurant.findById(decoded.sub || decoded.id);
    if (!restaurant || !restaurant.isActive) return null;
    if (decoded.tokenVersion !== restaurant.tokenVersion) return null;

    return {
      principalType: "restaurant-legacy",
      restaurantId: String(restaurant._id),
      staffId: null,
      role: "restaurant",
    };
  }

  return null;
}

function initRealtimeSocket(httpServer, { corsOrigins = [] } = {}) {
  io = new Server(httpServer, {
    path: "/socket.io",
    cors: {
      origin: corsOrigins,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token ||
        (socket.handshake.headers.authorization || "").replace(/^Bearer\s+/i, "");

      const principal = await resolveSocketPrincipal(token);
      if (!principal) {
        return next(new Error("unauthorized"));
      }

      const isPlatform =
        principal.principalType === "admin" &&
        ["superadmin", "admin", "moderator"].includes(principal.role);
      const isRestaurant =
        isRestaurantStaffRole(principal.role) || isRestaurantAdminRole(principal.role);

      if (!isPlatform && !isRestaurant) {
        return next(new Error("unauthorized"));
      }

      socket.data.principal = principal;
      return next();
    } catch (error) {
      return next(error);
    }
  });

  io.on("connection", (socket) => {
    const principal = socket.data.principal;
    if (!principal) {
      socket.disconnect(true);
      return;
    }

    if (principal.principalType === "admin") {
      socket.join(PLATFORM_ROOM);
      socket.emit("session:connected", {
        scope: "platform",
        role: principal.role,
      });
      return;
    }

    if (!principal.restaurantId) {
      socket.disconnect(true);
      return;
    }

    socket.join(restaurantRoom(principal.restaurantId));
    socket.emit("session:connected", {
      restaurantId: principal.restaurantId,
      role: principal.role,
    });
  });

  return io;
}

function emitRestaurantForceLogout(restaurantId, payload = {}) {
  if (!io || !restaurantId) return;
  io.to(restaurantRoom(restaurantId)).emit("session:force_logout", {
    reason: payload.reason || "restaurant_deactivated",
    restaurantId: String(restaurantId),
    at: new Date().toISOString(),
  });
}

function emitPlatformPublishRequest(payload = {}) {
  if (!io) return;
  io.to(PLATFORM_ROOM).emit("restaurant:publish_requested", {
    ...payload,
    at: new Date().toISOString(),
  });
}

function getRealtimeSocket() {
  return io;
}

module.exports = {
  initRealtimeSocket,
  emitRestaurantForceLogout,
  emitPlatformPublishRequest,
  getRealtimeSocket,
  restaurantRoom,
  PLATFORM_ROOM,
};
