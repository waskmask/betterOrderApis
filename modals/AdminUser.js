const mongoose = require("mongoose");

const adminUserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true }, // Hashed
    role: { type: String, enum: ["superadmin", "admin", "sales", "moderator"] },
    phone: { type: String },
    avatar: { type: String, default: "" },
    nameChangedAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    tokenVersion: { type: Number, default: 0 },
    password_reset_logs: [
      {
        action: {
          type: String,
          enum: ["password_change", "profile_update", "avatar_update"],
          default: "password_change",
        },
        reset_by: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "AdminUser",
        },
        reset_by_role: { type: String, enum: ["admin", "superadmin", "self"] },
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("AdminUser", adminUserSchema);
