const errorHandler = (err, req, res, next) => {
  // Handle Multer file size error
  if (err.message && err.message.includes("File too large")) {
    return res
      .status(400)
      .json({ success: false, message: "File too large. Max 2MB allowed." });
  }

  // Handle Multer extension error
  if (
    err.message &&
    err.message.includes(
      "Only PNG, JPG, JPEG, and WEBP image files are allowed"
    )
  ) {
    return res.status(400).json({ success: false, message: err.message });
  }

  // General fallback
  console.error("🔥 Global Error:", err.stack);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Global Error",
  });
};

module.exports = errorHandler;
