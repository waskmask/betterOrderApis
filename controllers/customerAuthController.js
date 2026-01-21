const Customer = require("../modals/Customer");
const bcrypt = require("bcryptjs");
const generateToken = require("../utils/generateToken");
const crypto = require("crypto");

// Register Customer
exports.register = async (req, res, next) => {
  try {
    const { firstname, surname, email, password, phone, companyName } =
      req.body;

    // Check if customer already exists
    const customerExists = await Customer.findOne({ email });
    if (customerExists) {
      return res.status(400).json({ message: "Email already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationTokenExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    // Create customer
    const customer = await Customer.create({
      firstname,
      surname,
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      phone,
      companyName,
      verificationToken,
      verificationTokenExpiry,
      isEmailVerified: false,
    });

    // TODO: Send verification email with token
    // For now, we'll return the token in development
    const token = generateToken({
      _id: customer._id,
      email: customer.email,
      role: "customer",
      tokenVersion: customer.tokenVersion,
    });

    const sanitizedCustomer = customer.toObject();
    delete sanitizedCustomer.password;
    delete sanitizedCustomer.verificationToken;
    delete sanitizedCustomer.passwordResetToken;

    // Set cookie
    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(201).json({
      success: true,
      message: "Customer registered successfully. Please verify your email.",
      token,
      customer: sanitizedCustomer,
      verificationToken: process.env.NODE_ENV === "development" ? verificationToken : undefined,
    });
  } catch (error) {
    next(error);
  }
};

// Login Customer
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Find customer
    const customer = await Customer.findOne({ email: email.toLowerCase().trim() });
    if (!customer) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Check if account is active
    if (!customer.isActive) {
      return res.status(403).json({ message: "Account is inactive" });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, customer.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Generate token
    const token = generateToken({
      _id: customer._id,
      email: customer.email,
      role: "customer",
      tokenVersion: customer.tokenVersion,
    });

    const sanitizedCustomer = customer.toObject();
    delete sanitizedCustomer.password;
    delete sanitizedCustomer.verificationToken;
    delete sanitizedCustomer.passwordResetToken;

    // Set cookie
    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      customer: sanitizedCustomer,
    });
  } catch (error) {
    next(error);
  }
};

// Logout Customer
exports.logout = async (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    path: "/",
  });

  res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
};

// Get Current Customer
exports.getMe = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.user._id).select(
      "-password -verificationToken -passwordResetToken"
    );

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    res.status(200).json({
      success: true,
      customer,
    });
  } catch (error) {
    next(error);
  }
};

// Change Password
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const customer = await Customer.findById(req.user._id);

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, customer.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    customer.password = hashedPassword;

    // Invalidate all previous tokens
    customer.tokenVersion += 1;

    // Add to password reset logs
    const logEntry = {
      reset_by: "self",
      timestamp: new Date(),
    };

    customer.password_reset_logs =
      customer.password_reset_logs?.slice(-19) || [];
    customer.password_reset_logs.push(logEntry);

    await customer.save();

    res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    next(error);
  }
};

// Request Password Reset
exports.requestPasswordReset = async (req, res, next) => {
  try {
    const { email } = req.body;

    const customer = await Customer.findOne({ email: email.toLowerCase().trim() });
    if (!customer) {
      // Don't reveal if email exists for security
      return res.status(200).json({
        success: true,
        message: "If the email exists, a password reset link has been sent",
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = Date.now() + 60 * 60 * 1000; // 1 hour

    customer.passwordResetToken = resetToken;
    customer.passwordResetTokenExpiry = resetTokenExpiry;
    await customer.save();

    // TODO: Send password reset email with token
    // For now, we'll return the token in development
    res.status(200).json({
      success: true,
      message: "If the email exists, a password reset link has been sent",
      resetToken: process.env.NODE_ENV === "development" ? resetToken : undefined,
    });
  } catch (error) {
    next(error);
  }
};

// Reset Password
exports.resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    const customer = await Customer.findOne({
      passwordResetToken: token,
      passwordResetTokenExpiry: { $gt: Date.now() },
    });

    if (!customer) {
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    customer.password = hashedPassword;
    customer.passwordResetToken = undefined;
    customer.passwordResetTokenExpiry = undefined;

    // Invalidate all previous tokens
    customer.tokenVersion += 1;

    // Add to password reset logs
    const logEntry = {
      reset_by: "self",
      timestamp: new Date(),
    };

    customer.password_reset_logs =
      customer.password_reset_logs?.slice(-19) || [];
    customer.password_reset_logs.push(logEntry);

    await customer.save();

    res.status(200).json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    next(error);
  }
};

// Verify Email
exports.verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.params;

    const customer = await Customer.findOne({
      verificationToken: token,
      verificationTokenExpiry: { $gt: Date.now() },
    });

    if (!customer) {
      return res.status(400).json({ message: "Invalid or expired verification token" });
    }

    customer.isEmailVerified = true;
    customer.verificationToken = undefined;
    customer.verificationTokenExpiry = undefined;
    await customer.save();

    res.status(200).json({
      success: true,
      message: "Email verified successfully",
    });
  } catch (error) {
    next(error);
  }
};


