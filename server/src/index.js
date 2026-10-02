require('dotenv').config();
const http = require('http');
const { createApp } = require('./app');
const { setupWebSocket } = require('./ws');
const db = require('./db');
const redis = require('./redis');

const PORT = parseInt(process.env.PORT || '5000', 10);

async function main() {
  db.initDb();
  await db.migrate().catch((err) => {
    console.warn('Database migration warning (continuing):', err.message);
  });

  redis.initRedis();

  const app = createApp();
  const server = http.createServer(app);

  setupWebSocket(server);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`LiveBoard API server listening on port ${PORT}`);
    console.log(`Health: http://localhost:${PORT}/healthz`);
    console.log(`Readiness: http://localhost:${PORT}/readyz`);
    console.log(`Metrics: http://localhost:${PORT}/metrics`);
  });

  // Graceful shutdown
  const shutdown = async (signal) => {
    console.log(`Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      await redis.closeRedis();
      await db.closeDb();
      console.log('HTTP server, Redis, and Database connections closed.');
      process.exit(0);
    });

    setTimeout(() => {
      console.error('Forcefully terminating server after timeout.');
      process.exit(1);
    }, 5000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
  });
}

module.exports = { main };
