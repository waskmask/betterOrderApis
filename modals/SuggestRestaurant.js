const mongoose = require("mongoose");

const suggestRestaurantSchema = new mongoose.Schema(
  {
    restaurantName: {
      type: String,
      required: [true, "Restaurant name is required"],
      trim: true,
      minlength: [2, "Restaurant name must be at least 2 characters"],
      maxlength: [100, "Restaurant name cannot exceed 100 characters"],
    },
    address: {
      street: {
        type: String,
        required: [true, "Street is required"],
        trim: true,
      },
      houseNumber: {
        type: String,
        required: [true, "House number is required"],
        trim: true,
      },
      postalCode: {
        type: String,
        required: [true, "Postal code is required"],
        trim: true,
      },
      city: {
        type: String,
        required: [true, "City is required"],
        trim: true,
      },
    },
    suggestedBy: {
      name: {
        type: String,
        required: [true, "Your name is required"],
        trim: true,
        minlength: [2, "Name must be at least 2 characters"],
        maxlength: [50, "Name cannot exceed 50 characters"],
      },
      email: {
        type: String,
        required: [true, "Email is required"],
        trim: true,
        lowercase: true,
        match: [
          /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+$/,
          "Please enter a valid email address",
        ],
      },
    },
    status: {
      type: String,
      enum: ["pending", "contacted", "registered", "rejected", "duplicate"],
      default: "pending",
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    notes: {
      type: String,
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdminUser",
    },
    processedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
suggestRestaurantSchema.index({ status: 1, createdAt: -1 });
suggestRestaurantSchema.index({ "suggestedBy.email": 1 });
suggestRestaurantSchema.index({ restaurantName: 1, "address.postalCode": 1 });

const SuggestRestaurant = mongoose.model("SuggestRestaurant", suggestRestaurantSchema);

module.exports = SuggestRestaurant;
