const mongoose = require("mongoose");

const reviewModerationLogSchema = new mongoose.Schema(
  {
    reviewId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RestaurantReview",
      required: true,
      index: true,
    },
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    action: { type: String, enum: ["removed"], default: "removed" },
    reason: { type: String, required: true, maxlength: 500 },
    actorId: { type: mongoose.Schema.Types.ObjectId, required: true },
    actorRole: { type: String, required: true },
    reviewSnapshotHash: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ReviewModerationLog", reviewModerationLogSchema);
