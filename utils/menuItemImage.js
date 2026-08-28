const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const { v4: uuidv4 } = require("uuid");
const { uploadBuffer, isR2Configured, deleteObjectByRelativePath } = require("./r2Storage");

/** 4:3 master long edge */
const MASTER_4_3_WIDTH = 1534;
/** 1:1 master */
const MASTER_1_1_SIZE = 1024;
const MASTER_QUALITY = 92;

/** Product modal / detail */
const ITEM_MAX_SIZE = 512;
const ITEM_QUALITY = 82;

/** Menu list cards */
const THUMB_SIZE = 150;
const THUMB_QUALITY = 78;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Normalize legacy string paths and new variant objects.
 * @returns {{ master?: string, item?: string, thumbnail?: string } | null}
 */
function normalizeItemImage(value) {
  if (!value) return null;
  if (typeof value === "string") {
    const pathValue = value.trim();
    if (!pathValue) return null;
    return { master: pathValue, item: pathValue, thumbnail: pathValue };
  }
  if (!isPlainObject(value)) return null;

  const master = typeof value.master === "string" ? value.master.trim() : "";
  const item = typeof value.item === "string" ? value.item.trim() : "";
  const thumbnail = typeof value.thumbnail === "string" ? value.thumbnail.trim() : "";

  if (!master && !item && !thumbnail) return null;
  return {
    master: master || item || thumbnail || undefined,
    item: item || master || thumbnail || undefined,
    thumbnail: thumbnail || item || master || undefined,
  };
}

function pickItemImageVariant(value, variant = "thumbnail") {
  const normalized = normalizeItemImage(value);
  if (!normalized) return "";
  if (variant === "master") return normalized.master || "";
  if (variant === "item") return normalized.item || "";
  return normalized.thumbnail || "";
}

/** Public storefront payload: never expose master. */
function formatItemImageForPublic(value) {
  const normalized = normalizeItemImage(value);
  if (!normalized) {
    return { thumbnail: "", item: "" };
  }
  return {
    thumbnail: normalized.thumbnail || "",
    item: normalized.item || normalized.thumbnail || "",
  };
}

/** Admin responses: full variants for edit/preview/future flyer use. */
function formatItemImageForAdmin(value) {
  const normalized = normalizeItemImage(value);
  if (!normalized) return null;
  return {
    master: normalized.master || "",
    item: normalized.item || "",
    thumbnail: normalized.thumbnail || "",
  };
}

async function writeVariantBuffer(buffer, key, relativePath) {
  if (isR2Configured()) {
    await uploadBuffer({
      buffer,
      key,
      contentType: "image/webp",
    });
    return relativePath;
  }

  const absolutePath = path.join(__dirname, "..", relativePath.replace(/^\/+/, ""));
  const dir = path.dirname(absolutePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  await fs.promises.writeFile(absolutePath, buffer);
  return relativePath;
}

function detectAspect(width, height) {
  if (!width || !height) return "1:1";
  const ratio = width / height;
  // Frontend crops to 1:1 or 4:3; treat near-square as 1:1.
  if (Math.abs(ratio - 1) <= 0.08) return "1:1";
  return "4:3";
}

async function buildMasterBuffer(inputBuffer, aspect) {
  const image = sharp(inputBuffer, { failOn: "none" }).rotate();

  if (aspect === "1:1") {
    return image
      .resize(MASTER_1_1_SIZE, MASTER_1_1_SIZE, {
        fit: "cover",
        position: "centre",
        withoutEnlargement: true,
      })
      .webp({ quality: MASTER_QUALITY })
      .toBuffer();
  }

  const masterHeight = Math.round((MASTER_4_3_WIDTH * 3) / 4);
  return image
    .resize(MASTER_4_3_WIDTH, masterHeight, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: MASTER_QUALITY })
    .toBuffer();
}

async function buildItemBuffer(masterBuffer) {
  return sharp(masterBuffer)
    .resize(ITEM_MAX_SIZE, ITEM_MAX_SIZE, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: ITEM_QUALITY })
    .toBuffer();
}

async function buildThumbnailBuffer(masterBuffer) {
  return sharp(masterBuffer)
    .resize(THUMB_SIZE, THUMB_SIZE, {
      fit: "cover",
      position: "centre",
    })
    .webp({ quality: THUMB_QUALITY })
    .toBuffer();
}

/**
 * Create master.webp + item.webp + thumbnail.webp under uploads/YYYY/MM/{uuid}/
 */
async function createMenuItemImageVariants(inputBuffer) {
  const meta = await sharp(inputBuffer, { failOn: "none" }).metadata();
  const aspect = detectAspect(meta.width, meta.height);

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const folderId = uuidv4();
  const baseKey = `uploads/${year}/${month}/${folderId}`;
  const baseRelative = `/uploads/${year}/${month}/${folderId}`;

  const masterBuffer = await buildMasterBuffer(inputBuffer, aspect);
  const [itemBuffer, thumbnailBuffer] = await Promise.all([
    buildItemBuffer(masterBuffer),
    buildThumbnailBuffer(masterBuffer),
  ]);

  const paths = {
    master: `${baseRelative}/master.webp`,
    item: `${baseRelative}/item.webp`,
    thumbnail: `${baseRelative}/thumbnail.webp`,
  };

  await Promise.all([
    writeVariantBuffer(masterBuffer, `${baseKey}/master.webp`, paths.master),
    writeVariantBuffer(itemBuffer, `${baseKey}/item.webp`, paths.item),
    writeVariantBuffer(thumbnailBuffer, `${baseKey}/thumbnail.webp`, paths.thumbnail),
  ]);

  return { ...paths, aspect };
}

async function removeItemImages(value) {
  const normalized = normalizeItemImage(value);
  if (!normalized) return;

  const unique = [
    ...new Set(
      [normalized.master, normalized.item, normalized.thumbnail].filter(Boolean)
    ),
  ];

  await Promise.all(unique.map((relativePath) => deleteObjectByRelativePath(relativePath)));
}

/**
 * Multer follow-up: builds 3 variants and sets req.itemImagePaths.
 * Also sets req.itemImagePath to thumbnail for any legacy readers.
 */
function processMenuItemImage() {
  return async (req, res, next) => {
    if (!req.file) return next();

    try {
      const variants = await createMenuItemImageVariants(req.file.buffer);
      req.itemImagePaths = {
        master: variants.master,
        item: variants.item,
        thumbnail: variants.thumbnail,
      };
      // Legacy single-path field (prefer thumbnail for list-friendly default)
      req.itemImagePath = variants.thumbnail;
      next();
    } catch (error) {
      console.error("processMenuItemImage error:", error);
      return res.status(500).json({ message: "Image processing failed" });
    }
  };
}

module.exports = {
  MASTER_4_3_WIDTH,
  MASTER_1_1_SIZE,
  normalizeItemImage,
  pickItemImageVariant,
  formatItemImageForPublic,
  formatItemImageForAdmin,
  createMenuItemImageVariants,
  removeItemImages,
  processMenuItemImage,
};
