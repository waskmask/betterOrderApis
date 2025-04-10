const { Restaurant } = require("../modals/Restaurant");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// restaurant login
// exports.login = async (req, res, next) => {
//   try {
//     const { email, password } = req.body;

//     const restaurant = await Restaurant.findOne({ email });
//     if (!restaurant || !restaurant.isActive) {
//       return res
//         .status(404)
//         .json({ message: "Restaurant not found or inactive" });
//     }

//     const isMatch = await bcrypt.compare(password, restaurant.password);
//     if (!isMatch) {
//       return res.status(401).json({ message: "Incorrect password" });
//     }

//     // ✅ Generate token right here
//     const token = jwt.sign(
//       {
//         id: restaurant._id,
//         email: restaurant.email,
//         role: "restaurant",
//         tokenVersion: restaurant.tokenVersion,
//       },
//       process.env.JWT_SECRET,
//       { expiresIn: "7d" }
//     );

//     const { password: _, ...restaurantData } = restaurant.toObject();

//     res.status(200).json({
//       message: "Login successful",
//       token,
//       restaurant: restaurantData,
//     });
//   } catch (error) {
//     next(error);
//   }
// };
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const restaurant = await Restaurant.findOne({ email });
    if (!restaurant || !restaurant.isActive) {
      return res
        .status(404)
        .json({ message: "Restaurant not found or inactive" });
    }

    const isMatch = await bcrypt.compare(password, restaurant.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Incorrect password" });
    }

    const token = jwt.sign(
      {
        id: restaurant._id,
        email: restaurant.email,
        role: "restaurant",
        tokenVersion: restaurant.tokenVersion,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const { password: _, ...restaurantData } = restaurant.toObject();

    // ✅ Set token in HttpOnly cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      message: "Login successful",
      token, // for Postman
      restaurant: restaurantData,
    });
  } catch (error) {
    next(error);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { restaurantId, newPassword } = req.body;
    const requester = req.user;

    console.log("🔐 Incoming password change request");
    console.log("🧑‍💼 Logged-in user:", requester?.email || requester?.username);
    console.log("📛 Role:", requester.role);
    console.log("🔍 restaurantId (from body):", restaurantId);
    console.log("🆔 requester._id:", requester._id.toString());
    console.log("🔐 Token Version (from token):", requester.tokenVersion);

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      console.log("❌ Restaurant not found");
      return res.status(404).json({ message: "Restaurant not found" });
    }

    const isSuperAdmin = requester.role === "superadmin";

    // ✅ Only allow self if tokenVersion matches
    const isSelf =
      requester.role === "restaurant" &&
      requester._id.toString() === restaurantId &&
      requester.tokenVersion === restaurant.tokenVersion;

    if (!isSuperAdmin && !isSelf) {
      console.log("❌ Not authorized to change this password");
      return res
        .status(403)
        .json({ message: "Not authorized to change password" });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    restaurant.password = hashed;

    // 🔁 Invalidate old tokens
    restaurant.tokenVersion += 1;

    // 📝 Audit log
    const newLogEntry = {
      reset_by: req.user._id,
      reset_by_role: req.user.role === "restaurant" ? "self" : req.user.role,
      timestamp: new Date(),
    };

    // 🧹 Keep only the last 19 entries and add this one as the 20th
    restaurant.password_reset_logs = restaurant.password_reset_logs.slice(-19);
    restaurant.password_reset_logs.push(newLogEntry);

    await restaurant.save();

    console.log("✅ Password updated successfully");
    return res.status(200).json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("❌ Error changing password:", err);
    next(err);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { restaurantId, newPassword } = req.body;

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant)
      return res.status(404).json({ message: "Restaurant not found" });

    const hashed = await bcrypt.hash(newPassword, 10);
    restaurant.password = hashed;

    restaurant.tokenVersion += 1;

    const newLogEntry = {
      reset_by: req.user._id,
      reset_by_role: req.user.role === "restaurant" ? "self" : req.user.role,
      timestamp: new Date(),
    };

    // 🧹 Keep only the last 19 entries and add this one as the 20th
    restaurant.password_reset_logs = restaurant.password_reset_logs.slice(-19);
    restaurant.password_reset_logs.push(newLogEntry);

    await restaurant.save();

    res.status(200).json({ message: "Password reset by superadmin" });
  } catch (err) {
    next(err);
  }
};
