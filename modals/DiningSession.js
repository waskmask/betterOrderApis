const mongoose = require("mongoose");

const diningGuestSchema = new mongoose.Schema(
  {
    guestId: { type: String, required: true },
    role: { type: String, enum: ["host", "guest"], default: "guest" },
    joinedAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const diningSessionSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    tableId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DiningTable",
      required: true,
      index: true,
    },
    tableNumberSnapshot: { type: String, required: true },
    status: {
      type: String,
      enum: ["open", "closed", "cancelled"],
      default: "open",
      index: true,
    },
    passcodeHash: { type: String, required: true },
    hostGuestId: { type: String, required: true },
    guests: { type: [diningGuestSchema], default: [] },
    orderIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }],
    openedAt: { type: Date, default: Date.now },
    lastActivityAt: { type: Date, default: Date.now },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

diningSessionSchema.index({ tableId: 1, status: 1, lastActivityAt: -1 });
diningSessionSchema.index({ restaurantId: 1, status: 1, lastActivityAt: -1 });

module.exports = mongoose.model("DiningSession", diningSessionSchema);
