const jwt = require("jsonwebtoken");
const AdminUser = require("../modals/AdminUser");
const AppUser = require("../modals/AppUser");
const RestaurantStaff = require("../modals/RestaurantStaff");
const { Restaurant } = require("../modals/Restaurant");
const {
  canViewPlatformAudit,
  getRestaurantIdFromUser,
  isRestaurantAdminRole,
  isRestaurantOrderRole,
  isRestaurantStaffRole,
  isPlatformStaffRole,
  normalizeLegacyRole,
  userBelongsToRestaurant,
} = require("../utils/restaurantRoles");

async function loadAdminUser(decoded) {
  const userId = decoded.sub || decoded.id;
  const adminUser = await AdminUser.findById(userId);
  if (!adminUser || !adminUser.isActive) return null;
  if (decoded.tokenVersion !== adminUser.tokenVersion) {
    return { expired: true };
  }
  return {
    ...adminUser.toObject(),
    role: adminUser.role,
    tokenVersion: decoded.tokenVersion,
  };
}

async function loadRestaurantStaffUser(decoded) {
  const staffId = decoded.sub || decoded.id;
  const staff = await RestaurantStaff.findById(staffId);
  if (!staff || !staff.isActive) return null;
  if (decoded.tokenVersion !== staff.tokenVersion) {
    return { expired: true };
  }

  const restaurant = await Restaurant.findById(staff.restaurantId).select(
    "isActive restaurant_name modules"
  );
  if (!restaurant || !restaurant.isActive) return null;

  return {
    _id: staff._id,
    staffId: staff._id,
    restaurantId: staff.restaurantId,
    name: staff.name,
    email: staff.email,
    role: staff.role,
    tokenVersion: decoded.tokenVersion,
    principalType: "restaurant-staff",
    restaurant,
  };
}

async function loadLegacyRestaurantUser(decoded) {
  const restaurantId = decoded.sub || decoded.id;
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant || !restaurant.isActive) return null;
  if (decoded.tokenVersion !== restaurant.tokenVersion) {
    return { expired: true };
  }

  return {
    ...restaurant.toObject(),
    role: "restaurant",
    restaurantId: restaurant._id,
    staffId: null,
    principalType: "restaurant-legacy",
    tokenVersion: decoded.tokenVersion,
  };
}

async function resolveRestaurantPrincipal(decoded, tokenSource) {
  if (decoded.principalType === "restaurant-staff") {
    return loadRestaurantStaffUser(decoded);
  }

  if (decoded.principalType === "admin") {
    return null;
  }

  if (decoded.role === "restaurant" || tokenSource === "restaurant") {
    if (decoded.principalType === "restaurant-staff") {
      return loadRestaurantStaffUser(decoded);
    }
    return loadLegacyRestaurantUser(decoded);
  }

  if (decoded.principalType === "restaurant-staff") {
    return loadRestaurantStaffUser(decoded);
  }

  return null;
}

