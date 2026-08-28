const {
  Restaurant,
  generateUsername,
  generateNextCustomerId,
} = require("../modals/Restaurant");
const Cuisine = require("../modals/Cuisine");
const bcrypt = require("bcryptjs");
const moment = require("moment-timezone");
const mongoose = require("mongoose");
const Order = require("../modals/Order");
const DiningSession = require("../modals/DiningSession");
const RestaurantStaff = require("../modals/RestaurantStaff");
const { emitRestaurantForceLogout, emitPlatformPublishRequest } = require("../services/realtimeSocketService");
const { getAppModuleConfig } = require("../services/moduleConfigService");
const {
  MODULE_KEYS,
  effectiveRestaurantModules,
  modulePayload,
} = require("../utils/modules");
const {
  canManagePlatformRestaurantFields,
  isRestaurantAdminRole,
} = require("../utils/restaurantRoles");
const { resolveLocalizedValue } = require("../utils/cuisineI18n");
const { getPublicUploadUrl } = require("../utils/r2Storage");
const { serializeCategoryI18n } = require("../utils/menuCategoryI18n");
const { formatItemImageForPublic } = require("../utils/menuItemImage");
const { buildDiacriticInsensitiveRegex } = require("../utils/searchNormalize");
const {
  DEFAULT_COUNTRY_CODE,
  isValidPostalCode,
  resolveCountryFromAddress,
} = require("../utils/countries");
const { getPlatformSettings } = require("../services/platformSettingsService");
const { getVisibilityFailedConditions } = require("../utils/restaurantVisibility");
const {
  appendRestaurantAudit,
  diffChange,
  paginateAuditLogs,
  auditLogsToCsv,
} = require("../utils/restaurantAudit");

const DISCOVER_DEFAULT_LIMIT = 12;
const DISCOVER_MAX_LIMIT = 50;
const DISCOVER_BATCH_MULTIPLIER = 3;
const BERLIN_TIMEZONE = "Europe/Berlin";
const WEEK_DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const BLOCKING_ONLINE_ORDER_STATUSES = ["pending", "accepted", "preparing"];
const PENDING_ORDER_STATUS = "pending";
const ONGOING_ORDER_STATUSES = [
  "accepted",
  "preparing",
  "dispatch",
  "out_for_delivery",
  "ready_for_pickup",
];

async function countBlockingOnlineOrders(restaurantId) {
  return Order.countDocuments({
    "restaurant.restaurantId": restaurantId,
    "payment.method": { $ne: "cod" },
    "payment.status": "paid",
    status: { $in: BLOCKING_ONLINE_ORDER_STATUSES },
  });
}

async function getRestaurantDeactivationImpact(restaurantId) {
  const [pendingOrders, ongoingOrders, openTableSessions] = await Promise.all([
    Order.countDocuments({
      "restaurant.restaurantId": restaurantId,
      status: PENDING_ORDER_STATUS,
    }),
    Order.countDocuments({
      "restaurant.restaurantId": restaurantId,
      status: { $in: ONGOING_ORDER_STATUSES },
    }),
    DiningSession.countDocuments({
      restaurantId,
      status: "open",
    }),
  ]);

  return {
    pendingOrders,
    ongoingOrders,
    openTableSessions,
    hasActivity: pendingOrders + ongoingOrders + openTableSessions > 0,
  };
}

async function respondIfBlockingOnlineOrders(restaurantId, res) {
  const ongoingOrders = await countBlockingOnlineOrders(restaurantId);
  if (ongoingOrders <= 0) return false;

  res.status(409).json({
    success: false,
    message: "restaurant_has_ongoing_paid_orders",
    ongoingOrders,
  });
  return true;
}

function normalizePostalCode(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "");
}

