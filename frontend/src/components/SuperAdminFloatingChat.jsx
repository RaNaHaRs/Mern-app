import React, { useState, useEffect, useRef } from 'react';

// ── Mock Platform-level Conversations for Super Admin ──
const SA_INITIAL_CHATS = [
  {
    id: 1,
    name: 'Node-C Server Alert',
    role: 'Database Follower Status',
    avatar: '🖥️',
    avatarBg: 'linear-gradient(135deg, #ef4444, #b91c1c)',
    lastMessage: 'High CPU usage warning cleared on Node-C.',
    time: '11:02 AM',
    unread: 0,
    tab: 'focused',
    messages: [
      { id: 1, sender: 'them', text: "ALERT: CPU usage exceeded 90% on Node-C database follower replication process.", time: "10:55 AM" },
      { id: 2, sender: 'me', text: "Trigger automatic connection pooling limit and verify slow query logs.", time: "11:00 AM" },
      { id: 3, sender: 'them', text: "RESOLVED: High CPU usage warning cleared on Node-C. Replica lag is now at 0ms.", time: "11:02 AM" }
    ]
  },
  {
    id: 2,
    name: 'Support Ticket #1082 (HardDrive Pros)',
    role: 'Subscriber Escalation',
    avatar: '🏢',
    avatarBg: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
    lastMessage: 'We need custom HDD fields enabled for Seagate 2.5.',
    time: 'Yesterday',
    unread: 1,
    tab: 'focused',
    messages: [
      { id: 1, sender: 'them', text: "Hello Platform Owner, we are trying to set up custom field tracking but are stuck on the mandatory configs for Seagate 2.5 devices. Can you enable these advanced fields for our professional plan?", time: "Yesterday" }
    ]
  },
  {
    id: 3,
    name: 'Razorpay Webhook Node',
    role: 'System Billing Logs',
    avatar: '💳',
    avatarBg: 'linear-gradient(135deg, #10b981, #059669)',
    lastMessage: 'Payment of ₹4,999 received from Mumbai Recovery Lab.',
    time: '3:15 AM',
    unread: 0,
    tab: 'other',
    messages: [
      { id: 1, sender: 'them', text: "SUCCESS: Webhook verify OK. Payment of ₹4,999 received from Mumbai Recovery Lab (Tenant ID: ten_8291) for plan: Professional.", time: "3:15 AM" }
    ]
  },
  {
    id: 4,
    name: 'SEO Crawler Bot',
    role: 'Platform indexer',
    avatar: '🔍',
    avatarBg: 'linear-gradient(135deg, #64748b, #475569)',
    lastMessage: 'Sitemap updated successfully. 12 pages crawled.',
    time: 'Sunday',
    unread: 0,
    tab: 'other',
    messages: [
      { id: 1, sender: 'them', text: "System cron triggered crawl. Sitemap updated successfully. 12 public landing pages indexed.", time: "Sunday" }
    ]
  }
];

export default function SuperAdminFloatingChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [chats, setChats] = useState(() => {
    const saved = localStorage.getItem('crm_sa_floating_chats');
    return saved ? JSON.parse(saved) : SA_INITIAL_CHATS;
  });
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('focused');
  const [newMessageText, setNewMessageText] = useState('');
  
  const messageEndRef = useRef(null);

  // Save chats to localStorage for state persistence
  useEffect(() => {
    localStorage.setItem('crm_sa_floating_chats', JSON.stringify(chats));
  }, [chats]);

  // Scroll to bottom when conversation changes
  useEffect(() => {
    if (messageEndRef.current) {
      messageEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedChatId, chats]);

  const activeChat = chats.find(c => c.id === selectedChatId);

  // Send message simulation
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!newMessageText.trim() || !selectedChatId) return;

    const timeString = new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    setChats(prevChats => 
      prevChats.map(chat => {
        if (chat.id === selectedChatId) {
          const nextMsgId = chat.messages.length ? Math.max(...chat.messages.map(m => m.id)) + 1 : 1;
          const updatedMessages = [
            ...chat.messages,
            { id: nextMsgId, sender: 'me', text: newMessageText.trim(), time: timeString }
          ];
          return {
            ...chat,
            lastMessage: newMessageText.trim(),
            time: 'Just now',
            messages: updatedMessages
          };
        }
        return chat;
      })
    );

    setNewMessageText('');
  };

  const handleSelectChat = (id) => {
    setSelectedChatId(id);
    setChats(prevChats => 
      prevChats.map(chat => chat.id === id ? { ...chat, unread: 0 } : chat)
    );
  };

  const totalUnread = chats.reduce((acc, c) => acc + c.unread, 0);

  const filteredChats = chats.filter(chat => {
    const matchesSearch = chat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          chat.role.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = chat.tab === activeTab;
    return matchesSearch && matchesTab;
  });

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
                  <div className="chat-header-user-role">{activeChat.role}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="chat-header-default-title">
              <span className="chat-header-icon">🛡️</span>
              <div>
                <div className="chat-header-title">Platform Monitor</div>
                <div className="chat-header-subtitle">SA Command Center Feed</div>
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
                    <div className="chat-message-text">{msg.text}</div>
                    <div className="chat-message-time">{msg.time}</div>
                  </div>
                </div>
              ))}
              <div ref={messageEndRef} />
            </div>

            {/* Message Input Box */}
            <form onSubmit={handleSendMessage} className="chat-input-form">
              <input
                type="text"
                placeholder="Type platform directive..."
                value={newMessageText}
                onChange={e => setNewMessageText(e.target.value)}
                className="chat-input-field"
                maxLength={400}
                required
              />
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
              {filteredChats.length > 0 ? (
                filteredChats.map(chat => (
                  <div 
                    key={chat.id} 
                    className="chat-item-row"
                    onClick={() => handleSelectChat(chat.id)}
                  >
                    <div 
                      className="chat-user-avatar"
                      style={{ background: chat.avatarBg }}
                    >
                      {chat.avatar}
                    </div>
                    <div className="chat-item-mid">
                      <div className="chat-item-row-top">
                        <span className="chat-item-name">{chat.name}</span>
                        <span className="chat-item-time">{chat.time}</span>
                      </div>
                      <div className="chat-item-row-bottom">
                        <span className="chat-item-preview">{chat.lastMessage}</span>
                        {chat.unread > 0 && (
                          <span className="chat-item-unread-badge sa-chat-unread-badge">
                            {chat.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
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
