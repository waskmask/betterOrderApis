const {
  DEFAULT_LEGACY_LANG,
  normalizeLocalizedMap,
  resolveLocalizedValue,
  getPrimaryContentLanguageCode,
} = require("./cuisineI18n");

function parseJsonObject(value) {
  if (value == null || value === "") return null;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseCategoryI18nPayload(body = {}) {
  const nameFromJson = parseJsonObject(body.nameI18n ?? body.names);
  const descFromJson = parseJsonObject(body.descriptionI18n ?? body.descriptions);

  const nameI18n = normalizeLocalizedMap(
    nameFromJson ?? body.category_name ?? body.name,
    DEFAULT_LEGACY_LANG
  );
  const descriptionI18n = normalizeLocalizedMap(
    descFromJson ?? body.category_desc ?? body.description,
    DEFAULT_LEGACY_LANG
  );

  return { nameI18n, descriptionI18n };
}

async function resolveCategoryPrimaryFields(nameI18n, descriptionI18n) {
  const primaryCode = await getPrimaryContentLanguageCode();
  const preferred = [primaryCode, DEFAULT_LEGACY_LANG];
  return {
    primaryCode,
    category_name: resolveLocalizedValue(nameI18n, preferred, DEFAULT_LEGACY_LANG),
    category_desc: resolveLocalizedValue(descriptionI18n, preferred, DEFAULT_LEGACY_LANG),
  };
}

function collectCategoryNameKeys(category) {
  const keys = new Set();
  const nameI18n = normalizeLocalizedMap(category?.nameI18n, DEFAULT_LEGACY_LANG);
  Object.values(nameI18n).forEach((value) => {
    const key = String(value || "").trim().toLowerCase();
    if (key) keys.add(key);
  });
  const legacy = String(category?.category_name || "").trim().toLowerCase();
  if (legacy) keys.add(legacy);
  return keys;
}

function hasDuplicateCategoryName(menu, nameI18n, excludeId = null) {
  const incoming = new Set(
    Object.values(normalizeLocalizedMap(nameI18n, DEFAULT_LEGACY_LANG))
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
  );
  if (incoming.size === 0) return false;

  return (menu || []).some((category) => {
    if (excludeId && category?._id?.toString() === String(excludeId)) return false;
    const existing = collectCategoryNameKeys(category);
    for (const key of incoming) {
      if (existing.has(key)) return true;
    }
    return false;
  });
}

function serializeCategoryI18n(category, primaryCode = DEFAULT_LEGACY_LANG) {
  const plain =
    typeof category?.toObject === "function" ? category.toObject() : { ...category };

  const nameI18n = normalizeLocalizedMap(
    plain.nameI18n && Object.keys(plain.nameI18n).length
      ? plain.nameI18n
      : plain.category_name,
    DEFAULT_LEGACY_LANG
  );
  const descriptionI18n = normalizeLocalizedMap(
    plain.descriptionI18n && Object.keys(plain.descriptionI18n).length
      ? plain.descriptionI18n
      : plain.category_desc,
    DEFAULT_LEGACY_LANG
  );
  const preferred = [primaryCode, DEFAULT_LEGACY_LANG];

  return {
    ...plain,
    nameI18n,
    descriptionI18n,
    category_name:
      resolveLocalizedValue(nameI18n, preferred, DEFAULT_LEGACY_LANG) ||
      plain.category_name ||
      "",
    category_desc:
      resolveLocalizedValue(descriptionI18n, preferred, DEFAULT_LEGACY_LANG) ||
      plain.category_desc ||
      "",
  };
}

module.exports = {
  parseCategoryI18nPayload,
  resolveCategoryPrimaryFields,
  hasDuplicateCategoryName,
  serializeCategoryI18n,
};
