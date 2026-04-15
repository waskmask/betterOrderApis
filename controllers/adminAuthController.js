const AdminUser = require("../modals/AdminUser");
const bcrypt = require("bcryptjs");
const generateToken = require("../utils/generateToken");

// Register Admin
exports.register = async (req, res) => {
  try {
    const { name, email, password, phone, role, isActive } = req.body;

    const userExists = await AdminUser.findOne({ email });
    if (userExists)
      return res.status(400).json({ message: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await AdminUser.create({
      name,
      email,
      password: hashedPassword,
      phone,
      role,
      isActive,
    });

    res
      .status(201)
      .json({ success: true, message: "Admin user created", id: user._id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Login Admin
// exports.login = async (req, res) => {
//   const user = req.user;
//   const token = generateToken(user);
//   const sanitizedUser = user.toObject();
//   delete sanitizedUser.password;
//   res
//     .status(200)
//     .json({ message: "Login successful", token, user: sanitizedUser });
// };

exports.login = async (req, res) => {
  const user = req.user;

  const token = generateToken(user);
  const sanitizedUser = user.toObject();
  delete sanitizedUser.password;

  // ✅ Set secure cookie
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  res.status(200).json({
    success: true,
    message: "Login successful",
    token, // still useful for Postman/mobile
    user: sanitizedUser,
  });
};

// Change password
exports.changePassword = async (req, res, next) => {
  try {
    const { userId, newPassword } = req.body;
    const requester = req.user;

    console.log("🔐 Incoming admin password change request");
    console.log("🧑‍💼 Requester:", requester.email);
    console.log("📛 Role:", requester.role);
    console.log("🎯 Target User ID:", userId);

    const targetUser = await AdminUser.findById(userId);
    if (!targetUser) {
      console.log("❌ Admin user not found");
      return res.status(404).json({ message: "User not found" });
    }

    const isSelf = requester._id.toString() === userId;
    const isAllowedAdmin = ["superadmin", "admin"].includes(requester.role);

    // ✅ Only allow self OR superadmin/admin to change password
    if (!isSelf && !isAllowedAdmin) {
      console.log("❌ Not authorized to change this password");
      return res
        .status(403)
        .json({ message: "Not authorized to change this password" });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    targetUser.password = hashed;

    // 🔁 Invalidate all previous tokens
    targetUser.tokenVersion += 1;

    // 📝 (Optional) Audit log example — add this if needed
    const logEntry = {
      reset_by: requester._id,
      reset_by_role: isSelf ? "self" : requester.role,
      timestamp: new Date(),
    };

    // Keep last 19, add this — if you want similar logging
    targetUser.password_reset_logs =
      targetUser.password_reset_logs?.slice(-19) || [];
    targetUser.password_reset_logs.push(logEntry);

    await targetUser.save();

    const msg = isSelf
      ? "Your password has been updated"
      : "Password changed by admin";

    console.log("✅ Password updated successfully");
    return res.status(200).json({ message: msg, success: true });
  } catch (err) {
    console.error("❌ Error changing password:", err);
    next(err);
  }
};
