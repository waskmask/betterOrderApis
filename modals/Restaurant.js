const mongoose = require("mongoose");
const {
  liveFoodInfoSectionSchema,
  liveCustomFoodInfoSectionSchema,
} = require("./MenuItemFoodInfoDraft");

// Updated By Schema for Audit Logs (legacy slim entries)
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

const editAuditChangeSchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    from: { type: String, default: "" },
    to: { type: String, default: "" },
  },
  { _id: false }
);

/** Full restaurant edit audits: who / when / what */
const editAuditLogSchema = new mongoose.Schema({
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
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  userName: { type: String, default: "" },
  userEmail: { type: String, default: "" },
  action: {
    type: String,
    enum: [
      "profile_update",
      "toggle_active",
      "toggle_visibility",
      "publish_request",
      "publish_approve",
      "publish_reject",
      "discount_update",
      "modules_update",
      "username_change",
      "other",
    ],
    default: "profile_update",
  },
  changes: { type: [editAuditChangeSchema], default: [] },
  timestamp: { type: Date, default: Date.now },
});

// Delivery Zone Schema
const deliveryZoneSchema = new mongoose.Schema({
  postalCode: { type: String, required: true },
  charges: { type: Number, default: 0 },
  free: { type: Boolean, default: false },
  delivery_time: { type: String }, // e.g., "30 mins", "45 mins"
  min_order_value: { type: Number, default: 0, required: true }, // e.g., "
  free_delivery_min_order: { type: Number, default: 0 },
});

// Discount Schema
const discountSchema = new mongoose.Schema({
  type: { type: String, enum: ["percentage", "fixed"], required: true },
  value: { type: Number, required: true },
});

const restaurantModuleSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    plan: { type: String, default: "none" },
    activatedAt: { type: Date, default: null },
    deactivatedAt: { type: Date, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "AdminUser", default: null },
  },
  { _id: false }
);

// Addon Option Schema
const optionItemSchema = new mongoose.Schema({
  addon_name: String,
  nameI18n: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  addon_price: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
});

const addonSchema = new mongoose.Schema({
  addon_label: String,
  labelI18n: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  optional: { type: Boolean, default: true },
  multiple: { type: Boolean, default: false },
  /** Min selections when multiple=true (0 = optional empty allowed unless optional=false). */
  minSelect: { type: Number, default: 0 },
  /** Max selections when multiple=true (0 = unlimited / all options). */
  maxSelect: { type: Number, default: 0 },
  options: [optionItemSchema],
  appliesTo: {
    type: [mongoose.Schema.Types.ObjectId],
    default: [],
  },
  applyToAll: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
});

const dressingSchema = new mongoose.Schema({
  dressing_label: String,
  labelI18n: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  multiple: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  options: [
    {
      dressing_name: String,
      nameI18n: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },
      isActive: { type: Boolean, default: true },
    },
  ],
});

// Size-based Price Schema
const sizePriceSchema = new mongoose.Schema({
  item_size: String,
  sizeI18n: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  item_price: Number,
});

// Menu Item Schema
const menuItemSchema = new mongoose.Schema({
  item_name: String,
  item_desc: String,
  nameI18n: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  descriptionI18n: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  item_image: {
    type: mongoose.Schema.Types.Mixed,
    default: undefined,
  },
  index: { type: Number, default: 0 }, // 👈 for ordering
  price: [sizePriceSchema], // [{ item_size, item_price }]
  food_info: {
    allergens: {
      type: liveFoodInfoSectionSchema,
      default: () => ({
        entries: { en: [], de: [] },
        source: "seller",
        isSafeForDisplay: false,
        lastEditedAt: null,
        lastEditedBy: null,
        lastApprovedDraftId: null,
        verification: {
          isVerified: false,
          sellerReadAt: null,
          verifiedAt: null,
          verifiedBy: null,
          verificationNote: "",
          approvalLogs: [],
        },
      }),
    },
    additives: {
      type: liveFoodInfoSectionSchema,
      default: () => ({
        entries: { en: [], de: [] },
        source: "seller",
        isSafeForDisplay: false,
        lastEditedAt: null,
        lastEditedBy: null,
        lastApprovedDraftId: null,
        verification: {
          isVerified: false,
          sellerReadAt: null,
          verifiedAt: null,
          verifiedBy: null,
          verificationNote: "",
          approvalLogs: [],
        },
      }),
    },
    custom_sections: {
      type: [liveCustomFoodInfoSectionSchema],
      default: [],
    },
  },
  highlight: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
});

