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
      return res.status(404).json({ message: "Restaurant not found" });

    if (restaurant.delivering_at.find((z) => z.postalCode === postalCode)) {
      return res.status(400).json({ message: "Postal code already exists" });
    }

    charges = parseFloat((charges || "0").toString().replace(",", "."));
    min_order_value = parseFloat(min_order_value.toString().replace(",", "."));

    if (isNaN(charges) || isNaN(min_order_value)) {
      return res.status(400).json({ message: "Invalid price format" });
    }

    restaurant.delivering_at.push({
      postalCode,
      charges: free ? 0 : charges,
      free: !!free,
      delivery_time,
      min_order_value,
    });

    await restaurant.save();
    res.status(201).json({
      success: true,
      message: "Delivery zone added",
      zones: restaurant.delivering_at,
    });
  } catch (err) {
    console.error("❌ Add zone error:", err);
    res.status(500).json({ message: "Server error" });
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
exports.updateDeliveryZone = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { index, postalCode, charges, free, delivery_time, min_order_value } =
      req.body;

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant || !restaurant.delivering_at[index])
      return res.status(404).json({ message: "Zone not found" });

    const zone = restaurant.delivering_at[index];

    if (postalCode) zone.postalCode = postalCode;
    if (delivery_time) zone.delivery_time = delivery_time;
    if (typeof free === "boolean") {
      zone.free = free;
      zone.charges = free
        ? 0
        : parseFloat((charges || "0").toString().replace(",", "."));
    }

    if (min_order_value !== undefined) {
      zone.min_order_value = parseFloat(
        min_order_value.toString().replace(",", ".")
      );
    }

    await restaurant.save();
    res
      .status(200)
      .json({ success: true, message: "Delivery zone updated", zone });
  } catch (err) {
    console.error("❌ Update zone error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// delete delivery zone
exports.deleteDeliveryZone = async (req, res) => {
  try {
    const { restaurantId, index } = req.params;

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant || !restaurant.delivering_at[index]) {
      return res.status(404).json({ message: "Zone not found" });
    }

    restaurant.delivering_at.splice(index, 1);
    await restaurant.save();

    res.status(200).json({
      success: true,
      message: "Zone removed",
      zones: restaurant.delivering_at,
    });
  } catch (err) {
    console.error("❌ Delete zone error:", err);
    res.status(500).json({ message: "Server error" });
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
