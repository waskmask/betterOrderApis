const crypto = require("crypto");
const { hashPrintAgentToken, generatePrintAgentToken } = require("./orderPrintService");

const PAIRING_TTL_MS = 15 * 60 * 1000;
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function generatePairingCode() {
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  }
  return code;
}

function hashPairingCode(code) {
  return crypto.createHash("sha256").update(String(code).trim().toUpperCase()).digest("hex");
}

function normalizePairingCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function createRestaurantPairing(restaurant) {
  const code = generatePairingCode();
  restaurant.printAgentPairingCodeHash = hashPairingCode(code);
  restaurant.printAgentPairingExpiresAt = new Date(Date.now() + PAIRING_TTL_MS);
  return {
    code,
    expiresAt: restaurant.printAgentPairingExpiresAt,
  };
}

function clearRestaurantPairing(restaurant) {
  restaurant.printAgentPairingCodeHash = "";
  restaurant.printAgentPairingExpiresAt = null;
}

function validateRestaurantPairing(restaurant, code) {
  const normalized = normalizePairingCode(code);
  if (!normalized || normalized.length !== 6) {
    return { ok: false, message: "invalid_pairing_code" };
  }
  if (!restaurant?.printAgentPairingCodeHash || !restaurant?.printAgentPairingExpiresAt) {
    return { ok: false, message: "pairing_code_not_found" };
  }
  if (new Date(restaurant.printAgentPairingExpiresAt).getTime() <= Date.now()) {
    return { ok: false, message: "pairing_code_expired" };
  }

  const hash = hashPairingCode(normalized);
  const stored = String(restaurant.printAgentPairingCodeHash || "");
  const valid =
    stored.length > 0 &&
    hash.length === stored.length &&
    crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(stored));

  if (!valid) {
    return { ok: false, message: "invalid_pairing_code" };
  }

  return { ok: true, normalizedCode: normalized };
}

function issueAgentCredentials(restaurant) {
  const token = generatePrintAgentToken();
  restaurant.printAgentTokenHash = hashPrintAgentToken(token);
  restaurant.printAgentLastSeenAt = null;
  clearRestaurantPairing(restaurant);
  return {
    restaurantId: String(restaurant._id),
    restaurantName: restaurant.restaurant_name || "",
    agentToken: token,
  };
}

module.exports = {
  PAIRING_TTL_MS,
  generatePairingCode,
  hashPairingCode,
  normalizePairingCode,
  createRestaurantPairing,
  clearRestaurantPairing,
  validateRestaurantPairing,
  issueAgentCredentials,
};
