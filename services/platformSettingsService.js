const PlatformSettings = require("../modals/PlatformSettings");
const {
  validateContentLanguages,
  toContentLanguagesResponse,
} = require("../utils/contentLanguages");
const {
  DEFAULT_ARABIC_DIALECT,
  ARABIC_DIALECTS,
  validateArabicDialect,
} = require("../utils/arabicDialects");
const {
  DEFAULT_COUNTRY_CODE,
  normalizeCountryCode,
  getCountryByCode,
  getCountryProfile,
} = require("../utils/countries");

const DEFAULT_KEY = "default";
const DEFAULT_PLATFORM_NAME = "BetterOrder";

function isArabicActive(contentLanguages) {
  const slots = [
    contentLanguages?.primary,
    contentLanguages?.secondary,
    contentLanguages?.additional,
  ];
  return slots.some(
    (slot) =>
      slot?.code &&
      String(slot.code).toLowerCase() === "ar" &&
      slot.isActive !== false
  );
}

function resolveDefaultCountryCode(value) {
  return normalizeCountryCode(value) || DEFAULT_COUNTRY_CODE;
}

function normalizePlatformName(value) {
  const name = String(value || "").trim();
  return name || DEFAULT_PLATFORM_NAME;
}

function normalizeTaxValue(value) {
  return String(value || "").trim();
}

function normalizeSupportEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeSupportContact(value) {
  return String(value || "").trim();
}

function isValidSupportEmail(value) {
  if (!value) return true;
  return /^[\w-.]+@([\w-]+\.)+[\w-]{2,}$/i.test(value);
}

function isValidSupportPhone(value) {
  if (!value) return true;
  return /^[0-9+\s\-()]{5,20}$/.test(value);
}

function areSupportContactsConfigured(settingsOrDoc) {
  const email = normalizeSupportEmail(settingsOrDoc?.supportEmail);
  const phone = normalizeSupportContact(settingsOrDoc?.supportPhone);
  const whatsapp = normalizeSupportContact(settingsOrDoc?.supportWhatsapp);
  return Boolean(email && phone && whatsapp);
}

async function getPlatformSettingsDocument() {
  let doc = await PlatformSettings.findOne({ key: DEFAULT_KEY });
  if (!doc) {
    doc = await PlatformSettings.create({
      key: DEFAULT_KEY,
      contentLanguages: {
        primary: { code: "en", isActive: true },
        secondary: { code: null, isActive: false },
        additional: { code: null, isActive: false },
      },
      arabicDialect: DEFAULT_ARABIC_DIALECT,
      defaultCountryCode: DEFAULT_COUNTRY_CODE,
      platformName: DEFAULT_PLATFORM_NAME,
      platformCountryCode: DEFAULT_COUNTRY_CODE,
      platformTaxId: "",
      platformVatNumber: "",
      supportEmail: "",
      supportPhone: "",
      supportWhatsapp: "",
    });
  }
  let dirty = false;
  if (!doc.arabicDialect) {
    doc.arabicDialect = DEFAULT_ARABIC_DIALECT;
    dirty = true;
  }
  if (!normalizeCountryCode(doc.defaultCountryCode)) {
    doc.defaultCountryCode = DEFAULT_COUNTRY_CODE;
    dirty = true;
  }
  if (!String(doc.platformName || "").trim()) {
    doc.platformName = DEFAULT_PLATFORM_NAME;
    dirty = true;
  }
  if (!normalizeCountryCode(doc.platformCountryCode)) {
    doc.platformCountryCode = resolveDefaultCountryCode(doc.defaultCountryCode);
    dirty = true;
  }
  if (doc.platformTaxId == null) {
    doc.platformTaxId = "";
    dirty = true;
  }
  if (doc.platformVatNumber == null) {
    doc.platformVatNumber = "";
    dirty = true;
  }
  if (doc.supportEmail == null) {
    doc.supportEmail = "";
    dirty = true;
  }
  if (doc.supportPhone == null) {
    doc.supportPhone = "";
    dirty = true;
  }
  if (doc.supportWhatsapp == null) {
    doc.supportWhatsapp = "";
    dirty = true;
  }
  if (dirty) await doc.save();
  return doc;
}

function serializeSettings(doc) {
  const contentLanguages = toContentLanguagesResponse(doc.contentLanguages);
  const defaultCountryCode = resolveDefaultCountryCode(doc.defaultCountryCode);
  const defaultCountry = getCountryByCode(defaultCountryCode);
  const platformName = normalizePlatformName(doc.platformName);
  const platformCountryCode = resolveDefaultCountryCode(
    doc.platformCountryCode || doc.defaultCountryCode
  );
  const platformCountry = getCountryByCode(platformCountryCode);
  const platformCountryProfile = getCountryProfile(platformCountryCode);
  const platformTaxId = normalizeTaxValue(doc.platformTaxId);
  const platformVatNumber = normalizeTaxValue(doc.platformVatNumber);
  const supportEmail = normalizeSupportEmail(doc.supportEmail);
  const supportPhone = normalizeSupportContact(doc.supportPhone);
  const supportWhatsapp = normalizeSupportContact(doc.supportWhatsapp);
  return {
    contentLanguages,
    arabicDialect: doc.arabicDialect || DEFAULT_ARABIC_DIALECT,
    arabicDialects: ARABIC_DIALECTS,
    arabicActive: isArabicActive(contentLanguages),
    defaultCountryCode,
    defaultCountryName: defaultCountry?.name || "Germany",
    platformName,
    platformCountryCode,
    platformCountryName: platformCountry?.name || "Germany",
    platformTaxId,
    platformVatNumber,
    platformTaxLabels: {
      taxId: platformCountryProfile.legal.taxId.label,
      vatNumber: platformCountryProfile.legal.vat_number.label,
      vatVisible: platformCountryProfile.legal.vat_number.visible !== false,
    },
    supportEmail,
    supportPhone,
    supportWhatsapp,
    supportContactsConfigured: areSupportContactsConfigured({
      supportEmail,
      supportPhone,
      supportWhatsapp,
    }),
    updatedAt: doc.updatedAt,
    updatedBy: doc.updatedBy,
  };
}

