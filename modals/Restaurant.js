const mongoose = require("mongoose");

// Updated By Schema for Audit Logs
const updatedBySchema = new mongoose.Schema({
  userType: {
    type: String,
    enum: [
      "admin",
      "restaurant-admin",
      "restaurant-user",
      "restaurant",
      "superadmin",
      "sales",
      "moderator",
    ],
    required: true,
  },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  timestamp: { type: Date, default: Date.now },
});

// Delivery Zone Schema
const deliveryZoneSchema = new mongoose.Schema({
  postalCode: { type: String, required: true },
  charges: { type: Number, default: 0 },
  free: { type: Boolean, default: false },
  delivery_time: { type: String }, // e.g., "30 mins", "45 mins"
  min_order_value: { type: Number, default: 0, required: true }, // e.g., "
});

// Discount Schema
const discountSchema = new mongoose.Schema({
  type: { type: String, enum: ["percentage", "fixed"], required: true },
  value: { type: Number, required: true },
});

// Addon Option Schema
const optionItemSchema = new mongoose.Schema({
  addon_name: String,
  addon_price: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
});

const addonSchema = new mongoose.Schema({
  addon_label: String,
  optional: { type: Boolean, default: true },
  multiple: { type: Boolean, default: false },
  options: [optionItemSchema],
  isActive: { type: Boolean, default: true },
});

const dressingSchema = new mongoose.Schema({
  dressing_label: String,
  multiple: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  options: [
    {
      dressing_name: String,
      isActive: { type: Boolean, default: true },
    },
  ],
});

// Size-based Price Schema
const sizePriceSchema = new mongoose.Schema({
  item_size: String,
  item_price: Number,
});

// Menu Item Schema
const menuItemSchema = new mongoose.Schema({
  item_name: String,
  item_desc: String,
  index: { type: Number, default: 0 }, // 👈 for ordering
  price: [sizePriceSchema], // [{ item_size, item_price }]
  isActive: { type: Boolean, default: true },
});

// Extra Menu Schema
const extraMenuSchema = new mongoose.Schema({
  extras: [
    {
      label: String,
      isActive: Boolean,
      prices: [
        {
          price: Number,
          _id: false,
        },
      ],
    },
  ],
});

// Category Schema
const categorySchema = new mongoose.Schema({
  category_name: {
    type: String,
    required: true,
    trim: true,
  },
  category_desc: String,
  count_of_prices: { type: Number, default: 1 },
  index: { type: Number, default: 0 }, // 👈 for ordering
  extra_menu: {
    type: extraMenuSchema,
    default: () => ({ extras: [] }), // ✅ ensure it's never undefined
  },
  category_image: { type: String },
  addons: [addonSchema], // Paid options for all items in the category
  dressings: [dressingSchema], // Optional dressings for the category
  items: [menuItemSchema],
  isActive: { type: Boolean, default: true },
});

// dayly timeline
const dailyTimeSchema = new mongoose.Schema(
  {
    ifClosed: { type: Boolean, default: false },
    // opening & closing in "HH:mm" format (24-hour)
    opening: { type: String, default: "" }, // e.g., "10:00"
    closing: { type: String, default: "" }, // e.g., "01:00"
    break_from: { type: String, default: "" }, // e.g., "15:00"
    break_to: { type: String, default: "" }, // e.g., "17:00"
    nextDay: { type: Boolean, default: false }, // true if closes after midnight
  },
  { _id: false }
);

// opening hours schema
const openingHoursSchema = new mongoose.Schema(
  {
    monday: dailyTimeSchema,
    tuesday: dailyTimeSchema,
    wednesday: dailyTimeSchema,
    thursday: dailyTimeSchema,
    friday: dailyTimeSchema,
    saturday: dailyTimeSchema,
    sunday: dailyTimeSchema,
  },
  { _id: false }
);

// Main Restaurant Schema
const restaurantSchema = new mongoose.Schema(
  {
    restaurant_name: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    ownerName: String,
    companyName: String,
    taxId: String,
    registry: String,
    registry_number: String,
    vat_number: String,
    fax: String,
    phoneNumber: String,
    email: { type: String, required: true, unique: true },
    password: String, // hashed
    address: {
      street: String,
      houseNumber: String,
      postalCode: String,
      city: String,
      country: { type: String, default: "Germany" },
    },
    cuisine_type: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Cuisine",
        required: true,
      },
    ],
    coordinates: {
      lat: Number,
      lng: Number,
    },
    images: {
      logo: String,
      cover: String,
    },
    isHalal: Boolean,
    description: String,
    delivery: { type: Boolean, default: false },
    take_away: { type: Boolean, default: false },
    delivering_at: [deliveryZoneSchema],
    delivery_radius: { type: Number }, // in km
    discount: discountSchema,
    menu: [categorySchema],
    opening_hours: openingHoursSchema,
    isActive: { type: Boolean, default: false },
    visibility: { type: Boolean, default: false },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updated_by: [updatedBySchema],
    tokenVersion: { type: Number, default: 0 },
    password_reset_logs: [
      {
        reset_by: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "AdminUser",
        },
        reset_by_role: { type: String, enum: ["admin", "superadmin", "self"] },
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

// ✅ Add compound index here
restaurantSchema.index(
  {
    restaurant_name: 1,
    "address.street": 1,
    "address.houseNumber": 1,
    "address.postalCode": 1,
    "address.city": 1,
    "address.country": 1,
  },
  {
    unique: true,
    name: "unique_restaurant_address_combo",
  }
);

const Restaurant = mongoose.model("Restaurant", restaurantSchema);
const generateUsername = async (name) => {
  let base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "") // remove all except letters, digits, and space
    .replace(/\s+/g, "-"); // then replace spaces with hyphen

  let username = base;
  let count = 0;

  while (await Restaurant.findOne({ username })) {
    count++;
    username = `${base}${count}`;
  }

  return username;
};

const restaurantLogSchema = new mongoose.Schema({
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant" },
  log_type: {
    type: String,
    enum: ["category_deleted", "category_created", "menu_updated"],
  },
  data: {
    categoryId: String,
    categoryName: String,
  },
  deleted_by: {
    userType: String, // "admin" or "restaurant"
    userId: { type: mongoose.Schema.Types.ObjectId },
  },
  timestamp: { type: Date, default: Date.now },
});

const RestaurantLog = mongoose.model("RestaurantLog", restaurantLogSchema);

module.exports = { Restaurant, generateUsername, RestaurantLog };
// we need to add an option for restaurant to upload menu item image
