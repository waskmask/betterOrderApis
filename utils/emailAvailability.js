const AdminUser = require("../modals/AdminUser");
const RestaurantStaff = require("../modals/RestaurantStaff");
const { Restaurant } = require("../modals/Restaurant");
const { normalizeStaffEmail } = require("./restaurantRoles");

/**
 * Check whether an email is free for a new RestaurantStaff account across
 * staff, legacy restaurant logins, and platform admin users.
 */
async function findStaffEmailConflict(email) {
  const normalized = normalizeStaffEmail(email);
  if (!normalized) {
    return { conflict: true, message: "invalid_email", source: "invalid" };
  }

  const [existingStaff, existingAdmin, existingRestaurant] = await Promise.all([
    RestaurantStaff.findOne({ email: normalized }).select("_id restaurantId").lean(),
    AdminUser.findOne({ email: normalized }).select("_id").lean(),
    Restaurant.findOne({ email: normalized }).select("_id restaurant_name").lean(),
  ]);

  if (existingStaff) {
    return {
      conflict: true,
      message: "email_already_exists",
      source: "staff",
    };
  }

  if (existingAdmin) {
    return {
      conflict: true,
      message: "email_used_by_platform_admin",
      source: "admin",
    };
  }

  if (existingRestaurant) {
    return {
      conflict: true,
      message: "email_used_by_restaurant",
      source: "restaurant",
    };
  }

  return { conflict: false, message: null, source: null };
}

async function assertEmailAvailableForNewStaff(email) {
  return findStaffEmailConflict(email);
}

module.exports = {
  findStaffEmailConflict,
  assertEmailAvailableForNewStaff,
};
