const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createRestaurantPairing,
  validateRestaurantPairing,
  issueAgentCredentials,
  normalizePairingCode,
} = require("../services/printPairingService");

function mockRestaurant() {
  return {
    _id: "rest123",
    restaurant_name: "Test Kitchen",
    printAgentPairingCodeHash: "",
    printAgentPairingExpiresAt: null,
    printAgentTokenHash: "",
  };
}

test("createRestaurantPairing stores hash and returns 6-char code", () => {
  const restaurant = mockRestaurant();
  const pairing = createRestaurantPairing(restaurant);

  assert.match(pairing.code, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
  assert.ok(restaurant.printAgentPairingCodeHash);
  assert.ok(restaurant.printAgentPairingExpiresAt instanceof Date);
  assert.equal(pairing.expiresAt, restaurant.printAgentPairingExpiresAt);
});

test("validateRestaurantPairing accepts valid code", () => {
  const restaurant = mockRestaurant();
  const pairing = createRestaurantPairing(restaurant);
  const validation = validateRestaurantPairing(restaurant, pairing.code);

  assert.equal(validation.ok, true);
  assert.equal(validation.normalizedCode, normalizePairingCode(pairing.code));
});

test("validateRestaurantPairing rejects expired code", () => {
  const restaurant = mockRestaurant();
  const pairing = createRestaurantPairing(restaurant);
  restaurant.printAgentPairingExpiresAt = new Date(Date.now() - 1000);

  const validation = validateRestaurantPairing(restaurant, pairing.code);
  assert.equal(validation.ok, false);
  assert.equal(validation.message, "pairing_code_expired");
});

test("issueAgentCredentials clears pairing and returns token", () => {
  const restaurant = mockRestaurant();
  const pairing = createRestaurantPairing(restaurant);
  const credentials = issueAgentCredentials(restaurant);

  assert.equal(credentials.restaurantId, "rest123");
  assert.equal(credentials.restaurantName, "Test Kitchen");
  assert.match(credentials.agentToken, /^[a-f0-9]{64}$/);
  assert.equal(restaurant.printAgentPairingCodeHash, "");
  assert.equal(restaurant.printAgentPairingExpiresAt, null);
  assert.ok(restaurant.printAgentTokenHash);
  assert.equal(validateRestaurantPairing(restaurant, pairing.code).ok, false);
});
