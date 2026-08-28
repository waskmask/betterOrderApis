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

function parseItemI18nPayload(body = {}) {
  const nameFromJson = parseJsonObject(body.nameI18n ?? body.names);
  const descFromJson = parseJsonObject(body.descriptionI18n ?? body.descriptions);

  const nameI18n = normalizeLocalizedMap(
    nameFromJson ?? body.item_name ?? body.name,
    DEFAULT_LEGACY_LANG
  );
  const descriptionI18n = normalizeLocalizedMap(
    descFromJson ?? body.item_desc ?? body.description,
    DEFAULT_LEGACY_LANG
  );

  return { nameI18n, descriptionI18n };
}

function parsePriceSizeI18n(entry = {}, primaryCode = DEFAULT_LEGACY_LANG) {
  const sizeI18n = normalizeLocalizedMap(
    entry?.sizeI18n ?? entry?.item_size,
    primaryCode || DEFAULT_LEGACY_LANG
  );
  const preferred = [primaryCode, DEFAULT_LEGACY_LANG];
  const item_size =
    resolveLocalizedValue(sizeI18n, preferred, DEFAULT_LEGACY_LANG) ||
    String(entry?.item_size || "").trim();
  return { item_size, sizeI18n };
}

async function resolveItemPrimaryFields(nameI18n, descriptionI18n) {
  const primaryCode = await getPrimaryContentLanguageCode();
  const preferred = [primaryCode, DEFAULT_LEGACY_LANG];
  return {
    primaryCode,
    item_name: resolveLocalizedValue(nameI18n, preferred, DEFAULT_LEGACY_LANG),
    item_desc: resolveLocalizedValue(descriptionI18n, preferred, DEFAULT_LEGACY_LANG),
  };
}

function collectItemNameKeys(item) {
  const keys = new Set();
  const nameI18n = normalizeLocalizedMap(item?.nameI18n, DEFAULT_LEGACY_LANG);
  Object.values(nameI18n).forEach((value) => {
    const key = String(value || "").trim().toLowerCase();
    if (key) keys.add(key);
  });
  const legacy = String(item?.item_name || "").trim().toLowerCase();
  if (legacy) keys.add(legacy);
  return keys;
}

function hasDuplicateItemName(items, nameI18n, excludeId = null) {
  const incoming = new Set(
    Object.values(normalizeLocalizedMap(nameI18n, DEFAULT_LEGACY_LANG))
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
  );
  if (incoming.size === 0) return false;

  return (items || []).some((item) => {
    if (excludeId && item?._id?.toString() === String(excludeId)) return false;
    const existing = collectItemNameKeys(item);
    for (const key of incoming) {
      if (existing.has(key)) return true;
    }
    return false;
  });
}

function serializeItemI18n(item, primaryCode = DEFAULT_LEGACY_LANG) {
  const plain = typeof item?.toObject === "function" ? item.toObject() : { ...item };

  const nameI18n = normalizeLocalizedMap(
    plain.nameI18n && Object.keys(plain.nameI18n).length
      ? plain.nameI18n
      : plain.item_name,
    DEFAULT_LEGACY_LANG
  );
  const descriptionI18n = normalizeLocalizedMap(
    plain.descriptionI18n && Object.keys(plain.descriptionI18n).length
      ? plain.descriptionI18n
      : plain.item_desc,
    DEFAULT_LEGACY_LANG
  );
  const preferred = [primaryCode, DEFAULT_LEGACY_LANG];

  const price = Array.isArray(plain.price)
    ? plain.price.map((entry) => {
        const sizeI18n = normalizeLocalizedMap(
          entry?.sizeI18n && Object.keys(entry.sizeI18n || {}).length
            ? entry.sizeI18n
            : entry?.item_size,
          primaryCode || DEFAULT_LEGACY_LANG
        );
        return {
          ...entry,
          sizeI18n,
          item_size:
            resolveLocalizedValue(sizeI18n, preferred, DEFAULT_LEGACY_LANG) ||
            entry?.item_size ||
            "",
        };
      })
    : plain.price;

  return {
    ...plain,
    nameI18n,
    descriptionI18n,
    price,
    item_name:
      resolveLocalizedValue(nameI18n, preferred, DEFAULT_LEGACY_LANG) ||
      plain.item_name ||
      "",
    item_desc:
      resolveLocalizedValue(descriptionI18n, preferred, DEFAULT_LEGACY_LANG) ||
      plain.item_desc ||
      "",
  };
}

module.exports = {
  parseItemI18nPayload,
  parsePriceSizeI18n,
  resolveItemPrimaryFields,
  hasDuplicateItemName,
  serializeItemI18n,
};
