const path = require("path");
const fs = require("fs");
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");

let client;

function getConfig() {
  const {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET,
    R2_PUBLIC_URL,
    R2_REGION = "auto",
  } = process.env;

  return {
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET,
    publicUrl: R2_PUBLIC_URL?.replace(/\/$/, ""),
    region: R2_REGION,
  };
}

function isR2Configured() {
  const config = getConfig();
  return Boolean(
    config.accountId &&
      config.accessKeyId &&
      config.secretAccessKey &&
      config.bucket &&
      config.publicUrl
  );
}

function getClient() {
  if (client) return client;

  const config = getConfig();
  client = new S3Client({
    region: config.region,
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return client;
}

function relativePathToKey(relativePath) {
  if (!relativePath) return "";
  return relativePath.replace(/^\/+/, "");
}

function getPublicUploadUrl(relativePath) {
  const config = getConfig();
  const key = relativePathToKey(relativePath);
  if (!config.publicUrl || !key) return null;

  if (
    config.publicUrl.includes(".r2.cloudflarestorage.com") &&
    config.bucket &&
    !config.publicUrl.endsWith(`/${config.bucket}`)
  ) {
    return `${config.publicUrl}/${config.bucket}/${key}`;
  }

  return `${config.publicUrl}/${key}`;
}

async function uploadBuffer({ buffer, key, contentType = "image/webp", cacheControl }) {
  if (!isR2Configured()) return false;

  const config = getConfig();
  await getClient().send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: cacheControl || "public, max-age=31536000, immutable",
    })
  );

  return true;
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function getObjectBuffer(relativePath) {
  if (!relativePath) return null;
  const key = relativePathToKey(relativePath);
  if (!key) return null;

  if (isR2Configured()) {
    try {
      const config = getConfig();
      const result = await getClient().send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: key,
        })
      );
      if (!result.Body) return null;
      return streamToBuffer(result.Body);
    } catch (error) {
      console.warn("Failed to read R2 object:", error.message);
    }
  }

  const absolutePath = path.join(__dirname, "..", key);
  if (fs.existsSync(absolutePath)) {
    return fs.promises.readFile(absolutePath);
  }
  return null;
}

async function deleteObjectByRelativePath(relativePath) {
  if (!relativePath) return;

  const key = relativePathToKey(relativePath);
  if (!key) return;

  if (isR2Configured()) {
    try {
      const config = getConfig();
      await getClient().send(
        new DeleteObjectCommand({
          Bucket: config.bucket,
          Key: key,
        })
      );
      return;
    } catch (error) {
      console.warn("Failed to delete R2 object:", error.message);
    }
  }

  const absolutePath = path.join(__dirname, "..", relativePath);
  if (fs.existsSync(absolutePath)) {
    try {
      fs.unlinkSync(absolutePath);
    } catch (error) {
      console.warn("Failed to delete uploaded file:", error.message);
    }
  }
}

module.exports = {
  deleteObjectByRelativePath,
  getObjectBuffer,
  getPublicUploadUrl,
  isR2Configured,
  uploadBuffer,
};
