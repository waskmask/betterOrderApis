function createAppError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function buildCuisineImagePrompt({ name, languageCode } = {}) {
  const cuisineName = String(name || "").trim();
  const code = String(languageCode || "").trim().toLowerCase() || "en";

  return `Create a consistent food category image for the BetterOrder food-ordering app.

INPUT:
* Category / cuisine name: "${cuisineName}"
* Language code: "${code}"

Interpret the category name according to the provided language code.
The category name may be localized, translated, or written in a non-Latin script.

Do NOT render the category name or any text in the image.

IMAGE STYLE:
* Real food photography for a food-delivery / takeaway app category grid
* Appetizing commercial presentation, freshly prepared
* Soft studio lighting, natural realistic colors
* Subtle soft drop shadow under the food so it reads clearly on any colored UI tile
* No illustration, cartoon, emoji style, or 3D-rendered look

SUBJECT (match popular delivery-app category icons):
* Show one clear representative dish for the category — the most recognizable option
* Prefer takeaway / delivery presentation when natural:
  - Pizza → open WHITE pizza box with a whole or large pizza (not a lone floating slice)
  - Chinese / Asian noodles → WHITE takeout box or WHITE noodle bowl with chopsticks
  - Burgers → burger with fries (and optional small sauce) on a plain white napkin
  - Pasta / Italian → pasta in a WHITE bowl with a fork on a white napkin
  - Indian / curry → curry in a WHITE bowl with flatbread / naan and small WHITE side dish on a white napkin
  - Other cuisines → one iconic dish in WHITE bowl/plate/box in the same style
* Keep the composition bold enough to read at small thumbnail sizes, with a small safety margin so box/bowl corners stay inside the frame
* Do not include people, hands, logos, text, labels, menus, restaurant branding, or busy restaurant scenes
* Avoid many unrelated dishes — one hero food composition only

COMPOSITION:
* Landscape 4:3 composition (width:height = 4:3)
* Food centered horizontally and vertically in the frame
* Food (including box/bowl/napkin) should fill about 95% of the canvas — leave a small even margin (~2–3% each side) so corners of boxes/bowls are fully visible
* Do not crop or clip packaging corners, crust edges, or dish rims
* No large empty letterboxing, but never push content past the canvas edge
* Slightly elevated three-quarter camera angle, consistent across all categories
* Keep camera distance, scale, and perspective consistent between categories

BACKGROUND:
* Fully transparent background only (only where food does not cover)
* Prefer the food composition near the center of the 4:3 frame with slight breathing room
* No white, colored, gradient, or patterned background plate behind the scene
* No table, countertop, surface, or floor extending past the food
* No colored tile, squircle, badge, border, or frame (UI will add those)

TABLEWARE / PACKAGING (critical — all white):
* Pizza boxes MUST be plain white cardboard (never brown, kraft, tan, or beige)
* Takeout containers MUST be plain white
* Bowls, plates, dishes, ramekins, and sauce cups MUST be plain white ceramic/porcelain
* Napkins MUST be plain white
* Only food, wooden utensils (chopsticks / fork / spoon), and soft shadows may use non-white colors
* No brown packaging, no kraft paper, no wood boards, no colored tableware
* No logos, patterns, decorative rims, or branded packaging text

CONSISTENCY:
Every image must look like part of the same BetterOrder category image set: same angle, lighting, food scale, centered framing with slight margin, soft shadow, photographic realism, white packaging/dishes.

OUTPUT:
* Transparent PNG
* Landscape 4:3
* Subject fills ~95% of the frame, centered, with corners fully visible (not cropped)
* No text
* No empty padded background beyond the small safety margin`;
}

async function generateCuisineImageIcon({ name, languageCode } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL_CUISINE || "gpt-image-2";
  const quality = process.env.OPENAI_IMAGE_QUALITY || "medium";
  // 4:3 — 1024x768 is valid for gpt-image-2 (sides ÷16, pixels ≥655k)
  const size = process.env.OPENAI_IMAGE_SIZE || "1024x768";

  if (!apiKey) {
    throw createAppError("openai_not_configured", 500);
  }

  const cuisineName = String(name || "").trim();
  if (!cuisineName) {
    throw createAppError("cuisine_name_required", 400);
  }

  const code = languageCode ? String(languageCode).toLowerCase() : "en";
  const prompt = buildCuisineImagePrompt({ name: cuisineName, languageCode: code });

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size,
      quality,
      background: "transparent",
      output_format: "png",
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error?.message || `openai_http_${response.status}`;
    throw createAppError(detail, 502);
  }

  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) {
    throw createAppError("openai_empty_image", 502);
  }

  return {
    pngBuffer: Buffer.from(b64, "base64"),
    model,
    quality,
    size,
    languageCode: code,
    prompt,
  };
}

module.exports = {
  generateCuisineImageIcon,
  buildCuisineImagePrompt,
};
