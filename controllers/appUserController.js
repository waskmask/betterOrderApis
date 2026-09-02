const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const mongoose = require("mongoose");
const { OAuth2Client } = require("google-auth-library");
const AppUser = require("../modals/AppUser");
const Order = require("../modals/Order");
const { Restaurant } = require("../modals/Restaurant");
const generateToken = require("../utils/generateToken");
const { sendAppUserEmail } = require("../utils/appUserMailer");
const { resolveRequestLanguage } = require("../utils/appUserLocale");
const { pickItemImageVariant } = require("../utils/menuItemImage");
const {
  issueVerificationEmail,
  issuePasswordResetEmail,
  sendAuthEmail,
} = require("../services/auth/authEmailService");
const {
  createVerificationToken,
  createPasswordResetToken,
  hashToken,
  timingSafeEqualToken,
  EMAIL_VERIFICATION_TTL_MS,
  PASSWORD_RESET_TTL_MS,
  buildVerificationUrl,
  buildPasswordResetUrl,
} = require("../services/auth/authTokenService");
const { anonymizeReviewsForAppUser } = require("../services/reviewService");

const APP_USER_COOKIE_NAME = "bo_app_token";
const APP_USER_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const RESEND_WINDOW_MS = 1000 * 60;
const TERMS_VERSION = process.env.APP_USER_TERMS_VERSION || "2026-04-29";
const PRIVACY_VERSION = process.env.APP_USER_PRIVACY_VERSION || "2026-04-29";
const GOOGLE_CLIENT = process.env.GOOGLE_CLIENT_ID
  ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  : null;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function splitFullName(value) {
  const parts = normalizeName(value).split(" ").filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" "),
  };
}

function combineName(firstName, lastName, fallback = "") {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || normalizeName(fallback);
}

function normalizePhone(value) {
  return String(value || "")
    .trim()
    .replace(/[^\d+\s()-]/g, "");
}

function normalizePostalCode(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "");
}

function getRequestMetadata(req) {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  return {
    ipAddress: forwardedFor || req.ip || req.socket?.remoteAddress || "",
    userAgent: String(req.headers["user-agent"] || "").slice(0, 500),
  };
}

function buildRequiredConsent(req, lang) {
  const now = new Date();
  const metadata = getRequestMetadata(req);
  return {
    terms: {
      accepted: true,
      acceptedAt: now,
      version: TERMS_VERSION,
      locale: lang,
      source: "web_signup",
      ...metadata,
    },
    privacy: {
      accepted: true,
      acceptedAt: now,
      version: PRIVACY_VERSION,
      locale: lang,
      source: "web_signup",
      ...metadata,
    },
  };
}

function buildMarketingEmailConsent(req, optedIn, source = "web_signup") {
  const now = new Date();
  return {
    optedIn: Boolean(optedIn),
    optedInAt: optedIn ? now : null,
    optedOutAt: optedIn ? null : now,
    updatedAt: now,
    source,
    ...getRequestMetadata(req),
  };
}

function hasRequiredConsent(body) {
  const consent = body?.consent || {};
  const termsAccepted = Boolean(body?.termsAccepted || consent.termsAccepted);
  const privacyAccepted = Boolean(body?.privacyAccepted || consent.privacyAccepted);
  return termsAccepted && privacyAccepted;
}

function getMarketingEmailOptIn(body) {
  const consent = body?.consent || {};
  return Boolean(body?.marketingEmailOptIn || consent.marketingEmailOptIn);
}

async function sendLifecycleEmail({ appUser, type, actionUrl = null }) {
  return sendAuthEmail({ appUser, template: type, actionUrl });
}

function setAppUserCookie(res, token) {
  res.cookie(APP_USER_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: APP_USER_COOKIE_MAX_AGE,
  });
}

