import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

// ── Mock Initial Conversations ──
const INITIAL_CHATS = [
  {
    id: 1,
    name: 'Rahul Sharma',
    role: 'Senior Recovery Engineer',
    avatar: 'RS',
    avatarBg: 'linear-gradient(135deg, #0d9488, #0f766e)',
    lastMessage: "I've started the mechanical recovery on Case #2024-089.",
    time: '10:42 AM',
    unread: 2,
    tab: 'focused',
    messages: [
      { id: 1, sender: 'them', text: "Hey! Did you check the donor parts for the Seagate drive?", time: "10:35 AM" },
      { id: 2, sender: 'me', text: "Yes, I found a matching head stack in the donor inventory.", time: "10:40 AM" },
      { id: 3, sender: 'them', text: "Awesome! I've started the mechanical recovery on Case #2024-089.", time: "10:42 AM" }
    ]
  },
  {
    id: 2,
    name: 'Sneha Patel',
    role: 'Client Relations',
    avatar: 'SP',
    avatarBg: 'linear-gradient(135deg, #4f46e5, #4338ca)',
    lastMessage: 'Client for Case #2024-091 approved the quotation.',
    time: 'Yesterday',
    unread: 0,
    tab: 'focused',
    messages: [
      { id: 1, sender: 'me', text: "Has the client for Case #2024-091 responded yet?", time: "Yesterday 9:15 AM" },
      { id: 2, sender: 'them', text: "Yes! Client for Case #2024-091 approved the quotation. I will update the billing tracker now.", time: "Yesterday 11:20 AM" }
    ]
  },
  {
    id: 3,
    name: 'Vikram Singh',
    role: 'Lab Technician',
    avatar: 'VS',
    avatarBg: 'linear-gradient(135deg, #0ea5e9, #0369a1)',
    lastMessage: 'Disk imaging completed successfully. 1.8TB recovered.',
    time: 'Friday',
    unread: 0,
    tab: 'focused',
    messages: [
      { id: 1, sender: 'them', text: "I'm setting up the PC-3000 task for the Western Digital drive now.", time: "Friday 2:00 PM" },
      { id: 2, sender: 'them', text: "Disk imaging completed successfully. 1.8TB recovered.", time: "Friday 4:30 PM" }
    ]
  },
  {
    id: 4,
    name: 'RecoverLab Bot',
    role: 'System Alerts',
    avatar: '🤖',
    avatarBg: 'linear-gradient(135deg, #64748b, #475569)',
    lastMessage: 'Nightly cloud backup completed successfully at 03:00 AM.',
    time: '3:00 AM',
    unread: 0,
    tab: 'other',
    messages: [
      { id: 1, sender: 'them', text: "Nightly cloud backup completed successfully at 03:00 AM.", time: "3:00 AM" }
    ]
  },
  {
    id: 5,
    name: 'Billing Support',
    role: 'Platform billing',
    avatar: '💳',
    avatarBg: 'linear-gradient(135deg, #d97706, #b45309)',
    lastMessage: 'Subscription invoice RL-8291 has been generated.',
    time: 'May 22',
    unread: 0,
    tab: 'other',
    messages: [
      { id: 1, sender: 'them', text: "Subscription invoice RL-8291 has been generated.", time: "May 22" }
    ]
  }
];

