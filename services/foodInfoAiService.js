const {
  normalizeIdList,
  labelsForIds,
} = require("../constants/foodInfoRegistry");

function createAppError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function truncate(value, max = 400) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function stripMarkdownCodeFence(value) {
  const text = String(value || "").trim();
  const fencedMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedMatch ? fencedMatch[1].trim() : text;
}

function extractJsonCandidate(value) {
  const text = String(value || "").trim();
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1).trim();
  }

  return text;
}

const SYSTEM_PROMPT = `You are a food allergen and additive draft assistant for restaurant menus.

Your job is to propose likely EU Annex II allergens and common additive categories for a menu item, as a draft for the restaurant to review and verify.

You MAY use recipe and culinary knowledge. Infer typical ingredients from:
- item_name
- item_desc
- info_modal_text
- restaurant_country / restaurant_country_code (adapt regional recipes and local preparation norms)

Prefer the restaurant country when the same dish name has regional variants.

This output is a DRAFT only. Still be practical and realistic — include allergens/additives that are typically present for that dish in that country, not rare edge cases.

INFERENCE THRESHOLD

Infer an allergen or additive only when it is commonly expected
for the identified dish/product in the specified restaurant country.

Include typical/common declarations.
Do not include ingredients or additives that are merely possible,
brand-dependent, optional, or uncommon.

When several common recipe variants exist and an allergen/additive
is present only in some variants, omit it unless supported by the
source text.

The goal is a useful conservative draft, not an exhaustive list of
everything the dish could potentially contain.

EXPLICIT TEXT FIRST
- If the source text names an ingredient or allergen, always include the matching canonical ID.
- Also include likely IDs from standard recipes for the named dish (e.g. Pizza Margherita in Germany → CEREALS_GLUTEN + MILK; Carbonara → CEREALS_GLUTEN + EGGS + MILK; Döner / Dönerfleisch / Döner Salat in Germany → CEREALS_GLUTEN, EGGS, MILK are commonly declared; cured/processed meats like Dönerfleisch, salami, ham often imply PRESERVATIVE).

CANONICAL ALLERGEN IDS (return only these):
CEREALS_GLUTEN, CRUSTACEANS, EGGS, FISH, PEANUTS, SOYBEANS, MILK, NUTS, CELERY, MUSTARD, SESAME, SULPHITES, LUPIN, MOLLUSCS

Ingredient hints (non-exhaustive):
- milk / Milch / cheese / Käse / mozzarella / butter / cream / Sahne / yogurt → MILK
- wheat / Weizen / flour / Mehl / bread / Brot / pasta / Nudeln / pizza / Teig → CEREALS_GLUTEN
- egg / Ei / mayonnaise / mayo → EGGS
- fish / Fisch / tuna / Thunfisch / salmon / Lachs → FISH
- shrimp / Garnelen / lobster / Hummer → CRUSTACEANS
- soy / soja / soy sauce → SOYBEANS
- peanut / Erdnuss → PEANUTS
- almond / hazelnut / walnut / pistachio / nuts / Nüsse → NUTS
- celery / Sellerie → CELERY
- mustard / Senf → MUSTARD
- sesame / Sesam → SESAME
- lupin / Lupine → LUPIN
- mussels / squid / octopus / oyster → MOLLUSCS
- sulphites / sulfur dioxide when relevant (wine, dried fruit, etc.) → SULPHITES

CANONICAL ADDITIVE IDS (return only these):
COLORANT, PRESERVATIVE, ANTIOXIDANT, FLAVOUR_ENHANCER, SWEETENER, PHOSPHATE, SULPHUR_DIOXIDE_SULPHITES, CAFFEINE, QUININE, WAXED, BLACKENED, PHENYLALANINE_SOURCE

Additive guidance:
- Include PRESERVATIVE when the dish typically uses cured/processed meat (Dönerfleisch, salami, ham, sausage) or when preservatives are commonly declared for that item in the restaurant country.
- Include COLORANT, SWEETENER, FLAVOUR_ENHANCER, CAFFEINE, etc. only when typical for that dish/drink (e.g. cola → CAFFEINE; many soft drinks → COLORANT/SWEETENER).
- Map nitrite/nitrate curing salt style declarations to PRESERVATIVE (no separate nitrate ID exists).

DEDUPLICATION
- Return each ID at most once.

UNKNOWN
- If the name is too vague to infer a recipe (e.g. only "Special"), return empty arrays.

OUTPUT
Return ONLY valid JSON:
{
  "allergens": [],
  "additives": []
}

No Markdown. No explanations. No translated labels. No extra fields.`;