function clearAppUserCookie(res) {
  res.clearCookie(APP_USER_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
}

function sanitizeAppUser(user) {
  const plain = user.toObject ? user.toObject() : user;
  delete plain.password;
  delete plain.emailVerificationTokenHash;
  delete plain.emailVerificationTokenExpiresAt;
  delete plain.verificationEmailLastSentAt;
  delete plain.passwordResetTokenHash;
  delete plain.passwordResetTokenExpiresAt;
  delete plain.passwordResetLastSentAt;
  return plain;
}

function serializeAddress(address) {
  return {
    _id: address._id,
    label: address.label,
    customLabel: address.customLabel || "",
    street: address.street,
    houseNumber: address.houseNumber,
    postalCode: address.postalCode,
    city: address.city,
    state: address.state || "",
    country: address.country || "Germany",
    floor: address.floor || "",
    additionInfo: address.additionInfo || "",
    isDefault: Boolean(address.isDefault),
  };
}

function validatePasswordStrength(password) {
  return typeof password === "string" && password.length >= 8;
}

function validateAddressInput(input, isPartial = false) {
  const next = {
    label: input.label,
    customLabel: normalizeName(input.customLabel || ""),
    street: normalizeName(input.street),
    houseNumber: String(input.houseNumber || "").trim(),
    postalCode: normalizePostalCode(input.postalCode),
    city: normalizeName(input.city),
    state: normalizeName(input.state || ""),
    country: normalizeName(input.country || "Germany") || "Germany",
    floor: String(input.floor || "").trim(),
    additionInfo: String(input.additionInfo || "").trim(),
    isDefault: Boolean(input.isDefault),
  };

  const requiredFields = ["label", "street", "houseNumber", "postalCode", "city"];

  if (!["home", "office", "work", "parents", "custom"].includes(next.label || "")) {
    throw new Error("invalid_address_label");
  }

  if (next.label === "custom" && !next.customLabel) {
    throw new Error("custom_label_required");
  }

  if (!isPartial) {
    for (const field of requiredFields) {
      if (!next[field]) {
        throw new Error(`address_${field}_required`);
      }
    }
  }

  if (next.postalCode && !/^\d{5}$/.test(next.postalCode)) {
    throw new Error("invalid_german_postal_code");
  }

  return next;
}

async function findFavoriteMenuItem(restaurantId, itemId) {
  const restaurant = await Restaurant.findById(restaurantId)
    .select("restaurant_name menu._id menu.category_name menu.items._id menu.items.item_name menu.items.item_image")
    .lean();

  if (!restaurant) {
    return null;
  }

  for (const category of restaurant.menu || []) {
    for (const item of category.items || []) {
      if (String(item._id) === String(itemId)) {
        return {
          restaurantId: restaurant._id,
          restaurantName: restaurant.restaurant_name || "",
          categoryId: category._id,
          categoryName: category.category_name || "",
          itemId: item._id,
          itemName: item.item_name || "",
          itemImage: pickItemImageVariant(item.item_image, "thumbnail"),
        };
      }
    }
  }

  return null;
}

function buildFavoritesResponse(user, restaurants = []) {
  const restaurantMap = new Map(restaurants.map((restaurant) => [String(restaurant._id), restaurant]));

  return {
    restaurants: (user.favoriteRestaurants || []).map((restaurantId) => {
      const restaurant = restaurantMap.get(String(restaurantId));
      return restaurant
        ? {
            _id: restaurant._id,
            restaurant_name: restaurant.restaurant_name,
            username: restaurant.username,
            images: restaurant.images || {},
            address: restaurant.address || {},
          }
        : { _id: restaurantId };
    }),
    menuItems: (user.favoriteMenuItems || []).map((favorite) => ({
      _id: favorite._id,
      restaurantId: favorite.restaurantId,
      categoryId: favorite.categoryId,
      itemId: favorite.itemId,
      restaurantName: favorite.restaurantName,
      categoryName: favorite.categoryName,
      itemName: favorite.itemName,
      itemImage: favorite.itemImage || "",
    })),
  };
}

async function restaurantMetaForAppUserOrders(orders) {
  const restaurantIds = [
    ...new Set(
      orders
        .map((order) => String(order.restaurant?.restaurantId || ""))
        .filter(Boolean)
    ),
  ];

  if (!restaurantIds.length) return new Map();

  const restaurants = await Restaurant.find({ _id: { $in: restaurantIds } })
    .select("_id images.logo username restaurant_name")
    .lean();

  return new Map(
    restaurants.map((restaurant) => [
      String(restaurant._id),
      {
        logo: restaurant.images?.logo || "",
        username: restaurant.username || "",
        name: restaurant.restaurant_name || "",
      },
    ])
  );
}

function serializeAppUserOrder(order, restaurantMeta = null, includeDetails = false) {
  const doc = typeof order.toObject === "function" ? order.toObject() : order;
  const meta =
    restaurantMeta instanceof Map
      ? restaurantMeta.get(String(doc.restaurant?.restaurantId))
      : restaurantMeta;

  const base = {
    _id: String(doc._id),
    orderNumber: doc.orderNumber,
    status: doc.status,
    restaurant: {
      restaurantId: doc.restaurant?.restaurantId,
      usernameSnapshot: doc.restaurant?.usernameSnapshot || meta?.username || "",
      nameSnapshot: doc.restaurant?.nameSnapshot || meta?.name || "",
      phoneSnapshot: doc.restaurant?.phoneSnapshot || "",
      logoSnapshot: meta?.logo || "",
    },
    fulfillment: {
      mode: doc.fulfillment?.mode,
      requestedTime: doc.fulfillment?.requestedTime,
      deliveryMinutes: doc.fulfillment?.deliveryMinutes,
      acceptedDeliveryMinutes: doc.fulfillment?.acceptedDeliveryMinutes,
      acceptedEtaAt: doc.fulfillment?.acceptedEtaAt,
      dispatchDeliveryMinutes: doc.fulfillment?.dispatchDeliveryMinutes,
      dispatchEtaAt: doc.fulfillment?.dispatchEtaAt,
      address: doc.fulfillment?.address,
    },
    payment: doc.payment,
    totals: doc.totals,
    itemCount: (doc.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };

  if (!includeDetails) return base;

  return {
    ...base,
    customer: doc.customer,
    items: doc.items,
    statusHistory: doc.statusHistory,
    rejectReason: doc.rejectReason || "",
  };
}

function appUserOrderOwnerFilter(appUser) {
  const email = normalizeEmail(appUser?.email);
  const ownerFilter = [{ "customer.appUserId": appUser._id }];

  if (email) {
    ownerFilter.push({ "customer.email": email });
  }

  return { $or: ownerFilter };
}

exports.register = async (req, res, next) => {
  try {
    const lang = resolveRequestLanguage(req);
    const legacyName = normalizeName(req.body.name);
    const legacyParts = splitFullName(legacyName);
    const firstName = normalizeName(req.body.firstName || legacyParts.firstName);
    const lastName = normalizeName(req.body.lastName || legacyParts.lastName);
    const name = combineName(firstName, lastName, legacyName);
    const email = normalizeEmail(req.body.email);
    const phone = normalizePhone(req.body.phone || "");
    const password = req.body.password;

    if (!firstName) {
      return res.status(400).json({ success: false, message: "first_name_required" });
    }

    if (!lastName) {
      return res.status(400).json({ success: false, message: "last_name_required" });
    }

    if (!email) {
      return res.status(400).json({ success: false, message: "email_required" });
    }

    if (!validatePasswordStrength(password)) {
      return res.status(400).json({
        success: false,
        message: "password_min_8_chars",
      });
    }

    if (!hasRequiredConsent(req.body)) {
      return res.status(400).json({
        success: false,
        message: "legal_consent_required",
      });
    }

    const existing = await AppUser.findOne({ email });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "email_already_exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await AppUser.create({
      name,
      firstName,
      lastName,
      email,
      password: hashedPassword,
      phone,
      preferredLanguage: lang,
      consent: {
        ...buildRequiredConsent(req, lang),
        marketingEmail: buildMarketingEmailConsent(
          req,
          getMarketingEmailOptIn(req.body),
          "web_signup"
        ),
      },
    });

    const verification = await issueVerificationEmail(user);

    res.status(201).json({
      success: true,
      message: "app_user_registered_verification_required",
      user: sanitizeAppUser(user),
      verificationPreview: verification.preview,
      verificationExpiresAt: verification.expiresAt,
      verificationExpiresInSeconds: verification.expiresInSeconds,
    });
  } catch (error) {
    next(error);
  }
};