function parseBooleanParam(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();

  if (["true", "1", "yes"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function parseListParam(value) {
  if (!value) {
    return [];
  }

  const rawValues = Array.isArray(value) ? value : [value];

  return rawValues
    .flatMap((entry) => String(entry).split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function centsToEuroNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(((parsed / 100) + Number.EPSILON) * 100) / 100;
}

function storedDeliveryMoneyToEuroNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return centsToEuroNumber(parsed);
}

function formatMenuPricesFromCents(menu) {
  return (menu || []).map((category) => {
    const categoryObj = typeof category?.toObject === "function" ? category.toObject() : { ...category };

    categoryObj.items = (categoryObj.items || []).map((item) => {
      const priceRows = Array.isArray(item.price)
        ? item.price
        : item.price != null
          ? [{ item_price: item.price }]
          : [];

      return {
        ...item,
        price: priceRows.map((row) => ({
          ...row,
          item_price: centsToEuroNumber(row.item_price),
        })),
      };
    });

    if (categoryObj.extra_menu?.extras) {
      categoryObj.extra_menu.extras = categoryObj.extra_menu.extras.map((extra) => ({
        ...extra,
        prices: (Array.isArray(extra.prices) ? extra.prices : []).map((row) => ({
          ...row,
          price: centsToEuroNumber(row.price),
        })),
      }));
    }

    categoryObj.addons = (categoryObj.addons || []).map((addon) => ({
      ...addon,
      options: (addon.options || []).map((option) => ({
        ...option,
        addon_price: centsToEuroNumber(option.addon_price),
      })),
    }));

    return serializeCategoryI18n(categoryObj);
  });
}

function formatDeliveryZoneFromCents(zone) {
  if (!zone) return null;
  const zoneObj = typeof zone?.toObject === "function" ? zone.toObject() : { ...zone };
  return {
    ...zoneObj,
    charges: storedDeliveryMoneyToEuroNumber(zoneObj.charges),
    min_order_value: storedDeliveryMoneyToEuroNumber(zoneObj.min_order_value),
    free_delivery_min_order: storedDeliveryMoneyToEuroNumber(
      zoneObj.free_delivery_min_order
    ),
  };
}

function formatRestaurantMoneyFromCents(restaurant) {
  const restaurantObj =
    typeof restaurant?.toObject === "function" ? restaurant.toObject() : { ...restaurant };
  restaurantObj.delivering_at = (restaurantObj.delivering_at || []).map(
    formatDeliveryZoneFromCents
  );
  if (restaurantObj.menu) {
    restaurantObj.menu = formatMenuPricesFromCents(restaurantObj.menu);
  }
  return restaurantObj;
}

function timeStringToMinutes(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const [hour, minute] = value.split(":").map(Number);

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return hour * 60 + minute;
}

function getDayNameForMoment(date) {
  return WEEK_DAYS[date.day()];
}

function getPreviousDayName(dayName) {
  const currentIndex = WEEK_DAYS.indexOf(dayName);
  if (currentIndex === -1) {
    return "sunday";
  }

  return WEEK_DAYS[(currentIndex + 6) % 7];
}

function isInBreakWindow(schedule, minute) {
  const breakFrom = timeStringToMinutes(schedule?.break_from);
  const breakTo = timeStringToMinutes(schedule?.break_to);

  if (breakFrom === null || breakTo === null || breakTo <= breakFrom) {
    return false;
  }

  return minute >= breakFrom && minute < breakTo;
}

function isActiveDuringCurrentDay(schedule, minuteOfDay) {
  if (!schedule || schedule.ifClosed) {
    return false;
  }

  const opening = timeStringToMinutes(schedule.opening);
  const closing = timeStringToMinutes(schedule.closing);

  if (opening === null || closing === null) {
    return false;
  }

  if (!schedule.nextDay) {
    if (minuteOfDay < opening || minuteOfDay >= closing) {
      return false;
    }

    return !isInBreakWindow(schedule, minuteOfDay);
  }

  if (minuteOfDay < opening) {
    return false;
  }

  return !isInBreakWindow(schedule, minuteOfDay);
}

function isActiveDuringPreviousDayCarry(schedule, minuteOfDay) {
  if (!schedule || schedule.ifClosed || !schedule.nextDay) {
    return false;
  }

  const closing = timeStringToMinutes(schedule.closing);
  if (closing === null) {
    return false;
  }

  return minuteOfDay < closing;
}

function parseDeliveryMinutes(value) {
  const match = String(value || "").match(/(\d{1,3})/);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function getServiceSegmentEnd(schedule, minuteOfDay, fromPreviousDay = false) {
  if (!schedule || schedule.ifClosed) {
    return null;
  }

  const opening = timeStringToMinutes(schedule.opening);
  const closing = timeStringToMinutes(schedule.closing);
  if (opening === null || closing === null) {
    return null;
  }

  const breakFrom = timeStringToMinutes(schedule.break_from);
  const breakTo = timeStringToMinutes(schedule.break_to);
  const hasBreak = breakFrom !== null && breakTo !== null && breakTo > breakFrom;

  if (fromPreviousDay) {
    if (!schedule.nextDay || minuteOfDay >= closing) {
      return null;
    }
    return closing;
  }

  if (!schedule.nextDay) {
    if (minuteOfDay < opening || minuteOfDay >= closing) {
      return null;
    }
    if (hasBreak && minuteOfDay >= breakFrom && minuteOfDay < breakTo) {
      return null;
    }
    if (hasBreak && minuteOfDay < breakFrom) {
      return breakFrom;
    }
    return closing;
  }

  if (minuteOfDay < opening) {
    return null;
  }
  if (hasBreak && minuteOfDay >= breakFrom && minuteOfDay < breakTo) {
    return null;
  }
  if (hasBreak && minuteOfDay < breakFrom) {
    return breakFrom;
  }
  return 1440 + closing;
}

const CLOSING_SOON_MINUTES = 45;

function getMinutesUntilClose(openingHours, now = moment().tz(BERLIN_TIMEZONE)) {
  if (!openingHours) {
    return null;
  }

  const dayName = getDayNameForMoment(now);
  const previousDayName = getPreviousDayName(dayName);
  const minuteOfDay = now.hours() * 60 + now.minutes();

  const todayEnd = getServiceSegmentEnd(openingHours[dayName], minuteOfDay);
  if (todayEnd !== null) {
    return Math.max(0, todayEnd - minuteOfDay);
  }

  const previousEnd = getServiceSegmentEnd(
    openingHours[previousDayName],
    minuteOfDay,
    true
  );
  if (previousEnd !== null) {
    return Math.max(0, previousEnd - minuteOfDay);
  }

  return null;
}

function isTwentyFourHourSchedule(schedule) {
  if (!schedule || schedule.ifClosed) {
    return false;
  }
  if (schedule.break_from && schedule.break_to) {
    return false;
  }
  const opening = timeStringToMinutes(schedule.opening);
  const closing = timeStringToMinutes(schedule.closing);
  if (opening === null || closing === null) {
    return false;
  }
  if (opening === 0 && closing >= 23 * 60 + 59) {
    return true;
  }
  if (opening === 0 && closing === 0 && schedule.nextDay) {
    return true;
  }
  return false;
}

function isOpen24Hours(openingHours, now = moment().tz(BERLIN_TIMEZONE)) {
  if (!openingHours) {
    return false;
  }
  const dayName = getDayNameForMoment(now);
  if (isTwentyFourHourSchedule(openingHours[dayName])) {
    return true;
  }
  const minutesUntilClose = getMinutesUntilClose(openingHours, now);
  return minutesUntilClose !== null && minutesUntilClose >= 23 * 60;
}

function isClosingSoon(minutesUntilClose) {
  return (
    minutesUntilClose !== null &&
    minutesUntilClose > 0 &&
    minutesUntilClose < CLOSING_SOON_MINUTES
  );
}

function isRestaurantOpenNow(
  openingHours,
  now = moment().tz(BERLIN_TIMEZONE),
  leadTimeMinutes = 0
) {
  if (!openingHours) {
    return false;
  }

  const dayName = getDayNameForMoment(now);
  const previousDayName = getPreviousDayName(dayName);
  const minuteOfDay = now.hours() * 60 + now.minutes();

  const todaySchedule = openingHours[dayName];
  const todaySegmentEnd = getServiceSegmentEnd(todaySchedule, minuteOfDay);
  if (
    todaySegmentEnd !== null &&
    minuteOfDay + leadTimeMinutes <= todaySegmentEnd
  ) {
    return true;
  }

  const previousDaySchedule = openingHours[previousDayName];
  const previousSegmentEnd = getServiceSegmentEnd(
    previousDaySchedule,
    minuteOfDay,
    true
  );
  if (
    previousSegmentEnd !== null &&
    minuteOfDay + leadTimeMinutes <= previousSegmentEnd
  ) {
    return true;
  }

  return false;
}

function buildDiscoverBaseFilter(postalCode) {
  return {
    isActive: true,
    visibility: true,
    $or: [
      { "delivering_at.postalCode": postalCode },
      { "address.postalCode": postalCode },
    ],
  };
}

function getMatchedDeliveryZone(deliveryZones, postalCode) {
  return (deliveryZones || []).find(
    (zone) => normalizePostalCode(zone?.postalCode) === postalCode
  );
}

function mapCuisineIcon(icon) {
  const value = typeof icon === "string" ? icon.trim() : "";
  if (!value) return "";
  if (/^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
  return getPublicUploadUrl(value) || value;
}

function mapDiscoverRestaurant(restaurant, postalCode) {
  const normalizedPostalCode = normalizePostalCode(postalCode);
  const activeCategories = (restaurant.menu || []).filter(
    (category) => category?.isActive !== false
  );
  const matchedDeliveryZone = getMatchedDeliveryZone(
    restaurant.delivering_at,
    normalizedPostalCode
  );
  const now = moment().tz(BERLIN_TIMEZONE);
  const minutesUntilClose = getMinutesUntilClose(restaurant.opening_hours, now);
  const isOpenNow = isRestaurantOpenNow(restaurant.opening_hours, now, 0);
  const closingSoon = Boolean(isOpenNow && isClosingSoon(minutesUntilClose));
  const open24Hours = Boolean(isOpenNow && isOpen24Hours(restaurant.opening_hours, now));
  const cuisines = (restaurant.cuisine_type || [])
    .map((cuisine) => ({
      _id: String(cuisine?._id || ""),
      name: resolveLocalizedValue(cuisine?.name, ["de", "en"]),
      icon: mapCuisineIcon(cuisine?.icon),
    }))
    .filter((cuisine) => cuisine._id && cuisine.name);
  const categories = activeCategories.map((category) => ({
    _id: String(category?._id || ""),
    name: category?.category_name || "",
    description: category?.category_desc || "",
    itemCount: Array.isArray(category?.items)
      ? category.items.filter((item) => item?.isActive !== false).length
      : 0,
  }));
  const deliveryPostalCodes = (restaurant.delivering_at || []).map((zone) => ({
    postalCode: zone?.postalCode || "",
    free: Boolean(zone?.free),
    charges: storedDeliveryMoneyToEuroNumber(zone?.charges),
    minOrderValue: storedDeliveryMoneyToEuroNumber(zone?.min_order_value),
    freeDeliveryMinOrder: storedDeliveryMoneyToEuroNumber(
      zone?.free_delivery_min_order
    ),
    deliveryTime: zone?.delivery_time || "",
  }));

  return {
    _id: String(restaurant._id),
    restaurant_name: restaurant.restaurant_name,
    username: restaurant.username,
    description: restaurant.description || "",
    address: {
      street: restaurant.address?.street || "",
      houseNumber: restaurant.address?.houseNumber || "",
      city: restaurant.address?.city || "",
      postalCode: restaurant.address?.postalCode || "",
      country: restaurant.address?.country || "",
    },
    images: {
      logo: restaurant.images?.logo || "",
      cover: restaurant.images?.cover || "",
    },
    cuisines,
    categories,
    discount: restaurant.discount
      ? {
          type: restaurant.discount.type,
          value: Number(restaurant.discount.value || 0),
        }
      : null,
    deliveryPostalCodes,
    matchedDeliveryZone: matchedDeliveryZone
      ? {
          postalCode: matchedDeliveryZone.postalCode,
          free: Boolean(matchedDeliveryZone.free),
          charges: storedDeliveryMoneyToEuroNumber(matchedDeliveryZone.charges),
          minOrderValue: storedDeliveryMoneyToEuroNumber(
            matchedDeliveryZone.min_order_value
          ),
          freeDeliveryMinOrder: storedDeliveryMoneyToEuroNumber(
            matchedDeliveryZone.free_delivery_min_order
          ),
          deliveryTime: matchedDeliveryZone.delivery_time || "",
        }
      : null,
    deliveryAvailable: Boolean(restaurant.delivery && matchedDeliveryZone),
    takeawayAvailable: Boolean(restaurant.take_away),
    isHalal: Boolean(restaurant.isHalal),
    isOpenNow,
    isClosedNow: !isOpenNow,
    closingSoon,
    minutesUntilClose,
    closesAt: getCurrentClosingTime(restaurant.opening_hours, now),
    open24Hours,
    serviceStatus: isOpenNow ? (closingSoon ? "closing_soon" : "open") : "closed",
  };
}

function restaurantSearchHaystack(restaurant) {
  return [
    restaurant.restaurant_name,
    restaurant.username,
    restaurant.description,
    restaurant.address?.street,
    restaurant.address?.houseNumber,
    restaurant.address?.city,
    restaurant.address?.postalCode,
    ...(restaurant.cuisines || []).map((cuisine) => cuisine.name),
    ...(restaurant.categories || []).map((category) => category.name),
  ]
    .filter(Boolean)
    .join(" ");
}

function matchesDiscoverSearch(restaurant, searchRegex) {
  if (!searchRegex) {
    return true;
  }

  return searchRegex.test(restaurantSearchHaystack(restaurant));
}

async function findCuisineIdsForSearch(searchRegex) {
  if (!searchRegex) {
    return [];
  }

  const cuisines = await Cuisine.find({
    isActive: { $ne: false },
    $or: [
      { name: searchRegex },
      { "name.de": searchRegex },
      { "name.en": searchRegex },
      { "name.fr": searchRegex },
      { "name.es": searchRegex },
      { "name.it": searchRegex },
      { "name.pl": searchRegex },
      { "name.ru": searchRegex },
      { "name.ar": searchRegex },
    ],
  })
    .select("_id")
    .lean();

  return cuisines.map((cuisine) => cuisine._id);
}

function withDiscoverSearchFilter(baseFilter, searchRegex, cuisineIds) {
  if (!searchRegex) {
    return baseFilter;
  }

  const searchOr = [
    { restaurant_name: searchRegex },
    { username: searchRegex },
    { description: searchRegex },
    { "address.street": searchRegex },
    { "address.city": searchRegex },
    { "address.postalCode": searchRegex },
    { "menu.category_name": searchRegex },
  ];

  if (cuisineIds.length) {
    searchOr.push({ cuisine_type: { $in: cuisineIds } });
  }

  return {
    isActive: baseFilter.isActive,
    visibility: baseFilter.visibility,
    $and: [{ $or: baseFilter.$or }, { $or: searchOr }],
  };
}

function matchesDiscoverFilters(restaurant, filters) {
  if (!matchesDiscoverSearch(restaurant, filters.searchRegex)) {
    return false;
  }

  if (
    filters.cuisineIds.length &&
    !restaurant.cuisines.some((cuisine) =>
      filters.cuisineIds.includes(cuisine._id)
    )
  ) {
    return false;
  }

  if (
    filters.categoryNames.length &&
    !restaurant.categories.some((category) =>
      filters.categoryNames.includes(category.name.trim().toLowerCase())
    )
  ) {
    return false;
  }

  if (
    filters.deliveryAvailable !== undefined &&
    restaurant.deliveryAvailable !== filters.deliveryAvailable
  ) {
    return false;
  }

  if (
    filters.takeawayAvailable !== undefined &&
    restaurant.takeawayAvailable !== filters.takeawayAvailable
  ) {
    return false;
  }

  if (
    filters.openNow !== undefined &&
    restaurant.isOpenNow !== filters.openNow
  ) {
    return false;
  }

  if (
    filters.freeDelivery !== undefined &&
    (restaurant.matchedDeliveryZone
      ? restaurant.matchedDeliveryZone.free ||
        Number(restaurant.matchedDeliveryZone.freeDeliveryMinOrder || 0) > 0
      : false) !== filters.freeDelivery
  ) {
    return false;
  }

  return true;
}

function parseDiscoverFilters(query) {
  const search = String(query.search || query.q || "").trim();
  return {
    search,
    searchRegex: search ? buildDiacriticInsensitiveRegex(search) : null,
    cuisineIds: parseListParam(query.cuisine),
    categoryNames: parseListParam(query.category).map((name) =>
      String(name).trim().toLowerCase()
    ),
    deliveryAvailable: parseBooleanParam(query.deliveryAvailable),
    takeawayAvailable: parseBooleanParam(query.takeawayAvailable),
    openNow: parseBooleanParam(query.openNow),
    freeDelivery: parseBooleanParam(query.freeDelivery),
  };
}

function sanitizeDiscoverLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DISCOVER_DEFAULT_LIMIT;
  }

  return Math.min(parsed, DISCOVER_MAX_LIMIT);
}

function encodeCursor(id) {
  return Buffer.from(JSON.stringify({ id: String(id) }), "utf8").toString(
    "base64"
  );
}

function decodeCursor(cursor) {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(String(cursor), "base64").toString("utf8")
    );
    return parsed?.id ? String(parsed.id) : null;
  } catch (error) {
    return null;
  }
}

const discoverSelect =
  "restaurant_name username description images.logo images.cover address.street address.houseNumber address.city address.postalCode address.country cuisine_type delivery take_away discount delivering_at menu._id menu.category_name menu.category_desc menu.isActive menu.items.isActive opening_hours isHalal";

function getCurrentClosingTime(openingHours, now = moment().tz(BERLIN_TIMEZONE)) {
  if (!openingHours) {
    return "";
  }

  const dayName = getDayNameForMoment(now);
  const previousDayName = getPreviousDayName(dayName);
  const minuteOfDay = now.hours() * 60 + now.minutes();

  const todaySchedule = openingHours[dayName];
  if (isActiveDuringCurrentDay(todaySchedule, minuteOfDay)) {
    return todaySchedule?.closing || "";
  }

  const previousDaySchedule = openingHours[previousDayName];
  if (isActiveDuringPreviousDayCarry(previousDaySchedule, minuteOfDay)) {
    return previousDaySchedule?.closing || "";
  }

  return "";
}

function mapPublicHourRow(schedule) {
  if (
    !schedule ||
    schedule.ifClosed ||
    !schedule.opening ||
    !schedule.closing
  ) {
    return { closed: true };
  }

  if (schedule.break_from && schedule.break_to) {
    return {
      open: schedule.opening,
      close: schedule.break_from,
      breakAfter: true,
      open2: schedule.break_to,
      close2: schedule.closing,
    };
  }

  return {
    open: schedule.opening,
    close: schedule.closing,
  };
}

function mapPublicOpeningHours(openingHours) {
  return [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ].map((day) => mapPublicHourRow(openingHours?.[day]));
}

function filterPublicMenu(menu, modules = {}) {
  const includeFoodInfo = modules.foodInfo !== false;
  return (menu || [])
    .filter((category) => category?.isActive !== false)
    .map((category) => {
      const items = (category?.items || [])
        .filter((item) => item?.isActive !== false)
        .map((item) => ({
          _id: String(item?._id || ""),
          item_name: item?.item_name || "",
          item_desc: item?.item_desc || "",
          nameI18n:
            item?.nameI18n && typeof item.nameI18n === "object" ? item.nameI18n : {},
          descriptionI18n:
            item?.descriptionI18n && typeof item.descriptionI18n === "object"
              ? item.descriptionI18n
              : {},
          item_image: formatItemImageForPublic(item?.item_image),
          price: (item?.price || [])
            .filter(
              (row) =>
                row &&
                row.item_size &&
                row.item_price !== undefined &&
                row.item_price !== null
            )
            .map((row) => ({
              item_size: row.item_size,
              sizeI18n:
                row?.sizeI18n && typeof row.sizeI18n === "object" ? row.sizeI18n : {},
              item_price: centsToEuroNumber(row.item_price),
            })),
          ...(includeFoodInfo ? { food_info: item?.food_info || undefined } : {}),
          highlight: Boolean(item?.highlight),
        }))
        .filter((item) => item.price.length > 0);

      const extras = (category?.extra_menu?.extras || [])
        .filter((extra) => extra?.isActive !== false)
        .map((extra) => ({
          _id: extra?._id ? String(extra._id) : "",
          label: extra?.label || "",
          labelI18n:
            extra?.labelI18n && typeof extra.labelI18n === "object"
              ? extra.labelI18n
              : {},
          prices: (extra?.prices || [])
            .filter(
              (row) =>
                row &&
                row.price !== undefined &&
                row.price !== null
            )
            .map((row) => ({
              price: centsToEuroNumber(row.price),
            })),
        }))
        .filter((extra) => extra.label && extra.prices.length > 0);

      const dressing =
        category?.dressing && category.dressing.isActive !== false
          ? {
              _id: category.dressing?._id
                ? String(category.dressing._id)
                : "",
              dressing_label: category.dressing?.dressing_label || "",
              labelI18n:
                category.dressing?.labelI18n &&
                typeof category.dressing.labelI18n === "object"
                  ? category.dressing.labelI18n
                  : {},
              multiple: Boolean(category.dressing?.multiple),
              options: (category.dressing?.options || [])
                .filter((option) => option?.isActive !== false)
                .map((option) => ({
                  _id: option?._id ? String(option._id) : "",
                  dressing_name: option?.dressing_name || "",
                  nameI18n:
                    option?.nameI18n && typeof option.nameI18n === "object"
                      ? option.nameI18n
                      : {},
                }))
                .filter((option) => option.dressing_name),
            }
          : null;

      const addons = (category?.addons || [])
        .filter((addon) => addon?.isActive !== false)
        .map((addon) => ({
          _id: addon?._id ? String(addon._id) : "",
          addon_label: addon?.addon_label || "",
          labelI18n:
            addon?.labelI18n && typeof addon.labelI18n === "object"
              ? addon.labelI18n
              : {},
          optional: Boolean(addon?.optional),
          multiple: Boolean(addon?.multiple),
          minSelect: Number(addon?.minSelect) || 0,
          maxSelect: Number(addon?.maxSelect) || 0,
          applyToAll: Boolean(addon?.applyToAll),
          appliesTo: (addon?.appliesTo || []).map((id) => String(id)),
          options: (addon?.options || [])
            .filter((option) => option?.isActive !== false)
            .map((option) => ({
              _id: option?._id ? String(option._id) : "",
              addon_name: option?.addon_name || "",
              nameI18n:
                option?.nameI18n && typeof option.nameI18n === "object"
                  ? option.nameI18n
                  : {},
              addon_price: centsToEuroNumber(option?.addon_price || 0),
            }))
            .filter((option) => option.addon_name),
        }))
        .filter((addon) => addon.addon_label && addon.options.length > 0);

      return {
        _id: String(category?._id || ""),
        category_name: category?.category_name || "",
        category_desc: category?.category_desc || "",
        category_image: category?.category_image || "",
        count_of_prices: Number(category?.count_of_prices || 1),
        items,
        extra_menu: {
          extras,
        },
        dressing:
          dressing && dressing.options.length > 0 && dressing.dressing_label
            ? dressing
            : null,
        addons,
      };
    })
    .filter((category) => category.category_name && category.items.length > 0);
}

function getPrimaryDeliveryZone(restaurant, requestedPostalCode) {
  const requestedZone = getMatchedDeliveryZone(
    restaurant?.delivering_at,
    normalizePostalCode(requestedPostalCode)
  );

  if (requestedZone) {
    return requestedZone;
  }

  const restaurantPostalCode = normalizePostalCode(
    restaurant?.address?.postalCode
  );
  const exactZone = getMatchedDeliveryZone(
    restaurant?.delivering_at,
    restaurantPostalCode
  );

  if (exactZone) {
    return exactZone;
  }

  return restaurant?.delivering_at?.[0] || null;
}

function getPublicRestaurantLookup(restaurantId) {
  return mongoose.Types.ObjectId.isValid(restaurantId)
    ? { _id: restaurantId }
    : { username: restaurantId };
}

function getLowestPriceRow(priceRows) {
  const rows = (priceRows || []).filter(
    (row) => row && row.item_price !== undefined && row.item_price !== null
  );
  if (!rows.length) {
    return { row: null, index: 0 };
  }

  return rows.reduce(
    (lowest, row, index) => {
      const price = Number(row.item_price || 0);
      return price < lowest.price ? { row, index, price } : lowest;
    },
    { row: rows[0], index: 0, price: Number(rows[0]?.item_price || 0) }
  );
}

function getSelectedSizeIndex(item, choices) {
  const choice = choices?.[`${item._id}:size`];
  const match = String(choice || "").match(/:size:(\d+)$/);
  if (!match) {
    return getLowestPriceRow(item.price).index;
  }

  return Number.parseInt(match[1], 10);
}

function getSelectedValues(line, groupId, multiple) {
  if (multiple) {
    const values = line?.extras?.[groupId];
    return Array.isArray(values) ? values.map(String) : [];
  }

  const value = line?.choices?.[groupId];
  return value ? [String(value)] : [];
}

function calculateValidatedCartLine(category, item, line) {
  const issues = [];
  const quantity = Math.max(1, Math.floor(Number(line?.qty || 1)));
  const priceRows = (item.price || []).filter(
    (row) => row && row.item_price !== undefined && row.item_price !== null
  );
  const selectedSlotIndex = getSelectedSizeIndex(item, line?.choices || {});
  const selectedPriceRow = priceRows[selectedSlotIndex];

  if (!selectedPriceRow) {
    issues.push("size_unavailable");
  }

  let unitCents = Number(selectedPriceRow?.item_price || getLowestPriceRow(priceRows).row?.item_price || 0);

  const dressing = category.dressing;
  if (dressing && dressing.isActive !== false && dressing.options?.length) {
    const groupId = `${item._id}:dressing`;
    const multiple = Boolean(dressing.multiple);
    const selected = getSelectedValues(line, groupId, multiple);
    const activeOptionIds = (dressing.options || [])
      .map((option, index) => ({ option, index }))
      .filter(({ option }) => option?.isActive !== false)
      .map(({ option, index }) => `${item._id}:dressing:${option._id || index}`);

    if (!multiple && selected.length === 0) {
      issues.push("required_option_missing");
    }

    selected.forEach((optionId) => {
      if (!activeOptionIds.includes(optionId)) {
        issues.push("option_unavailable");
      }
    });
  }

  const extraGroupId = `${item._id}:extras`;
  const selectedExtras = getSelectedValues(line, extraGroupId, true);
  const activeExtras = (category.extra_menu?.extras || [])
    .map((extra, index) => ({ extra, index }))
    .filter(({ extra }) => extra?.isActive !== false);

  selectedExtras.forEach((selectedId) => {
    const selectedExtra = activeExtras.find(
      ({ extra, index }) => `${item._id}:extra:${extra._id || index}` === selectedId
    )?.extra;
    if (!selectedExtra) {
      issues.push("option_unavailable");
      return;
    }

    const prices = selectedExtra.prices || [];
    unitCents += Number(
      prices[selectedSlotIndex]?.price ?? prices[0]?.price ?? 0
    );
  });

  (category.addons || [])
    .filter(
      (addon) =>
        addon?.isActive !== false &&
        (addon.applyToAll ||
          (addon.appliesTo || []).some((appliesTo) => String(appliesTo) === String(item._id)))
    )
    .forEach((addon, addonIndex) => {
      const groupId = `${item._id}:addon:${addon._id || addonIndex}`;
      const multiple = Boolean(addon.multiple);
      const selected = getSelectedValues(line, groupId, multiple);
      const activeOptions = (addon.options || [])
        .map((option, index) => ({ option, index }))
        .filter(({ option }) => option?.isActive !== false);

      const minSelect = Number(addon.minSelect) || 0;
      const maxSelect = Number(addon.maxSelect) || 0;
      const effectiveMin = multiple
        ? addon.optional === false
          ? Math.max(minSelect, 1)
          : minSelect
        : addon.optional
          ? 0
          : 1;

      if (selected.length < effectiveMin) {
        issues.push("required_option_missing");
      }
      if (multiple && maxSelect > 0 && selected.length > maxSelect) {
        issues.push("option_limit_exceeded");
      }

      selected.forEach((optionId) => {
        const option = activeOptions.find(
          ({ option: entry, index }) =>
            `${item._id}:addon:${addon._id || addonIndex}:option:${entry._id || index}` === optionId
        )?.option;
        if (!option) {
          issues.push("option_unavailable");
          return;
        }

        unitCents += Number(option.addon_price || 0);
      });
    });

  return {
    issues,
    quantity,
    unit: centsToEuroNumber(unitCents),
    lineTotal: centsToEuroNumber(unitCents) * quantity,
  };
}

exports.createRestaurant = async (req, res, next) => {
  try {
    const {
      restaurant_name,
      ownerName,
      companyName,
      taxId,
      registry,
      registry_number,
      vat_number,
      fax,
      phoneNumber,
      email,
      password,
      isHalal,
      address,
      cuisine_type,
    } = req.body;

    const requiredStringFields = {
      restaurant_name,
      ownerName,
      companyName,
      phoneNumber,
      email,
      password,
      "address.street": address?.street,
      "address.houseNumber": address?.houseNumber,
      "address.postalCode": address?.postalCode,
      "address.city": address?.city,
    };

    for (const [field, value] of Object.entries(requiredStringFields)) {
      if (typeof value !== "string" || value.trim() === "") {
        return res.status(400).json({ message: `${field}_required` });
      }
    }

    if (!Array.isArray(cuisine_type) || cuisine_type.length === 0) {
      return res.status(400).json({ message: "cuisine_required" });
    }

    if (cuisine_type.length > 5) {
      return res.status(400).json({ message: "max_cuisines_select" });
    }

    if (password.length < 8 || password.length > 30) {
      return res.status(400).json({ message: "invalid_password_length" });
    }

    if (!/^[\w-.]+@([\w-]+\.)+[\w-]{2,}$/i.test(email.trim())) {
      return res.status(400).json({ message: "invalid_email" });
    }

    const platformSettings = await getPlatformSettings();
    const country = resolveCountryFromAddress(
      address,
      platformSettings.defaultCountryCode
    );

    if (!country) {
      return res.status(400).json({ message: "invalid_country" });
    }

    if (!isValidPostalCode(country.code, address.postalCode)) {
      return res.status(400).json({ message: "invalid_postal_code" });
    }

    const restaurantNameRule = /^[\p{L}0-9\s\-'"éèàöüä&@]+$/u;
    const alphaRule = /^[\p{L}\s\-'"éèàöüä]+$/u;
    const phoneRule = /^[0-9+\s\-()]{5,15}$/;

    if (
      !restaurantNameRule.test(restaurant_name.trim()) ||
      restaurant_name.trim().length > 40
    ) {
      return res.status(400).json({ message: "invalid_name" });
    }

    if (!alphaRule.test(ownerName.trim()) || ownerName.trim().length > 40) {
      return res.status(400).json({ message: "invalid_owner" });
    }

    if (
      !restaurantNameRule.test(companyName.trim()) ||
      companyName.trim().length > 40
    ) {
      return res.status(400).json({ message: "invalid_company" });
    }

    if (!phoneRule.test(phoneNumber.trim())) {
      return res.status(400).json({ message: "invalid_phone" });
    }

    // 🔧 Normalize helper: lowercase, trim, remove extra spaces
    const normalizeText = (text) =>
      String(text || "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");

    const normalizedName = normalizeText(restaurant_name);
    const normalizedAddress = {
      street: normalizeText(address.street),
      houseNumber: normalizeText(address.houseNumber),
      postalCode: address.postalCode.trim(),
      city: normalizeText(address.city),
      country: country.name,
      countryCode: country.code,
    };

    // 🕵️‍♂️ Check for existing restaurant with same normalized name + address
    const countryNamePattern = `^${normalizedAddress.country.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    )}$`;
    const existingRestaurant = await Restaurant.findOne({
      restaurant_name: normalizedName,
      "address.street": normalizedAddress.street,
      "address.houseNumber": normalizedAddress.houseNumber,
      "address.postalCode": normalizedAddress.postalCode,
      "address.city": normalizedAddress.city,
      $or: [
        { "address.countryCode": normalizedAddress.countryCode },
        { "address.country": { $regex: new RegExp(countryNamePattern, "i") } },
      ],
    });

    if (existingRestaurant) {
      return res.status(400).json({
        message: "restaurant_already_exists",
      });
    }

    const username = await generateUsername(normalizedName);
    const customer_id = await generateNextCustomerId();

    // 🔒 Check for existing email
    const existingEmail = await Restaurant.findOne({
      email: email.toLowerCase().trim(),
    });
    if (existingEmail) {
      return res.status(400).json({ message: "email_already_exists" });
    }

    if (!Array.isArray(cuisine_type) || cuisine_type.length === 0) {
      return res.status(400).json({ message: "cuisine_required" });
    }

    // 🔐 Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 📦 Create restaurant
    const restaurant = await Restaurant.create({
      restaurant_name: normalizedName,
      username,
      customer_id,
      ownerName,
      companyName,
      taxId,
      registry,
      registry_number,
      vat_number,
      fax,
      phoneNumber,
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      isHalal,
      address: normalizedAddress,
      cuisine_type,
      created_by: req.user._id,
    });

    res.status(201).json({
      success: true,
      message: "Restaurant created successfully",
      restaurant,
    });
  } catch (error) {
    next(error);
  }
};

exports.getAllRestaurants = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const search = req.query.search?.trim() || "";
    const order = req.query.order || "createdAt";
    const dir = req.query.dir === "asc" ? 1 : -1;

    const filter = {};

    if (search) {
      const searchRegex = buildDiacriticInsensitiveRegex(search);
      if (searchRegex) {
        filter.$or = [
          { customer_id: { $regex: searchRegex } },
          { restaurant_name: { $regex: searchRegex } },
          { "address.city": { $regex: searchRegex } },
          { "address.postalCode": { $regex: searchRegex } },
        ];
      }
    }

    if (req.query.status === "active") filter.isActive = true;
    else if (req.query.status === "inactive") filter.isActive = false;

    if (req.query.visibility === "true") filter.visibility = true;
    if (req.query.visibility === "false") filter.visibility = false;

    if (req.query.publishRequest === "pending") {
      filter["publishRequest.status"] = "pending";
    }

    if (req.query.cuisine) filter.cuisine_type = req.query.cuisine;

    const [restaurants, total, publishRequestCount] = await Promise.all([
      Restaurant.find(filter)
        .select(
          "_id restaurant_name username phoneNumber email isHalal isActive visibility publishRequest created_by createdAt updatedAt address images.logo opening_hours customer_id"
        )
        .populate("cuisine_type", "name")
        .sort({ [order]: dir })
        .skip(skip)
        .limit(limit)
        .lean(),
      Restaurant.countDocuments(filter),
      Restaurant.countDocuments({ "publishRequest.status": "pending" }),
    ]);

    restaurants.forEach((restaurant) => {
      restaurant.isOpenNow = isRestaurantOpenNow(restaurant.opening_hours);
    });

    res.status(200).json({
      success: true,
      data: restaurants,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      publishRequestCount,
    });
  } catch (err) {
    console.error("❌ Get all restaurants error:", err);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

exports.discoverRestaurants = async (req, res) => {
  try {
    const postalCode = normalizePostalCode(req.query.postalCode);

    if (!postalCode) {
      return res.status(400).json({
        success: false,
        message: "postal_code_required",
      });
    }

    const limit = sanitizeDiscoverLimit(req.query.limit);
    const cursorId = decodeCursor(req.query.cursor);
    const filters = parseDiscoverFilters(req.query);
    const batchSize = Math.max(limit * DISCOVER_BATCH_MULTIPLIER, 24);
    const matchingCuisineIds = await findCuisineIdsForSearch(filters.searchRegex);

    const baseFilter = withDiscoverSearchFilter(
      buildDiscoverBaseFilter(postalCode),
      filters.searchRegex,
      matchingCuisineIds
    );
    let lastSeenId = cursorId;
    let hasMore = false;
    const results = [];

    while (results.length < limit) {
      const queryFilter = {
        ...baseFilter,
        ...(lastSeenId ? { _id: { $gt: lastSeenId } } : {}),
      };

      const batch = await Restaurant.find(queryFilter)
        .select(discoverSelect)
        .populate("cuisine_type", "name icon")
        .sort({ _id: 1 })
        .limit(batchSize)
        .lean();

      if (!batch.length) {
        hasMore = false;
        break;
      }

      lastSeenId = String(batch[batch.length - 1]._id);

      const mappedBatch = batch
        .map((restaurant) => mapDiscoverRestaurant(restaurant, postalCode))
        .filter((restaurant) => matchesDiscoverFilters(restaurant, filters));

      for (const restaurant of mappedBatch) {
        if (results.length >= limit) {
          break;
        }

        results.push(restaurant);
      }

      if (batch.length < batchSize) {
        hasMore = false;
        break;
      }

      if (results.length >= limit) {
        hasMore = true;
        break;
      }
    }

    const nextCursor =
      hasMore && results.length
        ? encodeCursor(results[results.length - 1]._id)
        : null;

    res.status(200).json({
      success: true,
      data: results,
      pagination: {
        limit,
        nextCursor,
        hasMore: Boolean(nextCursor),
      },
      filtersApplied: {
        postalCode,
        search: filters.search,
        cuisine: filters.cuisineIds,
        category: filters.categoryNames,
        deliveryAvailable: filters.deliveryAvailable,
        takeawayAvailable: filters.takeawayAvailable,
        openNow: filters.openNow,
        freeDelivery: filters.freeDelivery,
      },
    });
  } catch (error) {
    console.error("Discover restaurants error:", error);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

exports.getDiscoverFilters = async (req, res) => {
  try {
    const postalCode = normalizePostalCode(req.query.postalCode);

    if (!postalCode) {
      return res.status(400).json({
        success: false,
        message: "postal_code_required",
      });
    }

    const restaurants = await Restaurant.find(buildDiscoverBaseFilter(postalCode))
      .select(discoverSelect)
      .populate("cuisine_type", "name icon")
      .sort({ _id: 1 })
      .lean();

    const mappedRestaurants = restaurants.map((restaurant) =>
      mapDiscoverRestaurant(restaurant, postalCode)
    );

    const cuisineMap = new Map();
    const categoryMap = new Map();

    let deliveryAvailableTrue = 0;
    let takeawayAvailableTrue = 0;
    let openNowTrue = 0;
    let freeDeliveryTrue = 0;

    for (const restaurant of mappedRestaurants) {
      for (const cuisine of restaurant.cuisines) {
        const current = cuisineMap.get(cuisine._id) || {
          _id: cuisine._id,
          name: cuisine.name,
          icon: cuisine.icon || "",
          count: 0,
        };
        if (!current.icon && cuisine.icon) {
          current.icon = cuisine.icon;
        }
        current.count += 1;
        cuisineMap.set(cuisine._id, current);
      }

      for (const category of restaurant.categories) {
        const categoryKey = category.name.trim().toLowerCase();
        const current = categoryMap.get(categoryKey) || {
          name: category.name,
          count: 0,
        };
        current.count += 1;
        categoryMap.set(categoryKey, current);
      }

      if (restaurant.deliveryAvailable) {
        deliveryAvailableTrue += 1;
      }

      if (restaurant.takeawayAvailable) {
        takeawayAvailableTrue += 1;
      }

      if (restaurant.isOpenNow) {
        openNowTrue += 1;
      }

      if (
        restaurant.matchedDeliveryZone?.free ||
        Number(restaurant.matchedDeliveryZone?.freeDeliveryMinOrder || 0) > 0
      ) {
        freeDeliveryTrue += 1;
      }
    }

    res.status(200).json({
      success: true,
      totalRestaurants: mappedRestaurants.length,
      filters: {
        cuisines: Array.from(cuisineMap.values()).sort((a, b) =>
          a.name.localeCompare(b.name)
        ),
        categories: Array.from(categoryMap.values()).sort((a, b) =>
          a.name.localeCompare(b.name)
        ),
        deliveryAvailable: {
          trueCount: deliveryAvailableTrue,
          falseCount: mappedRestaurants.length - deliveryAvailableTrue,
        },
        takeawayAvailable: {
          trueCount: takeawayAvailableTrue,
          falseCount: mappedRestaurants.length - takeawayAvailableTrue,
        },
        openNow: {
          trueCount: openNowTrue,
          falseCount: mappedRestaurants.length - openNowTrue,
        },
        freeDelivery: {
          trueCount: freeDeliveryTrue,
          falseCount: mappedRestaurants.length - freeDeliveryTrue,
        },
      },
    });
  } catch (error) {
    console.error("Discover filters error:", error);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

// 🔍 Quick search for app header
exports.quickSearchRestaurants = async (req, res) => {
  try {
    const q = req.query.q?.trim();
    if (!q || q.length < 3) return res.status(200).json({ success: true, results: [] });

    const searchRegex = buildDiacriticInsensitiveRegex(q);
    if (!searchRegex) {
      return res.status(200).json({ success: true, results: [] });
    }

    const results = await Restaurant.find({
      $or: [
        { restaurant_name: { $regex: searchRegex } },
        { customer_id: { $regex: searchRegex } },
      ],
    })
      .select("_id restaurant_name customer_id address")
      .limit(10)
      .lean();

    res.status(200).json({ success: true, results });
  } catch (err) {
    console.error("❌ Quick search error:", err);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

// get single restaurant by id
exports.getSingleRestaurant = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const restaurant = await Restaurant.findById(restaurantId).select(
      "-password"
    );

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    const appModules = await getAppModuleConfig();
    const formatted = formatRestaurantMoneyFromCents(restaurant);
    formatted.modules = modulePayload(restaurant, appModules);

    res.status(200).json({
      success: true,
      restaurant: formatted,
    });
  } catch (err) {
    console.error("❌ Get single restaurant error:", err);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

// 3️⃣ Toggle isActive (activate/deactivate restaurant)
exports.toggleRestaurantStatus = async (req, res) => {
  try {
    const { restaurantId } = req.params;

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant)
      return res.status(404).json({ message: "restaurant_not_found" });

    const nextActive = !restaurant.isActive;
    if (!nextActive) {
      restaurant.tokenVersion = (restaurant.tokenVersion || 0) + 1;
      await RestaurantStaff.updateMany(
        { restaurantId: restaurant._id },
        { $inc: { tokenVersion: 1 } }
      );
    }

    restaurant.isActive = nextActive;

    appendRestaurantAudit(restaurant, req.user, {
      action: "toggle_active",
      changes: [
        diffChange("isActive", !nextActive, nextActive),
      ].filter(Boolean),
    });

    await restaurant.save();

    if (!nextActive) {
      emitRestaurantForceLogout(restaurant._id, {
        reason: "restaurant_deactivated",
      });
    }

    res.status(200).json({
      success: true,
      message: restaurant.isActive
        ? "restaurant_status_now_active"
        : "restaurant_status_now_inactive",
      restaurant: {
        _id: restaurant._id,
        restaurant_name: restaurant.restaurant_name,
        isActive: restaurant.isActive,
      },
    });
  } catch (err) {
    console.error("Toggle status error:", err);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

exports.getDeactivationImpact = async (req, res, next) => {
  try {
    const { restaurantId } = req.params;
    const restaurant = await Restaurant.findById(restaurantId).select("_id isActive");
    if (!restaurant) {
      return res.status(404).json({ success: false, message: "restaurant_not_found" });
    }

    const impact = await getRestaurantDeactivationImpact(restaurantId);
    return res.json({
      success: true,
      isActive: restaurant.isActive,
      impact,
    });
  } catch (error) {
    next(error);
  }
};

// get restaurant menu
exports.getRestaurantMenu = async (req, res) => {
  try {
    const { restaurantId } = req.params;

    const restaurant = await Restaurant.findById(restaurantId).select(
      "restaurant_name menu"
    );
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    res.status(200).json({
      success: true,
      menu: formatMenuPricesFromCents(restaurant.menu),
      restaurant_name: restaurant.restaurant_name,
    });
  } catch (err) {
    console.error("❌ Get restaurant menu error:", err);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

exports.getPublicRestaurantMenu = async (req, res) => {
  const { restaurantId } = req.params;
  const requestedPostalCode =
    req.query.postal || req.query.postalCode || req.query.postcode || "";
  const restaurantLookup = getPublicRestaurantLookup(restaurantId);

  const restaurant = await Restaurant.findOne({
    ...restaurantLookup,
    isActive: true,
    visibility: true,
  })
    .select(
      [
        "restaurant_name",
        "username",
        "ownerName",
        "companyName",
        "taxId",
        "registry",
        "registry_number",
        "vat_number",
        "fax",
        "phoneNumber",
        "email",
        "address",
        "images",
        "description",
        "delivery",
        "take_away",
        "delivering_at",
        "discount",
        "menu",
        "opening_hours",
        "payment_methods",
        "modules",
      ].join(" ")
    )
    .populate("cuisine_type", "name icon")
    .lean();

  if (!restaurant) {
    return res.status(404).json({
      success: false,
      message: "restaurant_not_found",
    });
  }

  const appModules = await getAppModuleConfig();
  const modules = effectiveRestaurantModules(restaurant, appModules);
  const menu = filterPublicMenu(restaurant.menu, modules);

  if (!menu.length) {
    return res.status(404).json({
      success: false,
      message: "restaurant_menu_not_found",
    });
  }

  const primaryDeliveryZone = modules.delivery
    ? getPrimaryDeliveryZone(restaurant, requestedPostalCode)
    : null;
  const now = moment().tz(BERLIN_TIMEZONE);
  const minutesUntilClose = getMinutesUntilClose(restaurant.opening_hours, now);
  const isOpenNow = isRestaurantOpenNow(restaurant.opening_hours, now, 0);
  const closingSoon = Boolean(isOpenNow && isClosingSoon(minutesUntilClose));

  res.status(200).json({
    success: true,
    restaurant: {
      _id: String(restaurant._id),
      restaurant_name: restaurant.restaurant_name || "",
      username: restaurant.username || "",
      description: restaurant.description || "",
      ownerName: restaurant.ownerName || "",
      companyName: restaurant.companyName || "",
      taxId: restaurant.taxId || "",
      registry: restaurant.registry || "",
      registry_number: restaurant.registry_number || "",
      vat_number: restaurant.vat_number || "",
      fax: restaurant.fax || "",
      phoneNumber: restaurant.phoneNumber || "",
      email: restaurant.email || "",
      address: {
        street: restaurant.address?.street || "",
        houseNumber: restaurant.address?.houseNumber || "",
        postalCode: restaurant.address?.postalCode || "",
        city: restaurant.address?.city || "",
        country: restaurant.address?.country || "",
      },
      images: {
        logo: restaurant.images?.logo || "",
        cover: restaurant.images?.cover || "",
      },
      cuisines: (restaurant.cuisine_type || [])
        .map((entry) => ({
          _id: String(entry?._id || ""),
          name: resolveLocalizedValue(entry?.name, ["de", "en"]),
          icon: mapCuisineIcon(entry?.icon),
        }))
        .filter((entry) => entry._id && entry.name),
      delivery: Boolean(modules.delivery),
      take_away: Boolean(modules.takeaway),
      modules: modulePayload(restaurant, appModules),
      delivering_at: modules.delivery ? (restaurant.delivering_at || []).map((zone) => ({
        postalCode: zone?.postalCode || "",
        charges: storedDeliveryMoneyToEuroNumber(zone?.charges),
        free: Boolean(zone?.free),
        delivery_time: zone?.delivery_time || "",
        min_order_value: storedDeliveryMoneyToEuroNumber(zone?.min_order_value),
        free_delivery_min_order: storedDeliveryMoneyToEuroNumber(
          zone?.free_delivery_min_order
        ),
      })) : [],
      primary_delivery_zone: modules.delivery && primaryDeliveryZone
        ? {
            postalCode: primaryDeliveryZone.postalCode || "",
            charges: storedDeliveryMoneyToEuroNumber(primaryDeliveryZone.charges),
            free: Boolean(primaryDeliveryZone.free),
            delivery_time: primaryDeliveryZone.delivery_time || "",
            min_order_value: storedDeliveryMoneyToEuroNumber(
              primaryDeliveryZone.min_order_value
            ),
            free_delivery_min_order: storedDeliveryMoneyToEuroNumber(
              primaryDeliveryZone.free_delivery_min_order
            ),
          }
        : null,
      discount: restaurant.discount
        ? {
            type: restaurant.discount.type,
            value: Number(restaurant.discount.value || 0),
          }
        : null,
      opening_hours: mapPublicOpeningHours(restaurant.opening_hours),
      isOpenNow,
      closingSoon,
      minutesUntilClose,
      closesAt: getCurrentClosingTime(restaurant.opening_hours),
      payment_methods: Array.isArray(restaurant.payment_methods)
        ? restaurant.payment_methods
        : [],
    },
    menu,
  });
};

exports.validatePublicCheckout = async (req, res) => {
  const { restaurantId } = req.params;
  const mode = req.body?.mode === "takeaway" ? "takeaway" : "delivery";
  const requestedPostalCode =
    req.body?.postalCode || req.query.postal || req.query.postalCode || "";
  const cart = Array.isArray(req.body?.cart) ? req.body.cart : [];

  const restaurant = await Restaurant.findOne({
    ...getPublicRestaurantLookup(restaurantId),
    isActive: true,
    visibility: true,
  })
    .select(
      [
        "restaurant_name",
        "username",
        "delivery",
        "take_away",
        "delivering_at",
        "discount",
        "menu",
        "opening_hours",
        "modules",
      ].join(" ")
    )
    .lean();

  if (!restaurant) {
    return res.status(404).json({
      success: false,
      valid: false,
      code: "restaurant_not_found",
      message: "restaurant_not_found",
    });
  }

  const appModules = await getAppModuleConfig();
  const modules = effectiveRestaurantModules(restaurant, appModules);

  if (mode === "delivery" && !modules.delivery) {
    return res.status(409).json({
      success: false,
      valid: false,
      code: "delivery_unavailable",
      message: "delivery_unavailable",
    });
  }

  if (mode === "takeaway" && !modules.takeaway) {
    return res.status(409).json({
      success: false,
      valid: false,
      code: "takeaway_unavailable",
      message: "takeaway_unavailable",
    });
  }

  const deliveryZone =
    mode === "delivery"
      ? getMatchedDeliveryZone(
          restaurant.delivering_at,
          normalizePostalCode(requestedPostalCode)
        )
      : null;

  if (mode === "delivery" && !deliveryZone) {
    return res.status(409).json({
      success: false,
      valid: false,
      code: "delivery_zone_unavailable",
      message: "delivery_zone_unavailable",
    });
  }

  const isOpenNow = isRestaurantOpenNow(
    restaurant.opening_hours,
    moment().tz(BERLIN_TIMEZONE),
    0
  );

  if (!isOpenNow) {
    return res.status(409).json({
      success: false,
      valid: false,
      code: "restaurant_closed",
      message: "restaurant_closed",
    });
  }

  if (!cart.length) {
    return res.status(400).json({
      success: false,
      valid: false,
      code: "cart_empty",
      message: "cart_empty",
    });
  }

  const categories = (restaurant.menu || []).filter(
    (category) => category?.isActive !== false
  );
  const lineIssues = [];
  let subtotal = 0;

  cart.forEach((line, lineIndex) => {
    const itemId = String(line?.itemId || "");
    const category = categories.find((entry) =>
      (entry.items || []).some((item) => String(item?._id) === itemId)
    );
    const item = category?.items?.find((entry) => String(entry?._id) === itemId);

    if (!category || !item || item.isActive === false) {
      lineIssues.push({
        lineIndex,
        itemId,
        code: "item_unavailable",
      });
      return;
    }

    const validatedLine = calculateValidatedCartLine(category, item, line);
    if (validatedLine.issues.length) {
      lineIssues.push({
        lineIndex,
        itemId,
        code: "item_options_changed",
        issues: Array.from(new Set(validatedLine.issues)),
      });
      return;
    }

    subtotal += validatedLine.lineTotal;
  });

  if (lineIssues.length) {
    return res.status(409).json({
      success: false,
      valid: false,
      code: "cart_items_unavailable",
      message: "cart_items_unavailable",
      invalidItems: lineIssues,
    });
  }

  const minOrder =
    mode === "delivery"
      ? storedDeliveryMoneyToEuroNumber(deliveryZone?.min_order_value)
      : 0;

  if (subtotal + Number.EPSILON < minOrder) {
    return res.status(409).json({
      success: false,
      valid: false,
      code: "minimum_order_not_reached",
      message: "minimum_order_not_reached",
      totals: {
        subtotal,
        minOrder,
        remaining: Math.max(0, minOrder - subtotal),
      },
    });
  }

  const discount =
    restaurant.discount?.type === "percentage"
      ? subtotal * Number(restaurant.discount.value || 0) / 100
      : 0;
  const freeDeliveryMinOrder =
    mode === "delivery"
      ? storedDeliveryMoneyToEuroNumber(deliveryZone?.free_delivery_min_order)
      : 0;
  const deliveryFee =
    mode === "delivery" &&
    !deliveryZone?.free &&
    !(freeDeliveryMinOrder > 0 && subtotal >= freeDeliveryMinOrder)
      ? storedDeliveryMoneyToEuroNumber(deliveryZone?.charges)
      : 0;

  res.status(200).json({
    success: true,
    valid: true,
    restaurant: {
      _id: String(restaurant._id),
      username: restaurant.username || "",
      isOpenNow,
    },
    totals: {
      subtotal,
      discount,
      deliveryFee,
      total: Math.max(0, subtotal - discount + deliveryFee),
      minOrder,
      freeDeliveryMinOrder,
    },
  });
};

// get restaurant data for logged in restaurant
exports.getSelfRestaurant = async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.user._id).select(
      "-password"
    );
    if (!restaurant)
      return res.status(404).json({ message: "Restaurant not found" });

    res.status(200).json({
      success: true,
      restaurant: formatRestaurantMoneyFromCents(restaurant),
    });
  } catch (err) {
    console.error("❌ Get self restaurant error:", err);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

// update restaurant
exports.updateRestaurant = async (req, res, next) => {
  try {
    const { restaurantId } = req.params;
    const updates = req.body || {};
    const role = req.user?.role;

    const platformOnlyFields = ["discount", "modules", "isActive", "visibility"];
    for (const field of platformOnlyFields) {
      if (Object.prototype.hasOwnProperty.call(updates, field)) {
        if (!canManagePlatformRestaurantFields(role)) {
          return res.status(403).json({ message: "field_forbidden_platform_only" });
        }
      }
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "restaurant_not_found" });
    }

    const canCoreProfile =
      role === "superadmin" ||
      role === "admin" ||
      isRestaurantAdminRole(role);
    const canEditKyc = role === "superadmin" || role === "admin";
    const isSuperadmin = role === "superadmin";

    const addressInput =
      updates.address && typeof updates.address === "object"
        ? updates.address
        : null;

    const hasOwn = (key) => Object.prototype.hasOwnProperty.call(updates, key);
    const hasAddressOwn = (key) =>
      Boolean(addressInput && Object.prototype.hasOwnProperty.call(addressInput, key));

    const wantsName = hasOwn("restaurant_name");
    const wantsEmail = hasOwn("email");
    const wantsPhone = hasOwn("phoneNumber");
    const wantsFax = hasOwn("fax");
    const wantsHalal = hasOwn("isHalal");
    const wantsCuisines = hasOwn("cuisine_type");
    const wantsLegal =
      hasOwn("companyName") ||
      hasOwn("ownerName") ||
      hasOwn("taxId") ||
      hasOwn("registry") ||
      hasOwn("registry_number") ||
      hasOwn("vat_number");
    const wantsAddress =
      Boolean(addressInput) ||
      hasOwn("street") ||
      hasOwn("houseNumber") ||
      hasOwn("postalCode") ||
      hasOwn("city") ||
      hasOwn("country") ||
      hasOwn("countryCode");

    if (wantsName && !isSuperadmin) {
      return res.status(403).json({ message: "field_forbidden_restaurant_name" });
    }
    if (wantsAddress && !isSuperadmin) {
      return res.status(403).json({ message: "field_forbidden_address" });
    }
    if (wantsEmail && !canEditKyc) {
      return res.status(403).json({ message: "field_forbidden_email" });
    }
    if (wantsLegal && !canEditKyc) {
      // Restaurants may fill empty legal fields once; never overwrite existing KYC values.
      if (!isRestaurantAdminRole(role)) {
        return res.status(403).json({ message: "field_forbidden_legal" });
      }
      const legalKeys = [
        "companyName",
        "ownerName",
        "taxId",
        "registry",
        "registry_number",
        "vat_number",
      ];
      for (const key of legalKeys) {
        if (!hasOwn(key)) continue;
        const current = String(restaurant[key] || "").trim();
        if (current) {
          return res.status(403).json({ message: "field_forbidden_legal" });
        }
      }
    }
    if (wantsPhone && !canCoreProfile) {
      return res.status(403).json({ message: "field_forbidden_phone" });
    }
    if (wantsFax && !canCoreProfile) {
      return res.status(403).json({ message: "field_forbidden_fax" });
    }
    if (wantsCuisines && !canCoreProfile) {
      return res.status(403).json({ message: "field_forbidden_cuisine" });
    }
    if (wantsHalal && !canCoreProfile) {
      return res.status(403).json({ message: "field_forbidden_halal" });
    }

    const changes = [];
    const track = (field, from, to) => {
      const change = diffChange(field, from, to);
      if (change) changes.push(change);
    };

    if (Object.prototype.hasOwnProperty.call(updates, "discount")) {
      if (!canManagePlatformRestaurantFields(role)) {
        return res.status(403).json({ message: "field_forbidden_platform_only" });
      }
      const beforeDiscount = restaurant.discount
        ? {
            type: restaurant.discount.type,
            value: restaurant.discount.value,
          }
        : null;
      const discount = updates.discount;

      if (
        discount === null ||
        discount === undefined ||
        discount === false ||
        discount.value === "" ||
        Number(discount.value) === 0
      ) {
        restaurant.discount = undefined;
      } else {
        const type = discount.type === "fixed" ? "fixed" : "percentage";
        const value = Number(discount.value);

        if (!Number.isFinite(value) || value < 0) {
          return res.status(400).json({ message: "invalid_discount_value" });
        }

        if (type === "percentage" && value > 100) {
          return res.status(400).json({ message: "discount_percentage_max" });
        }

        restaurant.discount = {
          type,
          value,
        };
      }

      track(
        "discount",
        beforeDiscount,
        restaurant.discount
          ? { type: restaurant.discount.type, value: restaurant.discount.value }
          : null
      );
    }

    const normalizeText = (text) =>
      String(text || "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");

    if (wantsName) {
      const nextName = String(updates.restaurant_name || "").trim();
      if (!nextName) {
        return res.status(400).json({ message: "restaurant_name_cannot_be_empty" });
      }
      const before = restaurant.restaurant_name;
      restaurant.restaurant_name = normalizeText(nextName);
      track("restaurant_name", before, restaurant.restaurant_name);
    }

    if (wantsEmail) {
      const nextEmail = String(updates.email || "")
        .toLowerCase()
        .trim();
      if (!nextEmail) {
        return res.status(400).json({ message: "email_cannot_be_empty" });
      }
      if (!/^[\w-.]+@([\w-]+\.)+[\w-]{2,}$/i.test(nextEmail) || nextEmail.length > 35) {
        return res.status(400).json({ message: "invalid_email" });
      }
      if (nextEmail !== restaurant.email) {
        const existingEmail = await Restaurant.findOne({
          email: nextEmail,
          _id: { $ne: restaurant._id },
        });
        if (existingEmail) {
          return res.status(400).json({ message: "email_already_exists" });
        }
      }
      const before = restaurant.email;
      restaurant.email = nextEmail;
      track("email", before, restaurant.email);
    }

    if (wantsPhone) {
      const nextPhone = String(updates.phoneNumber || "").trim();
      if (!nextPhone) {
        return res.status(400).json({ message: "phoneNumber_cannot_be_empty" });
      }
      if (!/^[0-9+\s\-()]{5,15}$/.test(nextPhone)) {
        return res.status(400).json({ message: "invalid_phone" });
      }
      const before = restaurant.phoneNumber;
      restaurant.phoneNumber = nextPhone;
      track("phoneNumber", before, restaurant.phoneNumber);
    }

    if (wantsFax) {
      const before = restaurant.fax;
      restaurant.fax = String(updates.fax || "").trim();
      track("fax", before, restaurant.fax);
    }

    if (wantsHalal) {
      const before = restaurant.isHalal;
      restaurant.isHalal = Boolean(updates.isHalal);
      track("isHalal", before, restaurant.isHalal);
    }

    if (wantsCuisines) {
      if (!Array.isArray(updates.cuisine_type) || updates.cuisine_type.length === 0) {
        return res.status(400).json({ message: "cuisine_required" });
      }
      if (updates.cuisine_type.length > 5) {
        return res.status(400).json({ message: "max_cuisines_select" });
      }
      const before = restaurant.cuisine_type;
      restaurant.cuisine_type = updates.cuisine_type;
      track("cuisine_type", before, restaurant.cuisine_type);
    }

    if (wantsLegal) {
      if (hasOwn("companyName")) {
        const next = String(updates.companyName || "").trim();
        if (!next) {
          return res.status(400).json({ message: "companyName_cannot_be_empty" });
        }
        const before = restaurant.companyName;
        restaurant.companyName = next;
        track("companyName", before, restaurant.companyName);
      }
      if (hasOwn("ownerName")) {
        const next = String(updates.ownerName || "").trim();
        if (!next) {
          return res.status(400).json({ message: "ownerName_cannot_be_empty" });
        }
        const before = restaurant.ownerName;
        restaurant.ownerName = next;
        track("ownerName", before, restaurant.ownerName);
      }
      for (const key of ["taxId", "registry", "registry_number", "vat_number"]) {
        if (hasOwn(key)) {
          const before = restaurant[key];
          restaurant[key] = String(updates[key] || "").trim();
          track(key, before, restaurant[key]);
        }
      }
    }

    if (wantsAddress) {
      const beforeAddress = {
        street: restaurant.address?.street || "",
        houseNumber: restaurant.address?.houseNumber || "",
        postalCode: restaurant.address?.postalCode || "",
        city: restaurant.address?.city || "",
        country: restaurant.address?.country || "",
        countryCode: restaurant.address?.countryCode || "",
      };
      const merged = {
        street: hasAddressOwn("street")
          ? addressInput.street
          : hasOwn("street")
            ? updates.street
            : restaurant.address?.street,
        houseNumber: hasAddressOwn("houseNumber")
          ? addressInput.houseNumber
          : hasOwn("houseNumber")
            ? updates.houseNumber
            : restaurant.address?.houseNumber,
        postalCode: hasAddressOwn("postalCode")
          ? addressInput.postalCode
          : hasOwn("postalCode")
            ? updates.postalCode
            : restaurant.address?.postalCode,
        city: hasAddressOwn("city")
          ? addressInput.city
          : hasOwn("city")
            ? updates.city
            : restaurant.address?.city,
        country: hasAddressOwn("country")
          ? addressInput.country
          : hasOwn("country")
            ? updates.country
            : restaurant.address?.country,
        countryCode: hasAddressOwn("countryCode")
          ? addressInput.countryCode
          : hasOwn("countryCode")
            ? updates.countryCode
            : restaurant.address?.countryCode,
      };

      const country = resolveCountryFromAddress(
        merged,
        restaurant.address?.countryCode || DEFAULT_COUNTRY_CODE
      );
      if (!country) {
        return res.status(400).json({ message: "invalid_country" });
      }
      if (
        !String(merged.street || "").trim() ||
        !String(merged.houseNumber || "").trim() ||
        !String(merged.city || "").trim()
      ) {
        return res.status(400).json({ message: "address_incomplete" });
      }
      if (!isValidPostalCode(country.code, merged.postalCode)) {
        return res.status(400).json({ message: "invalid_postal_code" });
      }

      restaurant.address = {
        street: normalizeText(merged.street),
        houseNumber: normalizeText(merged.houseNumber),
        postalCode: String(merged.postalCode || "").trim(),
        city: normalizeText(merged.city),
        country: country.name,
        countryCode: country.code,
      };

      track("address.street", beforeAddress.street, restaurant.address.street);
      track(
        "address.houseNumber",
        beforeAddress.houseNumber,
        restaurant.address.houseNumber
      );
      track(
        "address.postalCode",
        beforeAddress.postalCode,
        restaurant.address.postalCode
      );
      track("address.city", beforeAddress.city, restaurant.address.city);
      track("address.country", beforeAddress.country, restaurant.address.country);
      track(
        "address.countryCode",
        beforeAddress.countryCode,
        restaurant.address.countryCode
      );
    }

    const hasDiscountUpdate = Object.prototype.hasOwnProperty.call(
      updates,
      "discount"
    );
    const profileTouched =
      wantsName ||
      wantsEmail ||
      wantsPhone ||
      wantsFax ||
      wantsHalal ||
      wantsCuisines ||
      wantsLegal ||
      wantsAddress;

    if (changes.length > 0) {
      appendRestaurantAudit(restaurant, req.user, {
        action: hasDiscountUpdate && !profileTouched
          ? "discount_update"
          : profileTouched
            ? "profile_update"
            : hasDiscountUpdate
              ? "discount_update"
              : "other",
        changes,
      });
    }

    await restaurant.save();

    res.status(200).json({
      success: true,
      message: "restaurant_updated_successfully",
      restaurant,
    });
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.email) {
      console.warn(
        "⚠️ Duplicate email on restaurant update:",
        error.keyValue?.email
      );
      return res.status(400).json({
        message: "email_already_exists",
      });
    }
    console.error("Update restaurant error:", error);
    res.status(500).json({ message: "server_error" });
  }
};

exports.updateRestaurantModules = async (req, res, next) => {
  try {
    const { restaurantId } = req.params;
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ success: false, message: "restaurant_not_found" });
    }

    const updates = req.body?.modules || req.body || {};
    const allowed = ["delivery", "takeaway", "dineIn", "tableQr", "foodInfo", "onlinePayment"];

    allowed.forEach((key) => {
      if (updates[key] === undefined) return;
      const value = updates[key];
      const enabled = typeof value === "object" ? Boolean(value.enabled) : Boolean(value);
      const plan =
        typeof value === "object" && value.plan !== undefined
          ? String(value.plan || "none")
          : enabled
            ? "included"
            : "none";

      if (!restaurant.modules) restaurant.modules = {};
      if (!restaurant.modules[key]) restaurant.modules[key] = {};
      restaurant.modules[key].enabled = enabled;
      restaurant.modules[key].plan = plan;
      restaurant.modules[key].updatedBy = req.user?._id || null;
      restaurant.modules[key].activatedAt = enabled ? restaurant.modules[key].activatedAt || new Date() : null;
      restaurant.modules[key].deactivatedAt = enabled ? null : new Date();
    });

    await restaurant.save();
    const appModules = await getAppModuleConfig();
    res.json({
      success: true,
      restaurant: formatRestaurantMoneyFromCents(restaurant),
      modules: modulePayload(restaurant, appModules),
      keys: MODULE_KEYS,
    });
  } catch (error) {
    next(error);
  }
};

// check username availability
exports.checkUsernameAvailability = async (req, res) => {
  const { username } = req.body;

  if (!username || typeof username !== "string") {
    return res.status(400).json({ message: "Username is required" });
  }

  const cleanUsername = username.trim().toLowerCase();

  // ✅ Must match allowed pattern
  const isValid = /^[a-z0-9\-]+$/.test(cleanUsername);
  if (!isValid) {
    return res.status(400).json({
      message:
        "Invalid username. Only lowercase letters, numbers, and hyphens are allowed.",
    });
  }

  const exists = await Restaurant.findOne({ username: cleanUsername });
  res.status(200).json({ available: !exists });
};

// change username
exports.changeUsername = async (req, res) => {
  const { restaurantId } = req.params;
  const { newUsername } = req.body;

  if (!newUsername || typeof newUsername !== "string") {
    return res.status(400).json({ message: "New username is required" });
  }

  const cleanUsername = newUsername.trim().toLowerCase();

  // ✅ Validate format
  const isValid = /^[a-z0-9\-]+$/.test(cleanUsername);
  if (!isValid) {
    return res.status(400).json({
      message:
        "Invalid username. Only lowercase letters, numbers, and hyphens are allowed.",
    });
  }

  const exists = await Restaurant.findOne({ username: cleanUsername });
  if (exists) {
    return res
      .status(400)
      .json({ message: "Username already in use. Try another." });
  }

  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) {
    return res.status(404).json({ message: "Restaurant not found" });
  }

  restaurant.username = cleanUsername;
  await restaurant.save();

  res.status(200).json({
    success: true,
    message: "Username updated successfully",
    username: restaurant.username,
  });
};

// toggle visibility — platform admin / superadmin only
exports.toggleRestaurantVisibility = async (req, res) => {
  try {
    const { restaurantId } = req.params;

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant)
      return res.status(404).json({ message: "restaurant_not_found" });

    const nextVisibility = !restaurant.visibility;
    if (!nextVisibility) {
      const blocked = await respondIfBlockingOnlineOrders(restaurantId, res);
      if (blocked) return;
    }

    if (nextVisibility) {
      const failedConditions = getVisibilityFailedConditions(restaurant);
      if (failedConditions.length > 0) {
        return res.status(400).json({
          success: false,
          message: "visibility_toggle_conditions_failed",
          failedConditions,
        });
      }
    }

    restaurant.visibility = nextVisibility;
    if (nextVisibility && restaurant.publishRequest?.status === "pending") {
      restaurant.publishRequest = {
        ...(restaurant.publishRequest?.toObject?.() || restaurant.publishRequest || {}),
        status: "none",
        reviewedAt: new Date(),
        reviewedBy: req.user?._id || null,
        rejectReason: "",
      };
    }

    appendRestaurantAudit(restaurant, req.user, {
      action: "toggle_visibility",
      changes: [
        diffChange("visibility", !nextVisibility, nextVisibility),
      ].filter(Boolean),
    });

    await restaurant.save();

    res.status(200).json({
      success: true,
      message: restaurant.visibility
        ? "restaurant_visibility_now_visible"
        : "restaurant_visibility_now_hidden",
      restaurant: {
        _id: restaurant._id,
        restaurant_name: restaurant.restaurant_name,
        visibility: restaurant.visibility,
        publishRequest: restaurant.publishRequest,
      },
    });
  } catch (err) {
    console.error("Toggle visibility error:", err);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

exports.getPublishReadiness = async (req, res, next) => {
  try {
    const { restaurantId } = req.params;
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ success: false, message: "restaurant_not_found" });
    }

    const failedConditions = getVisibilityFailedConditions(restaurant);
    const publishRequest = restaurant.publishRequest || { status: "none" };

    return res.json({
      success: true,
      visibility: restaurant.visibility,
      isActive: restaurant.isActive,
      ready: failedConditions.length === 0,
      failedConditions,
      publishRequest,
      canApply:
        !restaurant.visibility &&
        publishRequest.status !== "pending" &&
        failedConditions.length === 0,
    });
  } catch (error) {
    next(error);
  }
};

exports.requestRestaurantPublish = async (req, res, next) => {
  try {
    if (!isRestaurantAdminRole(req.user?.role)) {
      return res.status(403).json({
        success: false,
        message: "only_restaurant_can_request_publish",
      });
    }

    const { restaurantId } = req.params;
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ success: false, message: "restaurant_not_found" });
    }

    if (restaurant.visibility) {
      return res.status(400).json({
        success: false,
        message: "restaurant_already_visible",
      });
    }

    if (restaurant.publishRequest?.status === "pending") {
      return res.status(400).json({
        success: false,
        message: "publish_request_already_pending",
        publishRequest: restaurant.publishRequest,
      });
    }

    const failedConditions = getVisibilityFailedConditions(restaurant);
    if (failedConditions.length > 0) {
      return res.status(400).json({
        success: false,
        message: "publish_requirements_failed",
        failedConditions,
      });
    }

    restaurant.publishRequest = {
      status: "pending",
      requestedAt: new Date(),
      requestedBy: req.user?._id || req.user?.staffId || null,
      requestedByRole: req.user?.role || null,
      reviewedAt: null,
      reviewedBy: null,
      rejectReason: "",
    };

    appendRestaurantAudit(restaurant, req.user, {
      action: "publish_request",
      changes: [diffChange("publishRequest.status", "none", "pending")].filter(Boolean),
    });

    await restaurant.save();

    emitPlatformPublishRequest({
      restaurantId: String(restaurant._id),
      restaurantName: restaurant.restaurant_name,
      customerId: restaurant.customer_id,
      requestedAt: restaurant.publishRequest.requestedAt,
    });

    return res.status(200).json({
      success: true,
      message: "publish_request_submitted",
      publishRequest: restaurant.publishRequest,
    });
  } catch (error) {
    next(error);
  }
};

