const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeStaffEmail } = require("../utils/restaurantRoles");

test("normalizeStaffEmail lowercases and trims", () => {
  assert.equal(normalizeStaffEmail("  Owner@Example.COM  "), "owner@example.com");
});