exports.login = async (req, res, next) => {
  try {
    const lang = resolveRequestLanguage(req);
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;

    const user = await AppUser.findOne({ email });
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: "invalid_credentials" });
    }

    if (!user.password) {
      return res.status(400).json({
        success: false,
        message: "use_google_sign_in",
      });
    }

    const matches = await bcrypt.compare(password, user.password);
    if (!matches) {
      return res.status(401).json({ success: false, message: "invalid_credentials" });
    }

    if (!user.emailVerifiedAt) {
      if (user.preferredLanguage !== lang) {
        user.preferredLanguage = lang;
        await user.save();
      }
      return res.status(403).json({
        success: false,
        message: "email_not_verified",
      });
    }

    user.preferredLanguage = lang;
    user.lastLoginAt = new Date();
    await user.save();

    const token = generateToken(user);
    setAppUserCookie(res, token);

    res.status(200).json({
      success: true,
      message: "login_successful",
      token,
      user: sanitizeAppUser(user),
    });
  } catch (error) {
    next(error);
  }
};

exports.googleAuth = async (req, res, next) => {
  try {
    const lang = resolveRequestLanguage(req);
    const { idToken, phone } = req.body;
    const intent = String(req.body.intent || req.body.mode || "login").toLowerCase();
    const isSignupIntent = intent === "signup";

    if (!GOOGLE_CLIENT) {
      return res.status(500).json({
        success: false,
        message: "google_auth_not_configured",
      });
    }

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: "google_id_token_required",
      });
    }

    const ticket = await GOOGLE_CLIENT.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload?.email || !payload.email_verified) {
      return res.status(400).json({
        success: false,
        message: "google_email_not_verified",
      });
    }

    const email = normalizeEmail(payload.email);
    let user =
      (await AppUser.findOne({ googleId: payload.sub })) ||
      (await AppUser.findOne({ email }));

    if (user && !user.isActive) {
      return res.status(403).json({
        success: false,
        message: "account_inactive",
      });
    }

    const emailPreviews = [];

    if (!user) {
      if (!isSignupIntent) {
        return res.status(404).json({
          success: false,
          message: "google_account_not_found_signup_required",
        });
      }

      if (!hasRequiredConsent(req.body)) {
        return res.status(400).json({
          success: false,
          message: "legal_consent_required",
        });
      }

      const googleFirstName = normalizeName(payload.given_name);
      const googleLastName = normalizeName(payload.family_name);
      const fallbackName = normalizeName(payload.name || email.split("@")[0]);
      const fallbackParts = splitFullName(fallbackName);
      const firstName = googleFirstName || fallbackParts.firstName || email.split("@")[0];
      const lastName = googleLastName || fallbackParts.lastName || "Google";

      user = await AppUser.create({
        name: combineName(firstName, lastName, fallbackName),
        firstName,
        lastName,
        email,
        googleId: payload.sub,
        avatar: payload.picture || "",
        phone: normalizePhone(phone || ""),
        preferredLanguage: lang,
        emailVerifiedAt: new Date(),
        lastLoginAt: new Date(),
        consent: {
          ...buildRequiredConsent(req, lang),
          marketingEmail: buildMarketingEmailConsent(
            req,
            getMarketingEmailOptIn(req.body),
            "web_google_signup"
          ),
        },
      });
      const googleConfirmation = await sendLifecycleEmail({
        appUser: user,
        type: "googleSignup",
        actionUrl: process.env.CUSTOMER_APP_URL || "http://localhost:4003",
      });
      const welcome = await sendLifecycleEmail({
        appUser: user,
        type: "welcome",
        actionUrl: process.env.CUSTOMER_APP_URL || "http://localhost:4003",
      });
      if (googleConfirmation.preview) emailPreviews.push(googleConfirmation.preview);
      if (welcome.preview) emailPreviews.push(welcome.preview);
    } else {
      user.googleId = payload.sub;
      user.emailVerifiedAt = user.emailVerifiedAt || new Date();
      user.avatar = payload.picture || user.avatar;
      user.firstName = user.firstName || normalizeName(payload.given_name) || splitFullName(user.name).firstName;
      user.lastName = user.lastName || normalizeName(payload.family_name) || splitFullName(user.name).lastName;
      user.name = combineName(user.firstName, user.lastName, user.name);
      user.preferredLanguage = lang;
      user.lastLoginAt = new Date();
      if (!user.phone && phone) {
        user.phone = normalizePhone(phone);
      }
      await user.save();
    }

    const token = generateToken(user);
    setAppUserCookie(res, token);

    res.status(200).json({
      success: true,
      message: "login_successful",
      token,
      user: sanitizeAppUser(user),
      emailPreviews: emailPreviews.length ? emailPreviews : undefined,
    });
  } catch (error) {
    next(error);
  }
};

