const client = require('prom-client');

const register = new client.Registry();

// Default system & Node.js metrics
client.collectDefaultMetrics({
  register,
  prefix: 'liveboard_',
});

// Custom Prometheus metrics
const httpRequestsTotal = new client.Counter({
  name: 'liveboard_http_requests_total',
  help: 'Total number of HTTP requests processed by LiveBoard API',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpRequestDuration = new client.Histogram({
  name: 'liveboard_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

const activeWsConnections = new client.Gauge({
  name: 'liveboard_active_ws_connections',
  help: 'Current number of active WebSocket connections to this replica',
  registers: [register],
});

const cardEventsTotal = new client.Counter({
  name: 'liveboard_card_events_total',
  help: 'Total number of Kanban card events handled',
  labelNames: ['event_type'],
  registers: [register],
});

module.exports = {
  register,
  httpRequestsTotal,
  httpRequestDuration,
  activeWsConnections,
  cardEventsTotal,
};
