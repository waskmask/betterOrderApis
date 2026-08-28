const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isRestaurantStaffRole,
  isRestaurantAdminRole,
  canManagePlatformRestaurantFields,
  getRestaurantIdFromUser,
  normalizeLegacyRole,
} = require("../utils/restaurantRoles");

test("normalizeLegacyRole maps restaurant to restaurant-admin", () => {
  assert.equal(normalizeLegacyRole("restaurant"), "restaurant-admin");
});

test("restaurant staff roles are recognized", () => {
  assert.equal(isRestaurantStaffRole("restaurant-waiter"), true);
  assert.equal(isRestaurantStaffRole("admin"), false);
});

test("restaurant admin roles include legacy restaurant", () => {
  assert.equal(isRestaurantAdminRole("restaurant"), true);
  assert.equal(isRestaurantAdminRole("restaurant-kitchen"), false);
});

test("platform restaurant controls limited to admin roles", () => {
  assert.equal(canManagePlatformRestaurantFields("admin"), true);
  assert.equal(canManagePlatformRestaurantFields("moderator"), false);
});

test("getRestaurantIdFromUser prefers restaurantId on staff", () => {
  assert.equal(
    getRestaurantIdFromUser({
      _id: "staff1",
      restaurantId: "rest1",
      role: "restaurant-waiter",
    }),
    "rest1"
  );
});