exports.logout = async (req, res) => {
  clearAppUserCookie(res);
  res.status(200).json({ success: true, message: "logout_successful" });
};

exports.getMe = async (req, res, next) => {
  try {
    const user = await AppUser.findById(req.user._id)
      .populate("favoriteRestaurants", "restaurant_name username images address")
      .lean();

    if (!user || !user.isActive) {
      return res.status(404).json({ success: false, message: "app_user_not_found" });
    }

    res.status(200).json({
      success: true,
      user: sanitizeAppUser(user),
    });
  } catch (error) {
    next(error);
  }
};

exports.updateMe = async (req, res, next) => {
  try {
    const lang = resolveRequestLanguage(req, undefined);
    const user = await AppUser.findById(req.user._id);
    if (!user || !user.isActive) {
      return res.status(404).json({ success: false, message: "app_user_not_found" });
    }

    const legacyName = normalizeName(req.body.name);
    const legacyParts = splitFullName(legacyName);
    const firstName = normalizeName(req.body.firstName || legacyParts.firstName);
    const lastName = normalizeName(req.body.lastName || legacyParts.lastName);
    const phone = normalizePhone(req.body.phone || "");

    if (firstName) {
      user.firstName = firstName;
    }
    if (lastName) {
      user.lastName = lastName;
    }
    if (firstName || lastName || legacyName) {
      user.name = combineName(
        user.firstName || firstName,
        user.lastName || lastName,
        legacyName || user.name
      );
    }

    user.phone = phone;
    if (lang) {
      user.preferredLanguage = lang;
    }
    await user.save();

    res.status(200).json({
      success: true,
      message: "profile_updated",
      user: sanitizeAppUser(user),
    });
  } catch (error) {
    next(error);
  }
};

