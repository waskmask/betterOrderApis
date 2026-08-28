function createAppError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

const { getArabicDialect, DEFAULT_ARABIC_DIALECT } = require("../utils/arabicDialects");

const LANGUAGE_NAMES = {
  en: "English",
  de: "German",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  nl: "Dutch",
  pl: "Polish",
  pt: "Portuguese",
  tr: "Turkish",
  ru: "Russian",
  ar: "Arabic",
  he: "Hebrew",
  fa: "Persian",
  ur: "Urdu",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  th: "Thai",
  hi: "Hindi",
};

/** Content kinds for BetterOrder menu / catalog localization. */
const CONTENT_TYPE_CONTEXT = {
  cuisine: {
    label: "Cuisine",
    context:
      "This is a cuisine type used to classify restaurants (e.g. Italian, Chinese, Halal).",
    nameHint:
      'Cuisine names should be the natural cuisine label in that language (e.g. German "chinesisch" → English "Chinese").',
    descriptionHint:
      "Descriptions stay short (about one sentence / max ~12 words when possible). Do not invent cuisine facts.",
  },
  category: {
    label: "Menu category",
    context:
      "This is a category of a restaurant menu (e.g. Salads, Pizzas, Drinks). It groups menu items.",
    nameHint:
      "Category names should sound like natural menu section titles customers scan in that language.",
    descriptionHint:
      "Category descriptions briefly explain what belongs in the section; keep them short and menu-like.",
  },
  item: {
    label: "Menu item",
    context:
      "This is a single dish or product on a restaurant menu (e.g. Margherita Pizza, Caesar Salad).",
    nameHint:
      "Item names should be natural dish/product titles as they appear on a menu in that language.",
    descriptionHint:
      "Item descriptions may mention ingredients or style; keep length similar and do not invent dishes or allergens not implied by the source.",
    sizesHint:
      "Size labels are short menu option names (e.g. Small/Medium/Large/Standard). Translate word labels naturally. Never invent extra sizes; keep array length and order identical to the source sizes array.",
  },
  extra: {
    label: "Extra menu option",
    context:
      "This is an extra / side option under a menu category (e.g. extra sauce, fries, bread).",
    nameHint: "Extra labels should be short option names suitable for an extras list.",
    descriptionHint: "Keep extra descriptions very short if present; prefer concise option wording.",
  },
  dressing: {
    label: "Dressing option",
    context:
      "This is a dressing choice for menu items in a category (e.g. Ranch, Balsamic, Yogurt).",
    nameHint: "Dressing names should be natural product/dressing labels in that language.",
    descriptionHint: "Keep dressing descriptions brief and factual.",
  },
  addon: {
    label: "Addon option",
    context:
      "This is a paid addon option for menu items in a category (e.g. Extra cheese, Bacon, Avocado).",
    nameHint: "Addon names should be short add-on labels suitable for a modifier list.",
    descriptionHint: "Keep addon descriptions brief if present.",
  },
  restaurant: {
    label: "Restaurant profile text",
    context:
      "This is restaurant-facing copy (name/description style fields) for a food-ordering platform.",
    nameHint: "Keep names brand-faithful; translate only when the field is meant to be localized.",
    descriptionHint: "Keep tone professional and close to the source length.",
  },
};

function languageLabel(code) {
  const normalized = String(code || "").toLowerCase();
  return LANGUAGE_NAMES[normalized] || normalized || "unknown";
}

function resolveContentType(contentType) {
  const key = String(contentType || "cuisine")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
  const aliases = {
    cuisine: "cuisine",
    cuisines: "cuisine",
    category: "category",
    categories: "category",
    menu_category: "category",
    item: "item",
    items: "item",
    menu_item: "item",
    extra: "extra",
    extras: "extra",
    extra_menu: "extra",
    dressing: "dressing",
    dressings: "dressing",
    addon: "addon",
    addons: "addon",
    restaurant: "restaurant",
  };
  const resolved = aliases[key] || (CONTENT_TYPE_CONTEXT[key] ? key : "cuisine");
  return {
    type: resolved,
    ...(CONTENT_TYPE_CONTEXT[resolved] || CONTENT_TYPE_CONTEXT.cuisine),
  };
}