exports.reviewRestaurantPublish = async (req, res, next) => {
  try {
    const { restaurantId } = req.params;
    const action = String(req.body?.action || "").trim().toLowerCase();
    const rejectReason = String(req.body?.reason || "").trim();

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ success: false, message: "invalid_publish_action" });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ success: false, message: "restaurant_not_found" });
    }

    if (restaurant.publishRequest?.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "no_pending_publish_request",
      });
    }

    if (action === "approve") {
      const failedConditions = getVisibilityFailedConditions(restaurant);
      if (failedConditions.length > 0) {
        return res.status(400).json({
          success: false,
          message: "visibility_toggle_conditions_failed",
          failedConditions,
        });
      }

      const beforeVisibility = restaurant.visibility;
      restaurant.visibility = true;
      restaurant.publishRequest = {
        ...(restaurant.publishRequest?.toObject?.() || restaurant.publishRequest || {}),
        status: "none",
        reviewedAt: new Date(),
        reviewedBy: req.user?._id || null,
        rejectReason: "",
      };

      appendRestaurantAudit(restaurant, req.user, {
        action: "publish_approve",
        changes: [
          diffChange("visibility", beforeVisibility, true),
          diffChange("publishRequest.status", "pending", "none"),
        ].filter(Boolean),
      });

      await restaurant.save();

      return res.json({
        success: true,
        message: "publish_request_approved",
        restaurant: {
          _id: restaurant._id,
          visibility: restaurant.visibility,
          publishRequest: restaurant.publishRequest,
        },
      });
    }

    restaurant.publishRequest = {
      ...(restaurant.publishRequest?.toObject?.() || restaurant.publishRequest || {}),
      status: "rejected",
      reviewedAt: new Date(),
      reviewedBy: req.user?._id || null,
      rejectReason,
    };

    appendRestaurantAudit(restaurant, req.user, {
      action: "publish_reject",
      changes: [
        diffChange("publishRequest.status", "pending", "rejected"),
      ].filter(Boolean),
    });

    await restaurant.save();

    return res.json({
      success: true,
      message: "publish_request_rejected",
      publishRequest: restaurant.publishRequest,
    });
  } catch (error) {
    next(error);
  }
};