exports.updateMarketingEmailConsent = async (req, res, next) => {
  try {
    const user = await AppUser.findById(req.user._id);
    if (!user || !user.isActive) {
      return res.status(404).json({ success: false, message: "app_user_not_found" });
    }

    const optedIn = Boolean(req.body.marketingEmailOptIn);
    user.consent = user.consent || {};
    user.consent.marketingEmail = buildMarketingEmailConsent(
      req,
      optedIn,
      optedIn ? "web_settings_opt_in" : "web_settings_opt_out"
    );
    await user.save();

    res.status(200).json({
      success: true,
      message: optedIn ? "marketing_email_opted_in" : "marketing_email_opted_out",
      user: sanitizeAppUser(user),
    });
  } catch (error) {
    next(error);
  }
};

exports.deleteMe = async (req, res, next) => {
  try {
    const user = await AppUser.findById(req.user._id);
    if (!user || !user.isActive) {
      return res.status(404).json({ success: false, message: "app_user_not_found" });
    }

    const deletionMarker = String(user._id);
    user.name = "Deleted user";
    user.firstName = "Deleted";
    user.lastName = "User";
    user.email = `deleted+${deletionMarker}@deleted.betterorder.invalid`;
    user.password = null;
    user.googleId = null;
    user.avatar = "";
    user.phone = "";
    user.emailVerifiedAt = null;
    user.emailVerificationTokenHash = null;
    user.emailVerificationTokenExpiresAt = null;
    user.verificationEmailLastSentAt = null;
    user.passwordResetTokenHash = null;
    user.passwordResetTokenExpiresAt = null;
    user.passwordResetLastSentAt = null;
    user.addresses = [];
    user.favoriteRestaurants = [];
    user.favoriteMenuItems = [];
    user.consent = user.consent || {};
    user.consent.marketingEmail = buildMarketingEmailConsent(
      req,
      false,
      "account_deletion_opt_out"
    );
    user.isActive = false;
    user.tokenVersion += 1;
    user.deletedAt = new Date();
    user.anonymizedAt = new Date();
    await anonymizeReviewsForAppUser(user._id);
    await user.save();
    clearAppUserCookie(res);

    res.status(200).json({
      success: true,
      message: "account_deactivated",
    });
  } catch (error) {
    next(error);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await AppUser.findById(req.user._id);

    if (!user || !user.isActive) {
      return res.status(404).json({ success: false, message: "app_user_not_found" });
    }

    if (!validatePasswordStrength(newPassword)) {
      return res.status(400).json({
        success: false,
        message: "password_min_8_chars",
      });
    }

    if (user.password) {
      const matches = await bcrypt.compare(currentPassword || "", user.password);
      if (!matches) {
        return res.status(400).json({
          success: false,
          message: "current_password_incorrect",
        });
      }
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.tokenVersion += 1;
    await user.save();

    const successEmail = await sendLifecycleEmail({
      appUser: user,
      type: "resetSuccess",
      actionUrl: process.env.CUSTOMER_APP_URL || "http://localhost:4003/login",
    });

    clearAppUserCookie(res);

    res.status(200).json({
      success: true,
      message: "password_updated_relogin_required",
      emailPreview: successEmail.preview,
    });
  } catch (error) {
    next(error);
  }
};

exports.requestPasswordReset = async (req, res, next) => {
  try {
    const lang = resolveRequestLanguage(req);
    const email = normalizeEmail(req.body.email);

    if (!email) {
      return res.status(400).json({ success: false, message: "email_required" });
    }

    const user = await AppUser.findOne({ email });
    if (!user || !user.isActive) {
      return res.status(200).json({
        success: true,
        message: "password_reset_email_sent_if_account_exists",
      });
    }

    if (
      user.passwordResetLastSentAt &&
      Date.now() - new Date(user.passwordResetLastSentAt).getTime() < RESEND_WINDOW_MS
    ) {
      return res.status(429).json({
        success: false,
        message: "password_reset_recently_sent",
      });
    }

    user.preferredLanguage = lang;
    const resetEmail = await issuePasswordResetEmail(user);

    res.status(200).json({
      success: true,
      message: "password_reset_email_sent",
      resetPreview: resetEmail.preview,
    });
  } catch (error) {
    next(error);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const lang = resolveRequestLanguage(req);
    const token = String(req.body.token || "").trim();
    const newPassword = req.body.newPassword;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "reset_token_required",
      });
    }

    if (!validatePasswordStrength(newPassword)) {
      return res.status(400).json({
        success: false,
        message: "password_min_8_chars",
      });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await AppUser.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetTokenExpiresAt: { $gt: new Date() },
      isActive: true,
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "reset_token_invalid_or_expired",
      });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.passwordResetTokenHash = null;
    user.passwordResetTokenExpiresAt = null;
    user.passwordResetLastSentAt = null;
    user.tokenVersion += 1;
    user.preferredLanguage = lang;
    await user.save();

    const successEmail = await sendLifecycleEmail({
      appUser: user,
      type: "resetSuccess",
      actionUrl: process.env.CUSTOMER_APP_URL || "http://localhost:4003/login",
    });

    clearAppUserCookie(res);

    res.status(200).json({
      success: true,
      message: "password_reset_successful",
      emailPreview: successEmail.preview,
    });
  } catch (error) {
    next(error);
  }
};

