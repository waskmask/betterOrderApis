const mongoose = require("mongoose");

const appUserAddressSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      enum: ["home", "office", "work", "parents", "custom"],
      required: true,
      default: "home",
    },
    customLabel: {
      type: String,
      trim: true,
      maxlength: 40,
      default: "",
    },
    street: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    houseNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20,
    },
    postalCode: {
      type: String,
      required: true,
      match: /^\d{5}$/,
    },
    city: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    state: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "",
    },
    country: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "Germany",
    },
    floor: {
      type: String,
      trim: true,
      maxlength: 20,
      default: "",
    },
    additionInfo: {
      type: String,
      trim: true,
      maxlength: 250,
      default: "",
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const favoriteMenuItemSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    restaurantName: {
      type: String,
      trim: true,
      default: "",
    },
    categoryName: {
      type: String,
      trim: true,
      default: "",
    },
    itemName: {
      type: String,
      trim: true,
      default: "",
    },
    itemImage: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

const consentAuditSchema = new mongoose.Schema(
  {
    accepted: { type: Boolean, default: false },
    acceptedAt: { type: Date, default: null },
    version: { type: String, trim: true, default: "" },
    locale: { type: String, enum: ["en", "de"], default: "en" },
    source: { type: String, trim: true, default: "web" },
    ipAddress: { type: String, trim: true, default: "" },
    userAgent: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const marketingEmailConsentSchema = new mongoose.Schema(
  {
    optedIn: { type: Boolean, default: false },
    optedInAt: { type: Date, default: null },
    optedOutAt: { type: Date, default: null },
    updatedAt: { type: Date, default: null },
    source: { type: String, trim: true, default: "web" },
    ipAddress: { type: String, trim: true, default: "" },
    userAgent: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const appUserSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      default: "app-user",
      immutable: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    firstName: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "",
    },
    lastName: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "",
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      default: null,
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
      default: null,
    },
    avatar: {
      type: String,
      trim: true,
      default: "",
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    preferredLanguage: {
      type: String,
      enum: ["en", "de"],
      default: "en",
    },
    consent: {
      terms: {
        type: consentAuditSchema,
        default: () => ({}),
      },
      privacy: {
        type: consentAuditSchema,
        default: () => ({}),
      },
      marketingEmail: {
        type: marketingEmailConsentSchema,
        default: () => ({}),
      },
    },
    emailVerifiedAt: {
      type: Date,
      default: null,
    },
    emailVerificationTokenHash: {
      type: String,
      default: null,
    },
    emailVerificationTokenExpiresAt: {
      type: Date,
      default: null,
    },
    verificationEmailLastSentAt: {
      type: Date,
      default: null,
    },
    passwordResetTokenHash: {
      type: String,
      default: null,
    },
    passwordResetTokenExpiresAt: {
      type: Date,
      default: null,
    },
    passwordResetLastSentAt: {
      type: Date,
      default: null,
    },
    addresses: {
      type: [appUserAddressSchema],
      default: [],
    },
    favoriteRestaurants: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Restaurant" }],
      default: [],
    },
    favoriteMenuItems: {
      type: [favoriteMenuItemSchema],
      default: [],
    },
    order_history: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    tokenVersion: {
      type: Number,
      default: 0,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    anonymizedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

appUserSchema.index({ isActive: 1, emailVerifiedAt: 1 });

module.exports = mongoose.model("AppUser", appUserSchema);
