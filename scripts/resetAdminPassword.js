/**
 * One-off: reset an AdminUser password by email (or first superadmin).
 *
 * Usage:
 *   node scripts/resetAdminPassword.js
 *   node scripts/resetAdminPassword.js --email you@example.com --password "NewPass123!"
 *
 * If --password is omitted, a temporary password is generated and printed once.
 */
require("dotenv").config();
const crypto = require("crypto");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const AdminUser = require("../modals/AdminUser");

function arg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

function generateTempPassword() {
  return `Bo!${crypto.randomBytes(6).toString("base64url")}`;
}

(async () => {
  const email = arg("email");
  const newPassword = arg("password") || generateTempPassword();

  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI missing in .env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });

  let user;
  if (email) {
    user = await AdminUser.findOne({ email: email.toLowerCase().trim() });
  } else {
    user = await AdminUser.findOne({ role: "superadmin", isActive: true });
    if (!user) user = await AdminUser.findOne({ role: "superadmin" });
  }

  if (!user) {
    const all = await AdminUser.find()
      .select("name email role isActive")
      .lean();
    console.error("No matching admin user found. Existing admins:");
    console.error(JSON.stringify(all, null, 2));
    await mongoose.disconnect();
    process.exit(1);
  }

  user.password = await bcrypt.hash(newPassword, 10);
  user.isActive = true;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  user.password_reset_logs = (user.password_reset_logs || []).slice(-199);
  user.password_reset_logs.push({
    action: "password_change",
    reset_by: user._id,
    reset_by_role: "self",
    timestamp: new Date(),
  });
  await user.save();

  const matches = await bcrypt.compare(newPassword, user.password);
  if (!matches) {
    console.error("Password hash verification failed after save");
    process.exit(1);
  }

  console.log("Password reset OK");
  console.log(`  email: ${user.email}`);
  console.log(`  role:  ${user.role}`);
  console.log(`  name:  ${user.name}`);
  console.log(`  isActive: ${user.isActive}`);
  console.log(`  temp password: ${newPassword}`);
  console.log("Log in at admin-next-v1, then change password from account settings.");

  await mongoose.disconnect();
})().catch(async (err) => {
  console.error(err.message || err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
