const AdminUser = require("../modals/AdminUser");

// ✅ Get all admin users (only for superadmin and admin)
exports.getAllAdmins = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [admins, total] = await Promise.all([
      AdminUser.find().select("-password").skip(skip).limit(limit),
      AdminUser.countDocuments(),
    ]);

    res.status(200).json({
      success: true,
      message: "Admin users fetched successfully",
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalUsers: total,
      count: admins.length,
      admins,
    });
  } catch (error) {
    console.error("❌ Error fetching admin users:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.updateAdminUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { email, name, phone, isActive } = req.body;

    const adminToUpdate = await AdminUser.findById(id);
    if (!adminToUpdate) {
      return res.status(404).json({ message: "Admin user not found" });
    }

    // Optional: prevent updating yourself here if needed
    // if (req.user._id.toString() === id) { ... }

    // Only update allowed fields
    if (email !== undefined) adminToUpdate.email = email;
    if (name !== undefined) adminToUpdate.name = name;
    if (phone !== undefined) adminToUpdate.phone = phone;
    if (isActive !== undefined) adminToUpdate.isActive = isActive;

    await adminToUpdate.save();

    const sanitizedUser = adminToUpdate.toObject();
    delete sanitizedUser.password;

    res.status(200).json({
      success: true,
      message: "Admin user updated successfully",
      user: sanitizedUser,
    });
  } catch (error) {
    console.error("❌ Error updating admin user:", error);
    res.status(500).json({ message: "Server error", success: false });
  }
};

exports.getSingleAdminUser = async (req, res) => {
  try {
    const { id } = req.params;

    const adminUser = await AdminUser.findById(id).select("-password");

    if (!adminUser) {
      return res.status(404).json({
        success: false,
        message: "Admin user not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Admin user fetched successfully",
      user: adminUser,
    });
  } catch (error) {
    console.error("❌ Error fetching admin user:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
