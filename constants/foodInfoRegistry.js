const ALLERGEN_IDS = Object.freeze([
  "CEREALS_GLUTEN",
  "CRUSTACEANS",
  "EGGS",
  "FISH",
  "PEANUTS",
  "SOYBEANS",
  "MILK",
  "NUTS",
  "CELERY",
  "MUSTARD",
  "SESAME",
  "SULPHITES",
  "LUPIN",
  "MOLLUSCS",
]);

const ADDITIVE_IDS = Object.freeze([
  "COLORANT",
  "PRESERVATIVE",
  "ANTIOXIDANT",
  "FLAVOUR_ENHANCER",
  "SWEETENER",
  "PHOSPHATE",
  "SULPHUR_DIOXIDE_SULPHITES",
  "CAFFEINE",
  "QUININE",
  "WAXED",
  "BLACKENED",
  "PHENYLALANINE_SOURCE",
]);

const ALLERGEN_LABELS = Object.freeze({
  CEREALS_GLUTEN: {
    en: "Cereals containing gluten",
    de: "Glutenhaltiges Getreide",
  },
  CRUSTACEANS: {
    en: "Crustaceans",
    de: "Krebstiere",
  },
  EGGS: {
    en: "Eggs",
    de: "Eier",
  },
  FISH: {
    en: "Fish",
    de: "Fisch",
  },
  PEANUTS: {
    en: "Peanuts",
    de: "Erdnüsse",
  },
  SOYBEANS: {
    en: "Soybeans",
    de: "Soja",
  },
  MILK: {
    en: "Milk",
    de: "Milch",
  },
  NUTS: {
    en: "Nuts",
    de: "Schalenfrüchte",
  },
  CELERY: {
    en: "Celery",
    de: "Sellerie",
  },
  MUSTARD: {
    en: "Mustard",
    de: "Senf",
  },
  SESAME: {
    en: "Sesame",
    de: "Sesam",
  },
  SULPHITES: {
    en: "Sulphur dioxide and sulphites",
    de: "Schwefeldioxid und Sulfite",
  },
  LUPIN: {
    en: "Lupin",
    de: "Lupine",
  },
  MOLLUSCS: {
    en: "Molluscs",
    de: "Weichtiere",
  },
});

const ADDITIVE_LABELS = Object.freeze({
  COLORANT: {
    en: "Colorant",
    de: "Farbstoff",
  },
  PRESERVATIVE: {
    en: "Preservative",
    de: "Konservierungsstoff",
  },
  ANTIOXIDANT: {
    en: "Antioxidant",
    de: "Antioxidationsmittel",
  },
  FLAVOUR_ENHANCER: {
    en: "Flavour enhancer",
    de: "Geschmacksverstärker",
  },
  SWEETENER: {
    en: "Sweetener",
    de: "Süßungsmittel",
  },
  PHOSPHATE: {
    en: "Phosphate",
    de: "Phosphat",
  },
  SULPHUR_DIOXIDE_SULPHITES: {
    en: "Sulphur dioxide / sulphites",
    de: "Schwefeldioxid / Sulfite",
  },
  CAFFEINE: {
    en: "Contains caffeine",
    de: "Koffeinhaltig",
  },
  QUININE: {
    en: "Contains quinine",
    de: "Chininhaltig",
  },
  WAXED: {
    en: "Waxed",
    de: "Gewachst",
  },
  BLACKENED: {
    en: "Blackened",
    de: "Geschwärzt",
  },
  PHENYLALANINE_SOURCE: {
    en: "Contains a source of phenylalanine",
    de: "Enthält eine Phenylalaninquelle",
  },
});

const ALLERGEN_ID_SET = new Set(ALLERGEN_IDS);
const ADDITIVE_ID_SET = new Set(ADDITIVE_IDS);

function normalizeId(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function isValidAllergenId(value) {
  return ALLERGEN_ID_SET.has(normalizeId(value));
}

function isValidAdditiveId(value) {
  return ADDITIVE_ID_SET.has(normalizeId(value));
}

function normalizeIdList(values, kind) {
  if (!Array.isArray(values)) return [];

  const allowed = kind === "additive" ? ADDITIVE_ID_SET : ALLERGEN_ID_SET;
  const seen = new Set();
  const normalized = [];

  for (const value of values) {
    if (typeof value !== "string") continue;
    const id = normalizeId(value);
    if (!allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }

  return normalized;
}

function labelsForIds(ids, kind) {
  const catalog = kind === "additive" ? ADDITIVE_LABELS : ALLERGEN_LABELS;
  const en = [];
  const de = [];

  for (const id of ids) {
    const labels = catalog[id];
    if (!labels) continue;
    en.push(labels.en);
    de.push(labels.de);
  }

  return { en, de };
}

function labelForId(id, lang, kind) {
  const catalog = kind === "additive" ? ADDITIVE_LABELS : ALLERGEN_LABELS;
  const labels = catalog[normalizeId(id)];
  if (!labels) return null;
  const code = String(lang || "en").toLowerCase().startsWith("de") ? "de" : "en";
  return labels[code] || labels.en;
}

function buildLabelLookup(kind) {
  const catalog = kind === "additive" ? ADDITIVE_LABELS : ALLERGEN_LABELS;
  const lookup = new Map();

  for (const [id, labels] of Object.entries(catalog)) {
    lookup.set(String(labels.en).trim().toLowerCase(), id);
    lookup.set(String(labels.de).trim().toLowerCase(), id);
  }

  return lookup;
}

const ALLERGEN_LABEL_LOOKUP = buildLabelLookup("allergen");
const ADDITIVE_LABEL_LOOKUP = buildLabelLookup("additive");

function resolveCodeFromLabel(label, kind) {
  const key = String(label || "").trim().toLowerCase();
  if (!key) return "";
  const lookup = kind === "additive" ? ADDITIVE_LABEL_LOOKUP : ALLERGEN_LABEL_LOOKUP;
  return lookup.get(key) || "";
}

module.exports = {
  ALLERGEN_IDS,
  ADDITIVE_IDS,
  ALLERGEN_LABELS,
  ADDITIVE_LABELS,
  isValidAllergenId,
  isValidAdditiveId,
  normalizeIdList,
  labelsForIds,
  labelForId,
  resolveCodeFromLabel,
};
