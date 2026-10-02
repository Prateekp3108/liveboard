const { Pool } = require('pg');

let pool = null;
let inMemoryCards = [
  { id: '1', title: 'Welcome to LiveBoard', column: 'todo', position: 0, created_at: new Date().toISOString() },
  { id: '2', title: 'Containerize with Docker', column: 'in_progress', position: 1, created_at: new Date().toISOString() },
  { id: '3', title: 'Deploy to Kubernetes with Argo CD', column: 'done', position: 2, created_at: new Date().toISOString() },
];
let nextId = 4;

function initDb() {
  const databaseUrl = process.env.DATABASE_URL;
  const dbHost = process.env.PGHOST || process.env.DB_HOST;

  if (databaseUrl || dbHost) {
    pool = new Pool({
      connectionString: databaseUrl,
      host: dbHost,
      port: parseInt(process.env.PGPORT || process.env.DB_PORT || '5432', 10),
      user: process.env.PGUSER || process.env.DB_USER || 'postgres',
      password: process.env.PGPASSWORD || process.env.DB_PASSWORD || 'postgres',
      database: process.env.PGDATABASE || process.env.DB_NAME || 'liveboard',
      connectionTimeoutMillis: 3000,
    });

    pool.on('error', (err) => {
      console.error('Unexpected PostgreSQL pool error:', err.message);
    });
  }
}

async function migrate() {
  if (!pool) return;
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS cards (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      "column" VARCHAR(50) NOT NULL DEFAULT 'todo',
      position INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `;
  await pool.query(createTableQuery);

  const countRes = await pool.query('SELECT COUNT(*) FROM cards');
  if (parseInt(countRes.rows[0].count, 10) === 0) {
    await pool.query(`
      INSERT INTO cards (title, "column", position) VALUES
      ('Welcome to LiveBoard', 'todo', 0),
      ('Containerize with Docker', 'in_progress', 1),
      ('Deploy to Kubernetes with Argo CD', 'done', 2);
    `);
  }
}

async function isReady() {
  if (!pool) {
    if (process.env.NODE_ENV === 'test' || process.env.ALLOW_IN_MEMORY === 'true') {
      return true;
    }
    return false;
  }
  try {
    const res = await pool.query('SELECT 1');
    return res && res.rowCount === 1;
  } catch (err) {
    return false;
  }
}

async function getCards() {
  if (pool) {
    const res = await pool.query('SELECT id::text, title, "column", position, created_at FROM cards ORDER BY position ASC, id ASC');
    return res.rows;
  }
  return [...inMemoryCards];
}

async function createCard({ title, column = 'todo' }) {
  if (pool) {
    const maxPosRes = await pool.query('SELECT COALESCE(MAX(position), -1) AS max_pos FROM cards WHERE "column" = $1', [column]);
    const nextPos = (maxPosRes.rows[0]?.max_pos ?? -1) + 1;
    const res = await pool.query(
      'INSERT INTO cards (title, "column", position) VALUES ($1, $2, $3) RETURNING id::text, title, "column", position, created_at',
      [title, column, nextPos]
    );
    return res.rows[0];
  }

  const newCard = {
    id: String(nextId++),
    title,
    column,
    position: inMemoryCards.filter((c) => c.column === column).length,
    created_at: new Date().toISOString(),
  };
  inMemoryCards.push(newCard);
  return newCard;
}

async function updateCard(id, updates) {
  if (pool) {
    const allowed = ['title', 'column', 'position'];
    const fields = [];
    const values = [];
    let idx = 1;

    for (const key of allowed) {
      if (updates[key] !== undefined) {
        fields.push(`"${key}" = $${idx++}`);
        values.push(updates[key]);
      }
    }

    if (fields.length === 0) return null;

    values.push(id);
    const query = `UPDATE cards SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id::text, title, "column", position, created_at`;
    const res = await pool.query(query, values);
    return res.rows[0] || null;
  }

  const card = inMemoryCards.find((c) => c.id === String(id));
  if (!card) return null;
  if (updates.title !== undefined) card.title = updates.title;
  if (updates.column !== undefined) card.column = updates.column;
  if (updates.position !== undefined) card.position = updates.position;
  return card;
}

async function deleteCard(id) {
  if (pool) {
    const res = await pool.query('DELETE FROM cards WHERE id = $1 RETURNING id::text', [id]);
    return res.rowCount > 0;
  }
  const initialLength = inMemoryCards.length;
  inMemoryCards = inMemoryCards.filter((c) => c.id !== String(id));
  return inMemoryCards.length < initialLength;
}

async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  initDb,
  migrate,
  isReady,
  getCards,
  createCard,
  updateCard,
  deleteCard,
  closeDb,
};
