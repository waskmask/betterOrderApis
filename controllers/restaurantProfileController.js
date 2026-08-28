const { Restaurant } = require("../modals/Restaurant");
const { deleteObjectByRelativePath } = require("../utils/r2Storage");
const { getCurrentBusinessShift } = require("../services/businessShiftService");
const {
  normalizeRestaurantPrinters,
  validatePrintersPayload,
  primaryPrinterConfig,
  printersForStorage,
  normalizePrintRoles,
} = require("../services/printerConfigService");

const parseMoneyToCents = (value, fallback = 0) => {
  const parsed = parseFloat((value ?? String(fallback)).toString().replace(",", "."));
  return Number.isNaN(parsed)
    ? NaN
    : Math.round((parsed + Number.EPSILON) * 100);
};

const storedDeliveryMoneyToEuroNumber = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(((parsed / 100) + Number.EPSILON) * 100) / 100;
};

const formatDeliveryZoneForResponse = (zone) => {
  const normalized = typeof zone?.toObject === "function" ? zone.toObject() : { ...zone };
  return {
    ...normalized,
    charges: storedDeliveryMoneyToEuroNumber(normalized.charges),
    min_order_value: storedDeliveryMoneyToEuroNumber(normalized.min_order_value),
    free_delivery_min_order: storedDeliveryMoneyToEuroNumber(
      normalized.free_delivery_min_order
    ),
  };
};

// upload logo or cover
const handleImageUpload = async (req, res, type) => {
  try {
    const { restaurantId, sourceAssetPath } = req.body;

    if (!restaurantId) {
      await deleteObjectByRelativePath(req.restaurantImagePath);
      return res
        .status(400)
        .json({ message: "restaurantId_is_required_in_body" });
    }

    if (
      req.user?.role === "restaurant" &&
      String(req.user._id) !== String(restaurantId)
    ) {
      await deleteObjectByRelativePath(req.restaurantImagePath);
      return res.status(403).json({ message: "Access denied: Not authorized" });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      await deleteObjectByRelativePath(req.restaurantImagePath);
      return res.status(404).json({ message: "restaurant_not_found" });
    }

    if (!restaurant.images) restaurant.images = {};

    const currentImage = restaurant.images[type];

    // Delete old image if exists
    if (currentImage) {
      await deleteObjectByRelativePath(currentImage);
    }

    restaurant.images[type] = req.restaurantImagePath;

    if (type === "cover") {
      const candidate = typeof sourceAssetPath === "string" ? sourceAssetPath.trim() : "";
      const assets = Array.isArray(restaurant.images.coverAssets)
        ? restaurant.images.coverAssets
        : [];
      const matched = candidate && assets.some((a) => a?.path === candidate);
      restaurant.images.coverSourceAsset = matched ? candidate : undefined;
    }

    await restaurant.save();

    res.status(200).json({
      success: true,
      message: `${
        type === "logo" ? "logo" : "cover_image"
      } uploaded successfully`,
      [type]: restaurant.images[type],
      ...(type === "cover"
        ? { coverSourceAsset: restaurant.images.coverSourceAsset || null }
        : {}),
    });
  } catch (err) {
    console.error(`Upload ${type} error:`, err);
    await deleteObjectByRelativePath(req.restaurantImagePath);
    res.status(500).json({ message: "server_error", success: false });
  }
};

exports.uploadLogo = async (req, res) => {
  await handleImageUpload(req, res, "logo");
};

exports.uploadCover = async (req, res) => {
  await handleImageUpload(req, res, "cover");
};

// toogle delivery and take away status
exports.toggleDeliveryOrTakeaway = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { field } = req.body; // should be either "delivery" or "take_away"

    if (!["delivery", "take_away"].includes(field)) {
      return res.status(400).json({ message: "Invalid field to toggle" });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    restaurant[field] = !restaurant[field];
    await restaurant.save();

    res.status(200).json({
      success: true,
      message: `${field} is now ${restaurant[field] ? "enabled" : "disabled"}`,
      [field]: restaurant[field],
    });
  } catch (err) {
    console.error("❌ Toggle delivery/take_away error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// add delivery zone
exports.addDeliveryZone = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    let {
      postalCode,
      charges,
      free,
      delivery_time,
      min_order_value,
      free_delivery_min_order,
    } = req.body;

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant)
      return res.status(404).json({ message: "restaurant_not_found" });

    if (restaurant.delivering_at.find((z) => z.postalCode === postalCode)) {
      return res.status(400).json({ message: "postal_code_already_exists" });
    }

    charges = parseMoneyToCents(charges);
    min_order_value = parseMoneyToCents(min_order_value);
    free_delivery_min_order = parseMoneyToCents(free_delivery_min_order, 0);

    if (
      isNaN(charges) ||
      isNaN(min_order_value) ||
      isNaN(free_delivery_min_order)
    ) {
      return res.status(400).json({ message: "invalid_price_format" });
    }

    const isFree = free || charges === 0;
    // ✅ Store the new zone in a variable first
    const newZone = {
      postalCode,
      charges: free ? 0 : charges,
      free: isFree,
      delivery_time,
      min_order_value,
      free_delivery_min_order: isFree ? 0 : Math.max(0, free_delivery_min_order),
    };

    restaurant.delivering_at.push(newZone);
    await restaurant.save();
    res.status(201).json({
      success: true,
      message: "delivery_zone_added",
      zone: formatDeliveryZoneForResponse(newZone),
    });
  } catch (err) {
    console.error("add_zone_error:", err);
    res.status(500).json({ message: "server_error" });
  }
};

