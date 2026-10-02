const express = require('express');
const cors = require('cors');
const db = require('./db');
const redis = require('./redis');
const {
  register,
  httpRequestsTotal,
  httpRequestDuration,
  cardEventsTotal,
} = require('./metrics');

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Prometheus HTTP metrics tracking middleware
  app.use((req, res, next) => {
    // Avoid scraping metrics inflating request metrics excessively, but still track if desired
    const start = process.hrtime();
    res.on('finish', () => {
      const diff = process.hrtime(start);
      const durationInSeconds = diff[0] + diff[1] / 1e9;
      const route = req.route ? req.route.path : req.path;
      const statusCode = res.statusCode ? String(res.statusCode) : '500';

      httpRequestsTotal.inc({
        method: req.method,
        route,
        status_code: statusCode,
      });

      httpRequestDuration.observe(
        {
          method: req.method,
          route,
          status_code: statusCode,
        },
        durationInSeconds
      );
    });
    next();
  });

  // Liveness probe
  app.get('/healthz', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Readiness probe
  app.get('/readyz', async (req, res) => {
    try {
      const dbReady = await db.isReady();
      const redisReady = await redis.isReady();

      const checks = {
        database: dbReady ? 'up' : 'down',
        redis: redisReady ? 'up' : 'down',
      };

      if (dbReady && redisReady) {
        return res.status(200).json({
          status: 'ready',
          checks,
        });
      }

      return res.status(503).json({
        status: 'unready',
        checks,
      });
    } catch (err) {
      return res.status(503).json({
        status: 'unready',
        error: err.message,
      });
    }
  });

  // Prometheus metrics endpoint
  app.get('/metrics', async (req, res) => {
    try {
      res.set('Content-Type', register.contentType);
      const metrics = await register.metrics();
      res.end(metrics);
    } catch (err) {
      res.status(500).end(err.message);
    }
  });

  // REST API routes
  app.get('/api/board', async (req, res) => {
    try {
      const cards = await db.getCards();
      res.json({
        columns: [
          { id: 'todo', title: 'To Do' },
          { id: 'in_progress', title: 'In Progress' },
          { id: 'done', title: 'Done' },
        ],
        cards,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/cards', async (req, res) => {
    try {
      const { title, column } = req.body;
      if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: 'Title is required' });
      }

      const validColumns = ['todo', 'in_progress', 'done'];
      const targetColumn = validColumns.includes(column) ? column : 'todo';

      const card = await db.createCard({ title: title.trim(), column: targetColumn });
      cardEventsTotal.inc({ event_type: 'created' });

      await redis.publishEvent('liveboard:events', {
        type: 'CARD_CREATED',
        card,
      });

      res.status(201).json(card);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/cards/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { title, column, position } = req.body;

      const updates = {};
      if (title !== undefined) updates.title = String(title).trim();
      if (column !== undefined) {
        const validColumns = ['todo', 'in_progress', 'done'];
        if (validColumns.includes(column)) {
          updates.column = column;
        }
      }
      if (position !== undefined) {
        updates.position = parseInt(position, 10);
      }

      const card = await db.updateCard(id, updates);
      if (!card) {
        return res.status(404).json({ error: 'Card not found' });
      }

      cardEventsTotal.inc({ event_type: 'updated' });
      await redis.publishEvent('liveboard:events', {
        type: 'CARD_UPDATED',
        card,
      });

      res.json(card);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/cards/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await db.deleteCard(id);
      if (!deleted) {
        return res.status(404).json({ error: 'Card not found' });
      }

      cardEventsTotal.inc({ event_type: 'deleted' });
      await redis.publishEvent('liveboard:events', {
        type: 'CARD_DELETED',
        cardId: id,
      });

      res.json({ success: true, id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return app;
}

module.exports = { createApp };
