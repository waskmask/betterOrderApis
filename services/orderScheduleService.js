const DEFAULT_RELEASE_LEAD_MINUTES = 45;
const MIN_SCHEDULE_LEAD_MINUTES = 60;
const MAX_SCHEDULE_LEAD_DAYS = 7;

function parseRequestedFor(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function resolveScheduleFields(payload = {}) {
  const explicitType = String(payload.fulfillmentType || "").trim().toLowerCase();
  const requestedFor = parseRequestedFor(payload.requestedFor || payload.scheduledFor);
  const rawTime = String(payload.deliveryTime || "asap").trim().toLowerCase();

  const wantsScheduled =
    explicitType === "scheduled" ||
    Boolean(requestedFor) ||
    (rawTime && rawTime !== "asap" && /^\d{4}-\d{2}-\d{2}/.test(rawTime));

  if (!wantsScheduled) {
    return {
      fulfillmentType: "asap",
      requestedTime: rawTime || "asap",
      requestedFor: null,
      releaseAt: null,
      kitchenReleasedAt: new Date(),
    };
  }

  let scheduledAt = requestedFor;
  if (!scheduledAt && /^\d{4}-\d{2}-\d{2}/.test(rawTime)) {
    scheduledAt = parseRequestedFor(rawTime);
  }

  if (!scheduledAt) {
    const error = new Error("scheduled_time_required");
    error.code = "scheduled_time_required";
    error.status = 400;
    throw error;
  }

  const now = Date.now();
  const minAt = now + MIN_SCHEDULE_LEAD_MINUTES * 60 * 1000;
  const maxAt = now + MAX_SCHEDULE_LEAD_DAYS * 24 * 60 * 60 * 1000;
  if (scheduledAt.getTime() < minAt) {
    const error = new Error("scheduled_time_too_soon");
    error.code = "scheduled_time_too_soon";
    error.status = 400;
    throw error;
  }
  if (scheduledAt.getTime() > maxAt) {
    const error = new Error("scheduled_time_too_far");
    error.code = "scheduled_time_too_far";
    error.status = 400;
    throw error;
  }

  const leadMinutes = Number.parseInt(payload.releaseLeadMinutes, 10);
  const releaseLead =
    Number.isFinite(leadMinutes) && leadMinutes >= 15 && leadMinutes <= 180
      ? leadMinutes
      : DEFAULT_RELEASE_LEAD_MINUTES;

  const releaseAt = new Date(scheduledAt.getTime() - releaseLead * 60 * 1000);
  const alreadyReleased = releaseAt.getTime() <= now;

  return {
    fulfillmentType: "scheduled",
    requestedTime: scheduledAt.toISOString(),
    requestedFor: scheduledAt,
    releaseAt: alreadyReleased ? new Date(now) : releaseAt,
    kitchenReleasedAt: alreadyReleased ? new Date(now) : null,
  };
}

function isKitchenReleased(order, now = new Date()) {
  if (!order) return false;
  if (order.fulfillment?.fulfillmentType !== "scheduled") return true;
  if (order.fulfillment?.kitchenReleasedAt) return true;
  const releaseAt = order.fulfillment?.releaseAt;
  if (!releaseAt) return true;
  return new Date(releaseAt).getTime() <= now.getTime();
}

function isPrintEligible(order, now = new Date()) {
  return isKitchenReleased(order, now);
}

module.exports = {
  DEFAULT_RELEASE_LEAD_MINUTES,
  MIN_SCHEDULE_LEAD_MINUTES,
  MAX_SCHEDULE_LEAD_DAYS,
  parseRequestedFor,
  resolveScheduleFields,
  isKitchenReleased,
  isPrintEligible,
};
