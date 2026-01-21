const mongoose = require("mongoose");

// Order Item Schema
const orderItemSchema = new mongoose.Schema(
  {
    menuId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant" },
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
  },
  { _id: true }
);

// Order Schema
const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true, required: true },
    revOrderNumber: { type: Number, unique: true, required: true }, // Reverse order number for display
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
    },
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    items: [orderItemSchema],
    // Customer Information
    customerInfo: {
      firstname: String,
      surname: { type: String, required: true },
      email: { type: String, required: true },
      phone: String,
      companyName: String,
    },
    // Delivery Information
    deliveryInfo: {
      address: { type: String, required: true },
      floor: String,
      postalCode: { type: String, required: true },
      city: String,
      country: { type: String, default: "Germany" },
      coordinates: {
        lat: Number,
        lng: Number,
      },
    },
    // Order Details
    orderType: {
      type: String,
      enum: ["delivery", "takeaway"],
      required: true,
    },
    deliveryCharge: { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    subtotal: { type: Number, required: true }, // Sum of all items
    total: { type: Number, required: true }, // subtotal + deliveryCharge - discountAmount
    // Payment Information
    paymentMode: {
      type: String,
      enum: ["cod", "paypal", "online", "stripe"],
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },
    transactionId: String,
    // Order Status
    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "preparing",
        "ready",
        "out_for_delivery",
        "delivered",
        "cancelled",
      ],
      default: "pending",
    },
    restaurantStatus: {
      type: String,
      enum: ["unseen", "seen", "accepted", "rejected"],
      default: "unseen",
    },
    // Timing
    estimateTime: Number, // in minutes
    deliveredAt: Date,
    cancelledAt: Date,
    cancelledBy: {
      type: String,
      enum: ["customer", "restaurant", "admin"],
    },
    cancellationReason: String,
    // Notes
    notes: String,
    // Restaurant notes for customer
    restaurantNotes: String,
  },
  {
    timestamps: true,
  }
);

// Indexes
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ revOrderNumber: -1 });
orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ restaurant: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ restaurantStatus: 1 });

// Generate order number before saving
orderSchema.pre("save", async function (next) {
  if (this.isNew && !this.orderNumber) {
    // Generate order number like: ORD-2024-000001
    const year = new Date().getFullYear();
    const lastOrder = await mongoose.model("Order").findOne(
      { orderNumber: new RegExp(`^ORD-${year}-`) },
      {},
      { sort: { orderNumber: -1 } }
    );

    let sequence = 1;
    if (lastOrder) {
      const lastSeq = parseInt(lastOrder.orderNumber.split("-")[2]);
      sequence = lastSeq + 1;
    }

    this.orderNumber = `ORD-${year}-${String(sequence).padStart(6, "0")}`;
  }

  // Generate reverse order number if not set
  if (this.isNew && !this.revOrderNumber) {
    const lastOrder = await mongoose.model("Order").findOne(
      {},
      {},
      { sort: { revOrderNumber: -1 } }
    );

    if (lastOrder) {
      this.revOrderNumber = lastOrder.revOrderNumber - 1;
    } else {
      this.revOrderNumber = 1000000000; // Start with a large number
    }
  }

  next();
});

module.exports = mongoose.model("Order", orderSchema);