exports.requestEmailVerification = async (req, res, next) => {
  try {
    const lang = resolveRequestLanguage(req);
    const email = normalizeEmail(req.body.email || req.user?.email);

    if (!email) {
      return res.status(400).json({ success: false, message: "email_required" });
    }

    const user = await AppUser.findOne({ email });
    if (!user || !user.isActive) {
      return res.status(200).json({
        success: true,
        message: "verification_email_sent_if_account_exists",
      });
    }

    if (user.emailVerifiedAt) {
      if (user.preferredLanguage !== lang) {
        user.preferredLanguage = lang;
        await user.save();
      }
      return res.status(200).json({
        success: true,
        message: "email_already_verified",
      });
    }

    if (
      user.verificationEmailLastSentAt &&
      Date.now() - new Date(user.verificationEmailLastSentAt).getTime() < RESEND_WINDOW_MS
    ) {
      return res.status(429).json({
        success: false,
        message: "verification_email_recently_sent",
      });
    }

    user.preferredLanguage = lang;
    const verification = await issueVerificationEmail(user);

    res.status(200).json({
      success: true,
      message: "verification_email_sent",
      verificationPreview: verification.preview,
      verificationExpiresAt: verification.expiresAt,
      verificationExpiresInSeconds: verification.expiresInSeconds,
    });
  } catch (error) {
    next(error);
  }
};

exports.verifyEmail = async (req, res, next) => {
  try {
    const lang = resolveRequestLanguage(req);
    const token = String(req.body.token || "").trim();
    if (!token) {
      return res.status(400).json({ success: false, message: "verification_token_required" });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await AppUser.findOne({
      emailVerificationTokenHash: tokenHash,
      emailVerificationTokenExpiresAt: { $gt: new Date() },
      isActive: true,
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "verification_token_invalid_or_expired",
      });
    }

    user.emailVerifiedAt = new Date();
    user.emailVerificationTokenHash = null;
    user.emailVerificationTokenExpiresAt = null;
    user.preferredLanguage = lang;
    await user.save();

    const welcome = await sendLifecycleEmail({
      appUser: user,
      type: "welcome",
      actionUrl: process.env.CUSTOMER_APP_URL || "http://localhost:4003",
    });

    res.status(200).json({
      success: true,
      message: "email_verified_successfully",
      emailPreview: welcome.preview,
    });
  } catch (error) {
    next(error);
  }
};

