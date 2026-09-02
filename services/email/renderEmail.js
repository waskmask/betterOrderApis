const fs = require("fs/promises");
const path = require("path");
const { getPlatformSettings } = require("../platformSettingsService");
const {
  pickLang,
  getTemplate,
  getSubject,
  getTemplatePath,
  getTemplateFallbackPath,
  validateTemplateData,
  resolveTemplateKey,
} = require("./emailTemplateRegistry");

const FALLBACK_BRAND_NAME = "Platform";

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
    console.warn("Failed to load platform settings for email brand:", error?.message || error);
  }
  return FALLBACK_BRAND_NAME;
}

function defaultGlobalData(lang) {
  const baseUrl = publicBaseUrl();
  const configuredFrom = String(process.env.SMTP_FROM || "").trim();
  const fallbackEmail = configuredFrom.includes("@")
    ? configuredFrom.replace(/^.*<([^>]+)>.*$/, "$1").replace(/"/g, "").trim()
    : process.env.SMTP_USER;
  return {
    logoUrl: `${baseUrl}/public/betterorder-logo.png`,
    homeUrl: process.env.CUSTOMER_APP_URL || "http://localhost:4003",
    supportEmail:
      process.env.SUPPORT_EMAIL || fallbackEmail || "info@betterorder.de",
    year: new Date().getFullYear(),
    lang: pickLang(lang),
  };
}

function getByPath(obj, keypath) {
  if (!keypath) return undefined;
  return keypath.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
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
  return String(template || "").replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key) => {
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

async function readTemplateFile(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function loadTemplateHtml(templateKey, lang) {
  const resolvedLang = pickLang(lang);
  let html = await readTemplateFile(getTemplatePath(templateKey, resolvedLang));
  if (!html && resolvedLang !== "en") {
    console.warn(
      `Missing email template "${templateKey}" for lang "${resolvedLang}", falling back to en`
    );
    html = await readTemplateFile(getTemplateFallbackPath(templateKey));
  }
  if (!html) {
    throw new Error(`Email template not found: ${templateKey} (${resolvedLang})`);
  }
  return html;
}

async function renderPartial(partialSlug, lang, data = {}) {
  const resolvedLang = pickLang(lang);
  const root = path.join(__dirname, "..", "..", "emails", "partials");
  let html =
    (await readTemplateFile(path.join(root, `${partialSlug}-${resolvedLang}.html`))) ||
    (await readTemplateFile(path.join(root, `${partialSlug}-en.html`)));
  if (!html) {
    throw new Error(`Email partial not found: ${partialSlug}`);
  }
  const brandName = await resolveBrandName();
  const templateData = {
    ...defaultGlobalData(resolvedLang),
    brandName,
    ...data,
  };
  html = processIfBlocks(html, templateData);
  return interpolate(html, templateData);
}

async function renderEmail({ template, lang = "en", data = {} }) {
  const templateKey = resolveTemplateKey(template);
  getTemplate(templateKey);
  const resolvedLang = pickLang(lang);
  const brandName = await resolveBrandName();
  const templateData = {
    ...defaultGlobalData(resolvedLang),
    brandName,
    name: data.name || (resolvedLang === "de" ? "du" : "there"),
    ...data,
  };

  validateTemplateData(templateKey, templateData);

  let html = await loadTemplateHtml(templateKey, resolvedLang);
  html = processIfBlocks(html, templateData);
  html = interpolate(html, templateData);
  const subject = getSubject(templateKey, resolvedLang, templateData);

  return {
    template: templateKey,
    lang: resolvedLang,
    subject,
    html,
    text: htmlToText(html),
  };
}

module.exports = {
  renderEmail,
  renderPartial,
  htmlToText,
  interpolate,
  processIfBlocks,
  pickLang,
};
