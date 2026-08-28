const mongoose = require("mongoose");
const { Restaurant, RestaurantLog } = require("../modals/Restaurant");
const { MenuItemFoodInfoDraft } = require("../modals/MenuItemFoodInfoDraft");
const { deleteObjectByRelativePath } = require("../utils/r2Storage");
const {
  parseCategoryI18nPayload,
  resolveCategoryPrimaryFields,
  hasDuplicateCategoryName,
  serializeCategoryI18n,
} = require("../utils/menuCategoryI18n");
const {
  parseItemI18nPayload,
  parsePriceSizeI18n,
  resolveItemPrimaryFields,
  hasDuplicateItemName,
  serializeItemI18n,
} = require("../utils/menuItemI18n");
const { getPrimaryContentLanguageCode } = require("../utils/cuisineI18n");
const {
  parseExtraI18nPayload,
  resolveExtraPrimaryFields,
  hasDuplicateExtraLabel,
  serializeExtraI18n,
} = require("../utils/menuExtraI18n");
const {
  parseDressingI18nPayload,
  parseDressingOptionI18n,
  resolveDressingPrimaryFields,
  serializeDressingI18n,
} = require("../utils/menuDressingI18n");
const {
  parseAddonI18nPayload,
  parseAddonOptionI18n,
  resolveAddonPrimaryFields,
  hasDuplicateAddonLabel,
  serializeAddonI18n,
} = require("../utils/menuAddonI18n");
const { resolveCodeFromLabel } = require("../constants/foodInfoRegistry");
const {
  formatItemImageForAdmin,
  removeItemImages,
} = require("../utils/menuItemImage");

function removeUploadedFile(relativePath) {
  return deleteObjectByRelativePath(relativePath);
}

function removeUploadedItemImages(value) {
  return removeItemImages(value);
}

function cleanupReqItemImages(req) {
  return removeUploadedItemImages(req?.itemImagePaths || req?.itemImagePath);
}

