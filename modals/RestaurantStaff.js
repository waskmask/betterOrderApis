const mongoose = require("mongoose");

const restaurantStaffSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["restaurant-admin", "restaurant-waiter", "restaurant-kitchen"],
      default: "restaurant-waiter",
    },
    isActive: { type: Boolean, default: true },
    tokenVersion: { type: Number, default: 0 },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    createdByRole: { type: String, default: null },
  },
  { timestamps: true }
);

restaurantStaffSchema.index({ restaurantId: 1, isActive: 1 });
restaurantStaffSchema.index({ restaurantId: 1, role: 1, isActive: 1 });

module.exports = mongoose.model("RestaurantStaff", restaurantStaffSchema);
