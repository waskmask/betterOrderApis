const crypto = require("crypto");

const EMAIL_VERIFICATION_TTL_MS = 1000 * 60 * 60;
const PASSWORD_RESET_TTL_MS = 1000 * 60 * 60;

function createVerificationToken() {
  const raw = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return {
    raw,
    hash,
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
  };
}

function createPasswordResetToken() {
  const raw = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return {
    raw,
    hash,
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
  };
}

function hashToken(raw) {
  return crypto.createHash("sha256").update(String(raw || "")).digest("hex");
}

function timingSafeEqualToken(storedHash, rawToken) {
  try {
    const a = Buffer.from(String(storedHash || ""), "hex");
    const b = Buffer.from(hashToken(rawToken), "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function buildVerificationUrl(rawToken) {
  const baseUrl =
    process.env.APP_USER_EMAIL_VERIFICATION_URL ||
    process.env.CUSTOMER_APP_URL ||
    "http://localhost:4003/verify-email";
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}token=${rawToken}`;
}

function buildPasswordResetUrl(rawToken) {
  const baseUrl =
    process.env.APP_USER_PASSWORD_RESET_URL ||
    process.env.CUSTOMER_APP_URL ||
    "http://localhost:4003/reset-password";
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}token=${rawToken}`;
}

module.exports = {
  EMAIL_VERIFICATION_TTL_MS,
  PASSWORD_RESET_TTL_MS,
  createVerificationToken,
  createPasswordResetToken,
  hashToken,
  timingSafeEqualToken,
  buildVerificationUrl,
  buildPasswordResetUrl,
};
