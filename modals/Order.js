const mongoose = require("mongoose");

const moneySnapshotSchema = {
  subtotalCents: { type: Number, required: true, min: 0 },
  discountCents: { type: Number, default: 0, min: 0 },
  deliveryFeeCents: { type: Number, default: 0, min: 0 },
  tipCents: { type: Number, default: 0, min: 0 },
  totalCents: { type: Number, required: true, min: 0 },
  minimumOrderCents: { type: Number, default: 0, min: 0 },
  freeDeliveryThresholdCents: { type: Number, default: 0, min: 0 },
  freeDeliveryApplied: { type: Boolean, default: false },
  discount: {
    type: {
      type: String,
      enum: ["percentage", "fixed", "none"],
      default: "none",
    },
    value: { type: Number, default: 0 },
  },
};

const orderLineSchema = new mongoose.Schema(
  {
    itemId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    itemNameSnapshot: { type: String, required: true },
    categoryNameSnapshot: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPriceCents: { type: Number, required: true, min: 0 },
    lineTotalCents: { type: Number, required: true, min: 0 },
    note: { type: String, default: "" },
    size: {
      priceSlotIndex: { type: Number, default: 0 },
      labelSnapshot: { type: String, default: "" },
      priceCents: { type: Number, default: 0 },
    },
    dressing: {
      groupId: { type: mongoose.Schema.Types.ObjectId, default: null },
      groupNameSnapshot: { type: String, default: "" },
      options: [
        {
          optionId: { type: mongoose.Schema.Types.ObjectId, default: null },
          labelSnapshot: { type: String, default: "" },
          priceCents: { type: Number, default: 0 },
        },
      ],
    },
    extras: [
      {
        extraId: { type: mongoose.Schema.Types.ObjectId, default: null },
        labelSnapshot: { type: String, default: "" },
        priceCents: { type: Number, default: 0 },
      },
    ],
    addons: [
      {
        addonId: { type: mongoose.Schema.Types.ObjectId, default: null },
        addonNameSnapshot: { type: String, default: "" },
        optionId: { type: mongoose.Schema.Types.ObjectId, default: null },
        optionNameSnapshot: { type: String, default: "" },
        priceCents: { type: Number, default: 0 },
      },
    ],
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    idempotencyKey: { type: String, default: "" },
    customerAccessToken: { type: String, required: true, index: true },
    restaurant: {
      restaurantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Restaurant",
        required: true,
        index: true,
      },
      usernameSnapshot: { type: String, default: "" },
      nameSnapshot: { type: String, default: "" },
      phoneSnapshot: { type: String, default: "" },
      emailSnapshot: { type: String, default: "" },
      addressSnapshot: {
        street: String,
        houseNumber: String,
        postalCode: String,
        city: String,
        country: String,
      },
    },
    customer: {
      appUserId: { type: mongoose.Schema.Types.ObjectId, ref: "AppUser", default: null, index: true },
      firstName: { type: String, default: "" },
      lastName: { type: String, default: "" },
      email: { type: String, default: "" },
      phone: { type: String, default: "" },
    },
    fulfillment: {
      mode: { type: String, enum: ["delivery", "takeaway", "dine_in"], required: true },
      fulfillmentType: {
        type: String,
        enum: ["asap", "scheduled"],
        default: "asap",
        index: true,
      },
      diningSessionId: { type: mongoose.Schema.Types.ObjectId, ref: "DiningSession", default: null, index: true },
      tableId: { type: mongoose.Schema.Types.ObjectId, ref: "DiningTable", default: null, index: true },
      tableNumberSnapshot: { type: String, default: "" },
      postalCode: { type: String, default: "" },
      requestedTime: { type: String, default: "asap" },
      requestedFor: { type: Date, default: null, index: true },
      releaseAt: { type: Date, default: null, index: true },
      kitchenReleasedAt: { type: Date, default: null },
      deliveryMinutes: { type: Number, default: 0 },
      acceptedDeliveryMinutes: { type: Number, default: null },
      acceptedEtaAt: { type: Date, default: null },
      dispatchDeliveryMinutes: { type: Number, default: null },
      dispatchEtaAt: { type: Date, default: null },
      deliveryNote: { type: String, default: "" },
      address: {
        street: { type: String, default: "" },
        postalCode: { type: String, default: "" },
        city: { type: String, default: "" },
        floor: { type: String, default: "" },
        company: { type: String, default: "" },
      },
    },
    payment: {
      method: { type: String, enum: ["cod", "paypal", "online"], default: "cod" },
      status: {
        type: String,
        enum: ["pending", "cash_on_delivery", "paid", "failed", "refunded", "refund_pending"],
        default: "pending",
      },
      refundRequestedAt: { type: Date, default: null },
      refundNote: { type: String, default: "" },
    },
    items: [orderLineSchema],
    totals: moneySnapshotSchema,
    status: {
      type: String,
      enum: [
        "pending",
        "accepted",
        "rejected",
        "preparing",
        "dispatch",
        "out_for_delivery",
        "ready_for_pickup",
        "delivered",
        "cancelled",
        "expired",
      ],
      default: "pending",
      index: true,
    },
    statusHistory: [
      {
        status: String,
        at: { type: Date, default: Date.now },
        actorType: { type: String, default: "system" },
        actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
        note: { type: String, default: "" },
        deliveryMinutes: { type: Number, default: null },
      },
    ],
    rejectReason: { type: String, default: "" },
    acceptedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    pendingExpiresAt: { type: Date, default: null, index: true },
    shiftExpiresAt: { type: Date, default: null, index: true },
    expiredAt: { type: Date, default: null },
    expiredFromStatus: { type: String, default: null },
    acceptedVia: { type: String, enum: ["manual", "auto", null], default: null },
  },
  { timestamps: true }
);

orderSchema.index(
  { "restaurant.restaurantId": 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string", $gt: "" } },
  }
);
orderSchema.index({ "restaurant.restaurantId": 1, createdAt: -1 });
orderSchema.index({ "restaurant.restaurantId": 1, status: 1, createdAt: -1 });
orderSchema.index({ status: 1, pendingExpiresAt: 1 });
orderSchema.index({ status: 1, shiftExpiresAt: 1 });
orderSchema.index({ "fulfillment.fulfillmentType": 1, "fulfillment.releaseAt": 1, status: 1 });
orderSchema.index({ "customer.appUserId": 1, createdAt: -1 });
orderSchema.index({ "customer.email": 1, createdAt: -1 });
orderSchema.index({ "fulfillment.diningSessionId": 1, createdAt: -1 });
orderSchema.index({ "items.itemId": 1, createdAt: -1 });

module.exports = mongoose.model("Order", orderSchema);
