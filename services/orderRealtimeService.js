const clientsByRestaurant = new Map();
const globalClients = new Set();

const {
  isRedisEnabled,
  createRedisConnection,
  connectRedisClient,
  quitRedisClient,
} = require("../utils/redisClient");

let redisPublisher = null;
let redisSubscriber = null;
let redisReady = false;
const CHANNEL = "betterorder:orders:sse";

function writeToLocalClients(restaurantId, event, payload) {
  const clients = clientsByRestaurant.get(String(restaurantId));
  const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;

  clients?.forEach((client) => {
    try {
      client.write(message);
    } catch {
      clients.delete(client);
    }
  });

  globalClients.forEach((client) => {
    try {
      client.write(message);
    } catch {
      globalClients.delete(client);
    }
  });
}

function addOrderStreamClient(restaurantId, res) {
  if (!restaurantId) {
    globalClients.add(res);
    res.write("event: connected\n");
    res.write(`data: ${JSON.stringify({ scope: "all" })}\n\n`);

    // Local SSE keepalive only — does NOT touch Redis.
    const heartbeat = setInterval(() => {
      res.write("event: heartbeat\n");
      res.write(`data: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
    }, 25000);

    return () => {
      clearInterval(heartbeat);
      globalClients.delete(res);
    };
  }

  const key = String(restaurantId);
  if (!clientsByRestaurant.has(key)) {
    clientsByRestaurant.set(key, new Set());
  }

  const clients = clientsByRestaurant.get(key);
  clients.add(res);

  res.write("event: connected\n");
  res.write(`data: ${JSON.stringify({ restaurantId: key })}\n\n`);

  // Local SSE keepalive only — does NOT touch Redis.
  const heartbeat = setInterval(() => {
    res.write("event: heartbeat\n");
    res.write(`data: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
  }, 25000);

  return () => {
    clearInterval(heartbeat);
    clients.delete(res);
    if (clients.size === 0) {
      clientsByRestaurant.delete(key);
    }
  };
}

function broadcastOrderEventLocal(restaurantId, event, payload) {
  writeToLocalClients(restaurantId, event, payload);
}

function broadcastOrderEvent(restaurantId, event, payload) {
  writeToLocalClients(restaurantId, event, payload);

  // Publish only on real order events (accept/status/etc.) — never on a timer.
  if (redisReady && redisPublisher) {
    const envelope = JSON.stringify({
      restaurantId: String(restaurantId || ""),
      event,
      payload,
      origin: process.env.INSTANCE_ID || process.pid,
    });
    redisPublisher.publish(CHANNEL, envelope).catch((error) => {
      console.warn("[sse-redis] publish failed:", error.message);
    });
  }
}

async function initOrderRealtimeRedis() {
  if (!isRedisEnabled()) {
    console.log("[sse-redis] disabled — using in-process SSE only");
    return false;
  }

  try {
    redisPublisher = createRedisConnection("sse-redis-pub");
    redisSubscriber = createRedisConnection("sse-redis-sub");
    if (!redisPublisher || !redisSubscriber) {
      console.log("[sse-redis] REDIS_URL not set — using in-process SSE only");
      return false;
    }

    await connectRedisClient(redisPublisher, "sse-redis-pub");
    await connectRedisClient(redisSubscriber, "sse-redis-sub");

    await redisSubscriber.subscribe(CHANNEL);
    redisSubscriber.on("message", (channel, raw) => {
      if (channel !== CHANNEL) return;
      try {
        const message = JSON.parse(raw);
        const origin = process.env.INSTANCE_ID || process.pid;
        // Ignore our own publishes (already written locally).
        if (String(message.origin) === String(origin)) return;
        writeToLocalClients(message.restaurantId, message.event, message.payload);
      } catch (error) {
        console.warn("[sse-redis] message parse failed:", error.message);
      }
    });

    redisReady = true;
    console.log("[sse-redis] connected — multi-instance SSE fan-out enabled");
    return true;
  } catch (error) {
    redisReady = false;
    await quitRedisClient(redisPublisher);
    await quitRedisClient(redisSubscriber);
    redisPublisher = null;
    redisSubscriber = null;
    console.warn(
      "[sse-redis] unavailable — falling back to in-process SSE:",
      error.message
    );
    return false;
  }
}

async function shutdownOrderRealtimeRedis() {
  redisReady = false;
  await quitRedisClient(redisPublisher);
  await quitRedisClient(redisSubscriber);
  redisPublisher = null;
  redisSubscriber = null;
}

function getRealtimeStats() {
  let restaurantClients = 0;
  clientsByRestaurant.forEach((set) => {
    restaurantClients += set.size;
  });
  return {
    redisEnabled: redisReady,
    restaurantClients,
    globalClients: globalClients.size,
  };
}

module.exports = {
  addOrderStreamClient,
  broadcastOrderEvent,
  broadcastOrderEventLocal,
  initOrderRealtimeRedis,
  shutdownOrderRealtimeRedis,
  getRealtimeStats,
};
