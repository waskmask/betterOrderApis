const mongoose = require("mongoose");

// Cart Item Schema
const cartItemSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    categoryId: String,
    itemId: String,
    itemName: { type: String, required: true },
    itemSize: String,
    itemPrice: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    dressing: String,
    freeAddons: [String],
    extraMenu: [String],
    extraMenuPrices: [Number],
    totalExtraPrice: { type: Number, default: 0 },
    subtotal: { type: Number, required: true }, // itemPrice * quantity
    grandTotal: { type: Number, required: true }, // (itemPrice + totalExtraPrice) * quantity
    notes: String,
    restaurantNotes: String,
    postalCode: String, // For delivery zone calculation
  },
  { _id: true }
);

// Cart Schema
const cartSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true }, // For guest users
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null, // null for guests, set when customer logs in
    },
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      default: null, // All items must be from same restaurant
    },
    items: [cartItemSchema],
    postalCode: String, // For delivery zone calculation
    orderType: {
      type: String,
      enum: ["delivery", "takeaway"],
      default: "delivery",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
cartSchema.index({ sessionId: 1 });
cartSchema.index({ customer: 1 });
cartSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 }); // Auto-delete after 7 days

module.exports = mongoose.model("Cart", cartSchema);


