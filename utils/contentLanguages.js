const CONTENT_LANGUAGES = [
  { code: "en", name: "English", nativeName: "English", direction: "ltr" },
  { code: "de", name: "German", nativeName: "Deutsch", direction: "ltr" },
  { code: "fr", name: "French", nativeName: "Francais", direction: "ltr" },
  { code: "es", name: "Spanish", nativeName: "Espanol", direction: "ltr" },
  { code: "it", name: "Italian", nativeName: "Italiano", direction: "ltr" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands", direction: "ltr" },
  { code: "pl", name: "Polish", nativeName: "Polski", direction: "ltr" },
  { code: "pt", name: "Portuguese", nativeName: "Portugues", direction: "ltr" },
  { code: "tr", name: "Turkish", nativeName: "Turkce", direction: "ltr" },
  { code: "ru", name: "Russian", nativeName: "Russkiy", direction: "ltr" },
  { code: "ar", name: "Arabic", nativeName: "العربية", direction: "rtl" },
  { code: "he", name: "Hebrew", nativeName: "עברית", direction: "rtl" },
  { code: "fa", name: "Persian", nativeName: "فارسی", direction: "rtl" },
  { code: "ur", name: "Urdu", nativeName: "اردو", direction: "rtl" },
];

const CONTENT_LANGUAGE_CODES = CONTENT_LANGUAGES.map((item) => item.code);
const RTL_LANGUAGE_CODES = new Set(
  CONTENT_LANGUAGES.filter((item) => item.direction === "rtl").map((item) => item.code)
);

function getContentLanguage(code) {
  return CONTENT_LANGUAGES.find((item) => item.code === code) || null;
}

function getLanguageDirection(code) {
  if (!code) return "ltr";
  return RTL_LANGUAGE_CODES.has(code) ? "rtl" : "ltr";
}

function normalizeSlot(value, { fallbackCode = null, defaultActive = true } = {}) {
  if (value == null || value === "") {
    if (!fallbackCode) {
      return { code: null, isActive: false };
    }
    return { code: fallbackCode, isActive: defaultActive };
  }

  if (typeof value === "string") {
    return {
      code: value.toLowerCase(),
      isActive: defaultActive,
    };
  }

  const code = value.code ? String(value.code).toLowerCase() : null;
  return {
    code,
    isActive: code ? value.isActive !== false : false,
  };
}

function normalizeContentLanguages(input = {}) {
  // Backward compat: old global isActive applied when slots are still plain strings.
  const legacyActive = input.isActive !== false;
  const primaryRaw = input.primary;
  const secondaryRaw = input.secondary;
  const additionalRaw = input.additional;
  const usedLegacyStrings =
    typeof primaryRaw === "string" ||
    typeof secondaryRaw === "string" ||
    typeof additionalRaw === "string";

  const primary = normalizeSlot(primaryRaw, {
    fallbackCode: "en",
    defaultActive: usedLegacyStrings ? legacyActive : true,
  });
  const secondary = normalizeSlot(secondaryRaw, {
    defaultActive: usedLegacyStrings ? legacyActive : true,
  });
  const additional = normalizeSlot(additionalRaw, {
    defaultActive: usedLegacyStrings ? legacyActive : true,
  });

  return { primary, secondary, additional };
}

function validateContentLanguages(input = {}) {
  const normalized = normalizeContentLanguages(input);
  const { primary, secondary, additional } = normalized;

  if (!primary.code || !CONTENT_LANGUAGE_CODES.includes(primary.code)) {
    return { ok: false, message: "invalid_primary_language" };
  }

  if (secondary.code && !CONTENT_LANGUAGE_CODES.includes(secondary.code)) {
    return { ok: false, message: "invalid_secondary_language" };
  }

  if (additional.code && !CONTENT_LANGUAGE_CODES.includes(additional.code)) {
    return { ok: false, message: "invalid_additional_language" };
  }

  if (additional.code && !secondary.code) {
    return { ok: false, message: "secondary_required_before_additional" };
  }

  if (secondary.isActive && !secondary.code) {
    return { ok: false, message: "secondary_language_required_when_active" };
  }

  if (additional.isActive && !additional.code) {
    return { ok: false, message: "additional_language_required_when_active" };
  }

  const selected = [primary.code, secondary.code, additional.code].filter(Boolean);
  if (new Set(selected).size !== selected.length) {
    return { ok: false, message: "duplicate_content_languages" };
  }

  if (selected.length > 3) {
    return { ok: false, message: "max_content_languages_exceeded" };
  }

  return {
    ok: true,
    value: {
      primary: {
        code: primary.code,
        isActive: primary.isActive !== false,
      },
      secondary: {
        code: secondary.code || null,
        isActive: Boolean(secondary.code) && secondary.isActive !== false,
      },
      additional: {
        code: additional.code || null,
        isActive: Boolean(additional.code) && additional.isActive !== false,
      },
    },
  };
}

function toContentLanguagesResponse(languages) {
  const normalized = normalizeContentLanguages(languages);
  const slots = [
    { slot: "primary", ...normalized.primary },
    { slot: "secondary", ...normalized.secondary },
    { slot: "additional", ...normalized.additional },
  ].map((item) => {
    const meta = item.code ? getContentLanguage(item.code) : null;
    return {
      slot: item.slot,
      code: item.code,
      isActive: Boolean(item.code) && item.isActive !== false,
      name: meta?.name || item.code,
      nativeName: meta?.nativeName || item.code,
      direction: getLanguageDirection(item.code),
    };
  });

  return {
    primary: normalized.primary,
    secondary: normalized.secondary,
    additional: normalized.additional,
    // Flat helpers for simpler clients
    primaryCode: normalized.primary.code,
    secondaryCode: normalized.secondary.code,
    additionalCode: normalized.additional.code,
    slots,
    catalog: CONTENT_LANGUAGES,
  };
}

module.exports = {
  CONTENT_LANGUAGES,
  CONTENT_LANGUAGE_CODES,
  getContentLanguage,
  getLanguageDirection,
  normalizeContentLanguages,
  validateContentLanguages,
  toContentLanguagesResponse,
};
