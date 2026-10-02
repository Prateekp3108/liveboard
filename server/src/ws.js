const { WebSocketServer, WebSocket } = require('ws');
const { activeWsConnections } = require('./metrics');
const redis = require('./redis');

function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    activeWsConnections.inc();

    // Send initial handshake / welcome
    ws.send(JSON.stringify({ type: 'CONNECTED', message: 'Connected to LiveBoard real-time stream' }));

    ws.on('message', (message) => {
      try {
        const parsed = JSON.parse(message.toString());
        if (parsed.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG' }));
        }
      } catch (err) {
        // Ignore unparseable client messages
      }
    });

    ws.on('close', () => {
      activeWsConnections.dec();
    });

    ws.on('error', (err) => {
      console.warn('WebSocket client error:', err.message);
    });
  });

  // Subscribe to Redis events and broadcast to all connected WebSocket clients
  redis.subscribeEvents('liveboard:events', (event) => {
    const payload = typeof event === 'string' ? event : JSON.stringify(event);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  });

  return wss;
}

module.exports = { setupWebSocket };
