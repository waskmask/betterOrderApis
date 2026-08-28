const mongoose = require("mongoose");
const moment = require("moment-timezone");
const { Restaurant } = require("../modals/Restaurant");
const { getAppModuleConfig } = require("./moduleConfigService");
const { effectiveRestaurantModules } = require("../utils/modules");

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

class OrderValidationError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message || code);
    this.name = "OrderValidationError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function normalizePostalCode(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "");
}

function parseDeliveryMinutes(value) {
  const match = String(value || "").match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : 0;
}

function timeToMinutes(time) {
  const match = String(time || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function getDayNameForMoment(date) {
  return WEEK_DAYS[date.day()];
}

function getPreviousDayName(dayName) {
  const index = WEEK_DAYS.indexOf(dayName);
  return WEEK_DAYS[(index + 6) % 7];
}

function getServiceSegmentEnd(schedule, minuteOfDay, previousDayCarry = false) {
  if (!schedule || schedule.ifClosed || !schedule.opening || !schedule.closing) {
    return null;
  }

  const opening = timeToMinutes(schedule.opening);
  let closing = timeToMinutes(schedule.closing);
  const breakFrom = timeToMinutes(schedule.break_from);
  const breakTo = timeToMinutes(schedule.break_to);
  const hasBreak = breakFrom !== null && breakTo !== null;
  if (opening === null || closing === null) return null;

  const closesNextDay = Boolean(schedule.nextDay) || closing <= opening;
  if (closesNextDay) closing += 1440;

  if (previousDayCarry) {
    if (!closesNextDay) return null;
    const carriedMinute = minuteOfDay + 1440;
    if (carriedMinute < opening || carriedMinute >= closing) return null;
    if (hasBreak) {
      const carriedBreakFrom = breakFrom < opening ? breakFrom + 1440 : breakFrom;
      const carriedBreakTo = breakTo <= breakFrom ? breakTo + 1440 : breakTo;
      if (carriedMinute >= carriedBreakFrom && carriedMinute < carriedBreakTo) return null;
      if (carriedMinute < carriedBreakFrom) return carriedBreakFrom;
    }
    return closing;
  }

  if (minuteOfDay >= opening && minuteOfDay < closing) {
    if (hasBreak && minuteOfDay >= breakFrom && minuteOfDay < breakTo) return null;
    if (hasBreak && minuteOfDay < breakFrom) return breakFrom;
    return closing;
  }

  if (closesNextDay && minuteOfDay < closing - 1440) {
    if (hasBreak && minuteOfDay >= breakFrom && minuteOfDay < breakTo) return null;
    if (hasBreak && minuteOfDay < breakFrom) return breakFrom;
    return closing;
  }

  return null;
}

function isRestaurantOpenNow(openingHours, now = moment().tz(BERLIN_TIMEZONE), leadTimeMinutes = 0) {
  if (!openingHours) return false;

  const dayName = getDayNameForMoment(now);
  const previousDayName = getPreviousDayName(dayName);
  const minuteOfDay = now.hours() * 60 + now.minutes();

  const todayEnd = getServiceSegmentEnd(openingHours[dayName], minuteOfDay);
  if (todayEnd !== null && minuteOfDay + leadTimeMinutes <= todayEnd) {
    return true;
  }

  const previousEnd = getServiceSegmentEnd(openingHours[previousDayName], minuteOfDay, true);
  return previousEnd !== null && minuteOfDay + leadTimeMinutes <= previousEnd;
}

function getPublicRestaurantLookup(restaurantId) {
  return mongoose.Types.ObjectId.isValid(restaurantId)
    ? { _id: restaurantId }
    : { username: restaurantId };
}

function getMatchedDeliveryZone(deliveryZones, postalCode) {
  const normalized = normalizePostalCode(postalCode);
  return (deliveryZones || []).find(
    (zone) => normalizePostalCode(zone?.postalCode) === normalized
  );
}

function getLowestPriceRow(priceRows) {
  const rows = (priceRows || []).filter(
    (row) => row && row.item_price !== undefined && row.item_price !== null
  );
  if (!rows.length) return { row: null, index: 0 };

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
  if (!match) return getLowestPriceRow(item.price).index;
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

function asObjectIdOrNull(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""))
    ? new mongoose.Types.ObjectId(String(value))
    : null;
}

function sanitizeQuantity(value) {
  const parsed = Math.floor(Number(value || 1));
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, 99);
}

function sanitizeCents(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed);
}

