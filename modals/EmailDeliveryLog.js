const mongoose = require("mongoose");

const RETENTION_DAYS = Number.parseInt(process.env.EMAIL_LOG_RETENTION_DAYS || "90", 10);

const emailDeliveryLogSchema = new mongoose.Schema(
  {
    to: { type: String, required: true, index: true },
    template: { type: String, required: true, index: true },
    lang: { type: String, enum: ["en", "de"], default: "en" },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
    appUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AppUser",
      default: null,
      index: true,
    },
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ["queued", "sent", "failed", "skipped"],
      default: "queued",
      index: true,
    },
    providerMessageId: { type: String, default: "" },
    error: { type: String, default: "" },
    outboxEventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OutboxEvent",
      default: null,
    },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

emailDeliveryLogSchema.index({ status: 1, createdAt: -1 });
emailDeliveryLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: RETENTION_DAYS * 24 * 60 * 60 }
);

module.exports = mongoose.model("EmailDeliveryLog", emailDeliveryLogSchema);
