const {
  getRequiredPublishFields,
  resolveCountryFromAddress,
  DEFAULT_COUNTRY_CODE,
} = require("./countries");

/**
 * Shared visibility / publish readiness checks for a restaurant document.
 * Legal field requirements are country-aware (e.g. IN soft, DE strict).
 * @param {object} restaurant
 * @returns {Array<string|{condition:string,fields:string[]}>}
 */
function getVisibilityFailedConditions(restaurant) {
  const failedConditions = [];

  if (!restaurant?.isActive) {
    failedConditions.push("restaurant_must_be_active");
  }

  if (!restaurant.menu || restaurant.menu.length === 0) {
    failedConditions.push("at_least_one_category_required");
  }

  const hasTwoItems = Array.isArray(restaurant.menu)
    ? restaurant.menu.some((cat) => Array.isArray(cat.items) && cat.items.length >= 2)
    : false;
  if (!hasTwoItems) {
    failedConditions.push("at_least_two_items_required");
  }

  const country =
    resolveCountryFromAddress(restaurant.address || {}, DEFAULT_COUNTRY_CODE) ||
    { code: DEFAULT_COUNTRY_CODE };
  const requiredFieldNames = getRequiredPublishFields(country.code);

  const missingFields = requiredFieldNames.filter((field) => {
    const value = restaurant[field];
    return !value || String(value).trim() === "";
  });

  if (missingFields.length > 0) {
    failedConditions.push({
      condition: "required_fields_missing",
      fields: missingFields,
    });
  }

  if (!restaurant.images?.logo) {
    failedConditions.push("restaurant_logo_required");
  }

  if (!restaurant.delivery && !restaurant.take_away) {
    failedConditions.push("delivery_or_takeaway_required");
  }

  if (!restaurant.delivering_at || restaurant.delivering_at.length === 0) {
    failedConditions.push("at_least_one_delivery_zone_required");
  }

  const days = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];

  const allDaysFilled = days.every((day) => {
    const d = restaurant.opening_hours?.[day];
    return d && (d.ifClosed || (d.opening && d.closing));
  });

  if (!allDaysFilled) {
    failedConditions.push("incomplete_opening_hours");
  }

  return failedConditions;
}

module.exports = {
  getVisibilityFailedConditions,
};
