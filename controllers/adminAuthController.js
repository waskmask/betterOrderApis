const AdminUser = require("../modals/AdminUser");
const bcrypt = require("bcryptjs");
const generateToken = require("../utils/generateToken");

// Register Admin
exports.register = async (req, res) => {
  try {
    const { name, email, password, phone, role } = req.body;

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
    });

    res.status(201).json({ message: "Admin user created", id: user._id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Login Admin
exports.login = async (req, res) => {
  const user = req.user;
  const token = generateToken(user);
  const sanitizedUser = user.toObject();
  delete sanitizedUser.password;
  res
    .status(200)
    .json({ message: "Login successful", token, user: sanitizedUser });
};

// Change password
exports.changePassword = async (req, res, next) => {
  try {
    const { userId, newPassword } = req.body;
    const requester = req.user;

    // If user is changing their own password
    if (
      requester._id.toString() === userId ||
      requester.role === "superadmin"
    ) {
      const user = await AdminUser.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const hashed = await bcrypt.hash(newPassword, 10);
      user.password = hashed;
      await user.save();

      const msg =
        requester._id.toString() === userId
          ? "Your password has been updated"
          : "Password changed by superadmin";

      return res.status(200).json({ message: msg });
    }

    return res
      .status(403)
      .json({ message: "Not authorized to change this password" });
  } catch (err) {
    next(err);
  }
};
