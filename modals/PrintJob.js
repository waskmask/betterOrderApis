const mongoose = require("mongoose");

const printJobSchema = new mongoose.Schema(
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
      index: true,
    },
    orderNumber: { type: String, required: true },
    idempotencyKey: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["pending", "sent", "failed"],
      default: "pending",
      index: true,
    },
    printRole: {
      type: String,
      enum: ["KITCHEN", "RECEIPT", "BAR"],
      default: "KITCHEN",
      index: true,
    },
    printerKey: { type: String, default: "default", index: true },
    printerName: { type: String, default: "" },
    printerTarget: {
      key: { type: String, default: "" },
      name: { type: String, default: "" },
      roles: { type: [String], default: ["KITCHEN"] },
      connection: {
        type: { type: String, default: "tcp" },
        host: { type: String, default: "" },
        port: { type: mongoose.Schema.Types.Mixed, default: 9100 },
        baudRate: { type: Number, default: 9600 },
        printerName: { type: String, default: "" },
      },
      connectionType: { type: String, default: "network" },
      host: { type: String, default: "" },
      port: { type: Number, default: 9100 },
      serialPort: { type: String, default: "" },
      windowsPrinterName: { type: String, default: "" },
      baudRate: { type: Number, default: 9600 },
      copies: { type: Number, default: 1 },
    },
    payloadBase64: { type: String, required: true },
    copies: { type: Number, default: 1, min: 1, max: 3 },
    retryCount: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 5 },
    lastError: { type: String, default: "" },
    sentAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    claimedAt: { type: Date, default: null },
    source: { type: String, enum: ["accept", "reprint"], default: "accept" },
  },
  { timestamps: true }
);

printJobSchema.index({ restaurantId: 1, status: 1, createdAt: 1 });
printJobSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model("PrintJob", printJobSchema);
