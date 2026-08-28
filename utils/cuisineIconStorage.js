const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const { v4: uuidv4 } = require("uuid");
const { uploadBuffer, isR2Configured, deleteObjectByRelativePath } = require("./r2Storage");

/** Final stored icon height; width is derived from 4:3. */
const ICON_HEIGHT = Number(process.env.CUISINE_ICON_HEIGHT || process.env.CUISINE_ICON_SIZE || 120);
const ICON_WIDTH = Number(
  process.env.CUISINE_ICON_WIDTH || Math.round(ICON_HEIGHT * (4 / 3))
);
/** Preview height — keep larger so modal preview stays sharp. */
const PREVIEW_HEIGHT = Number(process.env.CUISINE_ICON_PREVIEW_HEIGHT || 384);
const PREVIEW_WIDTH = Number(
  process.env.CUISINE_ICON_PREVIEW_WIDTH || Math.round(PREVIEW_HEIGHT * (4 / 3))
);
/** Subject fill of the 4:3 canvas (0.95 = ~5% breathing room; never crop). */
const SUBJECT_FILL = Number(process.env.CUISINE_ICON_SUBJECT_FILL || 0.95);

/** @deprecated square helper — prefer ICON_WIDTH/ICON_HEIGHT */
const ICON_SIZE = ICON_HEIGHT;
const PREVIEW_SIZE = PREVIEW_HEIGHT;

function buildUploadPaths(extension) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const filename = `${uuidv4()}.${extension}`;
  const key = `uploads/${year}/${month}/${filename}`;
  const relativePath = `/uploads/${year}/${month}/${filename}`;
  return { key, relativePath, year, month, filename };
}

async function writeUploadBuffer(buffer, key, relativePath, contentType) {
  if (isR2Configured()) {
    await uploadBuffer({ buffer, key, contentType });
    return relativePath;
  }

  const parts = relativePath.replace(/^\/+/, "").split("/");
  const year = parts[1];
  const month = parts[2];
  const filename = parts[3];

  const uploadDir = path.join(__dirname, "../uploads", year, month);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  await fs.promises.writeFile(path.join(uploadDir, filename), buffer);
  return relativePath;
}

/**
 * Trim to opaque content, then fit the full subject into a 4:3 canvas.
 * Uses contain (not cover) so corners are never cropped; SUBJECT_FILL leaves
 * a centered margin (default ~95%).
 */
async function normalizeCuisineIconBuffer(
  inputBuffer,
  width = ICON_WIDTH,
  height = ICON_HEIGHT
) {
  const fill = Math.min(1, Math.max(0.5, SUBJECT_FILL));
  const targetW = Math.max(1, Math.round(width * fill));
  const targetH = Math.max(1, Math.round(height * fill));

  let trimmed;
  try {
    trimmed = await sharp(inputBuffer, { failOn: "none" })
      .ensureAlpha()
      .rotate()
      .trim({ threshold: 12 })
      .png()
      .toBuffer();
  } catch {
    trimmed = await sharp(inputBuffer, { failOn: "none" })
      .ensureAlpha()
      .rotate()
      .png()
      .toBuffer();
  }

  // Fit entire subject inside the target frame — no cropping, centered.
  const fitted = await sharp(trimmed)
    .resize(targetW, targetH, {
      fit: "contain",
      position: "centre",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .png()
    .toBuffer();

  if (fill >= 0.999) {
    return sharp(fitted)
      .webp({ quality: 90, alphaQuality: 100 })
      .toBuffer();
  }

  const left = Math.floor((width - targetW) / 2);
  const top = Math.floor((height - targetH) / 2);

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: fitted, left, top }])
    .webp({ quality: 90, alphaQuality: 100 })
    .toBuffer();
}

async function saveRasterIcon(inputBuffer) {
  const outputBuffer = await normalizeCuisineIconBuffer(inputBuffer);
  const { key, relativePath } = buildUploadPaths("webp");
  await writeUploadBuffer(outputBuffer, key, relativePath, "image/webp");
  return relativePath;
}

/** Normalize for preview without uploading. Returns larger WebP for sharp UI preview. */
async function prepareCuisineIconPreview(inputBuffer) {
  return normalizeCuisineIconBuffer(inputBuffer, PREVIEW_WIDTH, PREVIEW_HEIGHT);
}

async function replaceCuisineIcon(cuisine, nextRelativePath) {
  const previous = cuisine.icon || "";
  cuisine.icon = nextRelativePath || "";
  await cuisine.save();

  if (previous && previous !== nextRelativePath) {
    await deleteObjectByRelativePath(previous);
  }

  return cuisine.icon;
}

async function clearCuisineIcon(cuisine) {
  const previous = cuisine.icon || "";
  cuisine.icon = "";
  await cuisine.save();
  if (previous) {
    await deleteObjectByRelativePath(previous);
  }
}

module.exports = {
  ICON_SIZE,
  ICON_WIDTH,
  ICON_HEIGHT,
  PREVIEW_SIZE,
  PREVIEW_WIDTH,
  PREVIEW_HEIGHT,
  SUBJECT_FILL,
  normalizeCuisineIconBuffer,
  prepareCuisineIconPreview,
  saveRasterIcon,
  replaceCuisineIcon,
  clearCuisineIcon,
};
