const mongoose = require("mongoose");

// Address Schema
const addressSchema = new mongoose.Schema(
  {
    label: { type: String, required: true }, // e.g., "home", "work", "other"
    street: String,
    streetNumber: String,
    postalCode: String,
    city: String,
    country: { type: String, default: "Germany" },
    coordinates: {
      lat: Number,
      lng: Number,
    },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
);

const customerSchema = new mongoose.Schema(
  {
    firstname: { type: String, required: true, trim: true },
    surname: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true }, // Hashed
    phone: String,
    companyName: String,
    isEmailVerified: { type: Boolean, default: false },
    verificationToken: String,
    verificationTokenExpiry: Date,
    passwordResetToken: String,
    passwordResetTokenExpiry: Date,
    addresses: [addressSchema],
    favorites: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Restaurant",
      },
    ],
    isActive: { type: Boolean, default: true },
    tokenVersion: { type: Number, default: 0 },
    password_reset_logs: [
      {
        reset_by: {
          type: String,
          enum: ["self", "admin"],
        },
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Index for email lookup
customerSchema.index({ email: 1 });
customerSchema.index({ verificationToken: 1 });
customerSchema.index({ passwordResetToken: 1 });

module.exports = mongoose.model("Customer", customerSchema);

