const { Restaurant } = require("../modals/Restaurant");
const RestaurantStaff = require("../modals/RestaurantStaff");
const bcrypt = require("bcryptjs");
const { normalizeStaffEmail } = require("../utils/restaurantRoles");
const {
  getPlatformSettings,
} = require("../services/platformSettingsService");
const {
  signLegacyRestaurantToken,
  signStaffToken,
  buildMePayload,
} = require("./restaurantStaffController");

async function inactiveAccountResponse(res) {
  const settings = await getPlatformSettings().catch(() => null);
  return res.status(403).json({
    success: false,
    message: "restaurant_account_inactive",
    supportContacts: {
      supportEmail: settings?.supportEmail || "",
      supportPhone: settings?.supportPhone || "",
      supportWhatsapp: settings?.supportWhatsapp || "",
    },
  });
}

exports.login = async (req, res, next) => {
  try {
    const email = normalizeStaffEmail(req.body?.email);
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ message: "invalid_credentials" });
    }

    const staff = await RestaurantStaff.findOne({ email });
    if (staff) {
      const isMatch = await bcrypt.compare(password, staff.password);
      if (!isMatch) {
        return res.status(401).json({ message: "invalid_credentials" });
      }

      if (!staff.isActive) {
        return inactiveAccountResponse(res);
      }

      const restaurant = await Restaurant.findById(staff.restaurantId);
      if (!restaurant || !restaurant.isActive) {
        return inactiveAccountResponse(res);
      }

      const token = signStaffToken(staff);

      res.cookie("bo_re_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      const { password: _, ...staffData } = staff.toObject();
      return res.status(200).json({
        message: "Login successful",
        token,
        staff: staffData,
        user: {
          _id: String(staff._id),
          staffId: String(staff._id),
          name: staff.name,
          email: staff.email,
          role: staff.role,
          restaurantId: String(staff.restaurantId),
        },
      });
    }

    const restaurant = await Restaurant.findOne({ email });
    if (!restaurant) {
      return res.status(401).json({ message: "invalid_credentials" });
    }

    const isMatch = await bcrypt.compare(password, restaurant.password);
    if (!isMatch) {
      return res.status(401).json({ message: "invalid_credentials" });
    }

    if (!restaurant.isActive) {
      return inactiveAccountResponse(res);
    }

    const token = signLegacyRestaurantToken(restaurant);
    const { password: __, ...restaurantData } = restaurant.toObject();

    res.cookie("bo_re_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      message: "Login successful",
      token,
      restaurant: restaurantData,
      user: {
        _id: restaurantData._id,
        staffId: null,
        name: restaurantData.restaurant_name,
        email: restaurantData.email,
        role: "restaurant-admin",
        restaurantId: restaurantData._id,
        username: restaurantData.username,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.me = async (req, res) => {
  const payload = await buildMePayload(req.user);
  if (!payload) {
    return res.status(404).json({ message: "restaurant_not_found" });
  }
  return res.status(200).json({
    success: true,
    ...payload,
  });
};

exports.changePassword = async (req, res, next) => {
  try {
    const { restaurantId, newPassword, currentPassword } = req.body;
    const requester = req.user;

    if (!newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ message: "password_too_short" });
    }

    if (requester.principalType === "restaurant-staff" || requester.staffId) {
      const staff = await RestaurantStaff.findById(requester.staffId || requester._id);
      if (!staff || String(staff.restaurantId) !== String(restaurantId)) {
        return res.status(403).json({ message: "not_authorized_to_change_password" });
      }

      if (currentPassword) {
        const matches = await bcrypt.compare(String(currentPassword), staff.password);
        if (!matches) {
          return res.status(401).json({ message: "incorrect_current_password" });
        }
      }

      staff.password = await bcrypt.hash(String(newPassword), 10);
      staff.tokenVersion += 1;
      await staff.save();
      return res.status(200).json({ message: "password_updated_successfully" });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "restaurant_not_found" });
    }

    const isSuperAdmin = requester.role === "superadmin";
    const isSelf =
      requester.role === "restaurant" &&
      String(requester._id) === String(restaurantId) &&
      requester.tokenVersion === restaurant.tokenVersion;

    if (!isSuperAdmin && !isSelf) {
      return res.status(403).json({ message: "not_authorized_to_change_password" });
    }

    const hashed = await bcrypt.hash(String(newPassword), 10);
    restaurant.password = hashed;
    restaurant.tokenVersion += 1;

    const newLogEntry = {
      reset_by: req.user._id,
      reset_by_role: req.user.role === "restaurant" ? "self" : req.user.role,
      timestamp: new Date(),
    };

    restaurant.password_reset_logs = restaurant.password_reset_logs.slice(-19);
    restaurant.password_reset_logs.push(newLogEntry);

    await restaurant.save();

    return res.status(200).json({ message: "password_updated_successfully" });
  } catch (err) {
    next(err);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { restaurantId, newPassword } = req.body;

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "restaurant_not_found" });
    }

    const hashed = await bcrypt.hash(String(newPassword), 10);
    restaurant.password = hashed;
    restaurant.tokenVersion += 1;

    const newLogEntry = {
      reset_by: req.user._id,
      reset_by_role: req.user.role === "restaurant" ? "self" : req.user.role,
      timestamp: new Date(),
    };

    restaurant.password_reset_logs = restaurant.password_reset_logs.slice(-19);
    restaurant.password_reset_logs.push(newLogEntry);

    await restaurant.save();

    res.status(200).json({ success: true, message: "password_reset_by_superadmin" });
  } catch (err) {
    next(err);
  }
};
