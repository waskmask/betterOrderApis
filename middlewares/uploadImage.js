const multer = require("multer");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { uploadBuffer, isR2Configured } = require("../utils/r2Storage");

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
const createUpload = (fileSize = 2 * 1024 * 1024) => multer({
  storage: multer.memoryStorage(),
  limits: { fileSize },
  fileFilter,
});

const upload = createUpload();
const largeUpload = createUpload(10 * 1024 * 1024);

/**
 * ✅ Image Processor Middleware
 * Converts to .webp, resizes, saves to R2 when configured or local uploads/YYYY/MM.
 * @param {string} fieldName - `req.imagePath` will be set with saved relative path
 * @returns Middleware function
 */
const processImage = (options = "imagePath") => {
  const normalizedOptions =
    typeof options === "string"
      ? { fieldName: options, maxWidth: 1000, webpQuality: 80 }
      : {
          fieldName: options.fieldName || "imagePath",
          maxWidth: options.maxWidth || 1000,
          webpQuality: options.webpQuality || 80,
        };

  return async (req, res, next) => {
    if (!req.file) return next();

    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");

      const filename = `${uuidv4()}.webp`;
      const key = `uploads/${year}/${month}/${filename}`;
      const relativePath = `/uploads/${year}/${month}/${filename}`;

      const outputBuffer = await sharp(req.file.buffer)
        .resize({
          width: normalizedOptions.maxWidth,
          withoutEnlargement: true,
        })
        .webp({ quality: normalizedOptions.webpQuality })
        .toBuffer();

      if (isR2Configured()) {
        await uploadBuffer({
          buffer: outputBuffer,
          key,
          contentType: "image/webp",
        });
      } else {
        const uploadDir = path.join(
          __dirname,
          "../uploads",
          year.toString(),
          month
        );
        const filepath = path.join(uploadDir, filename);
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        await fs.promises.writeFile(filepath, outputBuffer);
      }

      req[normalizedOptions.fieldName] = relativePath;
      next();
    } catch (err) {
      console.error("❌ Error processing image:", err);
      return res.status(500).json({ message: "Image processing failed" });
    }
  };
};

module.exports = {
  uploadImage: upload.single("image"), // default field name: 'image'
  uploadLargeImage: largeUpload.single("image"),
  processImage, // use as processImage("yourFieldName")
};
