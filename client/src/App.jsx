import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const COLUMNS = [
  { id: 'todo', title: 'To do', empty: 'nothing queued.', index: '01' },
  { id: 'in_progress', title: 'In progress', empty: 'nothing in flight.', index: '02' },
  { id: 'done', title: 'Done', empty: 'nothing shipped yet.', index: '03' },
];
const columnClass = (id) => `column-${id}`;
const cardId = (id) => `card-${id}`;

function relativeTime(value) {
  if (!value) return 'time unavailable';
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  if (!Number.isFinite(elapsed)) return 'time unavailable';
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function SortableCard({ card, onDelete, onEdit }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cardId(card.id), data: { card } });
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(card.title);
  const inputRef = useRef(null);
  useEffect(() => { setTitle(card.title); }, [card.title]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  const save = () => {
    const next = title.trim();
    setEditing(false);
    if (next && next !== card.title) onEdit(card, next);
    else setTitle(card.title);
  };
  return (
    <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`task-card ${isDragging ? 'is-dragging' : ''}`} {...attributes} {...listeners}>
      <div className="task-title" onDoubleClick={() => setEditing(true)} title="Double-click to edit">
        {editing ? <input ref={inputRef} aria-label="Edit card title" value={title} onChange={(event) => setTitle(event.target.value)} onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter') save(); if (event.key === 'Escape') { setTitle(card.title); setEditing(false); } }} onBlur={save} /> : card.title}
      </div>
      <div className="task-meta"><span className={`task-dot ${columnClass(card.column)}`} /><span>#{String(card.id).padStart(3, '0')}</span><span>·</span><time dateTime={card.created_at || undefined}>{relativeTime(card.created_at)}</time></div>
      <div className="task-actions"><button type="button" className="text-action" onPointerDown={(event) => event.stopPropagation()} onClick={() => setEditing(true)} aria-label={`Edit ${card.title}`}>edit</button><button type="button" className="text-action delete-action" onPointerDown={(event) => event.stopPropagation()} onClick={() => onDelete(card.id)} aria-label={`Delete ${card.title}`}>delete</button></div>
    </article>
  );
}

function BoardColumn({ column, cards, onDelete, onEdit }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { column: column.id } });
  return (
    <section ref={setNodeRef} className={`board-column ${columnClass(column.id)} ${isOver ? 'is-over' : ''}`} aria-label={`${column.title} column`}>
      <div className="column-topline" />
      <div className="column-heading"><h2>{column.index} <span>—</span> {column.title}</h2><span className="column-count">{String(cards.length).padStart(2, '0')}</span></div>
      <SortableContext items={cards.map((card) => cardId(card.id))} strategy={verticalListSortingStrategy}>
        <div className="column-cards">{cards.length ? cards.map((card) => <SortableCard key={card.id} card={card} onDelete={onDelete} onEdit={onEdit} />) : <p className="empty-state">{column.empty}</p>}</div>
      </SortableContext>
    </section>
  );
}

