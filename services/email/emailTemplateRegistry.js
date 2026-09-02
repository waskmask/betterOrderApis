const path = require("path");

const SUPPORTED_LANGS = ["en", "de"];

const EMAIL_TEMPLATES = {
  "auth.welcome": {
    fileSlug: "auth/welcome",
    subjects: {
      en: "{{brandName}} — Welcome",
      de: "{{brandName}} — Willkommen",
    },
    requiredKeys: ["name"],
  },
  "auth.verifyEmail": {
    fileSlug: "auth/verify-email",
    subjects: {
      en: "{{brandName}} — Verify your email",
      de: "{{brandName}} — E-Mail bestätigen",
    },
    requiredKeys: ["name", "actionUrl"],
  },
  "auth.googleSignup": {
    fileSlug: "auth/google-signup",
    subjects: {
      en: "{{brandName}} — Google sign-in confirmed",
      de: "{{brandName}} — Google-Anmeldung bestätigt",
    },
    requiredKeys: ["name"],
  },
  "auth.forgotPassword": {
    fileSlug: "auth/forgot-password",
    subjects: {
      en: "{{brandName}} — Reset your password",
      de: "{{brandName}} — Passwort zurücksetzen",
    },
    requiredKeys: ["name", "actionUrl"],
  },
  "auth.resetSuccess": {
    fileSlug: "auth/reset-success",
    subjects: {
      en: "{{brandName}} — Password changed",
      de: "{{brandName}} — Passwort geändert",
    },
    requiredKeys: ["name"],
  },
  "order.placed.customer": {
    fileSlug: "orders/placed-customer",
    subjects: {
      en: "Order {{orderNumber}} received — {{restaurantName}}",
      de: "Bestellung {{orderNumber}} eingegangen — {{restaurantName}}",
    },
    requiredKeys: ["orderNumber", "restaurantName", "customerName"],
  },
  "order.placed.restaurant": {
    fileSlug: "orders/placed-restaurant",
    subjects: {
      en: "New order {{orderNumber}} — {{customerName}}",
      de: "Neue Bestellung {{orderNumber}} — {{customerName}}",
    },
    requiredKeys: ["orderNumber", "restaurantName", "customerName"],
  },
  "order.accepted.customer": {
    fileSlug: "orders/accepted-customer",
    subjects: {
      en: "Order {{orderNumber}} accepted — {{restaurantName}}",
      de: "Bestellung {{orderNumber}} angenommen — {{restaurantName}}",
    },
    requiredKeys: ["orderNumber", "restaurantName", "customerName", "orderLinesHtml"],
  },
  "order.rejected.customer": {
    fileSlug: "orders/rejected-customer",
    subjects: {
      en: "Order {{orderNumber}} declined — {{restaurantName}}",
      de: "Bestellung {{orderNumber}} abgelehnt — {{restaurantName}}",
    },
    requiredKeys: ["orderNumber", "restaurantName", "customerName"],
  },
  "order.refund.customer": {
    fileSlug: "orders/refund-customer",
    subjects: {
      en: "Refund initiated — order {{orderNumber}}",
      de: "Rückerstattung eingeleitet — Bestellung {{orderNumber}}",
    },
    requiredKeys: ["orderNumber", "restaurantName", "customerName"],
  },
  "review.invite": {
    fileSlug: "reviews/invite",
    subjects: {
      en: "How was your order at {{restaurantName}}?",
      de: "Wie war deine Bestellung bei {{restaurantName}}?",
    },
    requiredKeys: ["name", "restaurantName", "orderNumber", "reviewUrl"],
  },
};

function pickLang(raw) {
  const value = String(raw || "").toLowerCase().trim();
  if (SUPPORTED_LANGS.includes(value)) return value;
  if (value.startsWith("de")) return "de";
  if (value.startsWith("en")) return "en";
  return "en";
}

function getTemplate(key) {
  const entry = EMAIL_TEMPLATES[key];
  if (!entry) {
    throw new Error(`Unknown email template: ${key}`);
  }
  return entry;
}

function getByPath(obj, keypath) {
  if (!keypath) return undefined;
  return keypath.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

function interpolate(template, data = {}) {
  return String(template || "").replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key) => {
    const value = getByPath(data, key);
    return value == null ? "" : String(value);
  });
}

function getSubject(key, lang, data = {}) {
  const entry = getTemplate(key);
  const resolvedLang = pickLang(lang);
  const subjectTemplate =
    entry.subjects?.[resolvedLang] || entry.subjects?.en || "{{brandName}}";
  return interpolate(subjectTemplate, data);
}

function getTemplatePath(key, lang) {
  const entry = getTemplate(key);
  const resolvedLang = pickLang(lang);
  const root = path.join(__dirname, "..", "..", "emails", "i18n");
  return path.join(root, `${entry.fileSlug}-${resolvedLang}.html`);
}

function getTemplateFallbackPath(key) {
  const entry = getTemplate(key);
  const root = path.join(__dirname, "..", "..", "emails", "i18n");
  return path.join(root, `${entry.fileSlug}-en.html`);
}

function validateTemplateData(key, data = {}) {
  const entry = getTemplate(key);
  const missing = (entry.requiredKeys || []).filter((field) => {
    const value = getByPath(data, field);
    return value == null || value === "";
  });
  if (missing.length) {
    throw new Error(`Email template "${key}" missing required keys: ${missing.join(", ")}`);
  }
  return true;
}

/** Map legacy appUserMailer type names to registry keys */
const LEGACY_AUTH_TYPE_MAP = {
  welcome: "auth.welcome",
  verifyEmail: "auth.verifyEmail",
  googleSignup: "auth.googleSignup",
  forgotPassword: "auth.forgotPassword",
  resetSuccess: "auth.resetSuccess",
};

function resolveTemplateKey(templateOrLegacyType) {
  return LEGACY_AUTH_TYPE_MAP[templateOrLegacyType] || templateOrLegacyType;
}

module.exports = {
  EMAIL_TEMPLATES,
  SUPPORTED_LANGS,
  LEGACY_AUTH_TYPE_MAP,
  pickLang,
  getTemplate,
  getSubject,
  getTemplatePath,
  getTemplateFallbackPath,
  validateTemplateData,
  resolveTemplateKey,
  interpolate,
};
