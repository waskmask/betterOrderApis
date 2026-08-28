const mongoose = require("mongoose");

const outboxEventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["print.enqueue", "push.restaurant", "customer.notify", "sse.broadcast"],
      required: true,
      index: true,
    },
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      default: null,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ["pending", "processing", "done", "failed"],
      default: "pending",
      index: true,
    },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 8 },
    availableAt: { type: Date, default: Date.now, index: true },
    processedAt: { type: Date, default: null },
    lastError: { type: String, default: "" },
    idempotencyKey: { type: String, default: "" },
  },
  { timestamps: true }
);

outboxEventSchema.index(
  { idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string", $gt: "" } },
  }
);
outboxEventSchema.index({ status: 1, availableAt: 1, createdAt: 1 });

module.exports = mongoose.model("OutboxEvent", outboxEventSchema);