function calculateDiscountCents(restaurantDiscount, subtotalCents) {
  if (!restaurantDiscount || !restaurantDiscount.type || !restaurantDiscount.value) {
    return { discountCents: 0, discount: { type: "none", value: 0 } };
  }

  const value = Number(restaurantDiscount.value || 0);
  if (!Number.isFinite(value) || value <= 0) {
    return { discountCents: 0, discount: { type: "none", value: 0 } };
  }

  if (restaurantDiscount.type === "percentage") {
    return {
      discountCents: Math.min(subtotalCents, Math.round((subtotalCents * value) / 100)),
      discount: { type: "percentage", value },
    };
  }

  const fixedCents = Math.round(value * 100);
  return {
    discountCents: Math.min(subtotalCents, fixedCents),
    discount: { type: "fixed", value },
  };
}

function validateCartLine(category, item, line) {
  const issues = [];
  const quantity = sanitizeQuantity(line?.qty);
  const priceRows = (item.price || []).filter(
    (row) => row && row.item_price !== undefined && row.item_price !== null
  );
  const selectedSlotIndex = getSelectedSizeIndex(item, line?.choices || {});
  const selectedPriceRow = priceRows[selectedSlotIndex] || getLowestPriceRow(priceRows).row;

  if (!selectedPriceRow) issues.push("size_unavailable");
  if (priceRows[selectedSlotIndex] === undefined) issues.push("size_unavailable");

  let unitPriceCents = sanitizeCents(selectedPriceRow?.item_price);
  const sizeSnapshot = {
    priceSlotIndex: selectedSlotIndex,
    labelSnapshot: selectedPriceRow?.item_size || "",
    priceCents: sanitizeCents(selectedPriceRow?.item_price),
  };

  const dressingSnapshot = {
    groupId: null,
    groupNameSnapshot: "",
    options: [],
  };

  const dressing = category.dressing;
  if (dressing && dressing.isActive !== false && dressing.options?.length) {
    const groupId = `${item._id}:dressing`;
    const multiple = Boolean(dressing.multiple);
    const selected = getSelectedValues(line, groupId, multiple);
    const activeOptions = (dressing.options || [])
      .map((option, index) => ({ option, index }))
      .filter(({ option }) => option?.isActive !== false);

    dressingSnapshot.groupId = asObjectIdOrNull(dressing._id);
    dressingSnapshot.groupNameSnapshot = dressing.dressing_label || "";

    if (!multiple && selected.length === 0) issues.push("required_option_missing");

    selected.forEach((optionId) => {
      const match = activeOptions.find(
        ({ option, index }) => `${item._id}:dressing:${option._id || index}` === optionId
      );
      if (!match) {
        issues.push("option_unavailable");
        return;
      }
      dressingSnapshot.options.push({
        optionId: asObjectIdOrNull(match.option._id),
        labelSnapshot: match.option.dressing_name || "",
        priceCents: 0,
      });
    });
  }

  const extraSnapshots = [];
  const extraGroupId = `${item._id}:extras`;
  const selectedExtras = getSelectedValues(line, extraGroupId, true);
  const activeExtras = (category.extra_menu?.extras || [])
    .map((extra, index) => ({ extra, index }))
    .filter(({ extra }) => extra?.isActive !== false);

  selectedExtras.forEach((selectedId) => {
    const match = activeExtras.find(
      ({ extra, index }) => `${item._id}:extra:${extra._id || index}` === selectedId
    );
    if (!match) {
      issues.push("option_unavailable");
      return;
    }

    const priceCents = sanitizeCents(
      match.extra.prices?.[selectedSlotIndex]?.price ?? match.extra.prices?.[0]?.price
    );
    unitPriceCents += priceCents;
    extraSnapshots.push({
      extraId: asObjectIdOrNull(match.extra._id),
      labelSnapshot: match.extra.label || "",
      priceCents,
    });
  });

  const addonSnapshots = [];
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

      if (!addon.optional && selected.length === 0) issues.push("required_option_missing");

      selected.forEach((optionId) => {
        const match = activeOptions.find(
          ({ option, index }) =>
            `${item._id}:addon:${addon._id || addonIndex}:option:${option._id || index}` === optionId
        );
        if (!match) {
          issues.push("option_unavailable");
          return;
        }

        const priceCents = sanitizeCents(match.option.addon_price);
        unitPriceCents += priceCents;
        addonSnapshots.push({
          addonId: asObjectIdOrNull(addon._id),
          addonNameSnapshot: addon.addon_label || "",
          optionId: asObjectIdOrNull(match.option._id),
          optionNameSnapshot: match.option.addon_name || "",
          priceCents,
        });
      });
    });

  return {
    issues,
    line: {
      itemId: item._id,
      categoryId: category._id,
      itemNameSnapshot: item.item_name || "",
      categoryNameSnapshot: category.category_name || "",
      quantity,
      unitPriceCents,
      lineTotalCents: unitPriceCents * quantity,
      note: String(line?.note || "").trim().slice(0, 500),
      size: sizeSnapshot,
      dressing: dressingSnapshot,
      extras: extraSnapshots,
      addons: addonSnapshots,
    },
  };
}

