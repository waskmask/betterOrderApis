const moment = require("moment-timezone");
const { isRestaurantOpenNow } = require("./orderPricingService");

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

function timeToMinutes(time) {
  const match = String(time || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function getDaySchedule(openingHours, dayName) {
  if (!openingHours || typeof openingHours !== "object") return null;
  return openingHours[dayName] || null;
}

/**
 * Returns the active business shift window for history/analytics filtering.
 * Live order queue must NOT use this to hide active orders.
 */
function getCurrentBusinessShift(openingHours, now = moment().tz(BERLIN_TIMEZONE)) {
  const dayName = WEEK_DAYS[now.day()];
  const schedule = getDaySchedule(openingHours, dayName);
  const minuteOfDay = now.hours() * 60 + now.minutes();

  if (schedule?.closed) {
    return getLastCompletedShift(openingHours, now);
  }

  const openMin = timeToMinutes(schedule?.opening);
  const closeMin = timeToMinutes(schedule?.closing);
  if (openMin == null || closeMin == null) {
    const start = now.clone().startOf("day");
    return { shiftStart: start.toDate(), shiftEnd: now.clone().endOf("day").toDate() };
  }

  const spansMidnight = schedule?.nextDay || closeMin <= openMin;
  let shiftStart = now.clone().startOf("day").add(openMin, "minutes");
  let shiftEnd = spansMidnight
    ? now.clone().startOf("day").add(closeMin, "minutes").add(1, "day")
    : now.clone().startOf("day").add(closeMin, "minutes");

  if (spansMidnight && minuteOfDay < closeMin) {
    shiftStart = shiftStart.subtract(1, "day");
    shiftEnd = now.clone().startOf("day").add(closeMin, "minutes");
  }

  const inShift =
    spansMidnight && minuteOfDay < closeMin
      ? minuteOfDay >= 0 || minuteOfDay >= openMin
      : minuteOfDay >= openMin && (spansMidnight ? true : minuteOfDay < closeMin);

  if (!inShift && isRestaurantOpenNow(openingHours, now, 0)) {
    return { shiftStart: shiftStart.toDate(), shiftEnd: shiftEnd.toDate() };
  }

  if (!inShift) {
    return getLastCompletedShift(openingHours, now);
  }

  return { shiftStart: shiftStart.toDate(), shiftEnd: shiftEnd.toDate() };
}

function getLastCompletedShift(openingHours, now) {
  for (let offset = 0; offset <= 7; offset += 1) {
    const day = now.clone().subtract(offset, "days");
    const dayName = WEEK_DAYS[day.day()];
    const schedule = getDaySchedule(openingHours, dayName);
    if (!schedule || schedule.closed) continue;

    const openMin = timeToMinutes(schedule.opening);
    const closeMin = timeToMinutes(schedule.closing);
    if (openMin == null || closeMin == null) continue;

    const spansMidnight = schedule.nextDay || closeMin <= openMin;
    const shiftStart = day.clone().startOf("day").add(openMin, "minutes");
    const shiftEnd = spansMidnight
      ? day.clone().startOf("day").add(closeMin, "minutes").add(1, "day")
      : day.clone().startOf("day").add(closeMin, "minutes");

    if (offset > 0 || now.isAfter(shiftEnd)) {
      return { shiftStart: shiftStart.toDate(), shiftEnd: shiftEnd.toDate() };
    }
  }

  const start = now.clone().startOf("day");
  return { shiftStart: start.toDate(), shiftEnd: now.toDate() };
}

function getPreviousCompletedShift(openingHours, now = moment().tz(BERLIN_TIMEZONE)) {
  const current = getCurrentBusinessShift(openingHours, now);
  const beforeCurrent = moment(current.shiftStart).subtract(1, "minute");
  return getLastCompletedShift(openingHours, beforeCurrent);
}

function resolveHistoryDateRange(range, openingHours, fromParam, toParam, now = moment().tz(BERLIN_TIMEZONE)) {
  if (fromParam || toParam) {
    const filter = {};
    if (fromParam) {
      const parsedFrom = moment(fromParam).tz(BERLIN_TIMEZONE).startOf("day");
      if (parsedFrom.isValid()) filter.from = parsedFrom.toDate();
    }
    if (toParam) {
      const parsedTo = moment(toParam).tz(BERLIN_TIMEZONE).endOf("day");
      if (parsedTo.isValid()) filter.to = parsedTo.toDate();
    }
    return filter;
  }

  const normalizedRange = String(range || "today").trim().toLowerCase();

  if (normalizedRange === "today") {
    const { shiftStart, shiftEnd } = getCurrentBusinessShift(openingHours, now);
    return { from: shiftStart, to: shiftEnd };
  }

  if (normalizedRange === "yesterday") {
    const { shiftStart, shiftEnd } = getPreviousCompletedShift(openingHours, now);
    return { from: shiftStart, to: shiftEnd };
  }

  if (normalizedRange === "week") {
    return {
      from: now.clone().subtract(7, "days").startOf("day").toDate(),
      to: now.clone().endOf("day").toDate(),
    };
  }

  if (normalizedRange === "month") {
    return {
      from: now.clone().subtract(30, "days").startOf("day").toDate(),
      to: now.clone().endOf("day").toDate(),
    };
  }

  return {};
}

module.exports = {
  BERLIN_TIMEZONE,
  getCurrentBusinessShift,
  getPreviousCompletedShift,
  resolveHistoryDateRange,
};