async function getPlatformSettings() {
  const doc = await getPlatformSettingsDocument();
  return serializeSettings(doc);
}

async function updatePlatformSettings(input = {}, updatedBy = null) {
  const doc = await getPlatformSettingsDocument();

  const hasLanguagePayload =
    input.contentLanguages != null ||
    input.languages != null ||
    input.primary != null ||
    input.secondary != null ||
    input.additional != null;

  let nextContentLanguages = doc.contentLanguages;
  if (hasLanguagePayload) {
    const contentLanguagesInput =
      input.contentLanguages ??
      input.languages ??
      {
        primary: input.primary,
        secondary: input.secondary,
        additional: input.additional,
      };
    const validated = validateContentLanguages(contentLanguagesInput);
    if (!validated.ok) {
      const error = new Error(validated.message);
      error.statusCode = 400;
      throw error;
    }
    nextContentLanguages = validated.value;
  }

  const arabicActive = isArabicActive(nextContentLanguages);
  const dialectSource =
    input.arabicDialect !== undefined ? input.arabicDialect : doc.arabicDialect;
  const dialectResult = validateArabicDialect(dialectSource, { arabicActive });
  if (!dialectResult.ok) {
    const error = new Error(dialectResult.message);
    error.statusCode = 400;
    throw error;
  }

  if (input.defaultCountryCode !== undefined) {
    const nextCountryCode = normalizeCountryCode(input.defaultCountryCode);
    if (!nextCountryCode) {
      const error = new Error("invalid_default_country");
      error.statusCode = 400;
      throw error;
    }
    doc.defaultCountryCode = nextCountryCode;
  }

  if (input.platformName !== undefined) {
    const nextName = String(input.platformName || "").trim();
    if (!nextName || nextName.length > 80) {
      const error = new Error("invalid_platform_name");
      error.statusCode = 400;
      throw error;
    }
    doc.platformName = nextName;
  }

  if (input.platformCountryCode !== undefined) {
    const nextCountryCode = normalizeCountryCode(input.platformCountryCode);
    if (!nextCountryCode) {
      const error = new Error("invalid_platform_country");
      error.statusCode = 400;
      throw error;
    }
    doc.platformCountryCode = nextCountryCode;
  }

  if (input.platformTaxId !== undefined) {
    doc.platformTaxId = normalizeTaxValue(input.platformTaxId).slice(0, 64);
  }

  if (input.platformVatNumber !== undefined) {
    doc.platformVatNumber = normalizeTaxValue(input.platformVatNumber).slice(0, 64);
  }

  if (input.supportEmail !== undefined) {
    const nextEmail = normalizeSupportEmail(input.supportEmail);
    if (!isValidSupportEmail(nextEmail)) {
      const error = new Error("invalid_support_email");
      error.statusCode = 400;
      throw error;
    }
    doc.supportEmail = nextEmail;
  }

  if (input.supportPhone !== undefined) {
    const nextPhone = normalizeSupportContact(input.supportPhone);
    if (!isValidSupportPhone(nextPhone)) {
      const error = new Error("invalid_support_phone");
      error.statusCode = 400;
      throw error;
    }
    doc.supportPhone = nextPhone;
  }

  if (input.supportWhatsapp !== undefined) {
    const nextWhatsapp = normalizeSupportContact(input.supportWhatsapp);
    if (!isValidSupportPhone(nextWhatsapp)) {
      const error = new Error("invalid_support_whatsapp");
      error.statusCode = 400;
      throw error;
    }
    doc.supportWhatsapp = nextWhatsapp;
  }

  doc.contentLanguages = nextContentLanguages;
  doc.arabicDialect = dialectResult.value;
  doc.updatedBy = updatedBy || null;
  await doc.save();

  return serializeSettings(doc);
}

/** @deprecated use updatePlatformSettings */
async function updatePlatformContentLanguages(input, updatedBy = null) {
  return updatePlatformSettings({ contentLanguages: input }, updatedBy);
}

module.exports = {
  getPlatformSettings,
  updatePlatformSettings,
  updatePlatformContentLanguages,
  isArabicActive,
  resolveDefaultCountryCode,
  areSupportContactsConfigured,
  normalizeSupportEmail,
  normalizeSupportContact,
  normalizePlatformName,
  DEFAULT_PLATFORM_NAME,
};
