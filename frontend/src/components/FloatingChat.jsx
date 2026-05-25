import React, { useState, useEffect, useRef } from 'react';

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

  // Save chats to localStorage for persistent dummy state
  useEffect(() => {
    localStorage.setItem('crm_floating_chats', JSON.stringify(chats));
  }, [chats]);

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

  // Open chat and clear unread badge
  const handleSelectChat = (id) => {
    setSelectedChatId(id);
    setChats(prevChats => 
      prevChats.map(chat => chat.id === id ? { ...chat, unread: 0 } : chat)
    );
  };

  // Get total unread count for floating button badge
  const totalUnread = chats.reduce((acc, c) => acc + c.unread, 0);

  // Filtered chats list based on query and tab
  const filteredChats = chats.filter(chat => {
    const matchesSearch = chat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          chat.role.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = chat.tab === activeTab;
    return matchesSearch && matchesTab;
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
                placeholder="Type a secure message..."
                value={newMessageText}
                onChange={e => setNewMessageText(e.target.value)}
                className="chat-input-field"
                maxLength={400}
                required
              />
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
                          <span className="chat-item-unread-badge">
                            {chat.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="chat-empty-state">
                  <div className="chat-empty-icon">💬</div>
                  <div className="chat-empty-text">No active threads found</div>
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