// Extra Menu Schema
const extraMenuSchema = new mongoose.Schema({
  extras: [
    {
      label: String,
      labelI18n: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },
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
  nameI18n: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  descriptionI18n: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  count_of_prices: { type: Number, default: 1 },
  index: { type: Number, default: 0 }, // 👈 for ordering
  extra_menu: {
    type: extraMenuSchema,
    default: () => ({ extras: [] }), // ✅ ensure it's never undefined
  },
  category_image: { type: String },
  addons: [addonSchema], // Paid options for all items in the category
  dressing: dressingSchema,
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
    customer_id: {
      type: String,
      unique: true,
      required: true,
    },
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
      countryCode: { type: String, default: "DE", uppercase: true, trim: true },
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
      /** Path of coverAsset last applied as live cover (for Assets “Already using”). */
      coverSourceAsset: String,
      /** Per-restaurant AI cover generations only (max 10 enforced in service). */
      coverAssets: [
        {
          path: { type: String, required: true },
          thumbPath: { type: String },
          createdAt: { type: Date, default: Date.now },
        },
      ],
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
    publishRequest: {
      status: {
        type: String,
        enum: ["none", "pending", "rejected"],
        default: "none",
        index: true,
      },
      requestedAt: { type: Date, default: null },
      requestedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
      requestedByRole: { type: String, default: null },
      reviewedAt: { type: Date, default: null },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
      rejectReason: { type: String, default: "" },
    },
    payment_methods: {
      type: [String],
      enum: ["cod", "paypal", "online"],
      default: ["cod"],
    },
    orderSettings: {
      acceptTimeoutMinutes: { type: Number, default: 10, min: 3, max: 30 },
      autoAcceptEnabled: { type: Boolean, default: false },
      autoAcceptDeliveryMinutes: { type: Number, default: 45, min: 30, max: 120 },
      autoAcceptTakeawayMinutes: { type: Number, default: 30, min: 15, max: 120 },
      autoPrintOnAccept: { type: Boolean, default: true },
      autoDetectPrinters: { type: Boolean, default: true },
      printRolesOnAccept: {
        type: [String],
        default: () => ["KITCHEN"],
      },
    },
    printerConfig: {
      connectionType: {
        type: String,
        enum: ["network", "bluetooth"],
        default: "network",
      },
      host: { type: String, default: "" },
      port: { type: Number, default: 9100, min: 1, max: 65535 },
      serialPort: { type: String, default: "" },
      windowsPrinterName: { type: String, default: "" },
      copies: { type: Number, default: 1, min: 1, max: 3 },
      enabled: { type: Boolean, default: false },
    },
    printers: {
      type: [
        {
          key: { type: String, required: true },
          name: { type: String, default: "Printer" },
          enabled: { type: Boolean, default: true },
          roles: { type: [String], default: () => ["KITCHEN"] },
          connection: {
            type: { type: String, enum: ["tcp", "serial", "windows"], default: "tcp" },
            host: { type: String, default: "" },
            // tcp: number (9100), serial: string ("COM3")
            port: { type: mongoose.Schema.Types.Mixed, default: 9100 },
            baudRate: { type: Number, default: 9600 },
            printerName: { type: String, default: "" },
          },
          connectionType: {
            type: String,
            enum: ["network", "bluetooth"],
            default: "network",
          },
          host: { type: String, default: "" },
          port: { type: Number, default: 9100, min: 1, max: 65535 },
          serialPort: { type: String, default: "" },
          windowsPrinterName: { type: String, default: "" },
          baudRate: { type: Number, default: 9600 },
          copies: { type: Number, default: 1, min: 1, max: 3 },
        },
      ],
      default: [],
    },
    printAgentTokenHash: { type: String, default: "" },
    printAgentLastSeenAt: { type: Date, default: null },
    printAgentPairingCodeHash: { type: String, default: "" },
    printAgentPairingExpiresAt: { type: Date, default: null },
    printAgentDiscoveredPrinters: {
      type: [
        {
          key: { type: String, default: "" },
          name: { type: String, default: "" },
          roles: { type: [String], default: () => ["KITCHEN"] },
          connection: {
            type: { type: String, default: "serial" },
            host: { type: String, default: "" },
            port: { type: String, default: "" },
            baudRate: { type: Number, default: 9600 },
            printerName: { type: String, default: "" },
          },
          connectionType: { type: String, default: "bluetooth" },
          host: { type: String, default: "" },
          port: { type: Number, default: 9100 },
          serialPort: { type: String, default: "" },
          windowsPrinterName: { type: String, default: "" },
          copies: { type: Number, default: 1 },
        },
      ],
      default: [],
    },
    ordersPausedUntil: { type: Date, default: null },
    modules: {
      delivery: { type: restaurantModuleSchema, default: () => ({ enabled: true, plan: "included" }) },
      takeaway: { type: restaurantModuleSchema, default: () => ({ enabled: true, plan: "included" }) },
      dineIn: { type: restaurantModuleSchema, default: () => ({ enabled: false, plan: "none" }) },
      tableQr: { type: restaurantModuleSchema, default: () => ({ enabled: false, plan: "none" }) },
      foodInfo: { type: restaurantModuleSchema, default: () => ({ enabled: true, plan: "included" }) },
      onlinePayment: { type: restaurantModuleSchema, default: () => ({ enabled: false, plan: "none" }) },
    },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updated_by: [updatedBySchema],
    edit_audit_logs: { type: [editAuditLogSchema], default: [] },
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

restaurantSchema.index(
  {
    visibility: 1,
    isActive: 1,
    "delivering_at.postalCode": 1,
    "address.postalCode": 1,
  },
  {
    name: "restaurant_discovery_lookup",
  }
);

const Restaurant = mongoose.model("Restaurant", restaurantSchema);
const generateUsername = async (name) => {
  let base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "") // remove all except letters, digits, and space
    .replace(/\s+/g, "-"); // then replace spaces with hyphen

  if (!base) {
    base = "restaurant";
  }

  let username = base;
  let count = 0;

  while (await Restaurant.findOne({ username })) {
    count++;
    username = `${base}${count}`;
  }

  return username;
};

const generateNextCustomerId = async () => {
  const lastRestaurant = await Restaurant.findOne({
    customer_id: { $regex: /^WF\d+$/ },
  })
    .sort({ customer_id: -1 })
    .lean();

  if (!lastRestaurant || !lastRestaurant.customer_id) {
    return "WF10000";
  }

  const lastNumber = parseInt(lastRestaurant.customer_id.replace("WF", ""), 10);
  const nextNumber = lastNumber + 1;

  return `WF${nextNumber}`;
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

module.exports = {
  Restaurant,
  generateUsername,
  generateNextCustomerId,
  RestaurantLog,
}; 
