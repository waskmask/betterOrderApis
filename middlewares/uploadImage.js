const multer = require("multer");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

// Allowed file extensions
const allowedExtensions = [".png", ".jpg", ".jpeg", ".webp"];

// 🔒 File filter
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(
      new Error("Only PNG, JPG, JPEG, and WEBP image files are allowed"),
      false
    );
  }
};

// 🧠 Configure Multer (memory storage + filter + size limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter,
});

/**
 * ✅ Image Processor Middleware
 * Converts to .webp, resizes to 1000px width, saves to uploads/YYYY/MM
 * @param {string} fieldName - `req.imagePath` will be set with saved relative path
 * @returns Middleware function
 */
const processImage = (fieldName = "imagePath") => {
  return async (req, res, next) => {
    if (!req.file) return next();

    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");

      const uploadDir = path.join(
        __dirname,
        "../uploads",
        year.toString(),
        month
      );
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const filename = `${uuidv4()}.webp`;
      const filepath = path.join(uploadDir, filename);
      const relativePath = `/uploads/${year}/${month}/${filename}`;

      await sharp(req.file.buffer)
        .resize({ width: 1000, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(filepath);

      req[fieldName] = relativePath;
      next();
    } catch (err) {
      console.error("❌ Error processing image:", err);
      return res.status(500).json({ message: "Image processing failed" });
    }
  };
};

module.exports = {
  uploadImage: upload.single("image"), // default field name: 'image'
  processImage, // use as processImage("yourFieldName")
};