exports.getRestaurantAuditLogs = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 20, 1),
      50
    );
    const cursor = req.query.cursor ? String(req.query.cursor) : null;

    const restaurant = await Restaurant.findById(restaurantId)
      .select("restaurant_name edit_audit_logs")
      .lean();

    if (!restaurant) {
      return res.status(404).json({ success: false, message: "restaurant_not_found" });
    }

    const page = paginateAuditLogs(restaurant.edit_audit_logs || [], {
      cursor,
      limit,
    });

    return res.status(200).json({
      success: true,
      logs: page.logs,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      total: page.total,
      limit,
    });
  } catch (err) {
    console.error("Get restaurant audit logs error:", err);
    return res.status(500).json({ success: false, message: "server_error" });
  }
};

exports.exportRestaurantAuditLogs = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const restaurant = await Restaurant.findById(restaurantId)
      .select("restaurant_name edit_audit_logs")
      .lean();

    if (!restaurant) {
      return res.status(404).json({ success: false, message: "restaurant_not_found" });
    }

    const csv = auditLogsToCsv(
      restaurant.edit_audit_logs || [],
      restaurant.restaurant_name || ""
    );
    const safeName = String(restaurant.restaurant_name || "restaurant")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    const filename = `${safeName || "restaurant"}-audit-logs.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    return res.status(200).send(csv);
  } catch (err) {
    console.error("Export restaurant audit logs error:", err);
    return res.status(500).json({ success: false, message: "server_error" });
  }
};