// get all delivery zones
exports.getAllDeliveryZones = async (req, res) => {
  try {
    const { restaurantId } = req.params;

    const restaurant = await Restaurant.findById(restaurantId).select(
      "delivering_at"
    );
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    res.status(200).json({
      success: true,
      delivery_zones: (restaurant.delivering_at || []).map(formatDeliveryZoneForResponse),
    });
  } catch (err) {
    console.error("❌ Get delivery zones error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// update delivery zone
exports.updateDeliveryZone = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    let {
      index,
      postalCode,
      charges,
      free,
      delivery_time,
      min_order_value,
      free_delivery_min_order,
    } = req.body;

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant || !restaurant.delivering_at[index])
      return res.status(404).json({ message: "zone_not_found" });

    const zone = restaurant.delivering_at[index];

    if (postalCode) zone.postalCode = postalCode;
    if (delivery_time) zone.delivery_time = delivery_time;

    // Normalize charges and min order value
    charges = parseMoneyToCents(charges);
    min_order_value = parseMoneyToCents(min_order_value, 0);
    free_delivery_min_order = parseMoneyToCents(free_delivery_min_order, 0);

    if (
      isNaN(charges) ||
      isNaN(min_order_value) ||
      isNaN(free_delivery_min_order)
    ) {
      return res.status(400).json({ message: "invalid_price_format" });
    }

    // Determine if it's free
    const isFree = !!free || charges === 0;

    // Update free & charges accordingly
    zone.free = isFree;
    zone.charges = isFree ? 0 : charges;

    // Always update min_order_value
    zone.min_order_value = min_order_value;
    zone.free_delivery_min_order = isFree
      ? 0
      : Math.max(0, free_delivery_min_order);

    await restaurant.save();

    res.status(200).json({
      success: true,
      message: "delivery_zone_updated",
      zone: formatDeliveryZoneForResponse(zone),
    });
  } catch (err) {
    console.error("update_zone_error", err);
    res.status(500).json({ message: "server_error" });
  }
};

// delete delivery zone
exports.deleteDeliveryZone = async (req, res) => {
  try {
    const { restaurantId, index } = req.params;

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant || !restaurant.delivering_at[index]) {
      return res.status(404).json({ message: "zone_not_found" });
    }

    restaurant.delivering_at.splice(index, 1);
    await restaurant.save();

    res.status(200).json({
      success: true,
      message: "zone_removed",
      zones: restaurant.delivering_at,
    });
  } catch (err) {
    console.error("delete_zone_error", err);
    res.status(500).json({ message: "server_error" });
  }
};

// Set Opening Hours (all 7 days)
// Check if time format is HH:mm
const isValidTimeFormat = (time) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);

// Check if time is between open and close (supporting next-day)
const isTimeBetween = (open, close, check) => {
  const toMinutes = (t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };

  const o = toMinutes(open);
  const c = toMinutes(close);
  const x = toMinutes(check);

  // Special case: open 00:00 to close 00:00 means 24 hours open
  if (o === 0 && c === 0) return true;

  // Overnight range (e.g. 18:00–02:00)
  if (c <= o) {
    return x >= o || x <= c;
  }

  // Normal same-day range
  return x >= o && x <= c;
};

