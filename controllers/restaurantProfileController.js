const path = require("path");
const fs = require("fs");
const { Restaurant } = require("../modals/Restaurant");

// upload logo or cover
const handleImageUpload = async (req, res, type) => {
  try {
    const { restaurantId } = req.body;

    if (!restaurantId) {
      return res
        .status(400)
        .json({ message: "restaurantId is required in body" });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    const currentImage = restaurant.images[type];

    // Delete old image if exists
    if (currentImage) {
      const oldPath = path.join(__dirname, "../", currentImage);
      fs.existsSync(oldPath) && fs.unlinkSync(oldPath);
    }

    restaurant.images[type] = req.restaurantImagePath;
    await restaurant.save();

    res.status(200).json({
      success: true,
      message: `${
        type === "logo" ? "Logo" : "Cover image"
      } uploaded successfully`,
      [type]: restaurant.images[type],
    });
  } catch (err) {
    console.error(`❌ Upload ${type} error:`, err);
    res.status(500).json({ message: "Server error", success: false });
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
    let { postalCode, charges, free, delivery_time, min_order_value } =
      req.body;

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant)
      return res.status(404).json({ message: "restaurant_not_found" });

    if (restaurant.delivering_at.find((z) => z.postalCode === postalCode)) {
      return res.status(400).json({ message: "postal_code_already_exists" });
    }

    charges = parseFloat((charges || "0").toString().replace(",", "."));
    min_order_value = parseFloat(min_order_value.toString().replace(",", "."));

    if (isNaN(charges) || isNaN(min_order_value)) {
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
    };

    restaurant.delivering_at.push(newZone);
    await restaurant.save();
    res.status(201).json({
      success: true,
      message: "delivery_zone_added",
      zone: newZone,
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
      delivery_zones: restaurant.delivering_at || [],
    });
  } catch (err) {
    console.error("❌ Get delivery zones error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// update delivery zone
// update delivery zone
exports.updateDeliveryZone = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    let { index, postalCode, charges, free, delivery_time, min_order_value } =
      req.body;

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant || !restaurant.delivering_at[index])
      return res.status(404).json({ message: "zone_not_found" });

    const zone = restaurant.delivering_at[index];

    if (postalCode) zone.postalCode = postalCode;
    if (delivery_time) zone.delivery_time = delivery_time;

    // Normalize charges and min order value
    charges = parseFloat((charges || "0").toString().replace(",", "."));
    min_order_value = parseFloat(
      (min_order_value || "0").toString().replace(",", ".")
    );

    // Determine if it's free
    const isFree = !!free || charges === 0;

    // Update free & charges accordingly
    zone.free = isFree;
    zone.charges = isFree ? 0 : charges;

    // Always update min_order_value
    zone.min_order_value = isNaN(min_order_value) ? 0 : min_order_value;

    await restaurant.save();

    res.status(200).json({
      success: true,
      message: "delivery_zone_updated",
      zone,
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

  // if next day: "18:00" → "02:00"
  if (c <= o) return x >= o || x <= c;
  return x >= o && x <= c;
};

// ✅ Controller
exports.setOpeningHours = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { opening_hours } = req.body;

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant)
      return res.status(404).json({ message: "Restaurant not found" });

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
          .json({ message: `${day}: Opening and closing times required.` });
      }

      // Validate format
      if (!isValidTimeFormat(opening) || !isValidTimeFormat(closing)) {
        return res
          .status(400)
          .json({ message: `${day}: Invalid opening or closing format.` });
      }

      if (break_from && !isValidTimeFormat(break_from)) {
        return res
          .status(400)
          .json({ message: `${day}: Invalid break_from format.` });
      }

      if (break_to && !isValidTimeFormat(break_to)) {
        return res
          .status(400)
          .json({ message: `${day}: Invalid break_to format.` });
      }

      // ✅ Validate break range
      if (break_from && break_to) {
        if (!isTimeBetween(opening, closing, break_from)) {
          return res.status(400).json({
            message: `${day}: break_from must be between opening and closing.`,
          });
        }
        if (!isTimeBetween(opening, closing, break_to)) {
          return res.status(400).json({
            message: `${day}: break_to must be between opening and closing.`,
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
        break_from: break_from || "",
        break_to: break_to || "",
      };
    }

    restaurant.opening_hours = opening_hours;
    await restaurant.save();

    res.status(200).json({
      success: true,
      message: "Opening hours updated successfully",
      opening_hours: restaurant.opening_hours,
    });
  } catch (err) {
    console.error("❌ Set opening hours error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get Opening Hours
exports.getOpeningHours = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const restaurant = await Restaurant.findById(restaurantId);

    if (!restaurant)
      return res.status(404).json({ message: "Restaurant not found" });

    res.status(200).json({
      success: true,
      opening_hours: restaurant.opening_hours,
    });
  } catch (err) {
    console.error("❌ Get opening hours error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
