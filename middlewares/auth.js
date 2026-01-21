const jwt = require("jsonwebtoken");
const AdminUser = require("../modals/AdminUser");
const { Restaurant } = require("../modals/Restaurant");
const Customer = require("../modals/Customer");

exports.verifyToken = async (req, res, next) => {
  // 📦 Get token from cookie OR Authorization header
  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies?.token;

  let token;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1]; // From Postman / API clients
  } else if (cookieToken) {
    token = cookieToken; // From frontend HttpOnly cookie
  }

  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 🔍 Check if admin
    const adminUser = await AdminUser.findById(decoded.id);
    if (adminUser && adminUser.isActive) {
      if (decoded.tokenVersion !== adminUser.tokenVersion) {
        return res
          .status(401)
          .json({ message: "Session expired. Please log in again." });
      }

      req.user = {
        ...adminUser.toObject(),
        role: adminUser.role,
        tokenVersion: decoded.tokenVersion,
      };
      console.log("✅ Authenticated as Admin:", adminUser.email);
      return next();
    }

    // 🔍 Check if restaurant
    const restaurant = await Restaurant.findById(decoded.id);
    if (restaurant && restaurant.isActive) {
      if (decoded.tokenVersion !== restaurant.tokenVersion) {
        return res
          .status(401)
          .json({ message: "Session expired. Please log in again." });
      }

      req.user = {
        ...restaurant.toObject(),
        role: "restaurant",
        tokenVersion: decoded.tokenVersion,
      };
      console.log("✅ Authenticated as Restaurant:", restaurant.email);
      return next();
    }

    // 🔍 Check if customer
    const customer = await Customer.findById(decoded.id);
    if (customer && customer.isActive) {
      if (decoded.tokenVersion !== customer.tokenVersion) {
        return res
          .status(401)
          .json({ message: "Session expired. Please log in again." });
      }

      req.user = {
        ...customer.toObject(),
        role: "customer",
        tokenVersion: decoded.tokenVersion,
      };
      console.log("✅ Authenticated as Customer:", customer.email);
      return next();
    }

    return res.status(403).json({ message: "Invalid or inactive user" });
  } catch (error) {
    console.error("❌ Token verification error:", error.message);
    return res.status(401).json({ message: "Unauthorized token" });
  }
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

exports.canManageMenuCategory = (req, res, next) => {
  const adminRoles = ["superadmin", "admin", "moderator"];
  const { restaurantId } = req.params;

  // ✅ Admin users
  if (adminRoles.includes(req.user.role)) {
    return next();
  }

  // ✅ Logged-in restaurant (must match the route ID)
  if (
    req.user.role === "restaurant" &&
    req.user._id.toString() === restaurantId
  ) {
    return next();
  }

  // Not allowed
  return res.status(403).json({ message: "Access denied: Not authorized" });
};

//loggedIn admin
exports.loggedInAdmin = (req, res, next) => {
  const allowedRoles = ["superadmin", "admin", "sales", "moderator"];

  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return res
      .status(403)
      .json({ message: "Access denied: Not an authorized admin user" });
  }

  next();
};

//loggedIn restaurant
exports.isRestaurantSelf = (req, res, next) => {
  if (req.user.role !== "restaurant") {
    return res.status(403).json({ message: "Access denied" });
  }
  next();
};

//loggedIn customer
exports.isCustomer = (req, res, next) => {
  if (req.user.role !== "customer") {
    return res.status(403).json({ message: "Access denied: Customer only" });
  }
  next();
};