async function priceOrderPayload(payload) {
  const restaurantId = payload?.restaurantId;
  const restaurant = await Restaurant.findOne(getPublicRestaurantLookup(restaurantId)).lean();

  if (!restaurant || restaurant.isActive !== true || restaurant.visibility !== true) {
    throw new OrderValidationError("restaurant_unavailable", "Restaurant unavailable", 404);
  }

  const mode =
    payload?.mode === "takeaway"
      ? "takeaway"
      : payload?.mode === "dine_in"
        ? "dine_in"
        : "delivery";
  const postalCode = normalizePostalCode(payload?.postalCode);
  let deliveryZone = null;
  const appModules = await getAppModuleConfig();
  const modules = effectiveRestaurantModules(restaurant, appModules);

  if (mode === "delivery") {
    if (!modules.delivery) {
      throw new OrderValidationError("delivery_unavailable", "Delivery unavailable");
    }
    deliveryZone = getMatchedDeliveryZone(restaurant.delivering_at, postalCode);
    if (!deliveryZone) {
      throw new OrderValidationError("postal_code_out_of_range", "Postal code out of range");
    }
  } else if (mode === "takeaway" && !modules.takeaway) {
    throw new OrderValidationError("takeaway_unavailable", "Take-away unavailable");
  } else if (mode === "dine_in" && !modules.dineIn) {
    throw new OrderValidationError("dine_in_unavailable", "Dine-in unavailable");
  }

  const deliveryMinutes = mode === "delivery" ? parseDeliveryMinutes(deliveryZone?.delivery_time) : 0;
  if (restaurant.ordersPausedUntil && new Date(restaurant.ordersPausedUntil).getTime() > Date.now()) {
    throw new OrderValidationError("orders_paused", "Restaurant is not accepting orders right now", 409);
  }
  if (!isRestaurantOpenNow(restaurant.opening_hours, moment().tz(BERLIN_TIMEZONE), 0)) {
    throw new OrderValidationError("restaurant_closed", "Restaurant is closed", 409);
  }

  const invalidItems = [];
  const pricedItems = (payload?.cart || []).map((line, lineIndex) => {
    let matchedCategory = null;
    let matchedItem = null;

    (restaurant.menu || [])
      .filter((category) => category?.isActive !== false)
      .some((category) => {
        const item = (category.items || []).find(
          (entry) => String(entry?._id) === String(line?.itemId) && entry?.isActive !== false
        );
        if (item) {
          matchedCategory = category;
          matchedItem = item;
          return true;
        }
        return false;
      });

    if (!matchedCategory || !matchedItem) {
      invalidItems.push({ lineIndex, itemId: line?.itemId || "", issues: ["item_unavailable"] });
      return null;
    }

    const result = validateCartLine(matchedCategory, matchedItem, line);
    if (result.issues.length) {
      invalidItems.push({
        lineIndex,
        itemId: line?.itemId || "",
        issues: Array.from(new Set(result.issues)),
      });
    }
    return result.line;
  });

  const items = pricedItems.filter(Boolean);
  if (!items.length || invalidItems.length) {
    throw new OrderValidationError("cart_items_unavailable", "Cart contains unavailable items", 409, {
      invalidItems,
    });
  }

  const subtotalCents = items.reduce((sum, line) => sum + line.lineTotalCents, 0);
  const minimumOrderCents = mode === "delivery" ? sanitizeCents(deliveryZone?.min_order_value) : 0;
  if (subtotalCents < minimumOrderCents) {
    throw new OrderValidationError("minimum_order_not_reached", "Minimum order not reached", 409, {
      subtotalCents,
      minimumOrderCents,
    });
  }

  const { discountCents, discount } = calculateDiscountCents(restaurant.discount, subtotalCents);
  const freeDeliveryThresholdCents =
    mode === "delivery" ? sanitizeCents(deliveryZone?.free_delivery_min_order) : 0;
  const freeDeliveryApplied =
    mode === "delivery" &&
    (Boolean(deliveryZone?.free) ||
      (freeDeliveryThresholdCents > 0 && subtotalCents >= freeDeliveryThresholdCents));
  const deliveryFeeCents =
    mode === "delivery" && !freeDeliveryApplied ? sanitizeCents(deliveryZone?.charges) : 0;
  const tipCents = sanitizeCents(payload?.tipCents);
  const totalCents = Math.max(0, subtotalCents - discountCents + deliveryFeeCents + tipCents);

  return {
    restaurant,
    deliveryZone,
    mode,
    postalCode,
    deliveryMinutes,
    items,
    totals: {
      subtotalCents,
      discountCents,
      deliveryFeeCents,
      tipCents,
      totalCents,
      minimumOrderCents,
      freeDeliveryThresholdCents,
      freeDeliveryApplied,
      discount,
    },
  };
}

module.exports = {
  OrderValidationError,
  normalizePostalCode,
  parseDeliveryMinutes,
  isRestaurantOpenNow,
  priceOrderPayload,
};
