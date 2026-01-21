const mongoose = require("mongoose");

// Updated By Schema for Audit Logs
const updatedBySchema = new mongoose.Schema({
  userType: {
    type: String,
    enum: ["admin", "superadmin", "sales", "moderator", "self"],
  },
  userId: { type: mongoose.Schema.Types.ObjectId },
  timestamp: { type: Date, default: Date.now },
});

const restaurantOnboardingSchema = new mongoose.Schema(
  {
    restaurant_name: {
      type: String,
      required: [true, "Restaurant name is required"],
      trim: true,
    },
    contact_name: {
      type: String,
      trim: true,
      default: "",
    },
    phoneNumber: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
    },
    website: {
      type: String,
      trim: true,
      default: "",
    },
    address: {
      street: { type: String, trim: true },
      houseNumber: { type: String, trim: true },
      postalCode: { type: String, trim: true },
      city: { type: String, trim: true },
      country: { type: String, trim: true, default: "germany" },
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["new", "contacted", "demo_scheduled", "onboarding", "registered", "rejected"],
      default: "new",
    },
    updated_by: [updatedBySchema],
  },
  {
    timestamps: true,
  }
);

// Indexes for faster queries
restaurantOnboardingSchema.index({ status: 1, createdAt: -1 });
restaurantOnboardingSchema.index({ email: 1 });
restaurantOnboardingSchema.index({ restaurant_name: 1, "address.postalCode": 1 });

const RestaurantOnboarding = mongoose.model("RestaurantOnboarding", restaurantOnboardingSchema);

module.exports = RestaurantOnboarding;
