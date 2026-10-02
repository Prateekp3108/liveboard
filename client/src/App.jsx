import React, { useState, useEffect, useRef } from 'react';

const COLUMNS = [
  { id: 'todo', title: 'To Do' },
  { id: 'in_progress', title: 'In Progress' },
  { id: 'done', title: 'Done' },
];

export default function App() {
  const [cards, setCards] = useState([]);
  const [newTitle, setNewTitle] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  // Fetch initial board state
  const fetchBoard = async () => {
    try {
      const res = await fetch('/api/board');
      if (res.ok) {
        const data = await res.json();
        setCards(data.cards || []);
      }
    } catch (err) {
      console.error('Failed to fetch board:', err);
    } finally {
      setLoading(false);
    }
  };

  // WebSocket connection management
  const connectWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'CARD_CREATED') {
          setCards((prev) => {
            if (prev.some((c) => String(c.id) === String(data.card.id))) {
              return prev;
            }
            return [...prev, data.card];
          });
        } else if (data.type === 'CARD_UPDATED') {
          setCards((prev) =>
            prev.map((c) => (String(c.id) === String(data.card.id) ? data.card : c))
          );
        } else if (data.type === 'CARD_DELETED') {
          setCards((prev) => prev.filter((c) => String(c.id) !== String(data.cardId)));
        }
      } catch (err) {
        console.warn('Error handling WebSocket message:', err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };
  };

  useEffect(() => {
    fetchBoard();
    connectWebSocket();

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, []);

  // Card operations
  const handleAddCard = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      const res = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim(), column: 'todo' }),
      });
      if (res.ok) {
        setNewTitle('');
        const card = await res.json();
        // Optimistic / local update if WS takes a moment
        setCards((prev) => (prev.some((c) => c.id === card.id) ? prev : [...prev, card]));
      }
    } catch (err) {
      console.error('Failed to create card:', err);
    }
  };

  const handleMoveCard = async (card, direction) => {
    const colOrder = ['todo', 'in_progress', 'done'];
    const currentIndex = colOrder.indexOf(card.column);
    const newIndex = currentIndex + direction;

    if (newIndex < 0 || newIndex >= colOrder.length) return;
    const newColumn = colOrder[newIndex];

    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column: newColumn }),
      });
      if (res.ok) {
        const updated = await res.json();
        setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      }
    } catch (err) {
      console.error('Failed to move card:', err);
    }
  };

  const handleDeleteCard = async (id) => {
    try {
      const res = await fetch(`/api/cards/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setCards((prev) => prev.filter((c) => String(c.id) !== String(id)));
      }
    } catch (err) {
      console.error('Failed to delete card:', err);
    }
  };

  return (
    <div className="app-container">
      <header>
        <div className="logo-area">
          <span style={{ fontSize: '1.75rem' }}>📋</span>
          <h1>LiveBoard</h1>
        </div>
        <div className={`status-badge ${isConnected ? 'connected' : 'disconnected'}`}>
          <span className="status-dot"></span>
          <span>{isConnected ? 'Real-Time Sync Active' : 'Disconnected'}</span>
        </div>
      </header>

      <main>
        <form className="add-card-bar" onSubmit={handleAddCard}>
          <input
            type="text"
            placeholder="Add a new task (e.g. Write Helm chart, Setup Argo CD)..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <button type="submit" className="btn btn-primary">
            + Add Card
          </button>
        </form>

        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading board...</p>
        ) : (
          <div className="kanban-grid">
            {COLUMNS.map((col) => {
              const colCards = cards.filter((c) => c.column === col.id);
              return (
                <div key={col.id} className="column">
                  <div className="column-header">
                    <span className="column-title">{col.title}</span>
                    <span className="card-count">{colCards.length}</span>
                  </div>

                  <div className="cards-container">
                    {colCards.map((card) => (
                      <div key={card.id} className="card">
                        <div className="card-title">{card.title}</div>
                        <div className="card-actions">
                          <div className="card-nav-buttons">
                            <button
                              className="icon-btn"
                              title="Move left"
                              disabled={col.id === 'todo'}
                              onClick={() => handleMoveCard(card, -1)}
                            >
                              ←
                            </button>
                            <button
                              className="icon-btn"
                              title="Move right"
                              disabled={col.id === 'done'}
                              onClick={() => handleMoveCard(card, 1)}
                            >
                              →
                            </button>
                          </div>
                          <button
                            className="icon-btn icon-btn-danger"
                            title="Delete card"
                            onClick={() => handleDeleteCard(card.id)}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <footer>
        <span>LiveBoard v1.0.0 — DevOps Automated Kanban</span>
        <div style={{ display: 'flex', gap: '1.25rem' }}>
          <a href="/healthz" target="_blank" rel="noreferrer">/healthz</a>
          <a href="/readyz" target="_blank" rel="noreferrer">/readyz</a>
          <a href="/metrics" target="_blank" rel="noreferrer">/metrics</a>
        </div>
      </footer>
    </div>
  );
}
