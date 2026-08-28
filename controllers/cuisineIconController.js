const path = require("path");
const multer = require("multer");
const Cuisine = require("../modals/Cuisine");
const {
  getActiveContentLanguageCodes,
  getPrimaryContentLanguageCode,
  serializeCuisine,
} = require("../utils/cuisineI18n");
const {
  saveRasterIcon,
  prepareCuisineIconPreview,
  replaceCuisineIcon,
  clearCuisineIcon,
} = require("../utils/cuisineIconStorage");
const { generateCuisineImageIcon } = require("../services/cuisineIconAiService");

const iconUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const allowed = [".png", ".jpg", ".jpeg", ".webp"];
    if (allowed.includes(ext)) {
      cb(null, true);
      return;
    }
    cb(new Error("Only PNG, JPG, JPEG, and WEBP files are allowed"));
  },
}).single("icon");

function runIconUpload(req, res) {
  return new Promise((resolve, reject) => {
    iconUpload(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function decodeImagePayload(body = {}) {
  const raw = body.imageBase64 || body.webpBase64 || body.pngBase64 || "";
  if (!raw || typeof raw !== "string") return null;
  const cleaned = raw.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "").trim();
  if (!cleaned) return null;
  try {
    return Buffer.from(cleaned, "base64");
  } catch {
    return null;
  }
}

async function serializeOne(cuisine) {
  const primaryCode = await getPrimaryContentLanguageCode();
  const activeCodes = await getActiveContentLanguageCodes();
  return serializeCuisine(cuisine, primaryCode, activeCodes);
}

exports.previewGenerateCuisineIcon = async (req, res, next) => {
  try {
    const { name, languageCode } = req.body || {};
    const result = await generateCuisineImageIcon({ name, languageCode });
    const webpBuffer = await prepareCuisineIconPreview(result.pngBuffer);
    const imageBase64 = webpBuffer.toString("base64");

    res.status(200).json({
      success: true,
      imageBase64,
      mimeType: "image/webp",
      dataUrl: `data:image/webp;base64,${imageBase64}`,
      model: result.model,
      quality: result.quality,
      size: result.size,
      languageCode: result.languageCode,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }
    next(err);
  }
};

exports.commitCuisineIcon = async (req, res, next) => {
  try {
    const contentType = String(req.headers["content-type"] || "");
    let nextPath = "";

    const cuisine = await Cuisine.findById(req.params.id);
    if (!cuisine) {
      return res.status(404).json({ success: false, message: "Cuisine not found" });
    }

    if (contentType.includes("multipart/form-data")) {
      try {
        await runIconUpload(req, res);
      } catch (uploadErr) {
        return res.status(400).json({
          success: false,
          message: uploadErr.message || "invalid_upload",
        });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, message: "icon_required" });
      }

      nextPath = await saveRasterIcon(req.file.buffer);
    } else {
      const buffer = decodeImagePayload(req.body);
      if (!buffer) {
        return res.status(400).json({ success: false, message: "icon_required" });
      }
      nextPath = await saveRasterIcon(buffer);
    }

    await replaceCuisineIcon(cuisine, nextPath);
    const serialized = await serializeOne(cuisine);

    res.status(200).json({
      success: true,
      message: "Cuisine icon updated",
      cuisine: serialized,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }
    next(err);
  }
};

exports.deleteCuisineIcon = async (req, res, next) => {
  try {
    const cuisine = await Cuisine.findById(req.params.id);
    if (!cuisine) {
      return res.status(404).json({ success: false, message: "Cuisine not found" });
    }

    await clearCuisineIcon(cuisine);
    const serialized = await serializeOne(cuisine);

    res.status(200).json({
      success: true,
      message: "Cuisine icon removed",
      cuisine: serialized,
    });
  } catch (err) {
    next(err);
  }
};
