const { Restaurant } = require("../modals/Restaurant");
const { orchestrateCoverImageBrief } = require("../services/restaurantCoverOrchestratorService");
const { generateRestaurantCoverImage } = require("../services/restaurantCoverAiService");
const {
  saveRestaurantCoverAsset,
  listRestaurantCoverAssets,
  readCoverAssetBuffer,
} = require("../utils/restaurantCoverAssetStorage");

function serializeAssets(restaurant) {
  return listRestaurantCoverAssets(restaurant);
}

function cuisineDisplayName(cuisine) {
  if (!cuisine) return "";
  const name = cuisine.name;
  if (typeof name === "string") return name.trim();
  if (name && typeof name === "object") {
    return (
      String(name.en || "").trim() ||
      String(name.de || "").trim() ||
      String(Object.values(name).find((v) => String(v || "").trim()) || "").trim()
    );
  }
  return "";
}

const COUNTRY_CODE_MAP = {
  germany: "DE",
  deutschland: "DE",
  austria: "AT",
  österreich: "AT",
  osterreich: "AT",
  switzerland: "CH",
  schweiz: "CH",
  netherlands: "NL",
  belgium: "BE",
  france: "FR",
  italy: "IT",
  spain: "ES",
  poland: "PL",
  turkey: "TR",
  türkei: "TR",
  turkei: "TR",
  "united kingdom": "GB",
  uk: "GB",
  "united states": "US",
  usa: "US",
};

function resolveCountryCode(country) {
  const raw = String(country || "").trim();
  if (!raw) return "";
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  return COUNTRY_CODE_MAP[raw.toLowerCase()] || "";
}

exports.generateCoverAi = async (req, res, next) => {
  try {
    const restaurantId = req.params.restaurantId;
    const prompt = req.body?.prompt;

    const restaurant = await Restaurant.findById(restaurantId).populate(
      "cuisine_type",
      "name"
    );
    if (!restaurant) {
      return res.status(404).json({ success: false, message: "Restaurant not found" });
    }

    const restaurantName =
      restaurant.restaurant_name || restaurant.username || "Restaurant";
    const cuisines = (restaurant.cuisine_type || [])
      .map(cuisineDisplayName)
      .filter(Boolean);
    const city = restaurant.address?.city || "";
    const country = restaurant.address?.country || "";
    const countryCode = resolveCountryCode(country);
    const hasAdminPrompt = Boolean(String(prompt || "").trim());

    console.log("[cover AI] generate start", {
      restaurantId: String(restaurantId),
      restaurantName,
      cuisines,
      city,
      country,
      countryCode: countryCode || null,
      hasAdminPrompt,
    });

    const plan = await orchestrateCoverImageBrief({
      restaurantName,
      cuisines,
      city,
      country,
      countryCode,
      prompt,
    });

    console.log("[cover AI] Luna plan", {
      restaurantId: String(restaurantId),
      plannerModel: plan.model,
      requestId: plan.requestId,
      selectedFood: plan.selectedFood,
      selectionSource: plan.selectionSource,
      confidence: plan.confidence,
      imageBrief: plan.imageBrief,
    });

    const result = await generateRestaurantCoverImage({
      imageBrief: plan.imageBrief,
    });

    // Persist only after successful generation. Approve/Discard do not control save.
    const saved = await saveRestaurantCoverAsset(restaurant, result.imageBuffer);
    const imageBase64 = saved.webpBuffer.toString("base64");

    console.log("[cover AI] saved", {
      restaurantId: String(restaurantId),
      imageModel: result.model,
      path: saved.path,
      thumbPath: saved.thumbPath,
    });

    res.status(200).json({
      success: true,
      imageBase64,
      mimeType: "image/webp",
      dataUrl: `data:image/webp;base64,${imageBase64}`,
      asset: {
        path: saved.path,
        thumbPath: saved.thumbPath,
        url: saved.url,
        thumbUrl: saved.thumbUrl,
        createdAt: saved.createdAt,
      },
      assets: serializeAssets(restaurant),
      model: result.model,
      orchestratorModel: plan.model,
      quality: result.quality,
      size: result.size,
      imageBrief: plan.imageBrief,
      selectedFood: plan.selectedFood,
      selectionSource: plan.selectionSource,
      confidence: plan.confidence,
      context: {
        restaurantName,
        cuisines,
        city,
        country,
        countryCode: countryCode || null,
        hasAdminPrompt,
        selectedFood: plan.selectedFood,
        selectionSource: plan.selectionSource,
        confidence: plan.confidence,
      },
    });
  } catch (err) {
    console.error("[cover AI] generate failed", {
      restaurantId: req.params.restaurantId,
      message: err.message,
    });
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }
    next(err);
  }
};

exports.listCoverAiAssets = async (req, res, next) => {
  try {
    const restaurant = await Restaurant.findById(req.params.restaurantId);
    if (!restaurant) {
      return res.status(404).json({ success: false, message: "Restaurant not found" });
    }
    res.status(200).json({
      success: true,
      assets: serializeAssets(restaurant),
    });
  } catch (err) {
    next(err);
  }
};

exports.getCoverAiAssetData = async (req, res, next) => {
  try {
    const restaurant = await Restaurant.findById(req.params.restaurantId);
    if (!restaurant) {
      return res.status(404).json({ success: false, message: "Restaurant not found" });
    }

    const index = Number(req.params.index);
    const assets = listRestaurantCoverAssets(restaurant);
    const asset = assets[index];
    if (!asset?.path) {
      return res.status(404).json({ success: false, message: "Asset not found" });
    }

    const buffer = await readCoverAssetBuffer(asset.path);
    if (!buffer) {
      return res.status(404).json({ success: false, message: "Asset file missing" });
    }

    const imageBase64 = buffer.toString("base64");
    res.status(200).json({
      success: true,
      mimeType: "image/webp",
      imageBase64,
      dataUrl: `data:image/webp;base64,${imageBase64}`,
      asset,
    });
  } catch (err) {
    next(err);
  }
};
