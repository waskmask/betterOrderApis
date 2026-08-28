const mongoose = require("mongoose");

const diningTableSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    tableNumber: { type: String, required: true, trim: true },
    label: { type: String, default: "", trim: true },
    area: { type: String, default: "", trim: true },
    qrToken: { type: String, required: true, unique: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

diningTableSchema.index(
  { restaurantId: 1, tableNumber: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

module.exports = mongoose.model("DiningTable", diningTableSchema);
