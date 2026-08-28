const mongoose = require("mongoose");

const cuisineSchema = new mongoose.Schema(
  {
    // String (legacy) or { de: "...", en: "..." }
    name: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    description: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // Relative path e.g. /uploads/2026/08/uuid.webp
    icon: {
      type: String,
      default: "",
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    position: {
      type: Number,
      default: 0,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Cuisine", cuisineSchema);