function buildSystemPrompt(contentMeta) {
  return `You localize BetterOrder food-ordering content fields.

CONTENT TYPE: ${contentMeta.label}
CONTEXT: ${contentMeta.context}

Your job:
1. Detect the REAL language of each source field independently (do not trust the declared source language blindly).
2. For each target language, ONLY fill the fields listed under "fieldsToFill".
3. Do NOT rewrite fields that are already provided as existing values unless they are also listed in fieldsToFill.
4. Never invent facts, marketing fluff, or details that are not implied by the source.
5. Keep meaning, tone, and length similar.
6. ${contentMeta.nameHint}
7. ${contentMeta.descriptionHint}
8. ${contentMeta.sizesHint || "If sizes are requested, translate each word-based size label and keep array length/order identical."}
9. Do not transliterate into Latin if the target language uses another script; write in the target script.
10. If Arabic dialect instructions are provided, apply them only to Arabic (ar) outputs.
11. Do not add quotation marks, markdown, or explanations outside the JSON.

Per-field rules:
- If a field is in fieldsToFill → produce a natural translation (or copy if source text is already in that target language) and set action "translated" or "already_target".
- If a field is NOT in fieldsToFill → return the existing value unchanged and set action "skipped".
- If fieldsToFill includes a field but source for that field is empty → return "" (or [] for sizes) and set action "empty".
- For sizes: return a JSON string array with the SAME length and order as source sizes. Translate word labels only.

Return ONLY valid JSON with this exact shape:
{
  "translations": {
    "<langCode>": {
      "name": "string",
      "description": "string",
      "sizes": ["string"],
      "nameAction": "translated|already_target|empty|skipped",
      "descriptionAction": "translated|already_target|empty|skipped",
      "sizesAction": "translated|already_target|empty|skipped",
      "nameDetectedLanguage": "bcp47-ish code guess",
      "descriptionDetectedLanguage": "bcp47-ish code guess"
    }
  }
}

Include every requested target language code as a key under translations.`;
}

function buildUserPrompt({
  sourceLanguageCode,
  targets,
  name,
  description,
  sizes,
  arabicDialect,
  contentMeta,
}) {
  const sourceLang = languageLabel(sourceLanguageCode);
  const targetCodes = targets.map((item) => item.code);
  const sourceSizes = Array.isArray(sizes) ? sizes.map((value) => String(value || "").trim()) : [];

  let arabicBlock = "";
  if (targetCodes.includes("ar")) {
    const dialect = getArabicDialect(arabicDialect) || getArabicDialect(DEFAULT_ARABIC_DIALECT);
    arabicBlock = `

ARABIC DIALECT (applies only to target "ar"):
Dialect code: ${dialect.code}
Dialect name: ${dialect.name} (${dialect.nativeName})
Instructions: ${dialect.promptHint}`;
  }

  const targetBlocks = targets
    .map((item) => {
      const fields = item.fields.join(", ");
      const existingSizes = Array.isArray(item.existingSizes)
        ? item.existingSizes.map((value) => String(value || "").trim())
        : [];
      return `- ${languageLabel(item.code)} (${item.code})
  fieldsToFill: [${fields}]
  existingName: """${item.existingName || ""}"""
  existingDescription: """${item.existingDescription || ""}"""
  existingSizes: ${JSON.stringify(existingSizes)}`;
    })
    .join("\n");

  return `Content type: ${contentMeta.type} (${contentMeta.label})
Context: ${contentMeta.context}

Declared source language slot: ${sourceLang} (${sourceLanguageCode})
${arabicBlock}

Source name:
"""${name || ""}"""

Source description:
"""${description || ""}"""

Source sizes (ordered array; keep length/order when translating):
${JSON.stringify(sourceSizes)}

Targets (fill ONLY fieldsToFill for each; keep existing values for other fields):
${targetBlocks}`;
}

