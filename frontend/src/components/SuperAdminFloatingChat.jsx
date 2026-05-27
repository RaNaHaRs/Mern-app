import React, { useState, useEffect, useRef, useMemo } from 'react';
import { io } from 'socket.io-client';

const initials = (name) => (name || '?').split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();

export default function SuperAdminFloatingChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('focused');
  const [newMessageText, setNewMessageText] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [socket, setSocket] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUser, setTypingUser] = useState(null);
  const [connected, setConnected] = useState(false);

  const messageEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimerRef = useRef(null);

  // Refs to prevent stale closures in socket events
  const contactsRef = useRef([]);
  const currentUserRef = useRef(null);
  const selectedChatIdRef = useRef(null);
  const chatsRef = useRef([]);

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

  // Scroll to bottom when conversation changes or new message is added
  useEffect(() => {
    if (messageEndRef.current) {
      messageEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedChatId, chats, typingUser]);

  // Initialize socket connection + load user and contacts
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    // Fetch self
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((user) => setCurrentUser(user))
      .catch(() => {});

    // Fetch allowed chat users and recent conversations
    fetch('/api/chat/contacts', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        if (data.users) setContacts(data.users || []);
        if (data.conversations) {
          const loadedChats = (data.conversations || []).map((conv) => ({
            id: `conv-${conv.participant.id}`,
            participantId: conv.participant.id,
            name: conv.participant.full_name || conv.participant.username,
            role: conv.participant.role,
            avatar: initials(conv.participant.full_name || conv.participant.username),
            avatarBg: conv.participant.role === 'admin' ? 'linear-gradient(135deg, #8b5cf6, #6d28d9)' : 'linear-gradient(135deg, #0ea5e9, #0369a1)',
            lastMessage: conv.lastMessage ? (conv.lastMessage.text || (conv.lastMessage.filePath ? 'Attachment' : '')) : '',
            time: conv.lastMessage && conv.lastMessage.created_at ? new Date(conv.lastMessage.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '',
            unread: 0,
            tab: (conv.participant.role === 'admin' || conv.participant.role === 'super_admin') ? 'focused' : 'other',
            room: conv.room,
            messages: [],
          }));
          setChats(loadedChats);
        }
      })
      .catch(() => {});

    // Establish socket connection (uses Vite dev server proxy or direct url fallback)
    const backendUrl = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:5001`;
    const s = io(backendUrl, { auth: { token } });
    setSocket(s);

    s.on('connect', () => {
      setConnected(true);
      // Join active room if there is one already selected
      const activeChat = chatsRef.current.find((c) => c.id === selectedChatIdRef.current);
      if (activeChat?.room) s.emit('joinRoom', activeChat.room);
    });

    s.on('disconnect', () => {
      setConnected(false);
    });

    s.on('onlineUsers', (users) => {
      setOnlineUsers(Array.isArray(users) ? users.map(String) : []);
    });

    s.on('newMessage', (msg) => {
      const currentUserId = currentUserRef.current?.id;
      const otherId = String(msg.sender_id) === String(currentUserId) ? String(msg.recipientId) : String(msg.sender_id);
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
        };

        if (existing) {
          if (existing.messages.some((m) => String(m.id) === String(msg.id))) return prev;
          return prev.map((c) =>
            c.room === msg.room
              ? {
                  ...c,
                  messages: [...(c.messages || []), formattedMsg],
                  lastMessage: msg.text || (msg.filePath ? 'Attachment' : ''),
                  time: new Date(msg.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
                  unread: isOwn || selectedChatIdRef.current === c.id ? c.unread : c.unread + 1,
                }
              : c
          );
        } else {
          // If the conversation is brand new, resolve contact info from list
          const contact = contactsRef.current.find((u) => String(u.id) === String(otherId));
          if (!contact) return prev;

          const newChat = {
            id: `conv-${contact.id}`,
            participantId: contact.id,
            name: contact.full_name || contact.username,
            role: contact.role,
            avatar: initials(contact.full_name || contact.username),
            avatarBg: contact.role === 'admin' ? 'linear-gradient(135deg, #8b5cf6, #6d28d9)' : 'linear-gradient(135deg, #0ea5e9, #0369a1)',
            lastMessage: msg.text || (msg.filePath ? 'Attachment' : ''),
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

    s.on('messagesSeen', ({ room }) => {
      setChats((prev) =>
        prev.map((c) =>
          c.room === room
            ? {
                ...c,
                messages: (c.messages || []).map((m) => ({ ...m, seen: true })),
              }
            : c
        )
      );
    });

    s.on('typing', (name) => {
      const activeChat = chatsRef.current.find((c) => c.id === selectedChatIdRef.current);
      if (!activeChat) return;
      setTypingUser(name);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        setTypingUser(null);
      }, 1800);
    });

    return () => {
      s.disconnect();
    };
  }, []);

  const attachmentUrl = (message) => {
    const token = localStorage.getItem('accessToken');
    return message?.filePath && token ? `${message.filePath}?token=${encodeURIComponent(token)}` : message?.filePath;
  };

  const activeChat = useMemo(() => {
    return chats.find((c) => c.id === selectedChatId) || null;
  }, [chats, selectedChatId]);

  // Send standard text message
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!newMessageText.trim() || !selectedChatId || !currentUser) return;

    const chat = chats.find((c) => c.id === selectedChatId);
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

  // Select chat from contact row list
  const handleSelectChat = (id) => {
    const chat = chats.find((c) => c.id === id);
    setSelectedChatId(id);
    setChats((prevChats) => prevChats.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));

    if (chat && chat.participantId && currentUser) {
      if (socket && chat.room) {
        socket.emit('joinRoom', chat.room);
        socket.emit('markSeen', { room: chat.room });
        setLoadingMessages(true);
        const token = localStorage.getItem('accessToken');
        fetch(`/api/chat/conversations/${chat.participantId}/messages?limit=200`, { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => r.json())
          .then((data) => {
            if (Array.isArray(data.messages)) {
              setChats((prev) =>
                prev.map((pc) =>
                  pc.id === id
                    ? {
                        ...pc,
                        messages: data.messages.map((m) => ({
                          id: m.id,
                          sender: String(m.sender_id) === String(currentUser.id) ? 'me' : 'them',
                          text: m.text || '',
                          time: new Date(m.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
                          filePath: m.filePath,
                          mimeType: m.mimeType,
                          seen: !!m.seen_at,
                        })),
                      }
                    : pc
                )
              );
            }
          })
          .catch(() => {})
          .finally(() => setLoadingMessages(false));
      }
    }
  };

  // Open/initialize chat room when clicking a contact who hasn't been messaged before
  const handleSelectContact = (user) => {
    const id = `conv-${user.id}`;
    const existing = chats.find((c) => c.participantId === user.id || c.id === id);
    if (!existing) {
      const room = `dm:${[String(currentUser.id), String(user.id)].sort().join(':')}`;
      const newChat = {
        id,
        participantId: user.id,
        name: user.full_name || user.username,
        role: user.role,
        avatar: initials(user.full_name || user.username),
        avatarBg: user.role === 'admin' ? 'linear-gradient(135deg, #8b5cf6, #6d28d9)' : 'linear-gradient(135deg, #0ea5e9, #0369a1)',
        lastMessage: '',
        time: '',
        unread: 0,
        tab: (user.role === 'admin' || user.role === 'super_admin') ? 'focused' : 'other',
        room,
        messages: [],
      };
      setChats((prev) => [newChat, ...prev]);
      setTimeout(() => {
        handleSelectChat(id);
      }, 50);
    } else {
      setSelectedChatId(existing.id);
      handleSelectChat(existing.id);
    }
  };

  // Handle file uploads as message attachments
  const handleFileSelect = async (file) => {
    if (!file || !selectedChatId || !currentUser) return;
    const chat = chats.find((c) => c.id === selectedChatId);
    if (!chat) return;
    const room = chat.room;
    const token = localStorage.getItem('accessToken');
    const fd = new FormData();
    fd.append('room', room);
    fd.append('recipientId', chat.participantId);
    fd.append('file', file);
    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        body: fd,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Upload failed');
      // The socket server will emit newMessage, which appends it. No local optimism required.
    } catch (e) {
      console.warn('File attachment upload failed', e.message);
    }
  };

  const handleTypingEvent = (e) => {
    const next = e.target.value;
    setNewMessageText(next);
    const chat = chats.find((c) => c.id === selectedChatId);
    if (next && chat?.room && socket) {
      socket.emit('typing', {
        room: chat.room,
        userName: currentUser?.fullName || currentUser?.username || 'Super Admin',
      });
    }
  };

  // Group contacts dynamically for command center lists
  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      if (currentUser && String(c.id) === String(currentUser.id)) return false;
      if (c.role !== 'admin') return false; // STRICTLY ONLY Admins!
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        (c.full_name || c.username || '').toLowerCase().includes(q);
      
      const matchesTab = activeTab === 'focused';
      return matchesSearch && matchesTab;
    });
  }, [contacts, currentUser, searchQuery, activeTab]);

  const totalUnread = useMemo(() => {
    return chats.reduce((acc, c) => acc + c.unread, 0);
  }, [chats]);

  return (
    <div className="floating-chat-container sa-chat-container">
      {/* ── 1. Floating Panel ── */}
      <div className={`floating-chat-panel sa-chat-panel ${isOpen ? 'open' : ''}`}>
        
        {/* Panel Header */}
        <div className="chat-panel-header sa-chat-header">
          {activeChat ? (
            <div className="chat-header-back-wrapper">
              <button className="chat-back-btn sa-chat-back-btn" onClick={() => setSelectedChatId(null)}>
                ←
              </button>
              <div className="chat-active-user-info">
                <div 
                  className="chat-user-avatar-sm"
                  style={{ background: activeChat.avatarBg }}
                >
                  {activeChat.avatar}
                </div>
                <div className="chat-user-name-meta">
                  <div className="chat-header-user-name" style={{ color: 'var(--text-primary)' }}>{activeChat.name}</div>
                  <div className="chat-header-user-role">{activeChat.role.replace(/_/g, ' ')}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="chat-header-default-title">
              <span className="chat-header-icon">🛡️</span>
              <div>
                <div className="chat-header-title">SA Command Messenger</div>
                <div className="chat-header-subtitle">Real-time system communications ({connected ? 'live' : 'offline'})</div>
              </div>
            </div>
          )}
          <button className="chat-close-panel-btn" onClick={() => setIsOpen(false)}>
            ✕
          </button>
        </div>

        {/* Panel Body */}
        {activeChat ? (
          /* Active Thread View */
          <div className="chat-thread-container">
            <div className="chat-messages-scroller">
              {loadingMessages ? (
                <div className="chat-empty-state">
                  <div className="spinner" style={{ width: 24, height: 24, margin: '16px auto' }} />
                  <div className="chat-empty-text">Loading platform logs...</div>
                </div>
              ) : activeChat.messages.length > 0 ? (
                activeChat.messages.map((msg) => (
                  <div key={msg.id} className={`chat-message-bubble-row ${msg.sender}`}>
                    <div className="chat-message-bubble">
                      {msg.filePath ? (
                        <div className="chat-message-attachment">
                          <a href={attachmentUrl(msg)} target="_blank" rel="noreferrer" download style={{ color: 'var(--sa-accent-primary)', textDecoration: 'underline' }}>
                            📎 {msg.fileName || msg.filePath.split('/').pop()}
                          </a>
                        </div>
                      ) : (
                        <div className="chat-message-text">{msg.text}</div>
                      )}
                      <div className="chat-message-time">
                        {msg.time} {msg.sender === 'me' && (msg.seen ? '✓✓' : '✓')}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="chat-empty-state">
                  <div className="chat-empty-icon">🛡️</div>
                  <div className="chat-empty-text">Send a secure directive to establish connection.</div>
                </div>
              )}
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

            {/* Message Input Box */}
            <form onSubmit={handleSendMessage} className="chat-input-form">
              <input
                type="text"
                placeholder="Type platform directive..."
                value={newMessageText}
                onChange={handleTypingEvent}
                className="chat-input-field"
                maxLength={400}
                required
              />
              <input 
                type="file" 
                style={{ display: 'none' }} 
                ref={fileInputRef} 
                onChange={(e) => handleFileSelect(e.target.files[0])} 
              />
              <button 
                type="button" 
                className="chat-attach-btn" 
                onClick={() => fileInputRef.current && fileInputRef.current.click()} 
                title="Attach log file"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '0 8px', color: 'var(--text-muted)' }}
              >
                📎
              </button>
              <button type="submit" className="chat-send-btn sa-chat-send-btn">
                Send
              </button>
            </form>
          </div>
        ) : (
          /* Contacts/Chats List View */
          <div className="chat-list-container">
            {/* Search Input */}
            <div className="chat-search-wrapper">
              <span className="chat-search-icon">🔍</span>
              <input
                type="text"
                placeholder="Filter logs or subscribers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="chat-search-input"
              />
            </div>

            {/* List Tabs */}
            <div className="chat-tabs-bar">
              <button 
                className={`chat-tab-btn ${activeTab === 'focused' ? 'active' : ''}`}
                onClick={() => setActiveTab('focused')}
              >
                Admins
              </button>
              <button 
                className={`chat-tab-btn ${activeTab === 'other' ? 'active' : ''}`}
                onClick={() => setActiveTab('other')}
              >
                Staff
              </button>
            </div>

            {/* Scrollable list */}
            <div className="chat-list-scroller">
              {filteredContacts.length > 0 ? (
                filteredContacts.map((user) => {
                  const id = `conv-${user.id}`;
                  const isOnline = onlineUsers.includes(String(user.id));
                  const conversation = chats.find((c) => String(c.participantId) === String(user.id));
                  
                  return (
                    <div 
                      key={user.id} 
                      className="chat-item-row"
                      onClick={() => handleSelectContact(user)}
                    >
                      <div className="chat-user-avatar-wrapper" style={{ position: 'relative' }}>
                        <div 
                          className="chat-user-avatar"
                          style={{ background: user.role === 'admin' ? 'linear-gradient(135deg, #8b5cf6, #6d28d9)' : 'linear-gradient(135deg, #0ea5e9, #0369a1)' }}
                        >
                          {initials(user.full_name || user.username)}
                        </div>
                        {isOnline && (
                          <span style={{
                            position: 'absolute', bottom: -2, right: -2, width: 10, height: 10,
                            borderRadius: '50%', background: '#10b981', border: '2px solid var(--bg-card)',
                            display: 'inline-block'
                          }} />
                        )}
                      </div>
                      <div className="chat-item-mid">
                        <div className="chat-item-row-top" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="chat-item-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>{user.full_name || user.username}</span>
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
                            display: 'inline-block'
                          }}>Admin</span>
                          <span className="chat-item-time" style={{ marginLeft: 'auto', flexShrink: 0 }}>{conversation?.time || (isOnline ? 'online' : '')}</span>
                        </div>
                        <div className="chat-item-row-bottom">
                          <span className="chat-item-preview">
                            {conversation?.lastMessage || user.role.replace(/_/g, ' ')}
                          </span>
                          {conversation && conversation.unread > 0 && (
                            <span className="chat-item-unread-badge sa-chat-unread-badge">
                              {conversation.unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="chat-empty-state">
                  <div className="chat-empty-icon">🛡️</div>
                  <div className="chat-empty-text">No active nodes found</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── 2. Floating Action Button (FAB) ── */}
      <button 
        className={`floating-chat-btn sa-floating-chat-btn ${isOpen ? 'active' : ''}`} 
        onClick={() => setIsOpen(!isOpen)}
        title="Toggle Platform Feed"
      >
        <span className="chat-btn-icon">💬</span>
        {totalUnread > 0 && !isOpen && (
          <span className="chat-btn-unread-badge">{totalUnread}</span>
        )}
      </button>
    </div>
  );
}
