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

function parseExtraI18nPayload(body = {}) {
  const labelFromJson = parseJsonObject(body.labelI18n ?? body.labels);
  const labelI18n = normalizeLocalizedMap(
    labelFromJson ?? body.label,
    DEFAULT_LEGACY_LANG
  );
  return { labelI18n };
}

async function resolveExtraPrimaryFields(labelI18n) {
  const primaryCode = await getPrimaryContentLanguageCode();
  const preferred = [primaryCode, DEFAULT_LEGACY_LANG];
  return {
    primaryCode,
    label: resolveLocalizedValue(labelI18n, preferred, DEFAULT_LEGACY_LANG),
  };
}

function collectExtraLabelKeys(extra) {
  const keys = new Set();
  const labelI18n = normalizeLocalizedMap(extra?.labelI18n, DEFAULT_LEGACY_LANG);
  Object.values(labelI18n).forEach((value) => {
    const key = String(value || "").trim().toLowerCase();
    if (key) keys.add(key);
  });
  const legacy = String(extra?.label || "").trim().toLowerCase();
  if (legacy) keys.add(legacy);
  return keys;
}

function hasDuplicateExtraLabel(extras, labelI18n, excludeId = null) {
  const incoming = new Set(
    Object.values(normalizeLocalizedMap(labelI18n, DEFAULT_LEGACY_LANG))
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
  );
  if (incoming.size === 0) return false;

  return (extras || []).some((extra) => {
    if (excludeId && extra?._id?.toString() === String(excludeId)) return false;
    const existing = collectExtraLabelKeys(extra);
    for (const key of incoming) {
      if (existing.has(key)) return true;
    }
    return false;
  });
}

function serializeExtraI18n(extra, primaryCode = DEFAULT_LEGACY_LANG) {
  const plain = typeof extra?.toObject === "function" ? extra.toObject() : { ...extra };
  const labelI18n = normalizeLocalizedMap(
    plain.labelI18n && Object.keys(plain.labelI18n).length
      ? plain.labelI18n
      : plain.label,
    DEFAULT_LEGACY_LANG
  );
  const preferred = [primaryCode, DEFAULT_LEGACY_LANG];

  return {
    ...plain,
    labelI18n,
    label:
      resolveLocalizedValue(labelI18n, preferred, DEFAULT_LEGACY_LANG) ||
      plain.label ||
      "",
  };
}

module.exports = {
  parseExtraI18nPayload,
  resolveExtraPrimaryFields,
  hasDuplicateExtraLabel,
  serializeExtraI18n,
};
