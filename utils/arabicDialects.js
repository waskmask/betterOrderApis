const ARABIC_DIALECTS = [
  {
    code: "msa",
    name: "Modern Standard Arabic",
    nativeName: "الفصحى",
    promptHint:
      "Write in Modern Standard Arabic (MSA / الفصحى). Formal, clear catalog language suitable for an app UI. Avoid heavy colloquial slang.",
  },
  {
    code: "egyptian",
    name: "Egyptian",
    nativeName: "مصري",
    promptHint:
      "Write in Egyptian Arabic (مصري). Natural everyday Egyptian wording for food category labels and short descriptions, while remaining clear in an app catalog.",
  },
  {
    code: "levantine",
    name: "Levantine",
    nativeName: "شامي",
    promptHint:
      "Write in Levantine Arabic (شامي — Syria/Lebanon/Jordan/Palestine). Natural Levantine wording for food category labels and short descriptions, while remaining clear in an app catalog.",
  },
  {
    code: "gulf",
    name: "Gulf",
    nativeName: "خليجي",
    promptHint:
      "Write in Gulf Arabic (خليجي). Natural Gulf wording for food category labels and short descriptions, while remaining clear in an app catalog.",
  },
  {
    code: "maghrebi",
    name: "Maghrebi",
    nativeName: "مغربي",
    promptHint:
      "Write in Maghrebi Arabic (مغربي — Morocco/Algeria/Tunisia). Natural Maghrebi wording for food category labels and short descriptions, while remaining clear in an app catalog.",
  },
];

const ARABIC_DIALECT_CODES = ARABIC_DIALECTS.map((item) => item.code);
const DEFAULT_ARABIC_DIALECT = "msa";

function getArabicDialect(code) {
  const normalized = String(code || "").toLowerCase().trim();
  return ARABIC_DIALECTS.find((item) => item.code === normalized) || null;
}

function normalizeArabicDialect(value, { required = false } = {}) {
  const normalized = value == null || value === "" ? "" : String(value).toLowerCase().trim();
  if (!normalized) {
    return required ? null : DEFAULT_ARABIC_DIALECT;
  }
  if (!ARABIC_DIALECT_CODES.includes(normalized)) {
    return null;
  }
  return normalized;
}

function validateArabicDialect(value, { arabicActive = false } = {}) {
  if (!arabicActive) {
    const normalized = normalizeArabicDialect(value, { required: false });
    return { ok: true, value: normalized || DEFAULT_ARABIC_DIALECT };
  }
  const normalized = normalizeArabicDialect(value, { required: true });
  if (!normalized) {
    return { ok: false, message: "arabic_dialect_required" };
  }
  return { ok: true, value: normalized };
}

module.exports = {
  ARABIC_DIALECTS,
  ARABIC_DIALECT_CODES,
  DEFAULT_ARABIC_DIALECT,
  getArabicDialect,
  normalizeArabicDialect,
  validateArabicDialect,
};
