const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const RestaurantStaff = require("../modals/RestaurantStaff");
const { Restaurant } = require("../modals/Restaurant");
const {
  getRestaurantIdFromUser,
  isPlatformStaffRole,
  isRestaurantAdminRole,
  normalizeStaffEmail,
  userBelongsToRestaurant,
} = require("../utils/restaurantRoles");
const { assertEmailAvailableForNewStaff } = require("../utils/emailAvailability");
const { getAppModuleConfig } = require("../services/moduleConfigService");
const { modulePayload } = require("../utils/modules");

function signStaffToken(staff) {
  return jwt.sign(
    {
      sub: String(staff._id),
      id: String(staff._id),
      principalType: "restaurant-staff",
      restaurantId: String(staff.restaurantId),
      role: staff.role,
      email: staff.email,
      tokenVersion: staff.tokenVersion,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function signLegacyRestaurantToken(restaurant) {
  return jwt.sign(
    {
      sub: String(restaurant._id),
      id: restaurant._id,
      email: restaurant.email,
      role: "restaurant",
      tokenVersion: restaurant.tokenVersion,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function serializeStaff(staff) {
  const doc = typeof staff.toObject === "function" ? staff.toObject() : staff;
  const { password, ...safe } = doc;
  return safe;
}

async function countActiveAdmins(restaurantId, excludeStaffId = null) {
  const filter = {
    restaurantId,
    role: "restaurant-admin",
    isActive: true,
  };
  if (excludeStaffId) {
    filter._id = { $ne: excludeStaffId };
  }
  return RestaurantStaff.countDocuments(filter);
}

async function buildMePayload(user) {
  const appModules = await getAppModuleConfig();

  if (user.principalType === "restaurant-staff" || user.staffId) {
    const restaurant = await Restaurant.findById(user.restaurantId);
    if (!restaurant) return null;
    const restaurantData = restaurant.toObject();
    const { password, ...safeRestaurant } = restaurantData;
    const modules = modulePayload(restaurantData, appModules);
    return {
      restaurant: safeRestaurant,
      user: {
        _id: String(user._id),
        staffId: String(user.staffId || user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        restaurantId: String(user.restaurantId),
        username: restaurant.username,
        modules,
      },
    };
  }

  const { password, ...restaurantData } = user;
  const modules = modulePayload(restaurantData, appModules);
  return {
    restaurant: restaurantData,
    user: {
      _id: restaurantData._id,
      staffId: null,
      name: restaurantData.restaurant_name,
      email: restaurantData.email,
      role: "restaurant-admin",
      restaurantId: restaurantData._id,
      username: restaurantData.username,
      modules,
    },
  };
}

async function ensureOwnerStaffForRestaurant(restaurantId) {
  const restaurant = await Restaurant.findById(restaurantId).select(
    "email password restaurant_name tokenVersion isActive"
  );
  if (!restaurant?.email) return null;

  const email = normalizeStaffEmail(restaurant.email);
  if (!email) return null;

  const existingForRestaurant = await RestaurantStaff.findOne({
    restaurantId,
    role: "restaurant-admin",
  });
  if (existingForRestaurant) return existingForRestaurant;

  const emailTakenElsewhere = await RestaurantStaff.findOne({
    email,
    restaurantId: { $ne: restaurantId },
  });
  if (emailTakenElsewhere) return null;

  try {
    return await RestaurantStaff.create({
      restaurantId,
      name: restaurant.restaurant_name || "Owner",
      email,
      password: restaurant.password,
      role: "restaurant-admin",
      isActive: restaurant.isActive !== false,
      tokenVersion: restaurant.tokenVersion || 0,
      createdByRole: "owner-sync",
    });
  } catch (error) {
    if (error.code === 11000) {
      return RestaurantStaff.findOne({ restaurantId, email });
    }
    throw error;
  }
}

async function resolveViewerStaffId(user, restaurantId) {
  if (!user) return null;

  if (user.principalType === "restaurant-staff" || user.staffId) {
    const staff = await RestaurantStaff.findOne({
      _id: user.staffId || user._id,
      restaurantId,
    }).select("_id");
    return staff ? String(staff._id) : null;
  }

  if (user.role === "restaurant" || user.role === "restaurant-admin") {
    const userRestaurantId = String(user.restaurantId || user._id || "");
    if (userRestaurantId !== String(restaurantId)) return null;

    const email = normalizeStaffEmail(user.email);
    if (!email) return null;

    const match = await RestaurantStaff.findOne({ restaurantId, email }).select("_id");
    return match ? String(match._id) : null;
  }

  return null;
}

exports.listStaff = async (req, res, next) => {
  try {
    const { restaurantId } = req.params;
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 25, 1), 100);
    const skip = (page - 1) * limit;

    await ensureOwnerStaffForRestaurant(restaurantId);

    const [staff, total] = await Promise.all([
      RestaurantStaff.find({ restaurantId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("-password")
        .lean(),
      RestaurantStaff.countDocuments({ restaurantId }),
    ]);

    const viewerStaffId = await resolveViewerStaffId(req.user, restaurantId);

    return res.json({
      success: true,
      staff,
      viewerStaffId,
      pageInfo: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

exports.createStaff = async (req, res, next) => {
  try {
    const { restaurantId } = req.params;
    const name = String(req.body?.name || "").trim();
    const email = normalizeStaffEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const role = req.body?.role || "restaurant-waiter";

    if (!name || !email || !password) {
      return res.status(400).json({ message: "name_email_password_required" });
    }
    if (!["restaurant-admin", "restaurant-waiter", "restaurant-kitchen"].includes(role)) {
      return res.status(400).json({ message: "invalid_staff_role" });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: "password_too_short" });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "restaurant_not_found" });
    }

    const emailConflict = await assertEmailAvailableForNewStaff(email);
    if (emailConflict.conflict) {
      return res.status(400).json({ message: emailConflict.message });
    }

    const hashed = await bcrypt.hash(password, 10);
    const staff = await RestaurantStaff.create({
      restaurantId,
      name,
      email,
      password: hashed,
      role,
      createdBy: req.user?._id || null,
      createdByRole: req.user?.role || null,
    });

    return res.status(201).json({
      success: true,
      staff: serializeStaff(staff),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "email_already_exists" });
    }
    next(error);
  }
};

exports.updateStaff = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { restaurantId, staffId } = req.params;
    const updates = req.body || {};

    let resultStaff = null;
    await session.withTransaction(async () => {
      const staff = await RestaurantStaff.findOne({
        _id: staffId,
        restaurantId,
      }).session(session);
      if (!staff) {
        throw Object.assign(new Error("not_found"), { status: 404, message: "staff_not_found" });
      }

      if (updates.name !== undefined) {
        staff.name = String(updates.name || "").trim();
      }
      if (updates.role !== undefined) {
        const role = String(updates.role);
        if (!["restaurant-admin", "restaurant-waiter", "restaurant-kitchen"].includes(role)) {
          throw Object.assign(new Error("bad_role"), { status: 400, message: "invalid_staff_role" });
        }
        staff.role = role;
      }
      if (updates.isActive !== undefined) {
        const nextActive = Boolean(updates.isActive);
        if (!nextActive && staff.role === "restaurant-admin" && staff.isActive) {
          const remaining = await RestaurantStaff.countDocuments({
            restaurantId,
            role: "restaurant-admin",
            isActive: true,
            _id: { $ne: staff._id },
          }).session(session);
          if (remaining === 0) {
            throw Object.assign(new Error("last_admin"), {
              status: 409,
              message: "cannot_deactivate_last_restaurant_admin",
            });
          }
        }
        staff.isActive = nextActive;
        if (!nextActive) {
          staff.tokenVersion += 1;
        }
      }

      await staff.save({ session });
      resultStaff = serializeStaff(staff);
    });

    return res.json({ success: true, staff: resultStaff });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    next(error);
  } finally {
    session.endSession();
  }
};

exports.resetStaffPassword = async (req, res, next) => {
  try {
    const { restaurantId, staffId } = req.params;
    const newPassword = String(req.body?.newPassword || req.body?.password || "");

    if (newPassword.length < 8) {
      return res.status(400).json({ message: "password_too_short" });
    }

    const staff = await RestaurantStaff.findOne({ _id: staffId, restaurantId });
    if (!staff) {
      return res.status(404).json({ message: "staff_not_found" });
    }

    staff.password = await bcrypt.hash(newPassword, 10);
    staff.tokenVersion += 1;
    await staff.save();

    return res.json({ success: true, message: "password_updated_successfully" });
  } catch (error) {
    next(error);
  }
};

exports.deactivateStaff = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { restaurantId, staffId } = req.params;

    await session.withTransaction(async () => {
      const staff = await RestaurantStaff.findOne({ _id: staffId, restaurantId }).session(session);
      if (!staff) {
        throw Object.assign(new Error("not_found"), { status: 404, message: "staff_not_found" });
      }

      if (staff.role === "restaurant-admin" && staff.isActive) {
        const remaining = await RestaurantStaff.countDocuments({
          restaurantId,
          role: "restaurant-admin",
          isActive: true,
          _id: { $ne: staff._id },
        }).session(session);
        if (remaining === 0) {
          throw Object.assign(new Error("last_admin"), {
            status: 409,
            message: "cannot_deactivate_last_restaurant_admin",
          });
        }
      }

      staff.isActive = false;
      staff.tokenVersion += 1;
      await staff.save({ session });
    });

    return res.json({ success: true, message: "staff_deactivated" });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    next(error);
  } finally {
    session.endSession();
  }
};

exports.signStaffToken = signStaffToken;
exports.signLegacyRestaurantToken = signLegacyRestaurantToken;
exports.buildMePayload = buildMePayload;
exports.countActiveAdmins = countActiveAdmins;
