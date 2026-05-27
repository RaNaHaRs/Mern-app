import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../store/AuthContext';

const API = '/api';
const SOCKET_URL = window.location.origin.replace(/:\d+$/, ':5000');
const getToken = () => localStorage.getItem('accessToken');

const initials = (name) => (name || '?').split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();
const isImageType = (mime) => mime && mime.startsWith('image/');
const buildRoom = (a, b) => `dm:${[String(a), String(b)].sort().join(':')}`;

function formatTime(value) {
  if (!value) return '';
  const d = new Date(value);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function attachmentUrl(filePath) {
  const token = getToken();
  return filePath && token ? `${filePath}?token=${encodeURIComponent(token)}` : filePath;
}

export default function TeamChatPage() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [messagesByUser, setMessagesByUser] = useState({});
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [file, setFile] = useState(null);
  const [connected, setConnected] = useState(false);
  const [onlineIds, setOnlineIds] = useState([]);
  const [typingByUser, setTypingByUser] = useState({});

  const socketRef = useRef(null);
  const typingTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const endRef = useRef(null);

  const selectedContact = useMemo(
    () => contacts.find((c) => String(c.id) === String(selectedUserId)) || null,
    [contacts, selectedUserId]
  );

  const selectedRoom = useMemo(() => {
    if (!selectedContact || !user?.id) return null;
    return buildRoom(user.id, selectedContact.id);
  }, [selectedContact, user?.id]);

  const selectedMessages = useMemo(
    () => (selectedUserId ? (messagesByUser[selectedUserId] || []) : []),
    [messagesByUser, selectedUserId]
  );

  const loadContacts = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const res = await fetch(`${API}/chat/contacts`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    const users = Array.isArray(data.users) ? data.users : [];
    setContacts(users);
    if (!selectedUserId && users[0]) setSelectedUserId(String(users[0].id));
  }, [selectedUserId]);

  const loadMessages = useCallback(async (otherUserId) => {
    const token = getToken();
    if (!token || !otherUserId) return;
    const res = await fetch(`${API}/chat/conversations/${otherUserId}/messages?limit=200`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    const messages = Array.isArray(data.messages) ? data.messages : [];
    setMessagesByUser((prev) => ({ ...prev, [otherUserId]: messages }));
  }, []);

  useEffect(() => {
    loadContacts().catch(() => {});
  }, [loadContacts]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const socket = io(SOCKET_URL, { auth: { token }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      if (selectedRoom) socket.emit('joinRoom', selectedRoom);
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('onlineUsers', (ids) => setOnlineIds((ids || []).map(String)));

    socket.on('newMessage', (msg) => {
      const otherId = String(msg.sender_id) === String(user?.id) ? String(selectedUserId) : String(msg.sender_id);
      if (!otherId) return;
      setMessagesByUser((prev) => {
        const current = prev[otherId] || [];
        if (current.some((m) => String(m.id) === String(msg.id))) return prev;
        return { ...prev, [otherId]: [...current, msg] };
      });
    });

    socket.on('messagesSeen', ({ room, userId }) => {
      if (!selectedRoom || room !== selectedRoom || String(userId) === String(user?.id)) return;
      setMessagesByUser((prev) => ({
        ...prev,
        [selectedUserId]: (prev[selectedUserId] || []).map((m) =>
          String(m.sender_id) === String(user?.id) ? { ...m, seen_at: new Date().toISOString() } : m
        ),
      }));
    });

    socket.on('messagesDelivered', ({ room, userId }) => {
      if (!selectedRoom || room !== selectedRoom || String(userId) === String(user?.id)) return;
      setMessagesByUser((prev) => ({
        ...prev,
        [selectedUserId]: (prev[selectedUserId] || []).map((m) =>
          String(m.sender_id) === String(user?.id) ? { ...m, delivered_at: m.delivered_at || new Date().toISOString() } : m
        ),
      }));
    });

    socket.on('typing', (name) => {
      if (!selectedUserId) return;
      setTypingByUser((prev) => ({ ...prev, [selectedUserId]: name }));
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        setTypingByUser((prev) => ({ ...prev, [selectedUserId]: null }));
      }, 1800);
    });

    return () => socket.disconnect();
  }, [selectedRoom, selectedUserId, user?.id]);

  useEffect(() => {
    if (!selectedUserId) return;
    loadMessages(selectedUserId).catch(() => {});
  }, [selectedUserId, loadMessages]);

  useEffect(() => {
    if (!selectedRoom || !socketRef.current) return;
    socketRef.current.emit('joinRoom', selectedRoom);
    socketRef.current.emit('markSeen', { room: selectedRoom });
  }, [selectedRoom]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedMessages, typingByUser, selectedUserId]);

  const sendMessage = async (e) => {
    e?.preventDefault();
    if (!selectedContact || (!input.trim() && !file) || sending) return;
    setSending(true);
    try {
      if (file) {
        const fd = new FormData();
        fd.append('recipientId', selectedContact.id);
        fd.append('file', file);
        if (input.trim()) fd.append('text', input.trim());
        const res = await fetch(`${API}/chat/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${getToken()}` },
          body: fd,
        });
        const saved = await res.json();
        setMessagesByUser((prev) => ({
          ...prev,
          [selectedUserId]: [...(prev[selectedUserId] || []), saved],
        }));
        setFile(null);
      } else {
        socketRef.current?.emit('sendMessage', {
          recipientId: selectedContact.id,
          text: input.trim(),
        });
      }
      setInput('');
    } finally {
      setSending(false);
    }
  };

  const onInputChange = (e) => {
    const next = e.target.value;
    setInput(next);
    if (next && selectedRoom && socketRef.current) {
      socketRef.current.emit('typing', { room: selectedRoom, userName: user?.fullName || user?.username || 'Someone' });
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Team Chat</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            Role-based real-time messaging ({connected ? 'live' : 'reconnecting'})
          </p>
        </div>
      </div>
      <div className="chat-layout">
        <div className="chat-sidebar">
          <div className="chat-sidebar-title">People</div>
          {contacts.map((contact) => {
            const online = onlineIds.includes(String(contact.id));
            return (
              <button
                key={contact.id}
                className={`chat-room-item ${String(selectedUserId) === String(contact.id) ? 'active' : ''}`}
                onClick={() => setSelectedUserId(String(contact.id))}
              >
                <span>{online ? '🟢' : '⚪'}</span>
                <span>{contact.full_name || contact.username}</span>
              </button>
            );
          })}
        </div>
        <div className="chat-messages-area">
          <div className="chat-header">
            <span>{selectedContact ? (selectedContact.full_name || selectedContact.username) : 'Select a contact'}</span>
            <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              {selectedContact?.role?.replace(/_/g, ' ') || ''}
            </span>
          </div>
          <div className="chat-messages-list">
            {selectedMessages.map((msg) => {
              const own = String(msg.sender_id) === String(user?.id);
              return (
                <div key={msg.id} className={`chat-msg ${own ? 'own' : ''}`}>
                  <div className="chat-msg-avatar">{initials(msg.sender_name || selectedContact?.full_name || 'U')}</div>
                  <div style={{ maxWidth: '70%' }}>
                    {msg.text ? <div className="chat-msg-bubble">{msg.text}</div> : null}
                    {msg.filePath ? (
                      <div className="chat-msg-bubble" style={{ padding: 8 }}>
                        {isImageType(msg.mimeType) ? (
                          <img
                            src={attachmentUrl(msg.filePath)}
                            alt="attachment"
                            style={{ maxWidth: 240, borderRadius: 8, cursor: 'pointer' }}
                            onClick={() => window.open(attachmentUrl(msg.filePath), '_blank')}
                          />
                        ) : (
                          <a href={attachmentUrl(msg.filePath)} target="_blank" rel="noreferrer" download>
                            {msg.fileName || msg.filePath.split('/').pop()}
                          </a>
                        )}
                      </div>
                    ) : null}
                    <div className="chat-msg-time">
                      {formatTime(msg.created_at)}
                      {own ? ` ${msg.seen_at ? 'Seen' : msg.delivered_at ? 'Delivered' : 'Sent'}` : ''}
                    </div>
                  </div>
                </div>
              );
            })}
            {typingByUser[selectedUserId] ? (
              <div className="chat-msg">
                <div className="chat-msg-avatar">...</div>
                <div className="chat-msg-bubble" style={{ fontStyle: 'italic' }}>
                  {typingByUser[selectedUserId]} is typing...
                </div>
              </div>
            ) : null}
            <div ref={endRef} />
          </div>
          <form className="chat-input-bar" onSubmit={sendMessage}>
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setFile(f);
                e.target.value = '';
              }}
              style={{ display: 'none' }}
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
            />
            <button type="button" onClick={() => fileInputRef.current?.click()} style={{ background: 'none', border: 'none' }}>
              📎
            </button>
            <input
              className="chat-input"
              value={input}
              onChange={onInputChange}
              placeholder={selectedContact ? `Message ${selectedContact.full_name || selectedContact.username}` : 'Select a user'}
              disabled={!selectedContact || sending}
            />
            <button className="chat-send-btn" type="submit" disabled={!selectedContact || (!input.trim() && !file) || sending}>
              ➤
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
