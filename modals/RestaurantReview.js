const mongoose = require("mongoose");

const restaurantReviewSchema = new mongoose.Schema(
  {
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
      unique: true,
      index: true,
    },
    appUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AppUser",
      default: null,
      index: true,
    },
    customerName: { type: String, default: "" },
    customerEmail: { type: String, default: "" },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: "", maxlength: 2000 },
    status: {
      type: String,
      enum: ["published", "removed"],
      default: "published",
      index: true,
    },
    removedAt: { type: Date, default: null },
    removedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    removedByRole: { type: String, default: "" },
    removalReason: { type: String, default: "", maxlength: 500 },
    submittedAt: { type: Date, default: Date.now, index: true },
    locale: { type: String, enum: ["en", "de"], default: "en" },
    submittedFromIp: { type: String, default: "" },
  },
  { timestamps: true }
);

restaurantReviewSchema.index({ restaurantId: 1, status: 1, submittedAt: -1 });

module.exports = mongoose.model("RestaurantReview", restaurantReviewSchema);