exports.getAddresses = async (req, res, next) => {
  try {
    const user = await AppUser.findById(req.user._id).select("addresses");
    if (!user || !user.isActive) {
      return res.status(404).json({ success: false, message: "app_user_not_found" });
    }

    res.status(200).json({
      success: true,
      addresses: user.addresses.map(serializeAddress),
    });
  } catch (error) {
    next(error);
  }
};

exports.createAddress = async (req, res, next) => {
  try {
    const user = await AppUser.findById(req.user._id);
    if (!user || !user.isActive) {
      return res.status(404).json({ success: false, message: "app_user_not_found" });
    }

    const address = validateAddressInput(req.body);
    if (user.addresses.length === 0) {
      address.isDefault = true;
    }
    if (address.isDefault) {
      user.addresses.forEach((entry) => {
        entry.isDefault = false;
      });
    }

    user.addresses.push(address);
    await user.save();

    const created = user.addresses[user.addresses.length - 1];
    res.status(201).json({
      success: true,
      message: "address_created",
      address: serializeAddress(created),
    });
  } catch (error) {
    next(error);
  }
};

exports.updateAddress = async (req, res, next) => {
  try {
    const user = await AppUser.findById(req.user._id);
    if (!user || !user.isActive) {
      return res.status(404).json({ success: false, message: "app_user_not_found" });
    }

    const address = user.addresses.id(req.params.addressId);
    if (!address) {
      return res.status(404).json({ success: false, message: "address_not_found" });
    }

    const nextAddress = validateAddressInput(
      {
        ...address.toObject(),
        ...req.body,
      },
      false
    );

    if (nextAddress.isDefault) {
      user.addresses.forEach((entry) => {
        entry.isDefault = false;
      });
    }

    Object.assign(address, nextAddress);
    await user.save();

    res.status(200).json({
      success: true,
      message: "address_updated",
      address: serializeAddress(address),
    });
  } catch (error) {
    next(error);
  }
};

exports.deleteAddress = async (req, res, next) => {
  try {
    const user = await AppUser.findById(req.user._id);
    if (!user || !user.isActive) {
      return res.status(404).json({ success: false, message: "app_user_not_found" });
    }

    const address = user.addresses.id(req.params.addressId);
    if (!address) {
      return res.status(404).json({ success: false, message: "address_not_found" });
    }

    const wasDefault = address.isDefault;
    address.deleteOne();

    if (wasDefault && user.addresses.length > 0) {
      user.addresses[0].isDefault = true;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: "address_deleted",
    });
  } catch (error) {
    next(error);
  }
};

exports.setDefaultAddress = async (req, res, next) => {
  try {
    const user = await AppUser.findById(req.user._id);
    if (!user || !user.isActive) {
      return res.status(404).json({ success: false, message: "app_user_not_found" });
    }

    const address = user.addresses.id(req.params.addressId);
    if (!address) {
      return res.status(404).json({ success: false, message: "address_not_found" });
    }

    user.addresses.forEach((entry) => {
      entry.isDefault = String(entry._id) === String(req.params.addressId);
    });
    await user.save();

    res.status(200).json({
      success: true,
      message: "default_address_updated",
      address: serializeAddress(address),
    });
  } catch (error) {
    next(error);
  }
};

exports.getFavorites = async (req, res, next) => {
  try {
    const user = await AppUser.findById(req.user._id).select(
      "favoriteRestaurants favoriteMenuItems"
    );
    if (!user || !user.isActive) {
      return res.status(404).json({ success: false, message: "app_user_not_found" });
    }

    const restaurants = await Restaurant.find({
      _id: { $in: user.favoriteRestaurants || [] },
    })
      .select("restaurant_name username images address")
      .lean();

    res.status(200).json({
      success: true,
      favorites: buildFavoritesResponse(user, restaurants),
    });
  } catch (error) {
    next(error);
  }
};

