const bcrypt = require("bcryptjs");
const AppUser = require("../modals/AppUser");
const generateToken = require("../utils/generateToken");
const { OrderValidationError } = require("./orderPricingService");

const APP_USER_COOKIE_NAME = "bo_app_token";
const APP_USER_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const TERMS_VERSION = process.env.APP_USER_TERMS_VERSION || "2026-04-29";
const PRIVACY_VERSION = process.env.APP_USER_PRIVACY_VERSION || "2026-04-29";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function sanitizeAppUser(user) {
  const plain = user.toObject ? user.toObject() : { ...user };
  return {
    _id: plain._id,
    name: plain.name,
    firstName: plain.firstName,
    lastName: plain.lastName,
    email: plain.email,
    phone: plain.phone,
    emailVerifiedAt: plain.emailVerifiedAt,
    preferredLanguage: plain.preferredLanguage,
  };
}

function setAppUserCookie(res, token) {
  res.cookie(APP_USER_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: APP_USER_COOKIE_MAX_AGE,
  });
}

function requestMetadata(req) {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  return {
    ipAddress: forwardedFor || req.ip || req.socket?.remoteAddress || "",
    userAgent: String(req.headers["user-agent"] || "").slice(0, 500),
  };
}

function needsCheckoutAccount(payload, paymentMethod, existingUser) {
  if (existingUser?.role === "app-user") return false;
  if (paymentMethod === "cod") return true;
  return Boolean(payload?.createAccount);
}

function issueSession(res, user) {
  const token = generateToken(user);
  setAppUserCookie(res, token);
  return {
    appUser: {
      ...(user.toObject ? user.toObject() : user),
      role: "app-user",
    },
    session: {
      token,
      user: sanitizeAppUser(user),
    },
  };
}

async function ensureCheckoutAppUser({ req, res, payload, paymentMethod, existingUser }) {
  if (existingUser?.role === "app-user") {
    return { appUser: existingUser, session: null };
  }

  if (!needsCheckoutAccount(payload, paymentMethod, existingUser)) {
    return { appUser: null, session: null };
  }

  const customer = payload?.customer || {};
  const firstName = String(customer.firstName || "").trim().slice(0, 80);
  const lastName = String(customer.lastName || "").trim().slice(0, 80);
  const email = normalizeEmail(customer.email).slice(0, 160);
  const phone = String(customer.phone || "").trim().slice(0, 60);
  const password = String(payload?.password || "");
  const lang = String(payload?.lang || "").toLowerCase() === "de" ? "de" : "en";

  if (!firstName || !lastName || !email) {
    throw new OrderValidationError("account_details_required", "Account details are required", 400);
  }

  if (password.length < 8) {
    throw new OrderValidationError("password_min_8_chars", "Password must be at least 8 characters", 400);
  }

  if (!payload?.termsAccepted || !payload?.privacyAccepted) {
    throw new OrderValidationError("legal_consent_required", "Please accept the terms and privacy policy", 400);
  }

  const existing = await AppUser.findOne({ email });
  if (existing) {
    if (!existing.isActive) {
      throw new OrderValidationError("account_inactive", "This account is inactive", 403);
    }
    if (!existing.password) {
      throw new OrderValidationError("use_google_sign_in", "This account uses Google sign-in", 400);
    }
    const matches = await bcrypt.compare(password, existing.password);
    if (!matches) {
      throw new OrderValidationError("invalid_credentials", "Email or password is incorrect", 401);
    }
    const now = new Date();
    existing.lastLoginAt = now;
    existing.emailVerifiedAt = existing.emailVerifiedAt || now;
    if (existing.preferredLanguage !== lang) existing.preferredLanguage = lang;
    await existing.save();
    return issueSession(res, existing);
  }

  const now = new Date();
  const metadata = requestMetadata(req);
  const marketingOptIn = Boolean(payload?.marketingEmailOptIn);
  const user = await AppUser.create({
    name: `${firstName} ${lastName}`.trim(),
    firstName,
    lastName,
    email,
    phone,
    password: await bcrypt.hash(password, 10),
    preferredLanguage: lang,
    emailVerifiedAt: now,
    lastLoginAt: now,
    consent: {
      terms: {
        accepted: true,
        acceptedAt: now,
        version: TERMS_VERSION,
        locale: lang,
        source: "web_checkout",
        ...metadata,
      },
      privacy: {
        accepted: true,
        acceptedAt: now,
        version: PRIVACY_VERSION,
        locale: lang,
        source: "web_checkout",
        ...metadata,
      },
      marketingEmail: {
        optedIn: marketingOptIn,
        optedInAt: marketingOptIn ? now : null,
        optedOutAt: marketingOptIn ? null : now,
        updatedAt: now,
        source: "web_checkout",
        ...metadata,
      },
    },
  });

  return issueSession(res, user);
}

module.exports = {
  ensureCheckoutAppUser,
  needsCheckoutAccount,
};