exports.verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const adminCookieToken = req.cookies?.bo_ad_token;
  const restaurantCookieToken = req.cookies?.bo_re_token;
  const appUserCookieToken = req.cookies?.bo_app_token;
  const legacyCookieToken = req.cookies?.token;

  let token;
  /** @type {"admin" | "restaurant" | "app-user" | "bearer" | "legacy" | null} */
  let tokenSource = null;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
    tokenSource = "bearer";
  } else if (adminCookieToken) {
    token = adminCookieToken;
    tokenSource = "admin";
  } else if (restaurantCookieToken) {
    token = restaurantCookieToken;
    tokenSource = "restaurant";
  } else if (appUserCookieToken) {
    token = appUserCookieToken;
    tokenSource = "app-user";
  } else if (legacyCookieToken) {
    token = legacyCookieToken;
    tokenSource = "legacy";
  }

  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (tokenSource === "admin") {
      const adminUser = await loadAdminUser(decoded);
      if (adminUser?.expired) {
        return res.status(401).json({ message: "Session expired. Please log in again." });
      }
      if (adminUser) {
        req.user = adminUser;
        return next();
      }
      return res.status(403).json({ message: "Invalid or inactive user" });
    }

    if (tokenSource === "restaurant") {
      const restaurantUser = await resolveRestaurantPrincipal(decoded, tokenSource);
      if (restaurantUser?.expired) {
        return res.status(401).json({ message: "Session expired. Please log in again." });
      }
      if (restaurantUser) {
        req.user = restaurantUser;
        return next();
      }
      return res.status(403).json({ message: "Invalid or inactive user" });
    }

    if (tokenSource === "app-user") {
      const appUser = await AppUser.findById(decoded.sub || decoded.id);
      if (appUser && appUser.isActive) {
        if (decoded.tokenVersion !== appUser.tokenVersion) {
          return res.status(401).json({ message: "Session expired. Please log in again." });
        }
        req.user = {
          ...appUser.toObject(),
          role: "app-user",
          tokenVersion: decoded.tokenVersion,
        };
        return next();
      }
      return res.status(403).json({ message: "Invalid or inactive user" });
    }

    if (decoded.principalType === "restaurant-staff") {
      const restaurantUser = await loadRestaurantStaffUser(decoded);
      if (restaurantUser?.expired) {
        return res.status(401).json({ message: "Session expired. Please log in again." });
      }
      if (restaurantUser) {
        req.user = restaurantUser;
        return next();
      }
    }

    if (decoded.principalType === "admin" || decoded.role !== "restaurant") {
      const adminUser = await loadAdminUser(decoded);
      if (adminUser?.expired) {
        return res.status(401).json({ message: "Session expired. Please log in again." });
      }
      if (adminUser) {
        req.user = adminUser;
        return next();
      }
    }

    if (decoded.role === "restaurant") {
      const restaurantUser = await resolveRestaurantPrincipal(decoded, tokenSource);
      if (restaurantUser?.expired) {
        return res.status(401).json({ message: "Session expired. Please log in again." });
      }
      if (restaurantUser) {
        req.user = restaurantUser;
        return next();
      }
    }

    const appUser = await AppUser.findById(decoded.sub || decoded.id);
    if (appUser && appUser.isActive && decoded.tokenVersion === appUser.tokenVersion) {
      req.user = {
        ...appUser.toObject(),
        role: "app-user",
        tokenVersion: decoded.tokenVersion,
      };
      return next();
    }

    return res.status(403).json({ message: "Invalid or inactive user" });
  } catch {
    return res.status(401).json({ message: "Unauthorized token" });
  }
};

exports.optionalAppUserToken = async (req, _res, next) => {
  const authHeader = req.headers.authorization;
  const appUserCookieToken = req.cookies?.bo_app_token;
  const token =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : appUserCookieToken;

  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const appUser = await AppUser.findById(decoded.sub || decoded.id);
    if (
      appUser &&
      appUser.isActive &&
      decoded.tokenVersion === appUser.tokenVersion
    ) {
      req.user = {
        ...appUser.toObject(),
        role: "app-user",
        tokenVersion: decoded.tokenVersion,
      };
    }
  } catch {
    // Guest checkout should continue if an optional app-user token is stale.
  }

  return next();
};

exports.bindRestaurantIdFromBody = (req, res, next) => {
  const restaurantId = req.body?.restaurantId;
  if (!restaurantId) {
    return res.status(400).json({ message: "restaurantId_is_required_in_body" });
  }
  req.params.restaurantId = String(restaurantId);
  next();
};

exports.isSuperAdmin = (req, res, next) => {
  if (req.user.role !== "superadmin") {
    return res.status(403).json({ message: "Only Super Admins are allowed" });
  }
  next();
};

exports.isAdminOrSuperAdmin = (req, res, next) => {
  if (!["admin", "superadmin"].includes(req.user.role)) {
    return res
      .status(403)
      .json({ message: "Only Admins or Super Admins allowed" });
  }
  next();
};

exports.isAdminSuperadminOrSales = (req, res, next) => {
  const allowedRoles = ["admin", "superadmin", "sales"];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ message: "Access denied: Not authorized" });
  }
  next();
};

