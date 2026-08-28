const MODULE_KEYS = [
  "delivery",
  "takeaway",
  "dineIn",
  "tableQr",
  "foodInfo",
  "postalCodeSearch",
  "googleAddress",
  "onlinePayment",
  "reviews",
  "marketingEmails",
];

const DEFAULT_APP_MODULES = Object.freeze({
  delivery: true,
  takeaway: true,
  dineIn: true,
  tableQr: true,
  foodInfo: true,
  postalCodeSearch: true,
  googleAddress: true,
  onlinePayment: false,
  reviews: false,
  marketingEmails: true,
});

const DEFAULT_RESTAURANT_MODULES = Object.freeze({
  delivery: true,
  takeaway: true,
  dineIn: false,
  tableQr: false,
  foodInfo: true,
  onlinePayment: false,
});

function asBoolean(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return Boolean(value);
}

function disabledModulesFromEnv() {
  return new Set(
    String(process.env.APP_MODULES_DISABLED || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

function normalizeAppModules(raw = {}) {
  const disabled = disabledModulesFromEnv();
  return MODULE_KEYS.reduce((modules, key) => {
    modules[key] = disabled.has(key)
      ? false
      : asBoolean(raw?.[key]?.enabled ?? raw?.[key], DEFAULT_APP_MODULES[key] ?? false);
    return modules;
  }, {});
}

function normalizeRestaurantModules(restaurant = {}) {
  const raw = restaurant.modules || {};
  return {
    delivery: asBoolean(raw.delivery?.enabled ?? raw.delivery, DEFAULT_RESTAURANT_MODULES.delivery),
    takeaway: asBoolean(raw.takeaway?.enabled ?? raw.takeaway, DEFAULT_RESTAURANT_MODULES.takeaway),
    dineIn: asBoolean(raw.dineIn?.enabled ?? raw.dineIn, DEFAULT_RESTAURANT_MODULES.dineIn),
    tableQr: asBoolean(raw.tableQr?.enabled ?? raw.tableQr, DEFAULT_RESTAURANT_MODULES.tableQr),
    foodInfo: asBoolean(raw.foodInfo?.enabled ?? raw.foodInfo, DEFAULT_RESTAURANT_MODULES.foodInfo),
    onlinePayment: asBoolean(
      raw.onlinePayment?.enabled ?? raw.onlinePayment,
      DEFAULT_RESTAURANT_MODULES.onlinePayment
    ),
  };
}

function effectiveRestaurantModules(restaurant, appModules = DEFAULT_APP_MODULES) {
  const app = normalizeAppModules(appModules);
  const restaurantModules = normalizeRestaurantModules(restaurant);
  return {
    delivery: app.delivery && restaurantModules.delivery && restaurant.delivery !== false,
    takeaway: app.takeaway && restaurantModules.takeaway && restaurant.take_away !== false,
    dineIn: app.dineIn && restaurantModules.dineIn,
    tableQr: app.tableQr && restaurantModules.dineIn && restaurantModules.tableQr,
    foodInfo: app.foodInfo && restaurantModules.foodInfo,
    postalCodeSearch: app.postalCodeSearch && app.delivery,
    googleAddress: app.googleAddress && app.delivery,
    onlinePayment: app.onlinePayment && restaurantModules.onlinePayment,
    reviews: app.reviews,
    marketingEmails: app.marketingEmails,
  };
}

function moduleEnabled(restaurant, key, appModules = DEFAULT_APP_MODULES) {
  return Boolean(effectiveRestaurantModules(restaurant, appModules)[key]);
}

function modulePayload(restaurant, appModules = DEFAULT_APP_MODULES) {
  return {
    app: normalizeAppModules(appModules),
    restaurant: normalizeRestaurantModules(restaurant),
    effective: effectiveRestaurantModules(restaurant, appModules),
  };
}

module.exports = {
  MODULE_KEYS,
  DEFAULT_APP_MODULES,
  DEFAULT_RESTAURANT_MODULES,
  normalizeAppModules,
  normalizeRestaurantModules,
  effectiveRestaurantModules,
  moduleEnabled,
  modulePayload,
};