exports.listMyOrders = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 50);
    const filter = appUserOrderOwnerFilter(req.user);

    if (req.query.status && req.query.status !== "all") {
      const status = String(req.query.status);
      filter.status = status === "cancelled" ? { $in: ["cancelled", "rejected"] } : status;
    }

    if (req.query.cursor) {
      const cursorDate = new Date(String(req.query.cursor));
      if (!Number.isNaN(cursorDate.getTime())) {
        filter.createdAt = { $lt: cursorDate };
      }
    }

    const orders = await Order.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean();
    const hasMore = orders.length > limit;
    const visibleOrders = hasMore ? orders.slice(0, limit) : orders;
    const restaurantMeta = await restaurantMetaForAppUserOrders(visibleOrders);
    const nextCursor = hasMore
      ? visibleOrders[visibleOrders.length - 1]?.createdAt?.toISOString?.() || null
      : null;

    res.status(200).json({
      success: true,
      orders: visibleOrders.map((order) => serializeAppUserOrder(order, restaurantMeta)),
      pageInfo: { hasMore, nextCursor },
    });
  } catch (error) {
    next(error);
  }
};

exports.getMyOrder = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.orderId)) {
      return res.status(404).json({ success: false, message: "order_not_found" });
    }

    const order = await Order.findOne({
      _id: req.params.orderId,
      ...appUserOrderOwnerFilter(req.user),
    }).lean();

    if (!order) {
      return res.status(404).json({ success: false, message: "order_not_found" });
    }

    const restaurantMeta = await restaurantMetaForAppUserOrders([order]);
    res.status(200).json({
      success: true,
      order: serializeAppUserOrder(order, restaurantMeta, true),
    });
  } catch (error) {
    next(error);
  }
};

exports.addFavoriteRestaurant = async (req, res, next) => {
  try {
    const user = await AppUser.findById(req.user._id);
    if (!user || !user.isActive) {
      return res.status(404).json({ success: false, message: "app_user_not_found" });
    }

    const restaurant = await Restaurant.findById(req.params.restaurantId)
      .select("_id restaurant_name username images address isActive visibility")
      .lean();

    if (!restaurant || !restaurant.isActive || !restaurant.visibility) {
      return res.status(404).json({
        success: false,
        message: "restaurant_not_found",
      });
    }

    if (!user.favoriteRestaurants.some((id) => String(id) === String(restaurant._id))) {
      user.favoriteRestaurants.push(restaurant._id);
      await user.save();
    }

    res.status(200).json({
      success: true,
      message: "favorite_restaurant_added",
      restaurant,
    });
  } catch (error) {
    next(error);
  }
};

exports.removeFavoriteRestaurant = async (req, res, next) => {
  try {
    const user = await AppUser.findById(req.user._id);
    if (!user || !user.isActive) {
      return res.status(404).json({ success: false, message: "app_user_not_found" });
    }

    user.favoriteRestaurants = user.favoriteRestaurants.filter(
      (id) => String(id) !== String(req.params.restaurantId)
    );
    await user.save();

    res.status(200).json({
      success: true,
      message: "favorite_restaurant_removed",
    });
  } catch (error) {
    next(error);
  }
};

exports.addFavoriteMenuItem = async (req, res, next) => {
  try {
    const { restaurantId, itemId } = req.body;

    if (!restaurantId || !itemId) {
      return res.status(400).json({
        success: false,
        message: "restaurant_id_and_item_id_required",
      });
    }

    const user = await AppUser.findById(req.user._id);
    if (!user || !user.isActive) {
      return res.status(404).json({ success: false, message: "app_user_not_found" });
    }

    const favorite = await findFavoriteMenuItem(restaurantId, itemId);
    if (!favorite) {
      return res.status(404).json({
        success: false,
        message: "menu_item_not_found",
      });
    }

    const exists = user.favoriteMenuItems.some(
      (entry) =>
        String(entry.restaurantId) === String(favorite.restaurantId) &&
        String(entry.itemId) === String(favorite.itemId)
    );

    if (!exists) {
      user.favoriteMenuItems.push(favorite);
      await user.save();
    }

    res.status(200).json({
      success: true,
      message: "favorite_menu_item_added",
      favorite,
    });
  } catch (error) {
    next(error);
  }
};

exports.removeFavoriteMenuItem = async (req, res, next) => {
  try {
    const { restaurantId, itemId } = req.params;
    const user = await AppUser.findById(req.user._id);
    if (!user || !user.isActive) {
      return res.status(404).json({ success: false, message: "app_user_not_found" });
    }

    user.favoriteMenuItems = user.favoriteMenuItems.filter(
      (entry) =>
        !(
          String(entry.restaurantId) === String(restaurantId) &&
          String(entry.itemId) === String(itemId)
        )
    );

    await user.save();

    res.status(200).json({
      success: true,
      message: "favorite_menu_item_removed",
    });
  } catch (error) {
    next(error);
  }
};
