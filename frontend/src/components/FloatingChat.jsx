import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import UserAvatar from './UserAvatar';

const BTN_POS_KEY = 'chat_fab_pos';

export default function FloatingChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState(() => sessionStorage.getItem('activeTab_FloatingChat') || 'focused');
  useEffect(() => { sessionStorage.setItem('activeTab_FloatingChat', activeTab); }, [activeTab]);
  const [newMessageText, setNewMessageText] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);

  const messageEndRef = useRef(null);

  const [socket, setSocket] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUser, setTypingUser] = useState(null);
  const typingTimerRef = useRef(null);

  // Refs to prevent stale closures in socket events
  const contactsRef = useRef([]);
  const currentUserRef = useRef(null);
  const selectedChatIdRef = useRef(null);
  const chatsRef = useRef([]);

  // Draggable FAB position (persisted in localStorage)
  const [fabPos, setFabPos] = useState(() => {
    try { return JSON.parse(localStorage.getItem(BTN_POS_KEY)) || { right: 24, bottom: 24 }; }
    catch { return { right: 24, bottom: 24 }; }
  });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const fabPosRef = useRef(fabPos);
  useEffect(() => { fabPosRef.current = fabPos; }, [fabPos]);
  useEffect(() => { localStorage.setItem(BTN_POS_KEY, JSON.stringify(fabPos)); }, [fabPos]);

  useEffect(() => {
    contactsRef.current = contacts;
  }, [contacts]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    selectedChatIdRef.current = selectedChatId;
  }, [selectedChatId]);

  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  useEffect(() => {
    if (messageEndRef.current) {
      messageEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedChatId, chats]);

  const roomForUser = (a, b) => {
    try {
      const ids = [String(a), String(b)].sort();
      return `dm:${ids[0]}:${ids[1]}`;
    } catch {
      return null;
    }
  };

  const attachmentUrl = (message) => {
    const token = localStorage.getItem('accessToken');
    return message?.filePath && token ? `${message.filePath}?token=${encodeURIComponent(token)}` : message?.filePath;
  };

  // Initialize socket + load current user + contact list + conversations
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(user => setCurrentUser(user))
      .catch(err => console.warn('Failed to fetch current user', err));

    fetch('/api/chat/contacts', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (data.users) setContacts(data.users || []);
        if (data.conversations) {
          const loadedChats = (data.conversations || []).map((conv) => {
            const contactName = conv.participant?.full_name || conv.participant?.username || 'Unknown';
            return {
              id: `conv-${conv.participant.id}`,
              participantId: conv.participant.id,
              name: contactName,
              role: conv.participant.role,
              avatarUrl: conv.participant.avatar_url || null,
              lastMessage: conv.lastMessage ? (conv.lastMessage.text || (conv.lastMessage.filePath ? '📎 Attachment' : '')) : '',
              time: conv.lastMessage?.created_at 
                ? new Date(conv.lastMessage.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) 
                : '',
              unread: Number(conv.unread_count || 0),
              tab: (conv.participant.role === 'admin' || conv.participant.role === 'super_admin') ? 'focused' : 'other',
              room: conv.room,
              messages: [],
            };
          });
          setChats(loadedChats);
        }
      })
      .catch(err => console.warn('Failed to fetch chat contacts', err));

    const backendUrl = window.location.origin;
    const s = io(backendUrl, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      transports: ['websocket', 'polling'],
    });

    setSocket(s);

    s.on('connect', () => {
      console.info('Socket connected');
      const activeChat = chatsRef.current.find((c) => c.id === selectedChatIdRef.current);
      if (activeChat?.room) {
        s.emit('joinRoom', activeChat.room);
      }
    });

    s.on('disconnect', () => {
      console.warn('Socket disconnected');
    });

    s.on('connect_error', (err) => {
      console.error('Socket connection error', err);
    });

    s.on('onlineUsers', (users) => {
      setOnlineUsers(Array.isArray(users) ? users.map(String) : []);
    });

    s.on('newMessage', (msg) => {
      const currentUserId = currentUserRef.current?.id;
      const otherId = String(msg.sender_id) === String(currentUserId) 
        ? String(msg.recipient_id) 
        : String(msg.sender_id);

      if (!otherId || otherId === 'undefined') return;

      setChats((prev) => {
        const existing = prev.find((c) => c.room === msg.room);
        const isOwn = String(msg.sender_id) === String(currentUserId);

        const formattedMsg = {
          id: msg.id,
          sender: isOwn ? 'me' : 'them',
          text: msg.text || '',
          time: new Date(msg.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          filePath: msg.filePath,
          mimeType: msg.mimeType,
          created_at: msg.created_at,
          seen: !!msg.seen_at,
        };

        if (existing) {
          if (existing.messages.some((m) => String(m.id) === String(msg.id))) return prev;

          return prev.map((c) =>
            c.room === msg.room
              ? {
                  ...c,
                  messages: [...(c.messages || []), formattedMsg],
                  lastMessage: msg.text || (msg.filePath ? '📎 Attachment' : ''),
                  time: new Date(msg.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
                  unread: !isOwn && selectedChatIdRef.current !== c.id ? c.unread + 1 : c.unread,
                }
              : c
          );
        } else {
          const contact = contactsRef.current.find((u) => String(u.id) === String(otherId));
          if (!contact) return prev;

          const newChat = {
            id: `conv-${contact.id}`,
            participantId: contact.id,
            name: contact.full_name || contact.username,
            role: contact.role,
            avatarUrl: contact.avatar_url || null,
            lastMessage: msg.text || (msg.filePath ? '📎 Attachment' : ''),
            time: new Date(msg.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
            unread: isOwn ? 0 : 1,
            tab: (contact.role === 'admin' || contact.role === 'super_admin') ? 'focused' : 'other',
            room: msg.room,
            messages: [formattedMsg],
          };
          return [newChat, ...prev];
        }
      });
    });

    s.on('messagesSeen', ({ room, userId }) => {
      setChats(prev => prev.map(c => 
        c.room === room 
          ? { 
              ...c, 
              unread: 0,
              messages: (c.messages || []).map(m => ({ ...m, seen: true })) 
            } 
          : c
      ));
    });

    s.on('typing', ({ userName }) => {
      const activeChat = chatsRef.current.find((c) => c.id === selectedChatIdRef.current);
      if (!activeChat) return;
      setTypingUser(userName);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        setTypingUser(null);
      }, 1800);
    });

    s.on('error', (err) => {
      console.error('Socket error:', err);
    });

    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      s.disconnect();
    };
  }, []);

  const activeChat = chats.find(c => c.id === selectedChatId);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!newMessageText.trim() || !selectedChatId || !currentUser) return;

    const chat = chats.find(c => c.id === selectedChatId);
    if (!chat) return;

    if (socket && chat.room) {
      socket.emit('sendMessage', {
        room: chat.room,
        recipientId: chat.participantId,
        text: newMessageText.trim(),
      });
    }

    setNewMessageText('');
  };

  const fileInputRef = useRef(null);
  const handleFileSelect = async (file) => {
    if (!file || !selectedChatId || !currentUser) return;
    const chat = chats.find(c => c.id === selectedChatId);
    if (!chat) return;
    const room = chat.room;
    const token = localStorage.getItem('accessToken');
    const fd = new FormData();
    fd.append('room', room);
    fd.append('recipientId', chat.participantId);
    fd.append('file', file);
    try {
      const res = await fetch('/api/chat/messages', { method: 'POST', body: fd, headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Upload failed');
    } catch (e) {
      console.warn('File upload failed', e.message);
    }
  };

  const handleSelectChat = (id) => {
    const chat = chats.find(c => c.id === id);
    setSelectedChatId(id);

    setChats(prevChats => prevChats.map(c => c.id === id ? { ...c, unread: 0 } : c));

    if (!chat || !chat.participantId || !currentUser) return;

    // Always join room and mark seen if socket is available
    if (socket && chat.room) {
      socket.emit('joinRoom', chat.room);
      socket.emit('markSeen', { room: chat.room });
    }

    // Always load messages from DB regardless of socket state
    setLoadingMessages(true);
    const token = localStorage.getItem('accessToken');
    fetch(`/api/chat/conversations/${chat.participantId}/messages?limit=200`, { 
      headers: { Authorization: `Bearer ${token}` } 
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.messages)) {
          setChats(prev => prev.map(pc => 
            pc.id === id 
              ? {
                  ...pc, 
                  messages: data.messages.map(m => ({
                    id: m.id,
                    sender: String(m.sender_id) === String(currentUser.id) ? 'me' : 'them',
                    text: m.text || '',
                    time: new Date(m.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
                    filePath: m.filePath,
                    mimeType: m.mimeType,
                    created_at: m.created_at,
                    seen: !!m.seen_at,
                  }))
                }
              : pc
          ));
        }
      })
      .catch(err => console.warn('Failed to load message history', err))
      .finally(() => setLoadingMessages(false));
  };

  const totalUnread = chats.reduce((acc, c) => acc + c.unread, 0);

  const filteredContacts = contacts.filter(user => {
    if (currentUser && String(user.id) === String(currentUser.id)) return false;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      const match = (user.full_name || user.username || '').toLowerCase().includes(q) || (user.role || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    if (activeTab === 'focused') {
      return user.role === 'admin' || user.role === 'super_admin';
    }
    return user.role !== 'admin' && user.role !== 'super_admin';
  });

  const handleFabMouseDown = (e) => {
    dragStart.current = { x: e.clientX, y: e.clientY };
    isDragging.current = false;
    const onMove = (ev) => {
      const dx = ev.clientX - dragStart.current.x;
      const dy = ev.clientY - dragStart.current.y;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        isDragging.current = true;
        const pos = fabPosRef.current;
        const newRight = pos.right !== undefined ? Math.max(0, pos.right - dx) : undefined;
        const newBottom = pos.bottom !== undefined ? Math.max(0, pos.bottom - dy) : undefined;
        if (newRight !== undefined) { setFabPos({ right: newRight, bottom: newBottom || pos.bottom }); }
        dragStart.current = { x: ev.clientX, y: ev.clientY };
      }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div className="floating-chat-container" style={{ right: fabPos.right, bottom: fabPos.bottom }}>
      <div className={`floating-chat-panel ${isOpen ? 'open' : ''}`}>

        {/* Panel Header */}
        <div className="chat-panel-header">
          {activeChat ? (
            <div className="chat-header-back-wrapper">
              <button className="chat-back-btn" onClick={() => setSelectedChatId(null)}>
                ←
              </button>
              <div className="chat-active-user-info">
                <UserAvatar
                  name={activeChat.name}
                  avatarUrl={activeChat.avatarUrl}
                  size={32}
                  className="chat-user-avatar-sm"
                  style={{ flexShrink: 0 }}
                />
                <div className="chat-user-name-meta">
                  <div className="chat-header-user-name">{activeChat.name}</div>
                  <div className="chat-header-user-role">{activeChat.role}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="chat-header-default-title">
              <span className="chat-header-icon">💬</span>
              <div>
                <div className="chat-header-title">Lab Messenger</div>
                <div className="chat-header-subtitle">Secure team communications</div>
              </div>
            </div>
          )}
          <button className="chat-close-panel-btn" onClick={() => { setIsOpen(false); setSelectedChatId(null); }}>
            ✕
          </button>
        </div>

        {/* Panel Body */}
        {activeChat ? (
          <div className="chat-thread-container">
            <div className="chat-messages-scroller">
              {activeChat.messages.map(msg => (
                <div key={msg.id} className={`chat-message-bubble-row ${msg.sender}`}>
                  <div className="chat-message-bubble">
                    {msg.filePath ? (
                      <div className="chat-message-attachment">
                        <a href={attachmentUrl(msg)} target="_blank" rel="noreferrer" download>
                          {msg.fileName || msg.filePath.split('/').pop()}
                        </a>
                      </div>
                    ) : (
                      <div className="chat-message-text">{msg.text}</div>
                    )}
                    <div className="chat-message-time">{msg.time} {msg.seen ? '✓' : ''}</div>
                  </div>
                </div>
              ))}
              {typingUser && (
                <div className="chat-message-bubble-row them">
                  <div className="chat-message-bubble" style={{ opacity: 0.8 }}>
                    <div className="chat-message-text" style={{ fontStyle: 'italic' }}>
                      {typingUser} is typing...
                    </div>
                  </div>
                </div>
              )}
              <div ref={messageEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="chat-input-form">
              <input
                type="text"
                placeholder="Type a secure message..."
                value={newMessageText}
                onChange={e => {
                  setNewMessageText(e.target.value);
                  if (e.target.value && socket && activeChat?.room) {
                    socket.emit('typing', {
                      room: activeChat.room,
                      userName: currentUser?.fullName || currentUser?.username || 'User',
                    });
                  }
                }}
                className="chat-input-field"
                maxLength={400}
                required
              />
              <input type="file" style={{ display: 'none' }} ref={fileInputRef} onChange={(e) => handleFileSelect(e.target.files[0])} />
              <button type="button" className="chat-attach-btn" onClick={() => fileInputRef.current && fileInputRef.current.click()} title="Attach file">📎</button>
              <button type="submit" className="chat-send-btn">
                Send
              </button>
            </form>
          </div>
        ) : (
          <div className="chat-list-container">
            <div className="chat-search-wrapper">
              <span className="chat-search-icon">🔍</span>
              <input
                type="text"
                placeholder="Search staff or bots..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="chat-search-input"
              />
            </div>

            <div className="chat-tabs-bar">
              <button 
                className={`chat-tab-btn ${activeTab === 'focused' ? 'active' : ''}`}
                onClick={() => setActiveTab('focused')}
              >
                Focused
              </button>
              <button 
                className={`chat-tab-btn ${activeTab === 'other' ? 'active' : ''}`}
                onClick={() => setActiveTab('other')}
              >
                Other
              </button>
            </div>

            <div className="chat-list-scroller">
                {filteredContacts.length > 0 ? (
                  filteredContacts.map(user => {
                    const id = `conv-${user.id}`;
                    const isOnline = onlineUsers.includes(String(user.id));
                    const conversation = chats.find(c => String(c.participantId) === String(user.id));

                    return (
                    <div 
                      key={user.id} 
                      className="chat-item-row"
                      onClick={() => {
                        const existing = chats.find(c => c.participantId === user.id || c.id === id);
                        if (!existing) {
                          const room = roomForUser(currentUser ? currentUser.id : 'me', user.id);
                          const newChat = {
                            id,
                            participantId: user.id,
                            name: user.full_name || user.username,
                            role: user.role,
                            avatarUrl: user.avatar_url || null,
                            lastMessage: '',
                            time: '',
                            unread: 0,
                            tab: (user.role === 'admin' || user.role === 'super_admin') ? 'focused' : 'other',
                            room,
                            messages: []
                          };
                          setChats(prev => [newChat, ...prev]);
                          setTimeout(() => handleSelectChat(id), 50);
                        } else {
                          setSelectedChatId(existing.id);
                          handleSelectChat(existing.id);
                        }
                      }}
                    >
                      <div className="chat-user-avatar-wrapper" style={{ position: 'relative' }}>
                        <UserAvatar
                          name={user.full_name || user.username}
                          avatarUrl={user.avatar_url || null}
                          size={38}
                          className="chat-user-avatar"
                        />
                        <div style={{ position: 'absolute', top: -4, right: -4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                          {isOnline && (
                            <span style={{
                              width: 10, height: 10,
                              borderRadius: '50%', background: '#10b981', border: '2px solid var(--bg-card)',
                              display: 'inline-block'
                            }} />
                          )}
                          {conversation && conversation.unread > 0 && (
                            <span style={{
                              minWidth: 18, height: 18, borderRadius: 999,
                              background: '#ef4444', color: '#ffffff',
                              fontSize: 10, fontWeight: 700,
                              lineHeight: '18px', textAlign: 'center',
                              padding: '0 4px', border: '2px solid var(--bg-card)',
                              boxSizing: 'border-box',
                            }}>
                              {conversation.unread > 9 ? '9+' : conversation.unread}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="chat-item-mid">
                        <div className="chat-item-row-top" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="chat-item-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>{user.full_name || user.username}</span>
                          {user.role === 'super_admin' && (
                            <span className="chat-role-badge" style={{
                              fontSize: '0.6rem',
                              fontWeight: '700',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              background: 'rgba(239, 68, 68, 0.2)',
                              color: '#f87171',
                              border: '1px solid rgba(239, 68, 68, 0.4)',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                              display: 'inline-block',
                              flexShrink: 0
                            }}>Super Admin</span>
                          )}
                          {user.role === 'admin' && (
                            <span className="chat-role-badge" style={{
                              fontSize: '0.6rem',
                              fontWeight: '700',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              background: 'rgba(139, 92, 246, 0.25)',
                              color: '#a78bfa',
                              border: '1px solid rgba(139, 92, 246, 0.4)',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                              display: 'inline-block',
                              flexShrink: 0
                            }}>Admin</span>
                          )}
                          {user.role !== 'admin' && user.role !== 'super_admin' && (
                            <span className="chat-role-badge" style={{
                              fontSize: '0.6rem',
                              fontWeight: '700',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              background: 'rgba(59, 130, 246, 0.2)',
                              color: '#60a5fa',
                              border: '1px solid rgba(59, 130, 246, 0.4)',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                              display: 'inline-block',
                              flexShrink: 0
                            }}>{user.role.replace(/_/g, ' ')}</span>
                          )}
                          <span className="chat-item-time" style={{ marginLeft: 'auto', flexShrink: 0 }}>{conversation?.time || (isOnline ? 'online' : '')}</span>
                        </div>
                        <div className="chat-item-row-bottom" style={{ display: 'flex', alignItems: 'center' }}>
                          <span className="chat-item-preview" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                            {conversation?.lastMessage || user.role.replace(/_/g, ' ')}
                          </span>
                          {conversation && conversation.unread > 0 && (
                            <span className="chat-item-unread-badge sa-chat-unread-badge" style={{ marginLeft: 'auto' }}>
                              {conversation.unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )})
              ) : (
                <div className="chat-empty-state">
                  <div className="chat-empty-icon">💬</div>
                  <div className="chat-empty-text">No users found</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── 2. Floating Action Button (FAB) ── */}
      <button 
        className={`floating-chat-btn ${isOpen ? 'active' : ''}`} 
        onMouseDown={handleFabMouseDown}
        onClick={() => {
          if (!isDragging.current) {
            if (!isOpen) setSelectedChatId(null);
            setIsOpen(prev => !prev);
          }
        }}
        title="Toggle Team Chat"
      >
        <span className="chat-btn-icon">💬</span>
        {totalUnread > 0 && !isOpen && (
          <span className="chat-btn-unread-badge">{totalUnread}</span>
        )}
      </button>
    </div>
  );
}
