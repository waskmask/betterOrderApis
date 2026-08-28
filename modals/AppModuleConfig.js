const mongoose = require("mongoose");

const moduleFlagSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: true },
    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "AdminUser", default: null },
  },
  { _id: false }
);

const appModuleConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    modules: {
      delivery: { type: moduleFlagSchema, default: () => ({ enabled: true }) },
      takeaway: { type: moduleFlagSchema, default: () => ({ enabled: true }) },
      dineIn: { type: moduleFlagSchema, default: () => ({ enabled: true }) },
      tableQr: { type: moduleFlagSchema, default: () => ({ enabled: true }) },
      foodInfo: { type: moduleFlagSchema, default: () => ({ enabled: true }) },
      postalCodeSearch: { type: moduleFlagSchema, default: () => ({ enabled: true }) },
      googleAddress: { type: moduleFlagSchema, default: () => ({ enabled: true }) },
      onlinePayment: { type: moduleFlagSchema, default: () => ({ enabled: false }) },
      reviews: { type: moduleFlagSchema, default: () => ({ enabled: false }) },
      marketingEmails: { type: moduleFlagSchema, default: () => ({ enabled: true }) },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AppModuleConfig", appModuleConfigSchema);
