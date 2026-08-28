const AdminUser = require("../modals/AdminUser");
const { buildDiacriticInsensitiveRegex } = require("../utils/searchNormalize");

function sanitizeAdminUser(user) {
  const sanitizedUser = user.toObject ? user.toObject() : { ...user };
  delete sanitizedUser.password;
  return sanitizedUser;
}

function pushActivityLog(adminUser, { action, reset_by, reset_by_role }) {
  adminUser.password_reset_logs = adminUser.password_reset_logs?.slice(-199) || [];
  adminUser.password_reset_logs.push({
    action,
    reset_by,
    reset_by_role,
    timestamp: new Date(),
  });
}

// ✅ Get all admin users (only for superadmin and admin)
exports.getAllAdmins = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const search = req.query.search?.trim() || "";
    const order = req.query.order || "createdAt"; // default sort field
    const dir = req.query.dir === "asc" ? 1 : -1; // ascending or descending
    const status = String(req.query.status || "").toLowerCase();

    // ✅ Build MongoDB search filter
    const filter = {};

    if (search) {
      const searchRegex = buildDiacriticInsensitiveRegex(search);
      if (searchRegex) {
        filter.$or = [
          { name: { $regex: searchRegex } },
          { email: { $regex: searchRegex } },
          { role: { $regex: searchRegex } },
        ];
      }
    }

    if (status === "active") {
      filter.isActive = { $ne: false };
    } else if (status === "inactive") {
      filter.isActive = false;
    }

    // ✅ Fetch paginated and sorted data
    const [admins, total] = await Promise.all([
      AdminUser.find(filter)
        .sort({ [order]: dir })
        .select("-password")
        .skip(skip)
        .limit(limit),
      AdminUser.countDocuments(filter),
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

// ✅ update any admin user (only for superadmin and admin)
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

    res.status(200).json({
      success: true,
      message: "Admin user updated successfully",
      user: sanitizeAdminUser(adminToUpdate),
    });
  } catch (error) {
    console.error("❌ Error updating admin user:", error);
    res.status(500).json({ message: "Server error", success: false });
  }
};

