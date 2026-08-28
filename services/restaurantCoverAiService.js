function createAppError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * Fixed photography prompt for GPT Image — keep identical for caching.
 * Only SCENE BRIEF changes. No platform/app business context.
 * Source: BetterOrder_AI_Restaurant_Cover_Generation.md
 */
function buildCoverImageSystemPrompt() {
  return `Create a photorealistic professional restaurant food photograph.

FORMAT:
- Wide horizontal composition designed for a 2.4:1 final crop
- Compose with generous horizontal space
- Keep the primary food safely inside the central crop-safe area
- Do not place important food details at the extreme edges
- The composition must remain attractive when cropped responsively

PHOTOGRAPHY:
- Premium commercial restaurant food photography
- Realistic freshly prepared food
- Authentic natural food textures
- Appetizing but believable colors
- Soft directional natural or studio lighting
- Realistic highlights and shadows
- Professional food styling
- Natural depth and perspective
- Subtle shallow depth of field when appropriate
- Food must look edible and authentic, not synthetic or excessively perfect

COMPOSITION:
- Follow the SCENE BRIEF regarding whether the photograph contains one hero dish or a small multi-dish composition
- For a single-cuisine scene, prefer one dominant hero dish
- For a multi-cuisine scene, allow up to 3 representative dishes
- In a multi-dish scene, one dish should remain visually dominant and secondary dishes should support it
- Arrange multiple dishes as one intentionally styled restaurant photograph rather than a buffet
- Keep every requested representative dish recognizable
- Food is the visual focus
- Use appropriate plates, bowls, boards, or serving vessels when natural for the dish
- Supporting garnishes, dips, sides, or accompaniments must be minimal and naturally associated with the food
- Keep the scene clean and intentional
- Avoid excessive table clutter
- Avoid buffet-style arrangements
- Never add unrelated dishes that were not requested by the SCENE BRIEF
- Do not exceed 3 representative dishes unless explicitly requested
- Leave enough breathing room for a wide cover composition

ENVIRONMENT:
- Use a subtle restaurant-appropriate surface or setting
- Background should support the food without competing with it
- Background may be softly blurred
- Do not create an elaborate restaurant interior unless specifically requested

DO NOT INCLUDE:
- Text, letters, or numbers
- Restaurant names
- Logos or branding
- Watermarks
- Menus or prices
- Packaging with visible branding
- People, faces, or hands
- Screens or UI elements
- Frames or borders

VISUAL MEDIUM:
- Photorealistic food photography only
- No illustration
- No cartoon
- No emoji style
- No vector art
- No obvious CGI
- No obvious 3D-rendered appearance

Follow the restaurant-specific SCENE BRIEF below as the primary subject and food direction.`;
}

function buildCoverImagePrompt({ imageBrief } = {}) {
  const brief = String(imageBrief || "").trim();
  if (!brief) {
    throw createAppError("cover_image_brief_required", 400);
  }

  return `${buildCoverImageSystemPrompt()}

SCENE BRIEF:
${brief}`;
}

async function generateRestaurantCoverImage({ imageBrief } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL_COVER || process.env.OPENAI_MODEL_CUISINE || "gpt-image-2";
  const quality = process.env.OPENAI_COVER_IMAGE_QUALITY || process.env.OPENAI_IMAGE_QUALITY || "medium";
  const size = process.env.OPENAI_COVER_IMAGE_SIZE || "1536x1024";

  if (!apiKey) {
    throw createAppError("openai_not_configured", 500);
  }

  const fullPrompt = buildCoverImagePrompt({ imageBrief });

  console.log("\n========== COVER AI: Luna → image gen ==========");
  console.log("[SCENE BRIEF from Luna]\n" + String(imageBrief || "").trim());
  console.log("\n[FULL PROMPT sent to image model]\n" + fullPrompt);
  console.log("================================================\n");

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt: fullPrompt,
      n: 1,
      size,
      quality,
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
    imageBuffer: Buffer.from(b64, "base64"),
    model,
    quality,
    size,
    requestId: data?.created ? String(data.created) : null,
  };
}

module.exports = {
  generateRestaurantCoverImage,
  buildCoverImagePrompt,
  buildCoverImageSystemPrompt,
};
