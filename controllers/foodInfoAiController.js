const { Restaurant } = require("../modals/Restaurant");
const { generateFoodInfoDraft } = require("../services/foodInfoAiService");

function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

exports.generateFoodInfo = async (req, res) => {
  const { restaurantId, categoryId, itemId } = req.body || {};

  console.info("[food-info-ai] request received", {
    restaurantId,
    categoryId,
    itemId,
    adminId: req.user?.id || req.user?._id || null,
    role: req.user?.role || null,
  });

  if (!restaurantId || !categoryId || !itemId) {
    return res.status(400).json({
      success: false,
      message: "restaurantId_categoryId_itemId_required",
    });
  }

  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) {
    return res.status(404).json({ success: false, message: "restaurant_not_found" });
  }

  const category = restaurant.menu.id(categoryId);
  if (!category) {
    return res.status(404).json({ success: false, message: "category_not_found" });
  }

  const item = category.items.id(itemId);
  if (!item) {
    return res.status(404).json({ success: false, message: "menu_item_not_found" });
  }

  const allergensVerified = item.food_info?.allergens?.verification?.isVerified === true;
  const additivesVerified = item.food_info?.additives?.verification?.isVerified === true;
  if (allergensVerified && additivesVerified) {
    return res.status(409).json({
      success: false,
      message: "food_info_ai_blocked_verified",
    });
  }

  const effectiveItemName = normalizeText(req.body.item_name || item.item_name || "");
  const effectiveItemDesc = normalizeText(req.body.item_desc || item.item_desc || "");
  const effectiveInfoModalText = normalizeText(req.body.info_modal_text || "");
  const restaurantCountry = normalizeText(
    restaurant.address?.country || "Germany"
  );
  const restaurantCountryCode = normalizeText(
    restaurant.address?.countryCode || "DE"
  ).toUpperCase();

  console.info("[food-info-ai] effective payload", {
    restaurantId,
    categoryId,
    itemId,
    item_name: effectiveItemName,
    item_desc: effectiveItemDesc,
    info_modal_text: effectiveInfoModalText,
    restaurant_country: restaurantCountry,
    restaurant_country_code: restaurantCountryCode,
  });

  try {
    const { draft, usage } = await generateFoodInfoDraft({
      item_name: effectiveItemName,
      item_desc: effectiveItemDesc,
      info_modal_text: effectiveInfoModalText,
      restaurant_country: restaurantCountry,
      restaurant_country_code: restaurantCountryCode,
    });

    const isEmptyDraft =
      draft.allergens_en.length === 0 &&
      draft.allergens_de.length === 0 &&
      draft.additives_en.length === 0 &&
      draft.additives_de.length === 0;

    return res.status(200).json({
      success: true,
      draft,
      usage,
      notice: isEmptyDraft ? "food_info_ai_empty_result" : null,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    console.error("[food-info-ai] request failed", {
      restaurantId,
      categoryId,
      itemId,
      statusCode,
      message: error.message || "server_error",
    });
    return res.status(statusCode).json({
      success: false,
      message: error.message || "server_error",
    });
  }
};
