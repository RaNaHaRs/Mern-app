import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../store/AuthContext';

const API = '/api';
const SOCKET_URL = window.location.origin.replace(/:\d+$/, ':5000');

const getToken = () => localStorage.getItem('accessToken');
const authHeaders = () => ({ Authorization: `Bearer ${getToken()}` });

const ROOMS = [
  { id: 'general',   icon: '💬', name: 'General',       desc: 'Team-wide announcements' },
  { id: 'engineers', icon: '🔧', name: 'Engineers',      desc: 'Technical team chat' },
  { id: 'billing',   icon: '💼', name: 'Billing',        desc: 'Payment & invoice queries' },
  { id: 'cases',     icon: '📂', name: 'Case Updates',   desc: 'Case status discussion' },
];

const fmtTime = (iso) => {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return (
    d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) +
    ' ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  );
};

const initials = (name) =>
  name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';

const isImageType = (mime) => mime && mime.startsWith('image/');
const isPdfType   = (mime) => mime && mime.includes('pdf');

export default function TeamChatPage() {
  const { user } = useAuth();
  const [room, setRoom]           = useState('general');
  const [messages, setMessages]   = useState({});
  const [input, setInput]         = useState('');
  const [sending, setSending]     = useState(false);
  const [onlineIds, setOnlineIds] = useState([]);
  const [typing, setTyping]       = useState(null);
  const [connected, setConnected] = useState(false);
  const [file, setFile]           = useState(null);

  const messagesEndRef  = useRef(null);
  const socketRef       = useRef(null);
  const typingTimer     = useRef(null);
  const fileInputRef    = useRef(null);

  // ── Fetch history ─────────────────────────────────────────────
  const fetchHistory = useCallback(async (roomId) => {
    try {
      const res  = await fetch(`${API}/chat/messages?room=${roomId}`, { headers: authHeaders() });
      const data = await res.json();
      setMessages((prev) => ({ ...prev, [roomId]: data.messages || [] }));
    } catch (e) {
      console.warn('Failed to fetch chat history', e);
    }
  }, []);

  // ── Socket.io setup ───────────────────────────────────────────
  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('joinRoom', room);
      fetchHistory(room);
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('newMessage', (msg) => {
      setMessages((prev) => {
        const roomId  = msg.room || room;
        const current = prev[roomId] || [];
        // Avoid duplicates
        if (current.some((m) => m.id === msg.id)) return prev;
        return { ...prev, [roomId]: [...current, msg] };
      });
    });

    socket.on('onlineUsers', (ids) => setOnlineIds(ids));

    socket.on('typing', (userName) => {
      setTyping(userName);
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTyping(null), 2000);
    });

    return () => {
      socket.disconnect();
      clearTimeout(typingTimer.current);
    };
  }, []); // run once

  // ── Switch room ───────────────────────────────────────────────
  useEffect(() => {
    if (!socketRef.current) return;
    socketRef.current.emit('joinRoom', room);
    fetchHistory(room);
  }, [room, fetchHistory]);

  // ── Auto-scroll ───────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages[room]]);

  // ── Typing indicator emit ─────────────────────────────────────
  const handleInputChange = (e) => {
    setInput(e.target.value);
    if (socketRef.current && connected) {
      socketRef.current.emit('typing', {
        room,
        userName: user?.fullName || user?.username || 'Someone',
      });
    }
  };

  // ── Send message ──────────────────────────────────────────────
  const sendMessage = async (e) => {
    e?.preventDefault();
    if ((!input.trim() && !file) || sending) return;
    setSending(true);

    try {
      if (file) {
        // File upload via REST then broadcast via socket
        const formData = new FormData();
        formData.append('room', room);
        formData.append('file', file);
        if (input.trim()) formData.append('text', input.trim());

        const res = await fetch(`${API}/chat/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${getToken()}` },
          body: formData,
        });
        const saved = await res.json();
        // Add room to saved so socket listener deduplicates properly
        saved.room = room;
        // Emit to socket room so others see it
        socketRef.current?.emit('sendMessage', {
          room,
          text: saved.text || input.trim() || null,
          filePath: saved.filePath,
          mimeType: saved.mimeType,
        });
        // Also locally append immediately
        setMessages((prev) => {
          const current = prev[room] || [];
          if (current.some((m) => m.id === saved.id)) return prev;
          return { ...prev, [room]: [...current, { ...saved, sender_id: user?.id, sender_name: user?.fullName || user?.username }] };
        });
        setFile(null);
      } else {
        // Text only via socket
        const textMsg = input.trim();
        socketRef.current?.emit('sendMessage', { room, text: textMsg });
        // Optimistic update
        const tempMsg = {
          id: `temp_${Date.now()}`,
          room,
          text: textMsg,
          sender_id:   user?.id,
          sender_name: user?.fullName || user?.username || 'You',
          sender_role: user?.role,
          created_at:  new Date().toISOString(),
          is_own: true,
        };
        setMessages((prev) => ({ ...prev, [room]: [...(prev[room] || []), tempMsg] }));
      }
      setInput('');
    } catch (err) {
      console.error('sendMessage error', err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
    e.target.value = '';
  };

  const currentRoom = ROOMS.find((r) => r.id === room);
  const msgs        = messages[room] || [];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>💬 Team Chat</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            Real-time internal communication &nbsp;
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: '0.7rem',
              color: connected ? 'var(--status-success)' : 'var(--status-error)',
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: connected ? 'var(--status-success)' : 'var(--status-error)', display: 'inline-block' }} />
              {connected ? 'Live' : 'Reconnecting…'}
            </span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {onlineIds.slice(0, 6).map((uid, i) => (
            <div key={uid} title={`User #${uid}`} style={{
              width: 28, height: 28, borderRadius: '50%',
              background: `linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.6rem', fontWeight: 700, color: 'white',
              border: '2px solid var(--status-success)',
              marginLeft: i > 0 ? -8 : 0, zIndex: 10 - i, position: 'relative',
            }}>
              {uid === user?.id ? initials(user?.fullName || user?.username) : uid.toString().slice(-2)}
            </div>
          ))}
          {onlineIds.length > 0 && (
            <span style={{ fontSize: '0.72rem', color: 'var(--status-success)', marginLeft: 6 }}>
              {onlineIds.length} online
            </span>
          )}
        </div>
      </div>

      <div className="chat-layout">
        {/* Sidebar */}
        <div className="chat-sidebar">
          <div className="chat-sidebar-title">Channels</div>
          {ROOMS.map((r) => (
            <button
              key={r.id}
              className={`chat-room-item ${room === r.id ? 'active' : ''}`}
              onClick={() => setRoom(r.id)}
            >
              <span style={{ fontSize: '1.1rem' }}>{r.icon}</span>
              <span>{r.name}</span>
            </button>
          ))}

          <div style={{ flex: 1 }} />

          {/* Current user */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>You</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.7rem', fontWeight: 700, color: 'white', flexShrink: 0,
              }}>
                {initials(user?.fullName || user?.username)}
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {user?.fullName || user?.username}
                </div>
                <div style={{ fontSize: '0.62rem', color: 'var(--status-success)' }}>● Online</div>
              </div>
            </div>
          </div>
        </div>

        {/* Message area */}
        <div className="chat-messages-area">
          <div className="chat-header">
            <span style={{ fontSize: '1.2rem' }}>{currentRoom?.icon}</span>
            <span>{currentRoom?.name}</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>
              — {currentRoom?.desc}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: connected ? 'var(--status-success)' : 'var(--text-muted)' }}>
              {connected ? '⚡ Live' : '⏳ Connecting…'}
            </span>
          </div>

          <div className="chat-messages-list">
            {msgs.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: 8 }}>
                <div style={{ fontSize: '2.5rem' }}>{currentRoom?.icon}</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>No messages yet in #{currentRoom?.name}</div>
                <div style={{ fontSize: '0.75rem' }}>Be the first to say something!</div>
              </div>
            ) : (
              msgs.map((msg, i) => {
                const isOwn      = msg.sender_id === user?.id || msg.is_own;
                const showAvatar = i === 0 || msgs[i - 1]?.sender_id !== msg.sender_id;
                return (
                  <div key={msg.id || i} className={`chat-msg ${isOwn ? 'own' : ''}`}>
                    <div className="chat-msg-avatar" style={{ visibility: showAvatar ? 'visible' : 'hidden' }}>
                      {initials(msg.sender_name)}
                    </div>
                    <div style={{ maxWidth: '70%' }}>
                      {showAvatar && (
                        <div className="chat-msg-name">
                          {isOwn ? 'You' : msg.sender_name}
                          {msg.sender_role && (
                            <span style={{ marginLeft: 6, opacity: 0.6, fontWeight: 400, fontSize: '0.6rem' }}>
                              ({msg.sender_role?.replace(/_/g, ' ')})
                            </span>
                          )}
                        </div>
                      )}

                      {/* Text */}
                      {msg.text && (
                        <div className="chat-msg-bubble">{msg.text}</div>
                      )}

                      {/* File / Image attachment */}
                      {msg.filePath && (
                        <div className="chat-msg-bubble" style={{ padding: 8 }}>
                          {isImageType(msg.mimeType) ? (
                            <img
                              src={msg.filePath}
                              alt="attachment"
                              style={{ maxWidth: 240, maxHeight: 200, borderRadius: 8, display: 'block', cursor: 'pointer' }}
                              onClick={() => window.open(msg.filePath, '_blank')}
                            />
                          ) : (
                            <a
                              href={msg.filePath}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}
                            >
                              {isPdfType(msg.mimeType) ? '📄' : '📎'}
                              {msg.filePath.split('/').pop()}
                            </a>
                          )}
                        </div>
                      )}

                      <div className="chat-msg-time">{fmtTime(msg.created_at)}</div>
                    </div>
                  </div>
                );
              })
            )}

            {/* Typing indicator */}
            {typing && (
              <div className="chat-msg">
                <div className="chat-msg-avatar">…</div>
                <div className="chat-msg-bubble" style={{ color: 'var(--text-muted)', fontStyle: 'italic', padding: '6px 12px' }}>
                  <span style={{ display: 'inline-flex', gap: 3 }}>
                    <span className="typing-dot" />
                    <span className="typing-dot" style={{ animationDelay: '0.2s' }} />
                    <span className="typing-dot" style={{ animationDelay: '0.4s' }} />
                  </span>
                  &nbsp;{typing} is typing…
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input bar */}
          <form className="chat-input-bar" onSubmit={sendMessage}>
            {/* File preview */}
            {file && (
              <div style={{
                position: 'absolute', bottom: '100%', left: 0, right: 0,
                background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                borderRadius: '8px 8px 0 0', padding: '8px 14px',
                display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem',
              }}>
                <span>📎 {file.name}</span>
                <button type="button" onClick={() => setFile(null)}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--status-error)', cursor: 'pointer', fontSize: '1rem' }}>
                  ✕
                </button>
              </div>
            )}

            {/* Hidden file input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              style={{ display: 'none' }}
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
            />

            {/* Attach button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach file"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '1.15rem', padding: '0 8px', color: 'var(--text-muted)',
                display: 'flex', alignItems: 'center',
              }}
            >
              📎
            </button>

            <input
              className="chat-input"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={file ? 'Add a caption… (Enter to send)' : `Message #${currentRoom?.name}… (Enter to send)`}
              disabled={sending}
              autoFocus
            />
            <button
              type="submit"
              className="chat-send-btn"
              disabled={(!input.trim() && !file) || sending}
              title="Send message"
            >
              {sending ? '…' : '➤'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
