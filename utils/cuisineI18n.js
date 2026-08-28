const { getPlatformSettings } = require("../services/platformSettingsService");

const DEFAULT_LEGACY_LANG = "de";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function localizationMapToObject(value) {
  if (!value) return {};
  if (value instanceof Map) {
    return Object.fromEntries(value.entries());
  }
  if (isPlainObject(value)) return { ...value };
  return {};
}

function normalizeLocalizedMap(value, fallbackLang = DEFAULT_LEGACY_LANG) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? { [fallbackLang]: trimmed } : {};
  }

  const source = localizationMapToObject(value);
  const next = {};
  Object.entries(source).forEach(([code, text]) => {
    if (typeof text !== "string") return;
    const trimmed = text.trim();
    if (!trimmed) return;
    next[String(code).toLowerCase()] = trimmed;
  });
  return next;
}

function resolveLocalizedValue(value, preferredCodes = [], fallbackLang = DEFAULT_LEGACY_LANG) {
  if (typeof value === "string") return value.trim();
  const map = normalizeLocalizedMap(value, fallbackLang);
  for (const code of preferredCodes) {
    if (code && map[code]) return map[code];
  }
  if (map[fallbackLang]) return map[fallbackLang];
  const first = Object.values(map)[0];
  return typeof first === "string" ? first : "";
}

function needsLegacyMigration(doc) {
  return typeof doc?.name === "string" || typeof doc?.description === "string";
}

async function migrateCuisineDocIfNeeded(doc) {
  if (!doc || !needsLegacyMigration(doc)) return doc;

  const nameMap = normalizeLocalizedMap(doc.name, DEFAULT_LEGACY_LANG);
  const descriptionMap = normalizeLocalizedMap(doc.description, DEFAULT_LEGACY_LANG);

  doc.name = nameMap;
  doc.description = descriptionMap;
  doc.markModified("name");
  doc.markModified("description");
  await doc.save();
  return doc;
}

async function migrateCuisineDocs(docs) {
  const list = Array.isArray(docs) ? docs : [];
  for (const doc of list) {
    await migrateCuisineDocIfNeeded(doc);
  }
  return list;
}

async function getActiveContentLanguageCodes() {
  try {
    const settings = await getPlatformSettings();
    const slots = settings?.contentLanguages?.slots || [];
    const codes = slots
      .filter((slot) => slot?.code && slot.isActive !== false)
      .map((slot) => String(slot.code).toLowerCase());
    if (codes.length > 0) return codes;
  } catch {
    // fall through
  }
  return [DEFAULT_LEGACY_LANG];
}

async function getPrimaryContentLanguageCode() {
  const codes = await getActiveContentLanguageCodes();
  return codes[0] || DEFAULT_LEGACY_LANG;
}

function serializeCuisine(doc, primaryCode = DEFAULT_LEGACY_LANG, activeCodes = [DEFAULT_LEGACY_LANG]) {
  const plain = doc?.toObject ? doc.toObject() : { ...doc };
  const nameI18n = normalizeLocalizedMap(plain.name, DEFAULT_LEGACY_LANG);
  const descriptionI18n = normalizeLocalizedMap(plain.description, DEFAULT_LEGACY_LANG);
  const preferred = [primaryCode, ...activeCodes, DEFAULT_LEGACY_LANG];

  return {
    ...plain,
    icon: typeof plain.icon === "string" ? plain.icon : "",
    nameI18n,
    descriptionI18n,
    name: resolveLocalizedValue(nameI18n, preferred, DEFAULT_LEGACY_LANG),
    description: resolveLocalizedValue(descriptionI18n, preferred, DEFAULT_LEGACY_LANG),
  };
}

function parseCuisinePayload(body = {}) {
  const nameI18n = normalizeLocalizedMap(
    body.nameI18n ?? body.names ?? body.name,
    DEFAULT_LEGACY_LANG
  );
  const descriptionI18n = normalizeLocalizedMap(
    body.descriptionI18n ?? body.descriptions ?? body.description,
    DEFAULT_LEGACY_LANG
  );

  return { nameI18n, descriptionI18n };
}

module.exports = {
  DEFAULT_LEGACY_LANG,
  normalizeLocalizedMap,
  resolveLocalizedValue,
  migrateCuisineDocs,
  migrateCuisineDocIfNeeded,
  getActiveContentLanguageCodes,
  getPrimaryContentLanguageCode,
  serializeCuisine,
  parseCuisinePayload,
};