// ✅ Controller
exports.setOpeningHours = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { opening_hours } = req.body;

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant)
      return res.status(404).json({ message: "restaurant_not_found" });

    const days = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ];

    for (const day of days) {
      const data = opening_hours[day];
      if (!data) continue;

      const { opening, closing, break_from, break_to, ifClosed } = data;

      if (ifClosed) {
        opening_hours[day] = {
          ifClosed: true,
          opening: "",
          closing: "",
          nextDay: false,
          break_from: "",
          break_to: "",
        };
        continue;
      }

      // Validate required fields
      if (!opening || !closing) {
        return res
          .status(400)
          .json({ message: `${day}: opening_and_closing_times_required.` });
      }

      // Validate format
      if (!isValidTimeFormat(opening) || !isValidTimeFormat(closing)) {
        return res
          .status(400)
          .json({ message: `${day}: invalid_opening_or_closing_format` });
      }

      if (break_from && !isValidTimeFormat(break_from)) {
        return res
          .status(400)
          .json({ message: `${day}: invalid_break_from_format` });
      }

      if (break_to && !isValidTimeFormat(break_to)) {
        return res
          .status(400)
          .json({ message: `${day}: invalid_break_to_format` });
      }

      // ✅ Validate break range
      const hasValidBreak =
        break_from &&
        break_to &&
        break_from !== "00:00" &&
        break_to !== "00:00";

      if (hasValidBreak) {
        if (!isTimeBetween(opening, closing, break_from)) {
          return res.status(400).json({
            message: `${day}: break_from_must_be_between`,
          });
        }
        if (!isTimeBetween(opening, closing, break_to)) {
          return res.status(400).json({
            message: `${day}: break_to_must_be_between`,
          });
        }
      }

      // ✅ Determine nextDay
      const openMins =
        parseInt(opening.split(":")[0]) * 60 + parseInt(opening.split(":")[1]);
      const closeMins =
        parseInt(closing.split(":")[0]) * 60 + parseInt(closing.split(":")[1]);
      const nextDay = closeMins <= openMins;

      // Final assignment
      opening_hours[day] = {
        ifClosed: false,
        opening,
        closing,
        nextDay,
        break_from: hasValidBreak ? break_from : "",
        break_to: hasValidBreak ? break_to : "",
      };
    }

    restaurant.opening_hours = opening_hours;
    await restaurant.save();

    res.status(200).json({
      success: true,
      message: "opening_hours_updated_successfully",
      opening_hours: restaurant.opening_hours,
    });
  } catch (err) {
    console.error("set_opening_hours_error", err);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

// Get Opening Hours
exports.getOpeningHours = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const restaurant = await Restaurant.findById(restaurantId);

    if (!restaurant)
      return res.status(404).json({ message: "restaurant_not_found" });

    res.status(200).json({
      success: true,
      opening_hours: restaurant.opening_hours,
    });
  } catch (err) {
    console.error("get_opening_hours_error", err);
    res.status(500).json({ message: "server_error" });
  }
};

exports.getOrderSettings = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const restaurant = await Restaurant.findById(restaurantId).select(
      "orderSettings ordersPausedUntil opening_hours printerConfig printers printAgentLastSeenAt printAgentTokenHash"
    );
    if (!restaurant) {
      return res.status(404).json({ message: "restaurant_not_found" });
    }

    const { shiftStart } = getCurrentBusinessShift(restaurant.opening_hours || {});
    const { isPrintAgentHealthy } = require("../services/orderPrintService");

    return res.json({
      success: true,
      orderSettings: restaurant.orderSettings || { acceptTimeoutMinutes: 10 },
      ordersPausedUntil: restaurant.ordersPausedUntil || null,
      businessShiftStart: shiftStart.toISOString(),
      printerConfig: primaryPrinterConfig(restaurant),
      printers: normalizeRestaurantPrinters(restaurant),
      printAgentOnline: isPrintAgentHealthy(restaurant.printAgentLastSeenAt),
      printAgentLastSeenAt: restaurant.printAgentLastSeenAt || null,
      hasPrintAgentToken: Boolean(restaurant.printAgentTokenHash),
    });
  } catch (err) {
    console.error("get_order_settings_error", err);
    return res.status(500).json({ success: false, message: "server_error" });
  }
};

