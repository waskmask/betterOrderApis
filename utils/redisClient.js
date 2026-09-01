/**
 * Shared Redis helpers for BetterOrder API.
 *
 * Design goals (Upstash / test accounts):
 * - Event-driven only (pub/sub). No polling loops against Redis.
 * - Bounded reconnect attempts so a bad network cannot burn free-tier commands.
 * - enableOfflineQueue: false — never buffer infinite commands while disconnected.
 * - Optional REDIS_ENABLED=false kill switch even if REDIS_URL is set.
 */

let RedisCtor = null;
let redisAvailable = null;

function isRedisEnabled() {
  if (String(process.env.REDIS_ENABLED || "").trim().toLowerCase() === "false") {
    return false;
  }
  return Boolean(String(process.env.REDIS_URL || "").trim());
}

function getRedisUrl() {
  return String(process.env.REDIS_URL || "").trim();
}

function loadRedisConstructor() {
  if (RedisCtor) return RedisCtor;
  try {
    // eslint-disable-next-line import/no-extraneous-dependencies, global-require
    RedisCtor = require("ioredis");
    return RedisCtor;
  } catch (error) {
    redisAvailable = false;
    throw new Error(`ioredis_not_installed:${error.message}`);
  }
}

/**
 * @param {string} label
 * @returns {import("ioredis").default | null}
 */
function createRedisConnection(label = "redis") {
  if (!isRedisEnabled()) return null;

  const url = getRedisUrl();
  if (!url) return null;

  const Redis = loadRedisConstructor();
  const maxReconnectAttempts = Math.max(
    0,
    Number.parseInt(process.env.REDIS_MAX_RECONNECT_ATTEMPTS || "5", 10) || 5
  );
  const connectTimeoutMs = Math.max(
    1000,
    Number.parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS || "8000", 10) || 8000
  );

  let reconnectAttempts = 0;

  const client = new Redis(url, {
    // Don't auto-run commands until we explicitly connect.
    lazyConnect: true,
    // Critical for test accounts: never queue commands while disconnected.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: connectTimeoutMs,
    // TLS is implied by rediss:// — keep family auto.
    retryStrategy(times) {
      reconnectAttempts = times;
      if (times > maxReconnectAttempts) {
        console.warn(
          `[${label}] reconnect stopped after ${maxReconnectAttempts} attempts (protecting Redis quota)`
        );
        return null;
      }
      // 200ms, 400ms, … capped at 2s
      return Math.min(times * 200, 2000);
    },
    reconnectOnError(error) {
      const message = String(error?.message || "");
      // Only reconnect on transient read/connection errors — not auth failures.
      if (/READONLY|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN/i.test(message)) {
        return true;
      }
      return false;
    },
  });

  client.on("error", (error) => {
    // ioredis emits noisy errors while retrying; keep them warn-level once.
    if (reconnectAttempts <= 1) {
      console.warn(`[${label}] error:`, error.message);
    }
  });

  client.on("end", () => {
    console.warn(`[${label}] connection ended`);
  });

  return client;
}

async function connectRedisClient(client, label = "redis") {
  if (!client) return false;
  if (client.status === "ready") return true;
  await client.connect();
  // One cheap health check per connection — not on a timer.
  const pong = await client.ping();
  if (String(pong).toUpperCase() !== "PONG") {
    throw new Error("redis_ping_failed");
  }
  console.log(`[${label}] connected`);
  return true;
}

async function quitRedisClient(client) {
  if (!client) return;
  try {
    client.removeAllListeners();
    if (client.status !== "end" && client.status !== "wait") {
      await client.quit();
    }
  } catch {
    try {
      client.disconnect();
    } catch {
      /* ignore */
    }
  }
}

module.exports = {
  isRedisEnabled,
  getRedisUrl,
  createRedisConnection,
  connectRedisClient,
  quitRedisClient,
};
