const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const { v4: uuidv4 } = require("uuid");
const {
  uploadBuffer,
  isR2Configured,
  deleteObjectByRelativePath,
  getObjectBuffer,
  getPublicUploadUrl,
} = require("./r2Storage");

const MAX_COVER_ASSETS = 10;
/** Final cover ratio (matches UI crop target). */
const COVER_ASPECT = 2.4;
/** Max width for stored master after 2.4:1 crop. */
const FULL_MAX_WIDTH = Number(process.env.COVER_ASSET_MAX_WIDTH || 1600);
const FULL_WEBP_QUALITY = 90;
/** Grid thumbnail max width; height follows 2.4:1. Keep small for Assets UI. */
const THUMB_MAX_WIDTH = Number(process.env.COVER_ASSET_THUMB_WIDTH || 320);
const THUMB_WEBP_QUALITY = 72;

/**
 * Center-crop to 2.4:1, then optionally downscale width.
 * Spec: normalize → crop 2.4:1 → resize → WebP.
 */
async function toCoverAspectWebp(inputBuffer, { maxWidth, quality }) {
  const image = sharp(inputBuffer, { failOn: "none" }).rotate();
  const meta = await image.metadata();
  const srcW = meta.width || 1;
  const srcH = meta.height || 1;
  const srcAspect = srcW / srcH;

  let cropW = srcW;
  let cropH = srcH;
  if (srcAspect > COVER_ASPECT) {
    cropW = Math.round(srcH * COVER_ASPECT);
  } else if (srcAspect < COVER_ASPECT) {
    cropH = Math.round(srcW / COVER_ASPECT);
  }
  const left = Math.max(0, Math.floor((srcW - cropW) / 2));
  const top = Math.max(0, Math.floor((srcH - cropH) / 2));

  let pipeline = image.extract({ left, top, width: cropW, height: cropH });
  if (maxWidth && cropW > maxWidth) {
    pipeline = pipeline.resize({
      width: maxWidth,
      withoutEnlargement: true,
      fit: "inside",
    });
  }
  return pipeline.webp({ quality }).toBuffer();
}

function buildCoverAssetPaths(restaurantId, suffix = "") {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const filename = `${uuidv4()}${suffix}.webp`;
  const key = `uploads/${year}/${month}/cover-assets/${restaurantId}/${filename}`;
  const relativePath = `/${key}`;
  return { key, relativePath };
}

async function writeUploadBuffer(buffer, key, relativePath, contentType) {
  if (isR2Configured()) {
    await uploadBuffer({ buffer, key, contentType });
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

/** Full master: 2.4:1 WebP for crop / Use. */
async function toCoverAssetWebp(inputBuffer) {
  return toCoverAspectWebp(inputBuffer, {
    maxWidth: Math.max(800, Math.min(2400, FULL_MAX_WIDTH)),
    quality: FULL_WEBP_QUALITY,
  });
}

/** 2.4:1 thumbnail for Assets grid. */
async function toCoverAssetThumbWebp(inputBuffer) {
  const maxW = Math.max(160, Math.min(1280, THUMB_MAX_WIDTH));
  return toCoverAspectWebp(inputBuffer, {
    maxWidth: maxW,
    quality: THUMB_WEBP_QUALITY,
  });
}

function ensureCoverAssetsArray(restaurant) {
  if (!restaurant.images) restaurant.images = {};
  if (!Array.isArray(restaurant.images.coverAssets)) {
    restaurant.images.coverAssets = [];
  }
  return restaurant.images.coverAssets;
}

function normalizeAssetPath(p) {
  return String(p || "").trim().replace(/\\/g, "/");
}

function isProtectedCoverAsset(restaurant, asset) {
  const protectedPath = normalizeAssetPath(restaurant?.images?.coverSourceAsset);
  if (!protectedPath || !asset?.path) return false;
  return normalizeAssetPath(asset.path) === protectedPath;
}

/**
 * Keep at most MAX_COVER_ASSETS. Remove oldest first, but never delete the
 * asset currently used as the live cover source (coverSourceAsset).
 */
async function pruneOldestCoverAssets(restaurant) {
  const assets = ensureCoverAssetsArray(restaurant);
  while (assets.length > MAX_COVER_ASSETS) {
    const removeIndex = assets.findIndex((a) => !isProtectedCoverAsset(restaurant, a));
    if (removeIndex < 0) {
      // Only the in-use cover remains beyond the cap — keep it.
      break;
    }
    const [removed] = assets.splice(removeIndex, 1);
    if (removed?.path) {
      await deleteObjectByRelativePath(removed.path);
    }
    if (removed?.thumbPath) {
      await deleteObjectByRelativePath(removed.thumbPath);
    }
  }
}

function resolvePublicOrRelative(relativePath) {
  if (!relativePath) return null;
  if (isR2Configured()) {
    const publicUrl = getPublicUploadUrl(relativePath);
    if (publicUrl) return publicUrl;
  }
  return relativePath;
}

function serializeCoverAsset(a) {
  const pathRel = a.path;
  const thumbRel = a.thumbPath || a.path;
  return {
    path: pathRel,
    thumbPath: a.thumbPath || null,
    createdAt: a.createdAt,
    /** Prefer CDN/R2 public URL so clients are not stuck on localhost:/uploads proxy. */
    url: resolvePublicOrRelative(pathRel),
    thumbUrl: resolvePublicOrRelative(thumbRel),
  };
}

/**
 * Persist a generated cover image (full + thumb WebP) for this restaurant only.
 */
async function saveRestaurantCoverAsset(restaurant, inputBuffer) {
  const restaurantId = String(restaurant._id);
  const [webpBuffer, thumbBuffer] = await Promise.all([
    toCoverAssetWebp(inputBuffer),
    toCoverAssetThumbWebp(inputBuffer),
  ]);

  const full = buildCoverAssetPaths(restaurantId);
  const thumb = buildCoverAssetPaths(restaurantId, "-thumb");

  await Promise.all([
    writeUploadBuffer(webpBuffer, full.key, full.relativePath, "image/webp"),
    writeUploadBuffer(thumbBuffer, thumb.key, thumb.relativePath, "image/webp"),
  ]);

  const assets = ensureCoverAssetsArray(restaurant);
  assets.push({
    path: full.relativePath,
    thumbPath: thumb.relativePath,
    createdAt: new Date(),
  });
  await pruneOldestCoverAssets(restaurant);
  await restaurant.save();

  const saved = assets[assets.length - 1];
  return {
    ...serializeCoverAsset(saved),
    webpBuffer,
  };
}

function listRestaurantCoverAssets(restaurant) {
  const assets = ensureCoverAssetsArray(restaurant);
  return [...assets].map(serializeCoverAsset).reverse();
}

async function readCoverAssetBuffer(relativePath) {
  return getObjectBuffer(relativePath);
}

module.exports = {
  MAX_COVER_ASSETS,
  THUMB_MAX_WIDTH,
  saveRestaurantCoverAsset,
  listRestaurantCoverAssets,
  readCoverAssetBuffer,
  toCoverAssetWebp,
  toCoverAssetThumbWebp,
  serializeCoverAsset,
  resolvePublicOrRelative,
};
