const clientsByRestaurant = new Map();
const globalClients = new Set();

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
  const url = process.env.REDIS_URL || "";
  if (!url) {
    console.log("[sse-redis] REDIS_URL not set — using in-process SSE only");
    return false;
  }

  try {
    // Optional dependency: install ioredis when enabling multi-instance SSE.
    // eslint-disable-next-line import/no-extraneous-dependencies, global-require
    const Redis = require("ioredis");
    redisPublisher = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: true });
    redisSubscriber = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: true });

    await redisPublisher.connect();
    await redisSubscriber.connect();

    await redisSubscriber.subscribe(CHANNEL);
    redisSubscriber.on("message", (channel, raw) => {
      if (channel !== CHANNEL) return;
      try {
        const message = JSON.parse(raw);
        const origin = process.env.INSTANCE_ID || process.pid;
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
    redisPublisher = null;
    redisSubscriber = null;
    console.warn(
      "[sse-redis] unavailable — falling back to in-process SSE:",
      error.message
    );
    return false;
  }
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
  getRealtimeStats,
};