export default function FloatingChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [chats, setChats] = useState(() => {
    const saved = localStorage.getItem('crm_floating_chats');
    return saved ? JSON.parse(saved) : INITIAL_CHATS;
  });
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('focused');
  const [newMessageText, setNewMessageText] = useState('');
  
  const messageEndRef = useRef(null);

  const [socket, setSocket] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Save chats to localStorage for persistent dummy state
  useEffect(() => {
    localStorage.setItem('crm_floating_chats', JSON.stringify(chats));
  }, [chats]);

  // Initialize socket + load current user + contact list
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    // fetch current user
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(user => setCurrentUser(user))
      .catch(() => {});

    // fetch contact list
    fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(list => setContacts(list || []))
      .catch(() => setContacts([]));

    // connect directly to backend server (avoid vite proxy for WebSocket)
    const backendUrl = import.meta.env.VITE_API_URL || `${location.protocol}//${location.hostname}:5001`;
    const s = io(backendUrl, { auth: { token } });
    setSocket(s);

    s.on('connect', () => {
      // connected
    });

    s.on('onlineUsers', (users) => {
      setOnlineUsers(Array.isArray(users) ? users.map(String) : []);
    });

    s.on('newMessage', (msg) => {
      // Append to matching chat by room
      setChats(prev => prev.map(c => {
        if (c.room === msg.room) {
          const next = { id: msg.id, sender: msg.sender_id === (currentUser && String(currentUser.id)) ? 'me' : 'them', text: msg.text || '', time: new Date(msg.created_at).toLocaleTimeString(), filePath: msg.filePath };
          return { ...c, messages: [...(c.messages || []), next], lastMessage: msg.text || (msg.filePath ? 'Attachment' : '') };
        }
        return c;
      }));
    });

    s.on('messagesSeen', ({ room }) => {
      setChats(prev => prev.map(c => c.room === room ? ({ ...c, messages: (c.messages || []).map(m => ({ ...m, seen: true })) }) : c));
    });

    return () => { s.disconnect(); };
  }, []);

  // Scroll to bottom when conversation changes or new message is added
  useEffect(() => {
    if (messageEndRef.current) {
      messageEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedChatId, chats]);

  const activeChat = chats.find(c => c.id === selectedChatId);

  // Send message handler
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!newMessageText.trim() || !selectedChatId) return;

    const timeString = new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    // send through socket (server will persist and broadcast)
    const chat = chats.find(c => c.id === selectedChatId);
    if (socket && chat && currentUser) {
      const room = chat.room;
      socket.emit('sendMessage', { room, text: newMessageText.trim() });
    }

    setNewMessageText('');
  };

  // File upload for attachments
  const fileInputRef = useRef(null);
  const handleFileSelect = async (file) => {
    if (!file || !selectedChatId || !currentUser) return;
    const chat = chats.find(c => c.id === selectedChatId);
    if (!chat) return;
    const room = chat.room;
    const token = localStorage.getItem('accessToken');
    const fd = new FormData();
    fd.append('room', room);
    fd.append('file', file);
    try {
      const res = await fetch('/api/chat/messages', { method: 'POST', body: fd, headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Upload failed');
      const created = await res.json();
      // server will broadcast newMessage; local optimistic add if desired
      setChats(prev => prev.map(c => c.id === selectedChatId ? ({ ...c, messages: [...c.messages, { id: created.id, sender: String(created.sender_id) === String(currentUser && currentUser.id) ? 'me' : 'them', text: created.text || '', time: new Date(created.created_at).toLocaleTimeString(), filePath: created.filePath } ] }) : c));
    } catch (e) {
      console.warn('File upload failed', e.message);
    }
  };

  // Open chat and clear unread badge
  // Helper to build a 1:1 room name
  const roomForUser = (a, b) => {
    try { const ids = [String(a), String(b)].sort(); return `chat:${ids.join('-')}`; } catch { return null; }
  };

  const handleSelectChat = (id) => {
    const chat = chats.find(c => c.id === id);
    setSelectedChatId(id);
    setChats(prevChats => prevChats.map(c => c.id === id ? { ...c, unread: 0 } : c));

    // join socket room and fetch messages if room present
    if (chat && chat.participantId && currentUser) {
      const room = roomForUser(currentUser.id, chat.participantId);
      if (socket && room) {
        socket.emit('joinRoom', room);
        socket.emit('markSeen', { room });
        setLoadingMessages(true);
        const token = localStorage.getItem('accessToken');
        fetch(`/api/chat/messages?room=${encodeURIComponent(room)}&limit=200`, { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.json())
          .then(data => {
            if (Array.isArray(data.messages)) {
              setChats(prev => prev.map(pc => pc.id === id ? ({ ...pc, messages: data.messages.map(m => ({ id: m.id, sender: String(m.sender_id) === String(currentUser && currentUser.id) ? 'me' : 'them', text: m.text || '', time: new Date(m.created_at).toLocaleTimeString(), filePath: m.filePath, mimeType: m.mimeType, seen: !!m.seen_at })) }) : pc));
            }
          }).finally(() => setLoadingMessages(false));
      }
    }
  };

  // Get total unread count for floating button badge
  const totalUnread = chats.reduce((acc, c) => acc + c.unread, 0);

  // Contacts filtered by search and role; used as sidebar entries
  const filteredContacts = contacts.filter(user => {
    // exclude current user from contact list
    if (currentUser && String(user.id) === String(currentUser.id)) return false;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      return (user.full_name || user.username || '').toLowerCase().includes(q) || (user.email || '').toLowerCase().includes(q) || (user.role || '').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="floating-chat-container">
      {/* ── 1. Floating Panel ── */}
      <div className={`floating-chat-panel ${isOpen ? 'open' : ''}`}>
        
        {/* Panel Header */}
        <div className="chat-panel-header">
          {activeChat ? (
            <div className="chat-header-back-wrapper">
              <button className="chat-back-btn" onClick={() => setSelectedChatId(null)}>
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
          <button className="chat-close-panel-btn" onClick={() => setIsOpen(false)}>
            ✕
          </button>
        </div>

        {/* Panel Body */}
        {activeChat ? (
          /* Active Thread View */
          <div className="chat-thread-container">
            <div className="chat-messages-scroller">
              {activeChat.messages.map(msg => (
                <div key={msg.id} className={`chat-message-bubble-row ${msg.sender}`}>
                  <div className="chat-message-bubble">
                    {msg.filePath ? (
                      <div className="chat-message-attachment">
                        <a href={msg.filePath} target="_blank" rel="noreferrer" download>
                          {msg.filePath.split('/').pop()}
                        </a>
                      </div>
                    ) : (
                      <div className="chat-message-text">{msg.text}</div>
                    )}
                    <div className="chat-message-time">{msg.time} {msg.seen ? '✓' : ''}</div>
                  </div>
                </div>
              ))}
              <div ref={messageEndRef} />
            </div>

            {/* Message Input Box */}
            <form onSubmit={handleSendMessage} className="chat-input-form">
              <input
                type="text"
                placeholder="Type a secure message..."
                value={newMessageText}
                onChange={e => setNewMessageText(e.target.value)}
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
          /* Contacts/Chats List View */
          <div className="chat-list-container">
            {/* Search Input */}
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

            {/* List Tabs */}
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

            {/* Scrollable list */}
            <div className="chat-list-scroller">
                {filteredContacts.length > 0 ? (
                  filteredContacts.map(user => {
                    const id = `contact-${user.id}`;
                    const isOnline = onlineUsers.includes(String(user.id));
                  return (
                  <div 
                    key={id} 
                    className="chat-item-row"
                    onClick={() => {
                      // Ensure a chat item exists for this contact
                      const existing = chats.find(c => c.participantId === user.id || c.id === id);
                      if (!existing) {
                        const room = roomForUser(currentUser ? currentUser.id : 'me', user.id);
                        const newChat = {
                          id,
                          participantId: user.id,
                          name: user.full_name || user.username,
                          role: user.role,
                          avatar: (user.full_name || user.username || '').split(' ').map(n=>n[0]).slice(0,2).join(''),
                          avatarBg: 'linear-gradient(135deg,#0ea5e9,#0369a1)',
                          lastMessage: '',
                          time: '',
                          unread: 0,
                          tab: 'focused',
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
                    <div 
                      className="chat-user-avatar"
                      style={{ background: isOnline ? 'linear-gradient(135deg,#10b981,#059669)' : '#64748b' }}
                    >
                      { (user.full_name || user.username || '').split(' ').map(n=>n[0]).slice(0,2).join('') }
                    </div>
                    <div className="chat-item-mid">
                      <div className="chat-item-row-top">
                        <span className="chat-item-name">{user.full_name || user.username}</span>
                        <span className="chat-item-time">{isOnline ? 'online' : ''}</span>
                      </div>
                      <div className="chat-item-row-bottom">
                        <span className="chat-item-preview">{user.role}</span>
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
        onClick={() => setIsOpen(!isOpen)}
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
