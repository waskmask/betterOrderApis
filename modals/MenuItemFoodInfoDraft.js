const mongoose = require("mongoose");

const actorUserTypes = [
  "admin",
  "restaurant-admin",
  "restaurant-user",
  "restaurant",
  "superadmin",
  "sales",
  "moderator",
  "system",
  "ai",
];

const draftSourceTypes = ["ai", "seller", "admin", "import", "hybrid"];
const draftStatusTypes = ["draft", "approved", "rejected", "superseded"];

const actorSnapshotSchema = new mongoose.Schema(
  {
    userType: {
      type: String,
      enum: actorUserTypes,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    nameSnapshot: {
      type: String,
      trim: true,
      default: "",
    },
    roleSnapshot: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false }
);

const foodInfoEntrySchema = new mongoose.Schema(
  {
    code: {
      type: String,
      trim: true,
      default: "",
    },
    label: {
      type: String,
      trim: true,
      required: true,
    },
    children: {
      type: [String],
      default: [],
    },
    note: {
      type: String,
      trim: true,
      default: "",
    },
    index: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { _id: true }
);

const localizedFoodInfoEntriesSchema = new mongoose.Schema(
  {
    en: {
      type: [foodInfoEntrySchema],
      default: [],
    },
    de: {
      type: [foodInfoEntrySchema],
      default: [],
    },
  },
  { _id: false }
);

const localizedLabelSchema = new mongoose.Schema(
  {
    en: {
      type: String,
      trim: true,
      default: "",
    },
    de: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false }
);

const verificationLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ["approved", "rejected", "unverified", "updated"],
      required: true,
    },
    actor: {
      type: actorSnapshotSchema,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    draftId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    note: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: true }
);

const sectionVerificationSchema = new mongoose.Schema(
  {
    isVerified: {
      type: Boolean,
      default: false,
    },
    sellerReadAt: {
      type: Date,
      default: null,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    verifiedBy: {
      type: actorSnapshotSchema,
      default: null,
    },
    verificationNote: {
      type: String,
      trim: true,
      default: "",
    },
    approvalLogs: {
      type: [verificationLogSchema],
      default: [],
    },
  },
  { _id: false }
);

const liveFoodInfoSectionSchema = new mongoose.Schema(
  {
    entries: {
      type: localizedFoodInfoEntriesSchema,
      default: () => ({ en: [], de: [] }),
    },
    source: {
      type: String,
      enum: draftSourceTypes,
      default: "seller",
    },
    isSafeForDisplay: {
      type: Boolean,
      default: false,
    },
    lastEditedAt: {
      type: Date,
      default: null,
    },
    lastEditedBy: {
      type: actorSnapshotSchema,
      default: null,
    },
    lastApprovedDraftId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    verification: {
      type: sectionVerificationSchema,
      default: () => ({
        isVerified: false,
        sellerReadAt: null,
        verifiedAt: null,
        verifiedBy: null,
        verificationNote: "",
        approvalLogs: [],
      }),
    },
  },
  { _id: false }
);

const liveCustomFoodInfoSectionSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    label: {
      type: localizedLabelSchema,
      default: () => ({ en: "", de: "" }),
    },
    section: {
      type: liveFoodInfoSectionSchema,
      default: () => ({
        entries: { en: [], de: [] },
        source: "seller",
        isSafeForDisplay: false,
        lastEditedAt: null,
        lastEditedBy: null,
        lastApprovedDraftId: null,
        verification: {
          isVerified: false,
          sellerReadAt: null,
          verifiedAt: null,
          verifiedBy: null,
          verificationNote: "",
          approvalLogs: [],
        },
      }),
    },
  },
  { _id: true }
);

const draftCustomSectionSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    label: {
      type: localizedLabelSchema,
      default: () => ({ en: "", de: "" }),
    },
    entries: {
      type: localizedFoodInfoEntriesSchema,
      default: () => ({ en: [], de: [] }),
    },
  },
  { _id: true }
);

const menuItemFoodInfoDraftSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["food_info"],
      default: "food_info",
      required: true,
    },
    version: {
      type: Number,
      required: true,
      default: 1,
    },
    supersedes: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItemFoodInfoDraft",
      default: null,
    },
    source: {
      type: String,
      enum: draftSourceTypes,
      default: "ai",
      required: true,
    },
    status: {
      type: String,
      enum: draftStatusTypes,
      default: "draft",
      required: true,
      index: true,
    },
    isSafeForDisplay: {
      type: Boolean,
      default: false,
    },
    draft: {
      allergens: {
        type: localizedFoodInfoEntriesSchema,
        default: () => ({ en: [], de: [] }),
      },
      additives: {
        type: localizedFoodInfoEntriesSchema,
        default: () => ({ en: [], de: [] }),
      },
      custom_sections: {
        type: [draftCustomSectionSchema],
        default: [],
      },
    },
    rawInput: {
      item_name: {
        type: String,
        trim: true,
        default: "",
      },
      description: {
        type: String,
        trim: true,
        default: "",
      },
      sourceText: {
        type: String,
        trim: true,
        default: "",
      },
    },
    generationMeta: {
      provider: {
        type: String,
        trim: true,
        default: "openai",
      },
      model: {
        type: String,
        trim: true,
        default: "",
      },
      promptVersion: {
        type: String,
        trim: true,
        default: "v1",
      },
      inputSource: {
        type: String,
        trim: true,
        default: "",
      },
      confidence: {
        type: Number,
        default: null,
      },
      temperature: {
        type: Number,
        default: null,
      },
      imageUsed: {
        type: Boolean,
        default: false,
      },
      tokensInput: {
        type: Number,
        default: null,
      },
      tokensOutput: {
        type: Number,
        default: null,
      },
      latencyMs: {
        type: Number,
        default: null,
      },
    },
    createdBy: {
      type: actorSnapshotSchema,
      default: null,
    },
    approvedBy: {
      type: actorSnapshotSchema,
      default: null,
    },
    rejectedBy: {
      type: actorSnapshotSchema,
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    reviewReason: {
      type: String,
      trim: true,
      default: "",
    },
    internalNotes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

menuItemFoodInfoDraftSchema.index(
  { restaurantId: 1, categoryId: 1, itemId: 1, type: 1, version: -1 },
  { name: "menu_item_food_info_version_lookup" }
);

menuItemFoodInfoDraftSchema.index(
  { restaurantId: 1, categoryId: 1, itemId: 1, type: 1, status: 1, createdAt: -1 },
  { name: "menu_item_food_info_status_lookup" }
);

const MenuItemFoodInfoDraft = mongoose.model(
  "MenuItemFoodInfoDraft",
  menuItemFoodInfoDraftSchema
);

module.exports = {
  actorUserTypes,
  actorSnapshotSchema,
  foodInfoEntrySchema,
  localizedFoodInfoEntriesSchema,
  localizedLabelSchema,
  verificationLogSchema,
  sectionVerificationSchema,
  liveFoodInfoSectionSchema,
  liveCustomFoodInfoSectionSchema,
  MenuItemFoodInfoDraft,
};
