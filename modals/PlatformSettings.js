const mongoose = require("mongoose");

const languageSlotSchema = new mongoose.Schema(
  {
    code: { type: String, default: null },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const platformSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    contentLanguages: {
      primary: {
        type: languageSlotSchema,
        default: () => ({ code: "en", isActive: true }),
      },
      secondary: {
        type: languageSlotSchema,
        default: () => ({ code: null, isActive: false }),
      },
      additional: {
        type: languageSlotSchema,
        default: () => ({ code: null, isActive: false }),
      },
    },
    // Used when Arabic (ar) is an active content language
    arabicDialect: {
      type: String,
      enum: ["msa", "egyptian", "levantine", "gulf", "maghrebi"],
      default: "msa",
    },
    /** ISO 3166-1 alpha-2 — default country for new restaurants */
    defaultCountryCode: {
      type: String,
      default: "DE",
      uppercase: true,
      trim: true,
    },
    /** Platform brand / invoicing identity */
    platformName: { type: String, default: "BetterOrder", trim: true },
    platformCountryCode: {
      type: String,
      default: "DE",
      uppercase: true,
      trim: true,
    },
    platformTaxId: { type: String, default: "", trim: true },
    platformVatNumber: { type: String, default: "", trim: true },
    /** Public support contacts shown to restaurants for KYC / legal changes */
    supportEmail: { type: String, default: "", trim: true, lowercase: true },
    supportPhone: { type: String, default: "", trim: true },
    supportWhatsapp: { type: String, default: "", trim: true },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdminUser",
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PlatformSettings", platformSettingsSchema);
