const fs = require("fs/promises");
const path = require("path");
const { getPlatformSettings } = require("../services/platformSettingsService");

const SUPPORTED = ["en", "de"];
const FALLBACK_BRAND_NAME = "Platform";

const subjects = {
  welcome: {
    en: "{{brandName}} - Welcome",
    de: "{{brandName}} - Willkommen",
  },
  verifyEmail: {
    en: "{{brandName}} - Verify Email",
    de: "{{brandName}} - E-Mail bestaetigen",
  },
  googleSignup: {
    en: "{{brandName}} - Google Signup Confirmed",
    de: "{{brandName}} - Google Anmeldung bestaetigt",
  },
  forgotPassword: {
    en: "{{brandName}} - Password Reset",
    de: "{{brandName}} - Passwort zuruecksetzen",
  },
  resetSuccess: {
    en: "{{brandName}} - Password Changed",
    de: "{{brandName}} - Passwort geaendert",
  },
};

const templateBaseNames = {
  welcome: "welcome",
  verifyEmail: "verify-email",
  googleSignup: "google-signup",
  forgotPassword: "forgot-password",
  resetSuccess: "reset-success",
};

function pickLang(raw) {
  const value = String(raw || "").toLowerCase().trim();
  if (SUPPORTED.includes(value)) return value;
  if (value.startsWith("de")) return "de";
  if (value.startsWith("en")) return "en";
  return "en";
}

function publicBaseUrl() {
  const configured =
    process.env.API_PUBLIC_URL ||
    process.env.PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:4000";

  return configured.replace(/\/api\/?$/, "").replace(/\/$/, "");
}

async function resolveBrandName() {
  try {
    const settings = await getPlatformSettings();
    const name = String(settings?.platformName || "").trim();
    if (name) return name;
  } catch (error) {
    console.warn(
      "Failed to load platform settings for email brand:",
      error?.message || error
    );
  }
  return FALLBACK_BRAND_NAME;
}

function defaultTemplateData(data = {}) {
  const baseUrl = publicBaseUrl();
  const configuredFrom = String(process.env.SMTP_FROM || "").trim();
  const fallbackEmail = configuredFrom.includes("@")
    ? configuredFrom.replace(/^.*<([^>]+)>.*$/, "$1").replace(/"/g, "").trim()
    : process.env.SMTP_USER;
  return {
    brandName: FALLBACK_BRAND_NAME,
    logoUrl: `${baseUrl}/public/betterorder-logo.png`,
    homeUrl: process.env.CUSTOMER_APP_URL || "http://localhost:4003",
    supportEmail:
      process.env.SUPPORT_EMAIL ||
      fallbackEmail ||
      "info@betterorder.de",
    year: new Date().getFullYear(),
    ...data,
  };
}

async function getBrandTemplateData(data = {}) {
  let brandName = String(data.brandName || "").trim();
  if (!brandName) {
    brandName = await resolveBrandName();
  }
  return defaultTemplateData({ ...data, brandName });
}

function candidateTemplatePaths(baseName, lang) {
  const root = path.join(__dirname, "..");
  return [
    path.join(root, "emails", "i18n", `${baseName}-${lang}.html`),
    path.join(root, "emails", "i18n", `${baseName}.${lang}.html`),
  ];
}

async function readFirstExisting(paths) {
  for (const filePath of paths) {
    try {
      return await fs.readFile(filePath, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return null;
}

function getByPath(obj, keypath) {
  if (!keypath) return undefined;
  return keypath
    .split(".")
    .reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

function processIfBlocks(template, data) {
  return template.replace(
    /\{\{\#if\s+([a-zA-Z0-9_.-]+)\s*\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, key, inner) => {
      const value = getByPath(data, key);
      const truthy = Array.isArray(value) ? value.length > 0 : Boolean(value);
      return truthy ? inner : "";
    }
  );
}

function interpolate(template, data = {}) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key) => {
    if (key.startsWith("#") || key.startsWith("/")) return "";
    const value = getByPath(data, key);
    return value == null ? "" : String(value);
  });
}

function htmlToText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function renderTemplate(templateBaseName, lang, data = {}) {
  const resolvedLang = pickLang(lang);
  const preferredPaths = candidateTemplatePaths(templateBaseName, resolvedLang);
  const fallbackPaths = candidateTemplatePaths(templateBaseName, "en");
  let html = await readFirstExisting(preferredPaths);

  if (!html && resolvedLang !== "en") {
    console.warn(
      `Missing email template "${templateBaseName}" for lang "${resolvedLang}", falling back to "en"`
    );
    html = await readFirstExisting(fallbackPaths);
  }

  if (!html) {
    const checked = [...preferredPaths, ...fallbackPaths].join("\n- ");
    throw new Error(`Email template not found for "${templateBaseName}". Checked:\n- ${checked}`);
  }

  const templateData = await getBrandTemplateData(data);
  html = processIfBlocks(html, templateData);
  return interpolate(html, templateData);
}

async function renderAppUserEmail({ type, lang = "en", name, actionUrl }) {
  const resolvedLang = pickLang(lang);
  const templateBaseName = templateBaseNames[type] || "verify-email";
  const brandName = await resolveBrandName();
  const subjectTemplate =
    subjects[type]?.[resolvedLang] || subjects[type]?.en || "{{brandName}}";
  const subject = interpolate(subjectTemplate, { brandName });
  const html = await renderTemplate(templateBaseName, resolvedLang, {
    name: name || (resolvedLang === "de" ? "du" : "there"),
    actionUrl,
    brandName,
  });

  return {
    subject,
    html,
    text: htmlToText(html),
  };
}

module.exports = {
  pickLang,
  renderAppUserEmail,
  renderTemplate,
  getBrandTemplateData,
  defaultTemplateData,
  SUPPORTED,
};