export default function App() {
  const [cards, setCards] = useState([]);
  const [newTitle, setNewTitle] = useState('');
  const [connection, setConnection] = useState('reconnecting');
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState({ hostname: 'unknown', build: 'dev' });
  const [toast, setToast] = useState('');
  const [activeCard, setActiveCard] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const inputRef = useRef(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const notifyError = useCallback((message) => { setToast(message); window.setTimeout(() => setToast(''), 3200); }, []);
  const fetchBoard = useCallback(async () => {
    try { const response = await fetch('/api/board'); if (response.ok) setCards((await response.json()).cards || []); }
    catch (error) { console.error('Failed to fetch board:', error); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let disposed = false;
    const connect = () => {
      if (disposed) return;
      setConnection(navigator.onLine ? 'reconnecting' : 'offline');
      const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${scheme}//${window.location.host}/ws`);
      wsRef.current = ws;
      ws.onopen = () => { reconnectAttemptRef.current = 0; setConnection('live'); };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'CARD_CREATED') setCards((prev) => prev.some((card) => String(card.id) === String(data.card.id)) ? prev : [...prev, data.card]);
          if (data.type === 'CARD_UPDATED') setCards((prev) => prev.map((card) => String(card.id) === String(data.card.id) ? data.card : card));
          if (data.type === 'CARD_DELETED') setCards((prev) => prev.filter((card) => String(card.id) !== String(data.cardId)));
        } catch (error) { console.warn('Error handling WebSocket message:', error); }
      };
      ws.onclose = () => {
        if (disposed) return;
        setConnection('reconnecting');
        const delay = Math.min(1000 * (2 ** reconnectAttemptRef.current), 15000);
        reconnectAttemptRef.current += 1;
        reconnectTimeoutRef.current = window.setTimeout(connect, delay * (0.8 + Math.random() * 0.4));
      };
      ws.onerror = () => ws.close();
    };
    const onOffline = () => setConnection('offline');
    const onOnline = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      setConnection('reconnecting');
      connect();
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    fetchBoard();
    fetch('/api/info').then((response) => response.ok ? response.json() : null).then((data) => { if (!disposed && data) setInfo(data); }).catch(() => {});
    connect();
    return () => { disposed = true; window.removeEventListener('offline', onOffline); window.removeEventListener('online', onOnline); if (wsRef.current) wsRef.current.close(); if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current); };
  }, [fetchBoard]);

  useEffect(() => {
    const onKeyDown = (event) => { if (event.key.toLowerCase() !== 'n' || event.metaKey || event.ctrlKey || event.altKey || event.target.closest('input, textarea, select, [contenteditable="true"]')) return; event.preventDefault(); inputRef.current?.focus(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const addCard = async (event) => {
    event.preventDefault();
    if (!newTitle.trim()) return;
    try {
      const response = await fetch('/api/cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newTitle.trim(), column: 'todo' }) });
      if (!response.ok) throw new Error();
      const card = await response.json(); setCards((prev) => prev.some((item) => String(item.id) === String(card.id)) ? prev : [...prev, card]); setNewTitle('');
    } catch { notifyError('Could not add card. Try again.'); }
  };

  const deleteCard = async (id) => {
    const previous = cards; setCards((current) => current.filter((card) => String(card.id) !== String(id)));
    try { const response = await fetch(`/api/cards/${id}`, { method: 'DELETE' }); if (!response.ok) throw new Error(); }
    catch { setCards(previous); notifyError('Could not delete card. Changes restored.'); }
  };

  const editCard = async (card, title) => {
    const previous = cards; setCards((current) => current.map((item) => item.id === card.id ? { ...item, title } : item));
    try { const response = await fetch(`/api/cards/${card.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) }); if (!response.ok) throw new Error(); const updated = await response.json(); setCards((current) => current.map((item) => item.id === updated.id ? updated : item)); }
    catch { setCards(previous); notifyError('Could not save title. Changes restored.'); }
  };

  const moveCard = async (id, targetColumn, position) => {
    const previous = cards;
    const moving = previous.find((card) => cardId(card.id) === id);
    if (!moving || !targetColumn) return;
    const sourceCards = previous.filter((card) => card.column === moving.column);
    const targetCards = moving.column === targetColumn ? sourceCards : previous.filter((card) => card.column === targetColumn);
    const boundedPosition = Math.max(0, Math.min(position ?? targetCards.length, targetCards.length));
    const reorderedTarget = moving.column === targetColumn
      ? arrayMove(sourceCards, sourceCards.findIndex((card) => card.id === moving.id), boundedPosition)
      : [...targetCards.slice(0, boundedPosition), { ...moving, column: targetColumn }, ...targetCards.slice(boundedPosition)];
    const reorderedSource = moving.column === targetColumn ? reorderedTarget : sourceCards.filter((card) => card.id !== moving.id);
    const next = COLUMNS.flatMap((column) => {
      const items = column.id === targetColumn ? reorderedTarget : column.id === moving.column ? reorderedSource : previous.filter((card) => card.column === column.id);
      return items.map((card, index) => ({ ...card, position: index }));
    });
    const nextPosition = reorderedTarget.findIndex((card) => card.id === moving.id);
    setCards(next);
    try { const response = await fetch(`/api/cards/${moving.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ column: targetColumn, position: nextPosition }) }); if (!response.ok) throw new Error(); const updated = await response.json(); setCards((current) => current.map((card) => card.id === updated.id ? updated : card)); }
    catch { setCards(previous); notifyError('Could not move card. Changes restored.'); }
  };

  const onDragEnd = ({ active, over }) => {
    setActiveCard(null);
    if (!over) return;
    const source = cards.find((card) => cardId(card.id) === active.id);
    if (!source) return;
    const targetCard = cards.find((card) => cardId(card.id) === over.id);
    const targetColumn = targetCard?.column || COLUMNS.find((column) => column.id === over.id)?.id;
    if (!targetColumn) return;
    const targetItems = cards.filter((card) => card.column === targetColumn);
    const fromIndex = targetItems.findIndex((card) => card.id === source.id);
    const targetIndex = targetCard ? targetItems.findIndex((card) => card.id === targetCard.id) : targetItems.length - 1;
    if (source.column === targetColumn && fromIndex === targetIndex) return;
    const insertionIndex = targetCard ? targetIndex : targetItems.length - (source.column === targetColumn ? 1 : 0);
    moveCard(active.id, targetColumn, insertionIndex);
  };

  const counts = COLUMNS.map((column) => cards.filter((card) => card.column === column.id).length);
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="Liveboard home"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="17" height="4" rx="1.5"/><rect x="3" y="10" width="13" height="4" rx="1.5"/><rect x="3" y="17" width="9" height="4" rx="1.5"/></svg><span>liveboard</span></a>
        <nav className="header-meta" aria-label="Service links"><a href="/healthz">healthz</a><a href="/readyz">readyz</a><a href="/metrics">metrics</a><span className={`connection connection-${connection}`} aria-live="polite"><i />{connection === 'live' ? 'live' : connection === 'offline' ? 'offline' : 'reconnecting…'}</span></nav>
      </header>
      <main className="page-content">
        <section className="intro"><svg className="title-swoop" viewBox="0 0 350 38" aria-hidden="true"><path d="M4 27C82 7 173 2 346 14" /></svg><p className="eyebrow">A shared space for work in motion</p><h1>What’s on the <em>board</em> today.</h1>
          <div className="stats-strip" aria-label="Board statistics"><div className="stat-cell"><span className="stat-label">Total cards</span><strong>{String(cards.length).padStart(2, '0')}</strong></div><div className="stat-cell"><span className="stat-label">In progress</span><strong>{String(counts[1]).padStart(2, '0')}</strong></div><div className="stat-cell"><span className="stat-label">Done</span><strong>{String(counts[2]).padStart(2, '0')}</strong></div><div className="stat-cell served-stat"><span className="stat-label">Served by</span><strong title={info.hostname}>{info.hostname}</strong></div></div>
        </section>
        <form className="add-card-form" onSubmit={addCard}><label className="visually-hidden" htmlFor="new-card">Add a card</label><div className="input-wrap"><input id="new-card" ref={inputRef} value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="what needs doing?" /><kbd>n</kbd></div><button type="submit" className="primary-button">add</button></form>
        {loading ? <p className="loading-state">Gathering the board…</p> : <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={({ active }) => setActiveCard(cards.find((card) => cardId(card.id) === active.id) || null)} onDragEnd={onDragEnd} onDragCancel={() => setActiveCard(null)}><div className="board-grid">{COLUMNS.map((column) => <BoardColumn key={column.id} column={column} cards={cards.filter((card) => card.column === column.id)} onDelete={deleteCard} onEdit={editCard} />)}</div><DragOverlay>{activeCard ? <article className="task-card overlay-card"><div className="task-title">{activeCard.title}</div></article> : null}</DragOverlay></DndContext>}
      </main>
      <footer className="build-band"><span>served by {info.hostname} · build {info.build}</span></footer>
      {toast && <div className="error-toast" role="alert">{toast}</div>}
    </div>
  );
}