function parseMenuItemPrices(rawPrice) {
  if (Array.isArray(rawPrice)) return rawPrice;
  if (typeof rawPrice === "string") {
    try {
      const parsed = JSON.parse(rawPrice);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function parseNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

function roundToTwoDecimals(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parsePriceToCents(value) {
  const parsed = parseNumber(value);
  return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) : NaN;
}

function centsToEuroNumber(value) {
  const parsed = parseNumber(value);
  return Number.isFinite(parsed) ? roundToTwoDecimals(parsed / 100) : NaN;
}

function formatDecimalPrice(value) {
  const euros = centsToEuroNumber(value);
  return Number.isFinite(euros) ? euros.toFixed(2) : value;
}

function normalizeItemPrices(item) {
  if (!Array.isArray(item.price)) return item;
  item.price = item.price.map((entry) => ({
    ...entry,
    item_price: centsToEuroNumber(entry.item_price),
  }));
  return item;
}

function formatItemPricesForResponse(item, primaryCode) {
  const normalizedItem = typeof item?.toObject === "function" ? item.toObject() : { ...item };
  const withPrices = normalizeItemPrices(normalizedItem);
  withPrices.item_image = formatItemImageForAdmin(withPrices.item_image);
  return serializeItemI18n(withPrices, primaryCode);
}

function normalizeAddonPrices(addon) {
  if (!Array.isArray(addon.options)) return addon;
  addon.options = addon.options.map((option) => ({
    ...option,
    addon_price: centsToEuroNumber(option.addon_price),
  }));
  return addon;
}

function normalizeExtraPrices(extra) {
  if (!Array.isArray(extra.prices)) return extra;
  extra.prices = extra.prices.map((entry) => ({
    ...entry,
    price: centsToEuroNumber(entry.price),
  }));
  return extra;
}

function formatAddonPricesForResponse(addon, primaryCode) {
  const normalizedAddon = serializeAddonI18n(addon, primaryCode || "de");
  if (!normalizedAddon) return normalizedAddon;
  if (!Array.isArray(normalizedAddon.options)) return normalizedAddon;

  normalizedAddon.options = normalizedAddon.options.map((option) => ({
    ...option,
    addon_price: formatDecimalPrice(option?.addon_price),
  }));
  return normalizedAddon;
}

function formatCategoryPricesForResponse(category, primaryCode) {
  const normalizedCategory =
    typeof category?.toObject === "function" ? category.toObject() : { ...category };

  if (Array.isArray(normalizedCategory.items)) {
    normalizedCategory.items = normalizedCategory.items.map((item) =>
      formatItemPricesForResponse(item, primaryCode)
    );
  }
  if (Array.isArray(normalizedCategory.addons)) {
    normalizedCategory.addons = normalizedCategory.addons.map((addon) =>
      formatAddonPricesForResponse(addon, primaryCode)
    );
  }
  if (normalizedCategory.extra_menu?.extras) {
    normalizedCategory.extra_menu.extras =
      normalizedCategory.extra_menu.extras.map((extra) =>
        formatExtraPricesForResponse(extra, primaryCode)
      );
  }
  if (normalizedCategory.dressing) {
    normalizedCategory.dressing = serializeDressingI18n(
      normalizedCategory.dressing,
      primaryCode
    );
  }

  return serializeCategoryI18n(normalizedCategory, primaryCode || "de");
}

async function formatCategoryPricesForResponseAsync(category) {
  const primaryCode = await getPrimaryContentLanguageCode();
  return formatCategoryPricesForResponse(category, primaryCode);
}

function formatExtraPricesForResponse(extra, primaryCode) {
  const normalizedExtra = typeof extra?.toObject === "function" ? extra.toObject() : { ...extra };
  if (Array.isArray(normalizedExtra.prices)) {
    normalizedExtra.prices = normalizedExtra.prices.map((entry) => ({
      ...entry,
      price: formatDecimalPrice(entry?.price),
    }));
  }
  return serializeExtraI18n(normalizedExtra, primaryCode);
}

async function getRestaurantAndCategory(restaurantId, categoryId) {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) {
    return { error: { status: 404, message: "restaurant_not_found" } };
  }

  const category = restaurant.menu.id(categoryId);
  if (!category) {
    return { error: { status: 404, message: "category_not_found" } };
  }

  return { restaurant, category };
}

function ensureExtraMenu(category) {
  if (!category.extra_menu) {
    category.extra_menu = { extras: [] };
  }
  if (!Array.isArray(category.extra_menu.extras)) {
    category.extra_menu.extras = [];
  }
  return category.extra_menu.extras;
}

function recalculatePriceSlotCount(category) {
  const maxPriceLength = Math.max(
    ...(Array.isArray(category.items)
      ? category.items.map((item) => item.price?.length || 0)
      : [0]),
    1
  );
  category.count_of_prices = maxPriceLength;
}

function buildActorSnapshot(user) {
  return {
    userType: user?.role || "system",
    userId: user?._id || null,
    nameSnapshot:
      user?.name ||
      user?.restaurant_name ||
      user?.email ||
      user?.username ||
      "",
    roleSnapshot: user?.role || "",
  };
}

function normalizeFoodInfoText(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function parseFoodInfoTextEntries(value, kind = "allergen") {
  return normalizeFoodInfoText(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((label, index) => ({
      label,
      children: [],
      note: "",
      code: resolveCodeFromLabel(label, kind),
      index,
      isActive: true,
    }));
}

function entriesToText(entries) {
  if (!Array.isArray(entries)) return "";
  return entries
    .map((entry) => entry?.label?.trim())
    .filter(Boolean)
    .join("\n");
}

function normalizeLocalizedEntriesInput(section, kind = "allergen") {
  return {
    en: parseFoodInfoTextEntries(section?.en, kind),
    de: parseFoodInfoTextEntries(section?.de, kind),
  };
}

function serializeFoodInfoSection(section) {
  return {
    en: entriesToText(section?.entries?.en),
    de: entriesToText(section?.entries?.de),
    counts: {
      en: Array.isArray(section?.entries?.en) ? section.entries.en.length : 0,
      de: Array.isArray(section?.entries?.de) ? section.entries.de.length : 0,
    },
    verification: {
      isVerified: section?.verification?.isVerified === true,
      sellerReadAt: section?.verification?.sellerReadAt ?? null,
      verifiedAt: section?.verification?.verifiedAt ?? null,
      verifiedBy: section?.verification?.verifiedBy ?? null,
      verificationNote: section?.verification?.verificationNote ?? "",
      approvalLogs: Array.isArray(section?.verification?.approvalLogs)
        ? section.verification.approvalLogs
        : [],
    },
    source: section?.source ?? "seller",
    isSafeForDisplay: section?.isSafeForDisplay === true,
    lastEditedAt: section?.lastEditedAt ?? null,
    lastEditedBy: section?.lastEditedBy ?? null,
    lastApprovedDraftId: section?.lastApprovedDraftId ?? null,
  };
}

function buildFoodInfoResponse(item, latestDraft = null) {
  const liveFoodInfo = item?.food_info ?? {};

  return {
    live: {
      allergens: serializeFoodInfoSection(liveFoodInfo.allergens),
      additives: serializeFoodInfoSection(liveFoodInfo.additives),
      custom_sections: Array.isArray(liveFoodInfo.custom_sections)
        ? liveFoodInfo.custom_sections
        : [],
    },
    latestDraft: latestDraft
      ? {
          _id: latestDraft._id,
          version: latestDraft.version,
          status: latestDraft.status,
          source: latestDraft.source,
          isSafeForDisplay: latestDraft.isSafeForDisplay,
          reviewReason: latestDraft.reviewReason ?? "",
          updatedAt: latestDraft.updatedAt,
          draft: {
            allergens: {
              en: entriesToText(latestDraft.draft?.allergens?.en),
              de: entriesToText(latestDraft.draft?.allergens?.de),
            },
            additives: {
              en: entriesToText(latestDraft.draft?.additives?.en),
              de: entriesToText(latestDraft.draft?.additives?.de),
            },
          },
        }
      : null,
  };
}

function applyLiveFoodInfoSection(currentSection, localizedEntries, actor, options = {}) {
  const now = new Date();
  const existingLogs = Array.isArray(currentSection?.verification?.approvalLogs)
    ? currentSection.verification.approvalLogs
    : [];

  return {
    ...(currentSection?.toObject ? currentSection.toObject() : currentSection),
    entries: localizedEntries,
    source: options.source ?? "seller",
    isSafeForDisplay: options.isSafeForDisplay === true,
    lastEditedAt: now,
    lastEditedBy: actor,
    lastApprovedDraftId: options.draftId ?? null,
    verification: {
      ...(currentSection?.verification?.toObject
        ? currentSection.verification.toObject()
        : currentSection?.verification),
      isVerified: options.isVerified === true,
      sellerReadAt: options.isVerified
        ? now
        : options.resetVerification
          ? null
          : currentSection?.verification?.sellerReadAt ?? null,
      verifiedAt: options.isVerified
        ? now
        : options.resetVerification
          ? null
          : currentSection?.verification?.verifiedAt ?? null,
      verifiedBy: options.isVerified
        ? actor
        : options.resetVerification
          ? null
          : currentSection?.verification?.verifiedBy ?? null,
      verificationNote: options.verificationNote ?? "",
      approvalLogs: options.logEntry ? [...existingLogs, options.logEntry] : existingLogs,
    },
  };
}

function validateExtraPrices(prices) {
  if (!Array.isArray(prices) || prices.length === 0) {
    return { error: "label_and_atleast_1_price_required" };
  }

  const normalized = [];
  for (const entry of prices) {
    const value = parsePriceToCents(entry?.price);
    if (!Number.isFinite(value)) {
      return { error: `Invalid price value: "${entry?.price}"` };
    }
    normalized.push({ price: value });
  }

  return { normalized };
}

function validateAddonOptions(options, primaryCode = "de") {
  if (!Array.isArray(options) || options.length === 0) {
    return { error: "addon_label_and_option_required" };
  }

  const normalized = [];
  const seenNames = new Set();

  for (const option of options) {
    const parsed = parseAddonOptionI18n(option, primaryCode);
    if (!parsed.addon_name) {
      return { error: "addon_label_and_option_required" };
    }

    const normalizedName = parsed.addon_name.trim().toLowerCase();
    if (seenNames.has(normalizedName)) {
      return { error: `Duplicate option: ${parsed.addon_name}` };
    }
    seenNames.add(normalizedName);

    const parsedPrice =
      option.addon_price === undefined || option.addon_price === null || option.addon_price === ""
        ? 0
        : parsePriceToCents(option.addon_price);

    if (!Number.isFinite(parsedPrice)) {
      return { error: `Invalid price value: "${option.addon_price}"` };
    }

    normalized.push({
      addon_name: parsed.addon_name.trim(),
      nameI18n: parsed.nameI18n,
      addon_price: parsedPrice,
      isActive: option.isActive !== false,
    });
  }

  return { normalized };
}

function normalizeAddonSelectLimits({
  multiple,
  optional,
  minSelect,
  maxSelect,
  optionCount,
}) {
  if (!multiple) {
    return { minSelect: 0, maxSelect: 0 };
  }

  const count = Math.max(Number(optionCount) || 0, 0);
  let min = Number(minSelect);
  let max = Number(maxSelect);

  if (!Number.isFinite(min) || min < 0) min = optional === false ? 1 : 0;
  if (!Number.isFinite(max) || max < 0) max = 0;

  if (optional === false && min < 1) min = 1;
  if (count > 0 && min > count) {
    return { error: "addon_min_exceeds_options" };
  }
  if (max > 0 && count > 0 && max > count) {
    return { error: "addon_max_exceeds_options" };
  }
  if (max > 0 && min > max) {
    return { error: "addon_min_greater_than_max" };
  }

  return {
    minSelect: Math.floor(min),
    maxSelect: Math.floor(max),
  };
}

function validateAppliesTo(category, appliesTo, applyToAll) {
  if (applyToAll) return { normalized: [] };
  if (!Array.isArray(appliesTo) || appliesTo.length === 0) {
    return { error: "no_valid_menu_item_ids_provided" };
  }

  const itemIds = new Set((category.items ?? []).map((item) => item._id.toString()));
  const normalized = [];

  for (const itemId of appliesTo) {
    if (!itemIds.has(String(itemId))) {
      return { error: `Invalid menu item ID: ${itemId}` };
    }
    normalized.push(String(itemId));
  }

  return { normalized };
}

function slugifyImportKey(value, fallback) {
  const base = String(value || fallback || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return base || String(fallback || "item")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

function ensureUniqueImportKey(preferredKey, registry) {
  let candidate = preferredKey;
  let counter = 2;

  while (registry.has(candidate)) {
    candidate = `${preferredKey}-${counter}`;
    counter += 1;
  }

  registry.add(candidate);
  return candidate;
}

function parseImportPriceRows(priceRows, itemLabel) {
  if (!Array.isArray(priceRows) || priceRows.length === 0) {
    return { error: `price_required_for_${itemLabel}` };
  }

  const normalized = [];
  const seenSizes = new Set();

  for (const row of priceRows) {
    const itemSize = String(row?.item_size ?? "").trim();
    if (!itemSize) {
      return { error: `item_size_required_for_${itemLabel}` };
    }

    const sizeKey = itemSize.toLowerCase();
    if (seenSizes.has(sizeKey)) {
      return { error: `duplicate_item_size_${itemSize}` };
    }
    seenSizes.add(sizeKey);

    const itemPrice = parsePriceToCents(row?.item_price);
    if (!Number.isFinite(itemPrice)) {
      return { error: `invalid_item_price_for_${itemLabel}` };
    }

    normalized.push({
      item_size: itemSize,
      item_price: itemPrice,
    });
  }

  return { normalized };
}

function parseImportExtraPrices(priceRows, label) {
  if (!Array.isArray(priceRows) || priceRows.length === 0) {
    return { error: `extra_prices_required_for_${label}` };
  }

  const normalized = [];

  for (const row of priceRows) {
    const value = parsePriceToCents(row?.price);
    if (!Number.isFinite(value)) {
      return { error: `invalid_extra_price_for_${label}` };
    }

    normalized.push({ price: value });
  }

  return { normalized };
}

function parseImportAddonOptions(options, label) {
  if (!Array.isArray(options) || options.length === 0) {
    return { error: `addon_options_required_for_${label}` };
  }

  const normalized = [];
  const seenNames = new Set();

  for (const option of options) {
    const addonName = String(option?.addon_name ?? "").trim();
    if (!addonName) {
      return { error: `addon_option_name_required_for_${label}` };
    }

    const nameKey = addonName.toLowerCase();
    if (seenNames.has(nameKey)) {
      return { error: `duplicate_addon_option_${addonName}` };
    }
    seenNames.add(nameKey);

    const addonPrice =
      option?.addon_price === undefined || option?.addon_price === null || option?.addon_price === ""
        ? 0
        : parsePriceToCents(option.addon_price);

    if (!Number.isFinite(addonPrice)) {
      return { error: `invalid_addon_price_for_${addonName}` };
    }

    normalized.push({
      addon_name: addonName,
      addon_price: addonPrice,
      isActive: option?.isActive !== false,
    });
  }

  return { normalized };
}

function parseImportDressing(rawDressing) {
  if (!rawDressing) return { normalized: undefined };

  const dressingLabel = String(rawDressing.dressing_label ?? "").trim();
  if (!dressingLabel) {
    return { error: "dressing_label_required" };
  }

  if (!Array.isArray(rawDressing.options) || rawDressing.options.length === 0) {
    return { error: "dressing_options_required" };
  }

  const options = rawDressing.options
    .map((option) => ({
      dressing_name: String(option?.dressing_name ?? "").trim(),
      isActive: option?.isActive !== false,
    }))
    .filter((option) => option.dressing_name);

  if (!options.length) {
    return { error: "dressing_options_required" };
  }

  return {
    normalized: {
      dressing_label: dressingLabel,
      multiple: Boolean(rawDressing.multiple),
      isActive: rawDressing.isActive !== false,
      options,
    },
  };
}

exports.addCategory = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { nameI18n, descriptionI18n } = parseCategoryI18nPayload(req.body);
    const { category_name, category_desc, primaryCode } =
      await resolveCategoryPrimaryFields(nameI18n, descriptionI18n);
    const index = req.body.index;

    if (!category_name || !category_name.trim()) {
      removeUploadedFile(req.categoryImagePath);
      return res.status(400).json({ message: "category_name_is_required" });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      removeUploadedFile(req.categoryImagePath);
      return res.status(404).json({ message: "restaurant_not_found" });
    }

    if (hasDuplicateCategoryName(restaurant.menu, nameI18n)) {
      removeUploadedFile(req.categoryImagePath);
      return res.status(400).json({ message: "category_name_already_exists" });
    }

    restaurant.menu.push({
      category_name: category_name.trim(),
      category_desc: category_desc || "",
      nameI18n,
      descriptionI18n,
      index: typeof index === "number" ? index : Number(index) || restaurant.menu.length,
      category_image: req.categoryImagePath || undefined,
      extra_menu: { extras: [] },
    });

    await restaurant.save();

    res.status(201).json({
      success: true,
      message: "category_added",
      category: formatCategoryPricesForResponse(
        restaurant.menu[restaurant.menu.length - 1],
        primaryCode
      ),
    });
  } catch (error) {
    console.error("Add category error:", error);
    removeUploadedFile(req.categoryImagePath);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

exports.getSingleCategory = async (req, res) => {
  try {
    const { restaurantId, categoryId } = req.params;
    const result = await getRestaurantAndCategory(restaurantId, categoryId);

    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    res.status(200).json({
      success: true,
      category: await formatCategoryPricesForResponseAsync(result.category),
    });
  } catch (error) {
    console.error("getSingleCategory error:", error);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

exports.sortCategories = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { sortedIds } = req.body;

    if (!Array.isArray(sortedIds)) {
      return res.status(400).json({ message: "sortedIds_must_be_an_array" });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "restaurant_not_found" });
    }

    restaurant.menu.forEach((category) => {
      const nextIndex = sortedIds.indexOf(category._id.toString());
      if (nextIndex > -1) {
        category.index = nextIndex;
      }
    });

    await restaurant.save();
    const primaryCode = await getPrimaryContentLanguageCode();
    res.status(200).json({
      success: true,
      message: "categories_sorted",
      menu: restaurant.menu
        .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
        .map((category) => formatCategoryPricesForResponse(category, primaryCode)),
    });
  } catch (error) {
    console.error("sortCategories error:", error);
    res.status(500).json({ message: "server_error" });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { restaurantId, categoryId } = req.params;
    const { removeImage } = req.body;
    const hasI18nPayload =
      req.body.nameI18n != null ||
      req.body.descriptionI18n != null ||
      req.body.category_name != null ||
      req.body.category_desc != null;

    const result = await getRestaurantAndCategory(restaurantId, categoryId);

    if (result.error) {
      removeUploadedFile(req.categoryImagePath);
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const { restaurant, category } = result;
    let primaryCode = await getPrimaryContentLanguageCode();

    if (hasI18nPayload) {
      const { nameI18n, descriptionI18n } = parseCategoryI18nPayload(req.body);
      const resolved = await resolveCategoryPrimaryFields(nameI18n, descriptionI18n);
      primaryCode = resolved.primaryCode;

      if (!resolved.category_name || !resolved.category_name.trim()) {
        removeUploadedFile(req.categoryImagePath);
        return res.status(400).json({ message: "category_name_is_required" });
      }

      if (hasDuplicateCategoryName(restaurant.menu, nameI18n, categoryId)) {
        removeUploadedFile(req.categoryImagePath);
        return res.status(400).json({ message: "category_name_already_exists" });
      }

      category.category_name = resolved.category_name.trim();
      category.category_desc = resolved.category_desc || "";
      category.nameI18n = nameI18n;
      category.descriptionI18n = descriptionI18n;
      restaurant.markModified("menu");
    }

    if ((removeImage === "true" || removeImage === true) && category.category_image) {
      removeUploadedFile(category.category_image);
      category.category_image = undefined;
    }

    if (req.categoryImagePath) {
      if (category.category_image) {
        removeUploadedFile(category.category_image);
      }
      category.category_image = req.categoryImagePath;
    }

    await restaurant.save();
    res.status(200).json({
      success: true,
      message: "category_updated",
      category: formatCategoryPricesForResponse(category, primaryCode),
    });
  } catch (error) {
    console.error("updateCategory error:", error);
    removeUploadedFile(req.categoryImagePath);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

exports.toggleCategoryActiveStatus = async (req, res) => {
  try {
    const result = await getRestaurantAndCategory(req.params.restaurantId, req.params.categoryId);
    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    result.category.isActive = !result.category.isActive;
    await result.restaurant.save();

    res.status(200).json({
      success: true,
      message: result.category.isActive ? "category_is_now_active" : "category_is_now_inactive",
      category: await formatCategoryPricesForResponseAsync(result.category),
    });
  } catch (error) {
    console.error("toggleCategoryActiveStatus error:", error);
    res.status(500).json({ message: "server_error", success: false });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const { restaurantId, categoryId } = req.params;
    const result = await getRestaurantAndCategory(restaurantId, categoryId);

    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const { restaurant, category } = result;
    if (category.items && category.items.length > 0) {
      return res.status(400).json({ message: "cannot_delete_category_with_menu_items." });
    }

    if (category.category_image) {
      removeUploadedFile(category.category_image);
    }

    await RestaurantLog.create({
      restaurant: restaurantId,
      log_type: "category_deleted",
      data: {
        categoryId: category._id.toString(),
        categoryName: category.category_name,
      },
      deleted_by: {
        userType: req.user?.role,
        userId: req.user?._id,
      },
    }).catch(() => {});

    restaurant.menu.pull({ _id: categoryId });
    await restaurant.save();

    res.status(200).json({ success: true, message: "category_deleted" });
  } catch (error) {
    console.error("deleteCategory error:", error);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

exports.addMenuItem = async (req, res) => {
  try {
    const { restaurantId, categoryId } = req.params;
    const { isActive } = req.body;
    const price = parseMenuItemPrices(req.body.price);
    const { nameI18n, descriptionI18n } = parseItemI18nPayload(req.body);
    const resolved = await resolveItemPrimaryFields(nameI18n, descriptionI18n);
    const item_name = resolved.item_name;
    const item_desc = resolved.item_desc;

    if (!item_name || !Array.isArray(price) || price.length === 0) {
      cleanupReqItemImages(req);
      return res.status(400).json({ message: "item_name_price_required" });
    }

    const result = await getRestaurantAndCategory(restaurantId, categoryId);
    if (result.error) {
      cleanupReqItemImages(req);
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const { restaurant, category } = result;
    if (hasDuplicateItemName(category.items, nameI18n)) {
      cleanupReqItemImages(req);
      return res.status(400).json({ message: "item_name_already_exists_category" });
    }

    const normalizedPrices = [];
    const seenSizes = new Set();

    for (const entry of price) {
      const { item_size: size, sizeI18n } = parsePriceSizeI18n(
        entry,
        resolved.primaryCode
      );
      if (!size || entry.item_price === undefined || entry.item_price === null || entry.item_price === "") {
        cleanupReqItemImages(req);
        return res.status(400).json({ message: "each_price_must_include_size_and_price" });
      }

      if (seenSizes.has(size.toLowerCase())) {
        cleanupReqItemImages(req);
        return res.status(400).json({ message: `Duplicate size "${size}" is not allowed` });
      }

      seenSizes.add(size.toLowerCase());
      const normalizedPrice = parsePriceToCents(entry.item_price);

      if (!Number.isFinite(normalizedPrice)) {
        cleanupReqItemImages(req);
        return res.status(400).json({ message: `invalid_price_value: "${entry.item_price}"` });
      }

      normalizedPrices.push({
        item_size: size,
        sizeI18n,
        item_price: normalizedPrice,
      });
    }

    category.items.push({
      item_name: item_name.trim(),
      item_desc: item_desc || "",
      nameI18n,
      descriptionI18n,
      item_image: req.itemImagePaths || undefined,
      price: normalizedPrices,
      index: category.items.length,
      isActive: isActive !== false,
    });

    recalculatePriceSlotCount(category);
    restaurant.markModified("menu");
    await restaurant.save();

    res.status(201).json({
      success: true,
      message: "menu_item_added",
      item: formatItemPricesForResponse(
        category.items[category.items.length - 1],
        resolved.primaryCode
      ),
    });
  } catch (error) {
    console.error("addMenuItem error:", error);
    cleanupReqItemImages(req);
    res.status(500).json({ message: "server_error", success: false });
  }
};

exports.sortMenuItems = async (req, res) => {
  try {
    const { restaurantId, categoryId } = req.params;
    const { sortedIds } = req.body;

    if (!Array.isArray(sortedIds)) {
      return res.status(400).json({ message: "sortedIds must be an array" });
    }

    const result = await getRestaurantAndCategory(restaurantId, categoryId);
    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    result.category.items.forEach((item) => {
      const nextIndex = sortedIds.indexOf(item._id.toString());
      if (nextIndex > -1) {
        item.index = nextIndex;
      }
    });

    await result.restaurant.save();
    res.status(200).json({
      success: true,
      message: "Items sorted",
      items: result.category.items.map(formatItemPricesForResponse),
    });
  } catch (error) {
    console.error("sortMenuItems error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.updateMenuItem = async (req, res) => {
  try {
    const { restaurantId, categoryId, itemId } = req.params;
    const { isActive, removeImage } = req.body;
    const price =
      req.body.price !== undefined ? parseMenuItemPrices(req.body.price) : undefined;
    const hasI18nPayload =
      req.body.nameI18n != null ||
      req.body.descriptionI18n != null ||
      req.body.item_name != null ||
      req.body.item_desc != null;

    const result = await getRestaurantAndCategory(restaurantId, categoryId);
    if (result.error) {
      cleanupReqItemImages(req);
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const { restaurant, category } = result;
    const item = category.items.id(itemId);
    if (!item) {
      cleanupReqItemImages(req);
      return res.status(404).json({ message: "menu_item_not_found" });
    }

    let primaryCode;
    if (hasI18nPayload) {
      const { nameI18n, descriptionI18n } = parseItemI18nPayload(req.body);
      const resolved = await resolveItemPrimaryFields(nameI18n, descriptionI18n);
      primaryCode = resolved.primaryCode;

      if (!resolved.item_name) {
        cleanupReqItemImages(req);
        return res.status(400).json({ message: "item_name_price_required" });
      }

      if (hasDuplicateItemName(category.items, nameI18n, itemId)) {
        cleanupReqItemImages(req);
        return res.status(400).json({ message: "item_name_already_exists_category" });
      }

      item.item_name = resolved.item_name.trim();
      item.item_desc = resolved.item_desc || "";
      item.nameI18n = nameI18n;
      item.descriptionI18n = descriptionI18n;
    }

    if (typeof isActive === "boolean") item.isActive = isActive;

    if (price) {
      if (!Array.isArray(price) || price.length === 0) {
        cleanupReqItemImages(req);
        return res.status(400).json({ message: "price_must_be_a_non_empty_array" });
      }

      const sizePrimaryCode =
        primaryCode || (await getPrimaryContentLanguageCode());
      const normalizedPrices = [];
      const seenSizes = new Set();

      for (const entry of price) {
        const { item_size: size, sizeI18n } = parsePriceSizeI18n(
          entry,
          sizePrimaryCode
        );
        if (
          !size ||
          entry.item_price === undefined ||
          entry.item_price === null ||
          entry.item_price === ""
        ) {
          cleanupReqItemImages(req);
          return res.status(400).json({ message: "each_price_must_include_size_and_price" });
        }

        if (seenSizes.has(size.toLowerCase())) {
          cleanupReqItemImages(req);
          return res.status(400).json({ message: `Duplicate size "${size}" is not allowed` });
        }

        seenSizes.add(size.toLowerCase());
        const normalizedPrice = parsePriceToCents(entry.item_price);

        if (!Number.isFinite(normalizedPrice)) {
          cleanupReqItemImages(req);
          return res.status(400).json({ message: `Invalid price value: "${entry.item_price}"` });
        }

        normalizedPrices.push({
          item_size: size,
          sizeI18n,
          item_price: normalizedPrice,
        });
      }

      item.price = normalizedPrices;
      recalculatePriceSlotCount(category);
    }

    if ((removeImage === "true" || removeImage === true) && item.item_image) {
      await removeUploadedItemImages(item.item_image);
      item.item_image = undefined;
    }

    if (req.itemImagePaths) {
      if (item.item_image) {
        await removeUploadedItemImages(item.item_image);
      }
      item.item_image = req.itemImagePaths;
    }

    restaurant.markModified("menu");
    await restaurant.save();
    if (!primaryCode) {
      primaryCode = await getPrimaryContentLanguageCode();
    }
    res.status(200).json({
      success: true,
      message: "menu_item_updated",
      item: formatItemPricesForResponse(item, primaryCode),
    });
  } catch (error) {
    console.error("updateMenuItem error:", error);
    cleanupReqItemImages(req);
    res.status(500).json({ message: "server_error", success: false });
  }
};

exports.toggleItemActiveStatus = async (req, res) => {
  try {
    const result = await getRestaurantAndCategory(req.params.restaurantId, req.params.categoryId);
    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const item = result.category.items.id(req.params.itemId);
    if (!item) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    item.isActive = !item.isActive;
    await result.restaurant.save();

    res.status(200).json({
      success: true,
      message: item.isActive ? "item_is_now_active" : "item_is_now_inactive",
      item: formatItemPricesForResponse(item),
    });
  } catch (error) {
    console.error("toggleItemActiveStatus error:", error);
    res.status(500).json({ message: "Server error", success: false });
  }
};

exports.getMenuItemFoodInfo = async (req, res) => {
  try {
    const { restaurantId, categoryId, itemId } = req.params;
    const result = await getRestaurantAndCategory(restaurantId, categoryId);
    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const item = result.category.items.id(itemId);
    if (!item) {
      return res.status(404).json({ message: "menu_item_not_found" });
    }

    const latestDraft = await MenuItemFoodInfoDraft.findOne({
      restaurantId,
      categoryId,
      itemId,
      type: "food_info",
    }).sort({ version: -1, createdAt: -1 });

    return res.status(200).json({
      success: true,
      foodInfo: buildFoodInfoResponse(item, latestDraft),
    });
  } catch (error) {
    console.error("getMenuItemFoodInfo error:", error);
    return res.status(500).json({ success: false, message: "server_error" });
  }
};

exports.upsertMenuItemFoodInfo = async (req, res) => {
  try {
    const { restaurantId, categoryId, itemId } = req.params;
    const result = await getRestaurantAndCategory(restaurantId, categoryId);
    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const item = result.category.items.id(itemId);
    if (!item) {
      return res.status(404).json({ message: "menu_item_not_found" });
    }

    const actor = buildActorSnapshot(req.user);
    const approve = req.body?.approve !== false;
    const markVerified = req.body?.markVerified === true;
    const verificationNote = normalizeFoodInfoText(req.body?.verificationNote);
    const isSafeForDisplay = req.body?.isSafeForDisplay === true;
    const source =
      ["ai", "seller", "admin", "import", "hybrid"].includes(req.body?.source)
        ? req.body.source
        : "seller";

    const draftPayload = {
      allergens: normalizeLocalizedEntriesInput(req.body?.allergens, "allergen"),
      additives: normalizeLocalizedEntriesInput(req.body?.additives, "additive"),
      custom_sections: Array.isArray(req.body?.custom_sections) ? req.body.custom_sections : [],
    };

    const latestDraft = await MenuItemFoodInfoDraft.findOne({
      restaurantId,
      categoryId,
      itemId,
      type: "food_info",
    }).sort({ version: -1, createdAt: -1 });

    const draft = await MenuItemFoodInfoDraft.create({
      restaurantId,
      categoryId,
      itemId,
      type: "food_info",
      version: (latestDraft?.version ?? 0) + 1,
      supersedes: latestDraft?._id ?? null,
      source,
      status: approve ? "approved" : "draft",
      isSafeForDisplay,
      draft: draftPayload,
      rawInput: {
        item_name: item.item_name ?? "",
        description: item.item_desc ?? "",
        sourceText: "",
      },
      createdBy: actor,
      approvedBy: approve ? actor : null,
      approvedAt: approve ? new Date() : null,
      internalNotes: verificationNote,
    });

    if (approve) {
      await MenuItemFoodInfoDraft.updateMany(
        {
          restaurantId,
          categoryId,
          itemId,
          type: "food_info",
          status: "approved",
          _id: { $ne: draft._id },
        },
        { $set: { status: "superseded" } }
      );

      const now = new Date();
      const logEntry = {
        action: markVerified ? "approved" : "updated",
        actor,
        timestamp: now,
        draftId: draft._id,
        note: verificationNote,
      };

      item.food_info = item.food_info || {};
      item.food_info.allergens = applyLiveFoodInfoSection(
        item.food_info.allergens,
        draftPayload.allergens,
        actor,
        {
          source,
          isSafeForDisplay,
          draftId: draft._id,
          isVerified: markVerified,
          resetVerification: !markVerified,
          verificationNote,
          logEntry,
        }
      );
      item.food_info.additives = applyLiveFoodInfoSection(
        item.food_info.additives,
        draftPayload.additives,
        actor,
        {
          source,
          isSafeForDisplay,
          draftId: draft._id,
          isVerified: markVerified,
          resetVerification: !markVerified,
          verificationNote,
          logEntry,
        }
      );

      result.restaurant.markModified("menu");
      await result.restaurant.save();
    }

    const refreshedDraft = await MenuItemFoodInfoDraft.findById(draft._id);

    return res.status(200).json({
      success: true,
      message: approve
        ? markVerified
          ? "food_info_saved_and_verified"
          : "food_info_saved"
        : "food_info_draft_saved",
      item,
      foodInfo: buildFoodInfoResponse(item, refreshedDraft),
    });
  } catch (error) {
    console.error("upsertMenuItemFoodInfo error:", error);
    return res.status(500).json({ success: false, message: "server_error" });
  }
};

exports.addExtraMenu = async (req, res) => {
  try {
    const { restaurantId, categoryId } = req.params;
    const { prices } = req.body;
    const { labelI18n } = parseExtraI18nPayload(req.body);
    const resolved = await resolveExtraPrimaryFields(labelI18n);
    const label = resolved.label;
    const result = await getRestaurantAndCategory(restaurantId, categoryId);

    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    if (!label || !label.trim()) {
      return res.status(400).json({ message: "label_and_atleast_1_price_required" });
    }

    const extras = ensureExtraMenu(result.category);
    if (hasDuplicateExtraLabel(extras, labelI18n)) {
      return res.status(400).json({ message: "extra_with_this_name_exist" });
    }

    const validation = validateExtraPrices(prices);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    extras.push({
      label: label.trim(),
      labelI18n,
      isActive: true,
      prices: validation.normalized,
    });

    result.restaurant.markModified("menu");
    await result.restaurant.save();

    res.status(201).json({
      success: true,
      message: "extra_added",
      extras: extras.map((extra) =>
        formatExtraPricesForResponse(extra, resolved.primaryCode)
      ),
      extra: formatExtraPricesForResponse(
        extras[extras.length - 1],
        resolved.primaryCode
      ),
    });
  } catch (error) {
    console.error("addExtraMenu error:", error);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

exports.getExtraMenu = async (req, res) => {
  try {
    const result = await getRestaurantAndCategory(req.params.restaurantId, req.params.categoryId);
    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const primaryCode = await getPrimaryContentLanguageCode();
    res.status(200).json({
      success: true,
      extras: ensureExtraMenu(result.category).map((extra) =>
        formatExtraPricesForResponse(extra, primaryCode)
      ),
    });
  } catch (error) {
    console.error("getExtraMenu error:", error);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

exports.updateExtraMenu = async (req, res) => {
  try {
    const { restaurantId, categoryId } = req.params;
    const { extraId, prices } = req.body;
    const { labelI18n } = parseExtraI18nPayload(req.body);
    const resolved = await resolveExtraPrimaryFields(labelI18n);
    const label = resolved.label;
    const result = await getRestaurantAndCategory(restaurantId, categoryId);

    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const extras = ensureExtraMenu(result.category);
    const extra = extras.id(extraId);
    if (!extra) {
      return res.status(404).json({ message: "extra_not_found" });
    }

    if (!label || !label.trim()) {
      return res.status(400).json({ message: "label_and_atleast_1_price_required" });
    }

    if (hasDuplicateExtraLabel(extras, labelI18n, extraId)) {
      return res.status(400).json({ message: "extra_with_this_name_exist" });
    }

    const validation = validateExtraPrices(prices);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    extra.label = label.trim();
    extra.labelI18n = labelI18n;
    extra.prices = validation.normalized;

    result.restaurant.markModified("menu");
    await result.restaurant.save();

    res.status(200).json({
      success: true,
      message: "extra_updated",
      extra: formatExtraPricesForResponse(extra, resolved.primaryCode),
    });
  } catch (error) {
    console.error("updateExtraMenu error:", error);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

exports.deleteExtraMenu = async (req, res) => {
  try {
    const { restaurantId, categoryId, extraIndex } = req.params;
    const result = await getRestaurantAndCategory(restaurantId, categoryId);

    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const extras = ensureExtraMenu(result.category);
    const index = Number(extraIndex);
    if (!Number.isInteger(index) || !extras[index]) {
      return res.status(404).json({ message: "extra_not_found" });
    }

    extras.splice(index, 1);
    result.restaurant.markModified("menu");
    await result.restaurant.save();

    res.status(200).json({ success: true, message: "Extra deleted" });
  } catch (error) {
    console.error("deleteExtraMenu error:", error);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

exports.toggleExtraActiveStatus = async (req, res) => {
  try {
    const { restaurantId, categoryId, extraIndex } = req.params;
    const result = await getRestaurantAndCategory(restaurantId, categoryId);

    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const extras = ensureExtraMenu(result.category);
    const index = Number(extraIndex);
    const extra = extras[index];
    if (!extra) {
      return res.status(404).json({ message: "extra_not_found" });
    }

    extra.isActive = !extra.isActive;
    result.restaurant.markModified("menu");
    await result.restaurant.save();

    const primaryCode = await getPrimaryContentLanguageCode();
    res.status(200).json({
      success: true,
      message: extra.isActive ? "extra_is_now_active" : "extra_is_now_inactive",
      extra: formatExtraPricesForResponse(extra, primaryCode),
    });
  } catch (error) {
    console.error("toggleExtraActiveStatus error:", error);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

exports.upsertDressing = async (req, res) => {
  try {
    const { restaurantId, categoryId } = req.params;
    const { multiple, options } = req.body;
    const { labelI18n } = parseDressingI18nPayload(req.body);
    const resolved = await resolveDressingPrimaryFields(labelI18n);
    const dressing_label = resolved.dressing_label;
    const result = await getRestaurantAndCategory(restaurantId, categoryId);

    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    if (!dressing_label || !dressing_label.trim() || !Array.isArray(options) || options.length === 0) {
      return res.status(400).json({ message: "dressing_label_and_at_least_one_option" });
    }

    const normalizedOptions = [];
    for (const option of options) {
      const parsed = parseDressingOptionI18n(option, resolved.primaryCode);
      if (!parsed.dressing_name) continue;
      normalizedOptions.push({
        dressing_name: parsed.dressing_name,
        nameI18n: parsed.nameI18n,
        isActive: option.isActive !== false,
      });
    }

    if (normalizedOptions.length === 0) {
      return res.status(400).json({ message: "dressing_label_and_at_least_one_option" });
    }

    const hadExisting = Boolean(result.category.dressing);
    result.category.dressing = {
      dressing_label: dressing_label.trim(),
      labelI18n,
      multiple: Boolean(multiple),
      isActive: result.category.dressing?.isActive !== false,
      options: normalizedOptions,
    };

    result.restaurant.markModified("menu");
    await result.restaurant.save();

    res.status(200).json({
      success: true,
      message: hadExisting ? "dressing_updated" : "dressing_created",
      dressing: serializeDressingI18n(result.category.dressing, resolved.primaryCode),
    });
  } catch (error) {
    console.error("upsertDressing error:", error);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

exports.getAllDressings = async (req, res) => {
  try {
    const result = await getRestaurantAndCategory(req.params.restaurantId, req.params.categoryId);
    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const primaryCode = await getPrimaryContentLanguageCode();
    res.status(200).json({
      success: true,
      dressing: serializeDressingI18n(result.category.dressing ?? null, primaryCode),
    });
  } catch (error) {
    console.error("getAllDressings error:", error);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

exports.toggleDressing = async (req, res) => {
  try {
    const result = await getRestaurantAndCategory(req.params.restaurantId, req.params.categoryId);
    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    if (!result.category.dressing) {
      return res.status(404).json({ message: "dressing_not_found" });
    }

    result.category.dressing.isActive = !result.category.dressing.isActive;
    result.restaurant.markModified("menu");
    await result.restaurant.save();

    res.status(200).json({
      success: true,
      message: result.category.dressing.isActive ? "dressing_is_now_active" : "dressing_is_now_inactive",
      dressing: serializeDressingI18n(
        result.category.dressing,
        await getPrimaryContentLanguageCode()
      ),
    });
  } catch (error) {
    console.error("toggleDressing error:", error);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

exports.toggleDressingOption = async (req, res) => {
  try {
    const { optionIndex } = req.params;
    const result = await getRestaurantAndCategory(req.params.restaurantId, req.params.categoryId);
    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const options = result.category.dressing?.options;
    const index = Number(optionIndex);
    const option = options?.[index];
    if (!option) {
      return res.status(404).json({ message: "dressing_option_not_found" });
    }

    option.isActive = !option.isActive;
    result.restaurant.markModified("menu");
    await result.restaurant.save();

    const primaryCode = await getPrimaryContentLanguageCode();
    const serialized = serializeDressingI18n(result.category.dressing, primaryCode);
    res.status(200).json({
      success: true,
      message: option.isActive ? "option_is_now_active" : "option_is_now_inactive",
      option: serialized?.options?.[index] ?? option,
      dressing: serialized,
    });
  } catch (error) {
    console.error("toggleDressingOption error:", error);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

exports.deleteDressingOption = async (req, res) => {
  try {
    const { optionIndex } = req.params;
    const result = await getRestaurantAndCategory(req.params.restaurantId, req.params.categoryId);
    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const options = result.category.dressing?.options;
    const index = Number(optionIndex);
    if (!options || !options[index]) {
      return res.status(404).json({ message: "dressing_option_not_found" });
    }

    options.splice(index, 1);
    result.restaurant.markModified("menu");
    await result.restaurant.save();

    res.status(200).json({ success: true, message: "dressing_option_deleted" });
  } catch (error) {
    console.error("deleteDressingOption error:", error);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

exports.addAddon = async (req, res) => {
  try {
    const { restaurantId, categoryId } = req.params;
    const { optional, multiple, applyToAll, appliesTo, options, minSelect, maxSelect } = req.body;
    const { labelI18n } = parseAddonI18nPayload(req.body);
    const resolved = await resolveAddonPrimaryFields(labelI18n);
    const addon_label = resolved.addon_label;
    const result = await getRestaurantAndCategory(restaurantId, categoryId);

    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    if (!addon_label || !addon_label.trim()) {
      return res.status(400).json({ message: "addon_label_and_option_required" });
    }

    if (hasDuplicateAddonLabel(result.category.addons, labelI18n)) {
      return res.status(400).json({ message: "addon_label_already_exists" });
    }

    const validatedOptions = validateAddonOptions(options, resolved.primaryCode);
    if (validatedOptions.error) {
      return res.status(400).json({ message: validatedOptions.error });
    }

    const selectLimits = normalizeAddonSelectLimits({
      multiple: Boolean(multiple),
      optional: optional !== false,
      minSelect,
      maxSelect,
      optionCount: validatedOptions.normalized.length,
    });
    if (selectLimits.error) {
      return res.status(400).json({ message: selectLimits.error });
    }

    const validatedAppliesTo = validateAppliesTo(
      result.category,
      appliesTo,
      applyToAll !== false
    );
    if (validatedAppliesTo.error) {
      return res.status(400).json({ message: validatedAppliesTo.error });
    }

    result.category.addons.push({
      addon_label: addon_label.trim(),
      labelI18n,
      optional: optional !== false,
      multiple: Boolean(multiple),
      minSelect: selectLimits.minSelect,
      maxSelect: selectLimits.maxSelect,
      applyToAll: applyToAll !== false,
      appliesTo: validatedAppliesTo.normalized,
      options: validatedOptions.normalized,
      isActive: true,
    });

    result.restaurant.markModified("menu");
    await result.restaurant.save();

    res.status(201).json({
      success: true,
      message: "addon_added",
      addon: formatAddonPricesForResponse(
        result.category.addons[result.category.addons.length - 1],
        resolved.primaryCode
      ),
    });
  } catch (error) {
    console.error("addAddon error:", error);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

exports.updateAddon = async (req, res) => {
  try {
    const { restaurantId, categoryId, index } = req.params;
    const { optional, multiple, applyToAll, appliesTo, options, minSelect, maxSelect } = req.body;
    const { labelI18n } = parseAddonI18nPayload(req.body);
    const resolved = await resolveAddonPrimaryFields(labelI18n);
    const addon_label = resolved.addon_label;
    const result = await getRestaurantAndCategory(restaurantId, categoryId);

    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const addonIndex = Number(index);
    const addon = result.category.addons?.[addonIndex];
    if (!addon) {
      return res.status(404).json({ message: "addon_not_found" });
    }

    if (!addon_label || !addon_label.trim()) {
      return res.status(400).json({ message: "addon_label_and_option_required" });
    }

    if (hasDuplicateAddonLabel(result.category.addons, labelI18n, addonIndex)) {
      return res.status(400).json({ message: "addon_label_already_exists" });
    }

    const validatedOptions = validateAddonOptions(options, resolved.primaryCode);
    if (validatedOptions.error) {
      return res.status(400).json({ message: validatedOptions.error });
    }

    const selectLimits = normalizeAddonSelectLimits({
      multiple: Boolean(multiple),
      optional: optional !== false,
      minSelect,
      maxSelect,
      optionCount: validatedOptions.normalized.length,
    });
    if (selectLimits.error) {
      return res.status(400).json({ message: selectLimits.error });
    }

    const validatedAppliesTo = validateAppliesTo(
      result.category,
      appliesTo,
      applyToAll !== false
    );
    if (validatedAppliesTo.error) {
      return res.status(400).json({ message: validatedAppliesTo.error });
    }

    addon.addon_label = addon_label.trim();
    addon.labelI18n = labelI18n;
    addon.optional = optional !== false;
    addon.multiple = Boolean(multiple);
    addon.minSelect = selectLimits.minSelect;
    addon.maxSelect = selectLimits.maxSelect;
    addon.applyToAll = applyToAll !== false;
    addon.appliesTo = validatedAppliesTo.normalized;
    addon.options = validatedOptions.normalized;

    result.restaurant.markModified("menu");
    await result.restaurant.save();

    res.status(200).json({
      success: true,
      message: "Addon updated",
      addon: formatAddonPricesForResponse(addon, resolved.primaryCode),
    });
  } catch (error) {
    console.error("updateAddon error:", error);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

exports.toggleAddon = async (req, res) => {
  try {
    const result = await getRestaurantAndCategory(req.params.restaurantId, req.params.categoryId);
    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const addon = result.category.addons?.[Number(req.params.index)];
    if (!addon) {
      return res.status(404).json({ message: "addon_not_found" });
    }

    addon.isActive = !addon.isActive;
    result.restaurant.markModified("menu");
    await result.restaurant.save();

    res.status(200).json({
      success: true,
      message: addon.isActive ? "addon_is_now_active" : "addon_is_now_inactive",
      addon: formatAddonPricesForResponse(addon),
    });
  } catch (error) {
    console.error("toggleAddon error:", error);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

exports.deleteAddon = async (req, res) => {
  try {
    const result = await getRestaurantAndCategory(req.params.restaurantId, req.params.categoryId);
    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const addonIndex = Number(req.params.index);
    if (!result.category.addons?.[addonIndex]) {
      return res.status(404).json({ message: "addon_not_found" });
    }

    result.category.addons.splice(addonIndex, 1);
    result.restaurant.markModified("menu");
    await result.restaurant.save();

    res.status(200).json({ success: true, message: "addon_deleted" });
  } catch (error) {
    console.error("deleteAddon error:", error);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

exports.getAllAddons = async (req, res) => {
  try {
    const result = await getRestaurantAndCategory(req.params.restaurantId, req.params.categoryId);
    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    res.status(200).json({
      success: true,
      addons: (result.category.addons ?? []).map(formatAddonPricesForResponse),
    });
  } catch (error) {
    console.error("getAllAddons error:", error);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

exports.toggleAddonOptionStatus = async (req, res) => {
  try {
    const result = await getRestaurantAndCategory(req.params.restaurantId, req.params.categoryId);
    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const addon = result.category.addons?.[Number(req.params.addonIndex)];
    if (!addon) {
      return res.status(404).json({ message: "addon_not_found" });
    }

    const option = addon.options?.[Number(req.params.optionIndex)];
    if (!option) {
      return res.status(404).json({ message: "option_not_found" });
    }

    option.isActive = !option.isActive;
    result.restaurant.markModified("menu");
    await result.restaurant.save();

    res.status(200).json({
      success: true,
      message: option.isActive ? "option_is_now_active" : "option_is_now_inactive",
      option: {
        ...(typeof option?.toObject === "function" ? option.toObject() : option),
        addon_price: formatDecimalPrice(option?.addon_price),
      },
    });
  } catch (error) {
    console.error("toggleAddonOptionStatus error:", error);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

exports.deleteAddonOption = async (req, res) => {
  try {
    const result = await getRestaurantAndCategory(req.params.restaurantId, req.params.categoryId);
    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const addon = result.category.addons?.[Number(req.params.addonIndex)];
    if (!addon) {
      return res.status(404).json({ message: "addon_not_found" });
    }

    const optionIndex = Number(req.params.optionIndex);
    if (!addon.options?.[optionIndex]) {
      return res.status(404).json({ message: "option_not_found" });
    }

    addon.options.splice(optionIndex, 1);
    result.restaurant.markModified("menu");
    await result.restaurant.save();

    res.status(200).json({ success: true, message: "addon_option_deleted" });
  } catch (error) {
    console.error("deleteAddonOption error:", error);
    res.status(500).json({ success: false, message: "server_error" });
  }
};