function parseJsonContent(content) {
  const text = String(content || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeAction(value, text, allowed = ["translated", "already_target", "empty", "skipped"]) {
  const trimmed = String(text || "").trim();
  const action = String(value || "").toLowerCase();
  if (allowed.includes(action)) {
    if (action === "empty" && trimmed) return "translated";
    return action;
  }
  return trimmed ? "translated" : "empty";
}

function normalizeSizesArray(value, expectedLength = 0) {
  const list = Array.isArray(value)
    ? value.map((entry) => String(entry ?? "").trim())
    : [];
  if (expectedLength <= 0) return list;
  const next = list.slice(0, expectedLength);
  while (next.length < expectedLength) next.push("");
  return next;
}

function normalizeTargetEntry(raw = {}, targetMeta = {}, sourceSizes = []) {
  const fields = new Set(targetMeta.fields || ["name", "description"]);
  const existingName = String(targetMeta.existingName || "").trim();
  const existingDescription = String(targetMeta.existingDescription || "").trim();
  const existingSizes = normalizeSizesArray(
    targetMeta.existingSizes,
    sourceSizes.length
  );

  let name = String(raw.name ?? "").trim();
  let description = String(raw.description ?? "").trim();
  let sizes = normalizeSizesArray(raw.sizes, sourceSizes.length);
  let nameAction = normalizeAction(raw.nameAction, name);
  let descriptionAction = normalizeAction(raw.descriptionAction, description);
  let sizesAction = normalizeAction(
    raw.sizesAction,
    sizes.filter(Boolean).join(" ")
  );

  if (!fields.has("name")) {
    name = existingName;
    nameAction = "skipped";
  }
  if (!fields.has("description")) {
    description = existingDescription;
    descriptionAction = "skipped";
  }
  if (!fields.has("sizes")) {
    sizes = existingSizes;
    sizesAction = "skipped";
  } else if (sourceSizes.length === 0) {
    sizes = [];
    sizesAction = "empty";
  } else {
    sizes = sizes.map((value, index) => value || existingSizes[index] || sourceSizes[index] || "");
    if (!sizes.some(Boolean)) sizesAction = "empty";
  }

  return {
    name,
    description,
    sizes,
    nameAction,
    descriptionAction,
    sizesAction,
    nameDetectedLanguage: String(raw.nameDetectedLanguage || "unknown").toLowerCase(),
    descriptionDetectedLanguage: String(raw.descriptionDetectedLanguage || "unknown").toLowerCase(),
    fields: Array.from(fields),
  };
}

function normalizeTargetsInput({
  sourceCode,
  targetLanguageCode,
  targetLanguageCodes,
  targets,
}) {
  const allowedFields = new Set(["name", "description", "sizes"]);

  if (Array.isArray(targets) && targets.length > 0) {
    return targets
      .map((item) => {
        const code = String(item?.code || "").toLowerCase().trim();
        if (!code || code === sourceCode) return null;
        const fields = Array.isArray(item.fields)
          ? item.fields
              .map((field) => String(field || "").toLowerCase())
              .filter((field) => allowedFields.has(field))
          : Array.isArray(item.fieldsToFill)
            ? item.fieldsToFill
                .map((field) => String(field || "").toLowerCase())
                .filter((field) => allowedFields.has(field))
          : [];
        if (fields.length === 0) return null;
        return {
          code,
          fields: Array.from(new Set(fields)),
          existingName: String(item.existingName || "").trim(),
          existingDescription: String(item.existingDescription || "").trim(),
          existingSizes: Array.isArray(item.existingSizes)
            ? item.existingSizes.map((value) => String(value || "").trim())
            : [],
        };
      })
      .filter(Boolean);
  }

  const codes = Array.from(
    new Set(
      [
        ...(Array.isArray(targetLanguageCodes) ? targetLanguageCodes : []),
        targetLanguageCode,
      ]
        .filter(Boolean)
        .map((code) => String(code).toLowerCase().trim())
        .filter((code) => code && code !== sourceCode)
    )
  );

  return codes.map((code) => ({
    code,
    fields: ["name", "description"],
    existingName: "",
    existingDescription: "",
    existingSizes: [],
  }));
}

async function localizeContentFields({
  sourceLanguageCode,
  targetLanguageCode,
  targetLanguageCodes,
  targets: targetsInput,
  name,
  description,
  sizes,
  arabicDialect,
  contentType,
} = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model =
    process.env.OPENAI_MODEL_CONTENT_I18N ||
    process.env.OPENAI_MODEL_CUISINE_I18N ||
    "gpt-5.6-luna";

  if (!apiKey) {
    throw createAppError("openai_not_configured", 500);
  }

  const contentMeta = resolveContentType(contentType);
  const sourceCode = String(sourceLanguageCode || "").toLowerCase().trim();
  const targets = normalizeTargetsInput({
    sourceCode,
    targetLanguageCode,
    targetLanguageCodes,
    targets: targetsInput,
  });

  const sourceName = String(name || "").trim();
  const sourceDescription = String(description || "").trim();
  const sourceSizes = Array.isArray(sizes)
    ? sizes.map((value) => String(value || "").trim())
    : [];

  if (!sourceCode) {
    throw createAppError("language_codes_required", 400);
  }
  if (targets.length === 0) {
    throw createAppError("nothing_to_translate", 400);
  }
  if (!sourceName && !sourceDescription && sourceSizes.length === 0) {
    throw createAppError("source_text_required", 400);
  }

  // Need source text for at least one requested field type
  const needsName = targets.some((item) => item.fields.includes("name"));
  const needsDescription = targets.some((item) => item.fields.includes("description"));
  const needsSizes = targets.some((item) => item.fields.includes("sizes"));
  if (
    needsName &&
    !sourceName &&
    needsDescription &&
    !sourceDescription &&
    (!needsSizes || sourceSizes.length === 0)
  ) {
    throw createAppError("source_text_required", 400);
  }
  if (needsName && !sourceName && !needsDescription && !needsSizes) {
    throw createAppError("source_name_required", 400);
  }
  if (needsDescription && !sourceDescription && !needsName && !needsSizes) {
    throw createAppError("source_description_required", 400);
  }
  if (needsSizes && sourceSizes.length === 0 && !needsName && !needsDescription) {
    throw createAppError("source_text_required", 400);
  }

  const dialectCode =
    String(arabicDialect || DEFAULT_ARABIC_DIALECT).toLowerCase().trim() ||
    DEFAULT_ARABIC_DIALECT;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt(contentMeta) },
        {
          role: "user",
          content: buildUserPrompt({
            sourceLanguageCode: sourceCode,
            targets,
            name: sourceName,
            description: sourceDescription,
            sizes: sourceSizes,
            arabicDialect: dialectCode,
            contentMeta,
          }),
        },
      ],
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error?.message || `openai_http_${response.status}`;
    throw createAppError(detail, 502);
  }

  const parsed = parseJsonContent(data?.choices?.[0]?.message?.content);
  if (!parsed || typeof parsed !== "object") {
    throw createAppError("invalid_i18n_response", 502);
  }

  const rawTranslations =
    parsed.translations && typeof parsed.translations === "object"
      ? parsed.translations
      : parsed;

  const translations = {};
  for (const target of targets) {
    const entry = rawTranslations[target.code] || rawTranslations[target.code.toUpperCase()] || {};
    translations[target.code] = normalizeTargetEntry(entry, target, sourceSizes);
  }

  const primaryTarget = targets[0].code;
  const first = translations[primaryTarget] || normalizeTargetEntry({}, {}, sourceSizes);

  return {
    translations,
    name: first.name,
    description: first.description,
    sizes: first.sizes,
    nameAction: first.nameAction,
    descriptionAction: first.descriptionAction,
    sizesAction: first.sizesAction,
    nameDetectedLanguage: first.nameDetectedLanguage,
    descriptionDetectedLanguage: first.descriptionDetectedLanguage,
    model,
    contentType: contentMeta.type,
    sourceLanguageCode: sourceCode,
    targetLanguageCode: primaryTarget,
    targetLanguageCodes: targets.map((item) => item.code),
    targets,
    arabicDialect: targets.some((item) => item.code === "ar") ? dialectCode : null,
  };
}

/** @deprecated Prefer localizeContentFields — kept for existing callers. */
async function localizeCuisineFields(options = {}) {
  return localizeContentFields({ ...options, contentType: options.contentType || "cuisine" });
}

module.exports = {
  localizeContentFields,
  localizeCuisineFields,
  resolveContentType,
  CONTENT_TYPE_CONTEXT,
  buildSystemPrompt,
};
