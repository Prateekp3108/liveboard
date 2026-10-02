const Redis = require('ioredis');
const EventEmitter = require('events');

const localEmitter = new EventEmitter();
let pubClient = null;
let subClient = null;
let isRedisConnected = false;

function initRedis() {
  const redisUrl = process.env.REDIS_URL;
  const redisHost = process.env.REDIS_HOST;

  if (redisUrl || redisHost) {
    const options = {
      host: redisHost || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      retryStrategy(times) {
        if (times > 5) {
          console.warn('Redis retry limit reached, running in standalone mode');
          return null; // Stop retrying
        }
        return Math.min(times * 100, 2000);
      },
      connectTimeout: 3000,
      lazyConnect: false,
    };

    pubClient = redisUrl ? new Redis(redisUrl, options) : new Redis(options);
    subClient = redisUrl ? new Redis(redisUrl, options) : new Redis(options);

    pubClient.on('connect', () => {
      isRedisConnected = true;
    });

    pubClient.on('error', (err) => {
      console.warn('Redis pubClient error:', err.message);
      isRedisConnected = false;
    });

    subClient.on('error', (err) => {
      console.warn('Redis subClient error:', err.message);
    });
  }
}

async function isReady() {
  if (!pubClient) {
    if (process.env.NODE_ENV === 'test' || process.env.ALLOW_IN_MEMORY === 'true') {
      return true;
    }
    return false;
  }
  try {
    const pong = await pubClient.ping();
    return pong === 'PONG';
  } catch (err) {
    return false;
  }
}

async function publishEvent(channel, data) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  if (pubClient && isRedisConnected) {
    try {
      await pubClient.publish(channel, payload);
      return;
    } catch (err) {
      console.warn('Failed to publish to Redis, falling back to local:', err.message);
    }
  }
  // Local fallback
  localEmitter.emit(channel, payload);
}

function subscribeEvents(channel, onMessage) {
  if (subClient) {
    subClient.subscribe(channel, (err) => {
      if (err) console.warn(`Failed to subscribe to Redis channel ${channel}:`, err.message);
    });

    subClient.on('message', (chan, msg) => {
      if (chan === channel) {
        try {
          onMessage(JSON.parse(msg));
        } catch (e) {
          onMessage(msg);
        }
      }
    });
  }

  // Also listen on local fallback
  localEmitter.on(channel, (msg) => {
    // If Redis is connected, we already get the message from Redis subClient
    if (!pubClient || !isRedisConnected) {
      try {
        onMessage(JSON.parse(msg));
      } catch (e) {
        onMessage(msg);
      }
    }
  });
}

async function closeRedis() {
  if (pubClient) {
    await pubClient.quit().catch(() => {});
    pubClient = null;
  }
  if (subClient) {
    await subClient.quit().catch(() => {});
    subClient = null;
  }
  isRedisConnected = false;
  localEmitter.removeAllListeners();
}

module.exports = {
  initRedis,
  isReady,
  publishEvent,
  subscribeEvents,
  closeRedis,
};
