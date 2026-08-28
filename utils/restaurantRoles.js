const RESTAURANT_STAFF_ROLES = [
  "restaurant",
  "restaurant-admin",
  "restaurant-waiter",
  "restaurant-kitchen",
];

const RESTAURANT_ADMIN_ROLES = ["restaurant", "restaurant-admin"];

const RESTAURANT_ORDER_ROLES = [
  "restaurant",
  "restaurant-admin",
  "restaurant-waiter",
  "restaurant-kitchen",
];

const PLATFORM_STAFF_ROLES = ["superadmin", "admin", "moderator", "sales"];

const PLATFORM_AUDIT_ROLES = ["superadmin", "admin", "moderator"];

const PLATFORM_RESTAURANT_CONTROL_ROLES = ["superadmin", "admin"];

const PLATFORM_STAFF_MANAGEMENT_ROLES = ["superadmin", "admin", "moderator"];

function normalizeLegacyRole(role) {
  if (role === "restaurant") return "restaurant-admin";
  return role;
}

function isRestaurantStaffRole(role) {
  return RESTAURANT_STAFF_ROLES.includes(role);
}

function isRestaurantAdminRole(role) {
  return RESTAURANT_ADMIN_ROLES.includes(role);
}

function isRestaurantOrderRole(role) {
  return RESTAURANT_ORDER_ROLES.includes(role);
}

function isPlatformStaffRole(role) {
  return PLATFORM_STAFF_ROLES.includes(role);
}

function canManagePlatformRestaurantFields(role) {
  return PLATFORM_RESTAURANT_CONTROL_ROLES.includes(role);
}

function canViewPlatformAudit(role) {
  return PLATFORM_AUDIT_ROLES.includes(role);
}

function canManagePlatformStaff(role) {
  return PLATFORM_STAFF_MANAGEMENT_ROLES.includes(role);
}

function getRestaurantIdFromUser(user) {
  if (!user) return "";
  if (user.restaurantId) return String(user.restaurantId);
  if (isRestaurantStaffRole(user.role) && user._id && !user.staffId) {
    return String(user._id);
  }
  return "";
}

function userBelongsToRestaurant(user, restaurantId) {
  if (!user || !restaurantId) return false;
  if (isPlatformStaffRole(user.role)) return true;
  return getRestaurantIdFromUser(user) === String(restaurantId);
}

function normalizeStaffEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

module.exports = {
  RESTAURANT_STAFF_ROLES,
  RESTAURANT_ADMIN_ROLES,
  RESTAURANT_ORDER_ROLES,
  PLATFORM_STAFF_ROLES,
  PLATFORM_AUDIT_ROLES,
  PLATFORM_RESTAURANT_CONTROL_ROLES,
  PLATFORM_STAFF_MANAGEMENT_ROLES,
  normalizeLegacyRole,
  isRestaurantStaffRole,
  isRestaurantAdminRole,
  isRestaurantOrderRole,
  isPlatformStaffRole,
  canManagePlatformRestaurantFields,
  canViewPlatformAudit,
  canManagePlatformStaff,
  getRestaurantIdFromUser,
  userBelongsToRestaurant,
  normalizeStaffEmail,
};
