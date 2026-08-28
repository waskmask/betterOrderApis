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

function parseAddonI18nPayload(body = {}) {
  const labelFromJson = parseJsonObject(body.labelI18n ?? body.labels);
  const labelI18n = normalizeLocalizedMap(
    labelFromJson ?? body.addon_label ?? body.label,
    DEFAULT_LEGACY_LANG
  );
  return { labelI18n };
}

function parseAddonOptionI18n(option = {}, primaryCode = DEFAULT_LEGACY_LANG) {
  const nameI18n = normalizeLocalizedMap(
    option?.nameI18n ?? option?.addon_name,
    primaryCode || DEFAULT_LEGACY_LANG
  );
  const preferred = [primaryCode, DEFAULT_LEGACY_LANG];
  const addon_name =
    resolveLocalizedValue(nameI18n, preferred, DEFAULT_LEGACY_LANG) ||
    String(option?.addon_name || "").trim();
  return { addon_name, nameI18n };
}

async function resolveAddonPrimaryFields(labelI18n) {
  const primaryCode = await getPrimaryContentLanguageCode();
  const preferred = [primaryCode, DEFAULT_LEGACY_LANG];
  return {
    primaryCode,
    addon_label: resolveLocalizedValue(labelI18n, preferred, DEFAULT_LEGACY_LANG),
  };
}

function collectAddonLabelKeys(addon) {
  const keys = new Set();
  const labelI18n = normalizeLocalizedMap(addon?.labelI18n, DEFAULT_LEGACY_LANG);
  Object.values(labelI18n).forEach((value) => {
    const key = String(value || "").trim().toLowerCase();
    if (key) keys.add(key);
  });
  const legacy = String(addon?.addon_label || "").trim().toLowerCase();
  if (legacy) keys.add(legacy);
  return keys;
}

function hasDuplicateAddonLabel(addons, labelI18n, excludeIndex = null) {
  const incoming = new Set(
    Object.values(normalizeLocalizedMap(labelI18n, DEFAULT_LEGACY_LANG))
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
  );
  if (incoming.size === 0) return false;

  return (addons || []).some((addon, index) => {
    if (excludeIndex != null && Number(excludeIndex) === index) return false;
    const existing = collectAddonLabelKeys(addon);
    for (const key of incoming) {
      if (existing.has(key)) return true;
    }
    return false;
  });
}

function serializeAddonI18n(addon, primaryCode = DEFAULT_LEGACY_LANG) {
  if (!addon) return null;
  const plain = typeof addon?.toObject === "function" ? addon.toObject() : { ...addon };

  const labelI18n = normalizeLocalizedMap(
    plain.labelI18n && Object.keys(plain.labelI18n).length
      ? plain.labelI18n
      : plain.addon_label,
    DEFAULT_LEGACY_LANG
  );
  const preferred = [primaryCode, DEFAULT_LEGACY_LANG];

  const options = Array.isArray(plain.options)
    ? plain.options.map((option) => {
        const nameI18n = normalizeLocalizedMap(
          option?.nameI18n && Object.keys(option.nameI18n || {}).length
            ? option.nameI18n
            : option?.addon_name,
          primaryCode || DEFAULT_LEGACY_LANG
        );
        return {
          ...option,
          nameI18n,
          addon_name:
            resolveLocalizedValue(nameI18n, preferred, DEFAULT_LEGACY_LANG) ||
            option?.addon_name ||
            "",
        };
      })
    : [];

  return {
    ...plain,
    labelI18n,
    addon_label:
      resolveLocalizedValue(labelI18n, preferred, DEFAULT_LEGACY_LANG) ||
      plain.addon_label ||
      "",
    options,
  };
}

module.exports = {
  parseAddonI18nPayload,
  parseAddonOptionI18n,
  resolveAddonPrimaryFields,
  hasDuplicateAddonLabel,
  serializeAddonI18n,
};