exports.allAdminUsers = (req, res, next) => {
  const allowed = ["superadmin", "admin", "moderator", "sales"];
  if (!allowed.includes(req.user.role)) {
    return res.status(403).json({ message: "Access denied" });
  }
  next();
};

exports.allAdminUsersOrRestaurant = (req, res, next) => {
  const allowed = [
    "superadmin",
    "admin",
    "moderator",
    "sales",
    "restaurant",
    "restaurant-admin",
    "restaurant-waiter",
    "restaurant-kitchen",
  ];
  if (!allowed.includes(req.user?.role)) {
    return res.status(403).json({ message: "Access denied" });
  }
  next();
};

exports.isRestaurantStaff = (req, res, next) => {
  if (!isRestaurantStaffRole(req.user?.role)) {
    return res.status(403).json({ message: "Access denied" });
  }
  next();
};

exports.requireRestaurantRole =
  (...roles) =>
  (req, res, next) => {
    const normalized = normalizeLegacyRole(req.user?.role);
    const allowed = roles.map((role) =>
      role === "restaurant-admin" ? "restaurant-admin" : role
    );
    if (
      allowed.includes(req.user?.role) ||
      (allowed.includes("restaurant-admin") && req.user?.role === "restaurant")
    ) {
      return next();
    }
    if (allowed.includes(normalized)) {
      return next();
    }
    return res.status(403).json({ message: "Access denied" });
  };

exports.canViewPlatformAudit = (req, res, next) => {
  if (!canViewPlatformAudit(req.user?.role)) {
    return res.status(403).json({ message: "Access denied" });
  }
  next();
};

exports.canManageRestaurantStaffForRestaurant = (req, res, next) => {
  const { restaurantId } = req.params;
  if (isPlatformStaffRole(req.user?.role) && ["superadmin", "admin", "moderator"].includes(req.user.role)) {
    return next();
  }
  if (
    isRestaurantAdminRole(req.user?.role) &&
    userBelongsToRestaurant(req.user, restaurantId)
  ) {
    return next();
  }
  return res.status(403).json({ message: "Access denied" });
};

exports.canManageMenuCategory = (req, res, next) => {
  const { restaurantId } = req.params;

  if (["superadmin", "admin", "moderator"].includes(req.user.role)) {
    return next();
  }

  if (
    isRestaurantAdminRole(req.user.role) &&
    restaurantId &&
    userBelongsToRestaurant(req.user, restaurantId)
  ) {
    return next();
  }

  return res.status(403).json({ message: "Access denied: Not authorized" });
};

exports.canViewRestaurant = (req, res, next) => {
  const { restaurantId } = req.params;

  if (isPlatformStaffRole(req.user.role)) {
    return next();
  }

  if (isRestaurantStaffRole(req.user.role) && userBelongsToRestaurant(req.user, restaurantId)) {
    return next();
  }

  return res.status(403).json({ message: "Access denied: Not authorized" });
};

exports.canManageOrders = (req, res, next) => {
  if (["superadmin", "admin", "moderator"].includes(req.user?.role)) {
    return next();
  }
  if (isRestaurantOrderRole(req.user?.role)) {
    return next();
  }
  return res.status(403).json({ message: "Access denied" });
};

exports.loggedInAdmin = (req, res, next) => {
  const allowedRoles = ["superadmin", "admin", "sales", "moderator"];

  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return res
      .status(403)
      .json({ message: "Access denied: Not an authorized admin user" });
  }

  next();
};

exports.isRestaurantSelf = (req, res, next) => {
  if (!isRestaurantStaffRole(req.user.role)) {
    return res.status(403).json({ message: "Access denied" });
  }
  next();
};

exports.isAppUser = (req, res, next) => {
  if (req.user.role !== "app-user") {
    return res.status(403).json({ message: "Access denied" });
  }
  next();
};

exports.getRestaurantIdFromUser = getRestaurantIdFromUser;
exports.userBelongsToRestaurant = userBelongsToRestaurant;
