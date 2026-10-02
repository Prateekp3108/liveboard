const request = require('supertest');
const http = require('http');
const { WebSocket } = require('ws');
const { createApp } = require('../src/app');
const { setupWebSocket } = require('../src/ws');
const db = require('../src/db');
const redis = require('../src/redis');

describe('LiveBoard API & Observability Endpoints', () => {
  let app;
  let server;
  let serverPort;

  beforeAll((done) => {
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_IN_MEMORY = 'true';

    app = createApp();
    server = http.createServer(app);
    setupWebSocket(server);

    server.listen(0, () => {
      serverPort = server.address().port;
      done();
    });
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.closeDb();
    await redis.closeRedis();
  });

  describe('Observability: /healthz (Liveness)', () => {
    it('should return 200 OK and healthy status', async () => {
      const res = await request(app).get('/healthz');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  describe('Observability: /readyz (Readiness)', () => {
    it('should return 200 OK when dependencies are ready', async () => {
      const res = await request(app).get('/readyz');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
      expect(res.body.checks.database).toBe('up');
      expect(res.body.checks.redis).toBe('up');
    });

    it('should return 503 when database is unready', async () => {
      jest.spyOn(db, 'isReady').mockResolvedValueOnce(false);
      const res = await request(app).get('/readyz');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('unready');
      expect(res.body.checks.database).toBe('down');
    });

    it('should return 503 when redis is unready', async () => {
      jest.spyOn(redis, 'isReady').mockResolvedValueOnce(false);
      const res = await request(app).get('/readyz');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('unready');
      expect(res.body.checks.redis).toBe('down');
    });
  });

  describe('Observability: /metrics (Prometheus)', () => {
    it('should expose standard and custom Prometheus metrics', async () => {
      // Trigger an API request to populate metrics
      await request(app).get('/healthz');

      const res = await request(app).get('/metrics');
      expect(res.status).toBe(200);
      expect(res.text).toContain('liveboard_http_requests_total');
      expect(res.text).toContain('liveboard_active_ws_connections');
      expect(res.text).toContain('liveboard_card_events_total');
      expect(res.text).toContain('liveboard_http_request_duration_seconds');
      expect(res.text).toContain('liveboard_nodejs_');
    });
  });

  describe('Kanban REST API', () => {
    let createdCardId;

    it('GET /api/board should return columns and cards', async () => {
      const res = await request(app).get('/api/board');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('columns');
      expect(res.body.columns.length).toBe(3);
      expect(Array.isArray(res.body.cards)).toBe(true);
    });

    it('POST /api/cards should create a new card', async () => {
      const res = await request(app)
        .post('/api/cards')
        .send({ title: 'Test Task for CI', column: 'todo' });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Test Task for CI');
      expect(res.body.column).toBe('todo');
      expect(res.body).toHaveProperty('id');
      createdCardId = res.body.id;
    });

    it('POST /api/cards should reject card without title', async () => {
      const res = await request(app).post('/api/cards').send({ column: 'todo' });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('PATCH /api/cards/:id should update column and position', async () => {
      const res = await request(app)
        .patch(`/api/cards/${createdCardId}`)
        .send({ column: 'in_progress' });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(createdCardId);
      expect(res.body.column).toBe('in_progress');
    });

    it('DELETE /api/cards/:id should remove the card', async () => {
      const res = await request(app).delete(`/api/cards/${createdCardId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('WebSocket Real-Time Synchronization', () => {
    it('should establish connection and receive welcome message', (done) => {
      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/ws`);

      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'PING' }));
      });

      let receivedWelcome = false;
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'CONNECTED') {
          receivedWelcome = true;
        }
        if (msg.type === 'PONG') {
          expect(receivedWelcome).toBe(true);
          ws.close();
          done();
        }
      });
    });

    it('should broadcast card creation event to connected WebSocket clients', (done) => {
      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/ws`);

      ws.on('open', () => {
        // Create a card via REST API to trigger event
        request(app)
          .post('/api/cards')
          .send({ title: 'WebSocket Realtime Broadcast Card', column: 'todo' })
          .end((err) => {
            if (err) done(err);
          });
      });

      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'CARD_CREATED' && msg.card.title === 'WebSocket Realtime Broadcast Card') {
          ws.close();
          done();
        }
      });
    });
  });
});
