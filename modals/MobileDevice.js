const mongoose = require("mongoose");

const mobileDeviceSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    token: { type: String, required: true, unique: true, index: true },
    platform: {
      type: String,
      enum: ["android", "ios", "web", "unknown"],
      default: "unknown",
    },
    appVersion: { type: String, default: "" },
    deviceName: { type: String, default: "" },
    locale: { type: String, default: "" },
    isActive: { type: Boolean, default: true, index: true },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

mobileDeviceSchema.index({ restaurantId: 1, isActive: 1 });

module.exports = mongoose.model("MobileDevice", mobileDeviceSchema);