function buildUserPrompt({
  item_name,
  item_desc,
  info_modal_text,
  restaurant_country,
  restaurant_country_code,
}) {
  return `Propose likely allergens and additives for this menu item using culinary/recipe knowledge for the restaurant country.

restaurant_country:
${restaurant_country}

restaurant_country_code:
${restaurant_country_code}

item_name:
${item_name}

item_desc:
${item_desc}

info_modal_text:
${info_modal_text}

Return the required JSON only.`;
}

function normalizeAiIdPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw createAppError("food_info_ai_invalid_response", 502);
  }

  if (!("allergens" in payload) || !("additives" in payload)) {
    throw createAppError("food_info_ai_invalid_response", 502);
  }

  if (!Array.isArray(payload.allergens) || !Array.isArray(payload.additives)) {
    throw createAppError("food_info_ai_invalid_response", 502);
  }

  const allergenCodes = normalizeIdList(payload.allergens, "allergen");
  const additiveCodes = normalizeIdList(payload.additives, "additive");
  const allergenLabels = labelsForIds(allergenCodes, "allergen");
  const additiveLabels = labelsForIds(additiveCodes, "additive");

  return {
    draft: {
      allergens_en: allergenLabels.en,
      allergens_de: allergenLabels.de,
      additives_en: additiveLabels.en,
      additives_de: additiveLabels.de,
      allergen_codes: allergenCodes,
      additive_codes: additiveCodes,
    },
  };
}

async function generateFoodInfoDraft({
  item_name,
  item_desc,
  info_modal_text,
  restaurant_country,
  restaurant_country_code,
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL_FOOD_INFO || "gpt-5.4-nano";

  if (!apiKey) {
    throw createAppError("food_info_ai_api_key_missing", 500);
  }

  const userPrompt = buildUserPrompt({
    item_name,
    item_desc,
    info_modal_text,
    restaurant_country,
    restaurant_country_code,
  });

  console.info("[food-info-ai] generating draft", {
    model,
    item_name,
    item_desc,
    info_modal_text,
    restaurant_country,
    restaurant_country_code,
  });

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
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("[food-info-ai] upstream error", {
      status: response.status,
      body: truncate(JSON.stringify(data), 1200),
    });
    throw createAppError("food_info_ai_upstream_error", 502);
  }

  console.info("[food-info-ai] upstream response", {
    id: data?.id,
    model: data?.model,
    usage: data?.usage,
  });

  const rawText = String(data?.choices?.[0]?.message?.content || "").trim();

  if (!rawText) {
    console.error("[food-info-ai] invalid empty text response", {
      choices: data?.choices,
    });
    throw createAppError("food_info_ai_invalid_response", 502);
  }

  console.info("[food-info-ai] raw text response", {
    rawText: truncate(rawText, 1200),
  });

  let parsed;
  try {
    parsed = JSON.parse(stripMarkdownCodeFence(extractJsonCandidate(rawText)));
  } catch {
    console.error("[food-info-ai] json parse failed", {
      rawText: truncate(rawText, 1200),
    });
    throw createAppError("food_info_ai_invalid_response", 502);
  }

  const { draft } = normalizeAiIdPayload(parsed);
  console.info("[food-info-ai] normalized draft", { draft });

  return {
    draft,
    usage: {
      input_tokens:
        typeof data?.usage?.prompt_tokens === "number" ? data.usage.prompt_tokens : 0,
      output_tokens:
        typeof data?.usage?.completion_tokens === "number"
          ? data.usage.completion_tokens
          : 0,
    },
  };
}

module.exports = {
  generateFoodInfoDraft,
  SYSTEM_PROMPT,
  buildUserPrompt,
};
