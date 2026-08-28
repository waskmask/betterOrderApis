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

function parseDressingI18nPayload(body = {}) {
  const labelFromJson = parseJsonObject(body.labelI18n ?? body.labels);
  const labelI18n = normalizeLocalizedMap(
    labelFromJson ?? body.dressing_label ?? body.label,
    DEFAULT_LEGACY_LANG
  );
  return { labelI18n };
}

function parseDressingOptionI18n(option = {}, primaryCode = DEFAULT_LEGACY_LANG) {
  const nameI18n = normalizeLocalizedMap(
    option?.nameI18n ?? option?.dressing_name,
    primaryCode || DEFAULT_LEGACY_LANG
  );
  const preferred = [primaryCode, DEFAULT_LEGACY_LANG];
  const dressing_name =
    resolveLocalizedValue(nameI18n, preferred, DEFAULT_LEGACY_LANG) ||
    String(option?.dressing_name || "").trim();
  return { dressing_name, nameI18n };
}

async function resolveDressingPrimaryFields(labelI18n) {
  const primaryCode = await getPrimaryContentLanguageCode();
  const preferred = [primaryCode, DEFAULT_LEGACY_LANG];
  return {
    primaryCode,
    dressing_label: resolveLocalizedValue(labelI18n, preferred, DEFAULT_LEGACY_LANG),
  };
}

function serializeDressingI18n(dressing, primaryCode = DEFAULT_LEGACY_LANG) {
  if (!dressing) return null;
  const plain =
    typeof dressing?.toObject === "function" ? dressing.toObject() : { ...dressing };

  const labelI18n = normalizeLocalizedMap(
    plain.labelI18n && Object.keys(plain.labelI18n).length
      ? plain.labelI18n
      : plain.dressing_label,
    DEFAULT_LEGACY_LANG
  );
  const preferred = [primaryCode, DEFAULT_LEGACY_LANG];

  const options = Array.isArray(plain.options)
    ? plain.options.map((option) => {
        const nameI18n = normalizeLocalizedMap(
          option?.nameI18n && Object.keys(option.nameI18n || {}).length
            ? option.nameI18n
            : option?.dressing_name,
          primaryCode || DEFAULT_LEGACY_LANG
        );
        return {
          ...option,
          nameI18n,
          dressing_name:
            resolveLocalizedValue(nameI18n, preferred, DEFAULT_LEGACY_LANG) ||
            option?.dressing_name ||
            "",
        };
      })
    : [];

  return {
    ...plain,
    labelI18n,
    dressing_label:
      resolveLocalizedValue(labelI18n, preferred, DEFAULT_LEGACY_LANG) ||
      plain.dressing_label ||
      "",
    options,
  };
}

module.exports = {
  parseDressingI18nPayload,
  parseDressingOptionI18n,
  resolveDressingPrimaryFields,
  serializeDressingI18n,
};