// ✅ Update currently logged-in admin user's own profile
exports.updateLoggedInAdminUser = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const adminUser = await AdminUser.findById(req.user._id);
    if (!adminUser) {
      return res.status(404).json({ success: false, message: "Admin user not found" });
    }

    const { name, phone } = req.body || {};
    const namePattern = /^[\p{L}\p{M}\s'.-]+$/u;
    const phonePattern = /^[\d+\-()\s/]{5,20}$/;
    const NAME_MAX_WITHOUT_SPACES = 20;
    let profileChanged = false;

    if (typeof name === "string") {
      const trimmedName = name.trim();
      const nameWithoutSpaces = trimmedName.replace(/\s/g, "");

      if (!trimmedName || nameWithoutSpaces.length < 2) {
        return res.status(400).json({ success: false, message: "Name is required" });
      }
      if (!namePattern.test(trimmedName)) {
        return res.status(400).json({ success: false, message: "Invalid name" });
      }
      if (nameWithoutSpaces.length > NAME_MAX_WITHOUT_SPACES) {
        return res.status(400).json({
          success: false,
          message: "Name must be at most 20 characters excluding spaces",
        });
      }
      if (trimmedName !== adminUser.name) {
        if (adminUser.nameChangedAt) {
          return res.status(400).json({
            success: false,
            message: "Name can only be changed once",
          });
        }
        adminUser.name = trimmedName;
        adminUser.nameChangedAt = new Date();
        profileChanged = true;
      }
    }

    if (typeof phone === "string") {
      const trimmedPhone = phone.trim();
      if (trimmedPhone && !phonePattern.test(trimmedPhone)) {
        return res.status(400).json({ success: false, message: "Invalid phone" });
      }
      if (trimmedPhone !== (adminUser.phone || "")) {
        adminUser.phone = trimmedPhone;
        profileChanged = true;
      }
    }

    if (profileChanged) {
      pushActivityLog(adminUser, {
        action: "profile_update",
        reset_by: adminUser._id,
        reset_by_role: "self",
      });
    }

    await adminUser.save();

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: sanitizeAdminUser(adminUser),
    });
  } catch (error) {
    console.error("❌ Error updating logged-in admin user:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ✅ Get an admin user (only for superadmin and admin)
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

// ✅ Get currently logged-in admin user's profile
exports.getLoggedInAdminUser = async (req, res) => {
  try {
    // Optional: extra check if the role is restaurant, reject access
    if (
      !["admin", "superadmin", "sales", "moderator"].includes(req.user.role)
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.status(200).json({
      success: true,
      message: "Logged-in admin profile fetched successfully",
      user: sanitizeAdminUser(req.user),
    });
  } catch (error) {
    console.error("❌ Error fetching logged-in admin user:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Upload avatar for currently logged-in admin
exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!req.adminAvatarPath) {
      return res.status(400).json({ success: false, message: "No image provided" });
    }

    const adminUser = await AdminUser.findById(req.user._id);
    if (!adminUser) {
      return res.status(404).json({ success: false, message: "Admin user not found" });
    }

    adminUser.avatar = req.adminAvatarPath;
    pushActivityLog(adminUser, {
      action: "avatar_update",
      reset_by: adminUser._id,
      reset_by_role: "self",
    });
    await adminUser.save();

    return res.status(200).json({
      success: true,
      message: "Avatar updated successfully",
      user: sanitizeAdminUser(adminUser),
    });
  } catch (error) {
    console.error("❌ Error uploading admin avatar:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

function encodeActivityCursor(entry) {
  const timestamp = new Date(entry.timestamp).getTime();
  const id = entry._id ? String(entry._id) : "0";
  return Buffer.from(`${timestamp}_${id}`).toString("base64url");
}

function decodeActivityCursor(cursor) {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const [timestampPart, idPart] = raw.split("_");
    const timestamp = Number(timestampPart);
    if (!Number.isFinite(timestamp) || !idPart) return null;
    return { timestamp, id: idPart };
  } catch {
    return null;
  }
}

function sortActivityLogs(logs) {
  return [...logs]
    .filter((entry) => entry?.timestamp)
    .sort((a, b) => {
      const tb = new Date(b.timestamp).getTime();
      const ta = new Date(a.timestamp).getTime();
      if (tb !== ta) return tb - ta;
      return String(b._id || "").localeCompare(String(a._id || ""));
    });
}

async function buildSecurityActivityPage(userId, query) {
  const limitRaw = Number.parseInt(String(query.limit || "20"), 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 20;
  const cursor = typeof query.cursor === "string" ? query.cursor.trim() : "";

  const adminUser = await AdminUser.findById(userId)
    .select("password_reset_logs")
    .populate("password_reset_logs.reset_by", "name email role");
  if (!adminUser) {
    return { error: { status: 404, message: "Admin user not found" } };
  }

  const sorted = sortActivityLogs(adminUser.password_reset_logs || []);
  let startIndex = 0;

  if (cursor) {
    const decoded = decodeActivityCursor(cursor);
    if (!decoded) {
      return { error: { status: 400, message: "Invalid cursor" } };
    }

    const cursorIndex = sorted.findIndex((entry) => {
      const entryTs = new Date(entry.timestamp).getTime();
      const entryId = String(entry._id || "0");
      return entryTs === decoded.timestamp && entryId === decoded.id;
    });

    if (cursorIndex === -1) {
      return { error: { status: 400, message: "Invalid cursor" } };
    }

    startIndex = cursorIndex + 1;
  }

  const page = sorted.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < sorted.length;
  const nextCursor = hasMore && page.length > 0 ? encodeActivityCursor(page[page.length - 1]) : null;

  return {
    data: {
      success: true,
      items: page.map((entry) => {
        const resetBy = entry.reset_by;
        const resetByUser =
          resetBy && typeof resetBy === "object" && resetBy._id
            ? {
                _id: String(resetBy._id),
                name: resetBy.name || "",
                role: resetBy.role || entry.reset_by_role || "",
              }
            : resetBy
              ? { _id: String(resetBy), name: "", role: entry.reset_by_role || "" }
              : null;

        return {
          _id: entry._id,
          action: entry.action || "password_change",
          reset_by: resetByUser?._id || null,
          reset_by_role: entry.reset_by_role,
          reset_by_user: resetByUser,
          timestamp: entry.timestamp,
        };
      }),
      nextCursor,
      hasMore,
      limit,
    },
  };
}

// ✅ Cursor-paginated security activity for logged-in admin
exports.getLoggedInSecurityActivity = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const result = await buildSecurityActivityPage(req.user._id, req.query);
    if (result.error) {
      return res.status(result.error.status).json({
        success: false,
        message: result.error.message,
      });
    }

    return res.status(200).json(result.data);
  } catch (error) {
    console.error("❌ Error fetching security activity:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ✅ Superadmin-only: security activity for another admin user
exports.getAdminUserSecurityActivity = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (req.user.role !== "superadmin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, message: "Admin user id required" });
    }

    const result = await buildSecurityActivityPage(id, req.query);
    if (result.error) {
      return res.status(result.error.status).json({
        success: false,
        message: result.error.message,
      });
    }

    return res.status(200).json(result.data);
  } catch (error) {
    console.error("❌ Error fetching admin security activity:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