exports.updateOrderSettings = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "restaurant_not_found" });
    }

    const current = restaurant.orderSettings?.toObject?.() || restaurant.orderSettings || {};
    const next = { ...current };

    if (req.body?.acceptTimeoutMinutes != null) {
      const minutes = Number.parseInt(req.body.acceptTimeoutMinutes, 10);
      if (!Number.isFinite(minutes) || minutes < 3 || minutes > 30) {
        return res.status(400).json({ message: "invalid_accept_timeout_minutes" });
      }
      next.acceptTimeoutMinutes = minutes;
    }

    if (typeof req.body?.autoAcceptEnabled === "boolean") {
      next.autoAcceptEnabled = req.body.autoAcceptEnabled;
    }

    if (req.body?.autoAcceptDeliveryMinutes != null) {
      const minutes = Number.parseInt(req.body.autoAcceptDeliveryMinutes, 10);
      if (!Number.isFinite(minutes) || minutes < 30 || minutes > 120) {
        return res.status(400).json({ message: "invalid_auto_accept_delivery_minutes" });
      }
      next.autoAcceptDeliveryMinutes = minutes;
    }

    if (req.body?.autoAcceptTakeawayMinutes != null) {
      const minutes = Number.parseInt(req.body.autoAcceptTakeawayMinutes, 10);
      if (!Number.isFinite(minutes) || minutes < 15 || minutes > 120) {
        return res.status(400).json({ message: "invalid_auto_accept_takeaway_minutes" });
      }
      next.autoAcceptTakeawayMinutes = minutes;
    }

    if (typeof req.body?.autoDetectPrinters === "boolean") {
      next.autoDetectPrinters = req.body.autoDetectPrinters;
    }

    if (typeof req.body?.autoPrintOnAccept === "boolean") {
      next.autoPrintOnAccept = req.body.autoPrintOnAccept;
    }

    if (Array.isArray(req.body?.printRolesOnAccept)) {
      next.printRolesOnAccept = normalizePrintRoles(req.body.printRolesOnAccept);
    }

    const $set = { orderSettings: next };

    if (Array.isArray(req.body?.printers)) {
      const validated = validatePrintersPayload(req.body.printers);
      if (!validated.ok) {
        return res.status(400).json({ message: validated.message });
      }
      $set.printers = printersForStorage(validated.printers);
      $set.printerConfig = primaryPrinterConfig({ printers: validated.printers });
    } else if (req.body?.printerConfig && typeof req.body.printerConfig === "object") {
      const printer = restaurant.printerConfig?.toObject?.() || restaurant.printerConfig || {};
      if (typeof req.body.printerConfig.connectionType === "string") {
        const connectionType = req.body.printerConfig.connectionType.trim().toLowerCase();
        if (["network", "bluetooth"].includes(connectionType)) {
          printer.connectionType = connectionType;
        }
      }
      if (typeof req.body.printerConfig.host === "string") {
        printer.host = req.body.printerConfig.host.trim().slice(0, 120);
      }
      if (typeof req.body.printerConfig.serialPort === "string") {
        printer.serialPort = req.body.printerConfig.serialPort.trim().slice(0, 20).toUpperCase();
      }
      if (typeof req.body.printerConfig.windowsPrinterName === "string") {
        printer.windowsPrinterName = req.body.printerConfig.windowsPrinterName.trim().slice(0, 120);
      }
      if (req.body.printerConfig.port != null) {
        const port = Number.parseInt(req.body.printerConfig.port, 10);
        if (!Number.isFinite(port) || port < 1 || port > 65535) {
          return res.status(400).json({ message: "invalid_printer_port" });
        }
        printer.port = port;
      }
      if (req.body.printerConfig.copies != null) {
        const copies = Number.parseInt(req.body.printerConfig.copies, 10);
        if (!Number.isFinite(copies) || copies < 1 || copies > 3) {
          return res.status(400).json({ message: "invalid_printer_copies" });
        }
        printer.copies = copies;
      }
      if (typeof req.body.printerConfig.enabled === "boolean") {
        printer.enabled = req.body.printerConfig.enabled;
      }
      $set.printerConfig = printer;
      if (!restaurant.printers?.length) {
        $set.printers = normalizeRestaurantPrinters({ printerConfig: printer });
      }
    }

    const updated = await Restaurant.findByIdAndUpdate(
      restaurantId,
      { $set },
      { new: true, runValidators: true }
    );
    if (!updated) {
      return res.status(404).json({ message: "restaurant_not_found" });
    }

    return res.json({
      success: true,
      orderSettings: updated.orderSettings,
      printerConfig: primaryPrinterConfig(updated),
      printers: normalizeRestaurantPrinters(updated),
    });
  } catch (err) {
    console.error("update_order_settings_error", err);
    return res.status(500).json({ success: false, message: "server_error" });
  }
};

exports.pauseOrders = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const minutes = Number.parseInt(req.body?.minutes, 10);
    if (![30, 60, 90].includes(minutes)) {
      return res.status(400).json({ message: "invalid_pause_minutes" });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "restaurant_not_found" });
    }

    restaurant.ordersPausedUntil = new Date(Date.now() + minutes * 60 * 1000);
    await restaurant.save();

    return res.json({
      success: true,
      ordersPausedUntil: restaurant.ordersPausedUntil,
    });
  } catch (err) {
    console.error("pause_orders_error", err);
    return res.status(500).json({ success: false, message: "server_error" });
  }
};

exports.resumeOrders = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "restaurant_not_found" });
    }

    restaurant.ordersPausedUntil = null;
    await restaurant.save();

    return res.json({ success: true, ordersPausedUntil: null });
  } catch (err) {
    console.error("resume_orders_error", err);
    return res.status(500).json({ success: false, message: "server_error" });
  }
};
