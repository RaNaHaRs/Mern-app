import React, { useRef, useEffect } from 'react';
import {
  useTeamChat,
  formatChatTime,
  statusLabel,
  messagePreview,
} from '../hooks/useTeamChat';

const isImageType = (mime, path) =>
  (mime && mime.startsWith('image/')) || /\.(png|jpe?g|gif|webp|bmp)$/i.test(path || '');

function initials(name) {
  return (name || '?')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function MessageBubble({ msg }) {
  return (
    <div className={`chat-message-bubble-row ${msg.sender}`}>
      <div className="chat-message-bubble">
        {msg.filePath ? (
          <div className="chat-message-attachment">
            {isImageType(msg.mimeType, msg.filePath) ? (
              <a href={msg.filePath} target="_blank" rel="noreferrer">
                <img src={msg.filePath} alt="attachment" className="chat-attachment-image" />
              </a>
            ) : (
              <a href={msg.filePath} target="_blank" rel="noreferrer" download className="chat-attachment-file">
                <span>📎</span>
                <span>{msg.filePath.split('/').pop()}</span>
              </a>
            )}
          </div>
        ) : null}
        {msg.text ? <div className="chat-message-text">{msg.text}</div> : null}
        <div className="chat-message-time">
          {msg.time || formatChatTime(msg.created_at)}
          {msg.sender === 'me' ? (
            <span className="chat-message-status"> · {statusLabel(msg)}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Real-time team messenger — floating widget or full page.
 */
export default function ChatMessenger({
  variant = 'floating',
  title = 'Team Chat',
  subtitle = 'Secure team messaging',
  headerIcon = '💬',
  containerClassName = '',
  panelClassName = '',
}) {
  const {
    user,
    contacts,
    selectedUserId,
    selectContact,
    selectedContact,
    selectedMessages,
    input,
    onInputChange,
    file,
    setFile,
    sending,
    sendMessage,
    connected,
    onlineIds,
    typingByUser,
    unreadByUser,
    totalUnread,
    loadingMessages,
    getLastPreview,
  } = useTeamChat();

  const [isOpen, setIsOpen] = React.useState(variant === 'page');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [showThread, setShowThread] = React.useState(variant === 'page');

  const messageEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedMessages, typingByUser, selectedUserId, showThread]);

  useEffect(() => {
    if (variant === 'page' && selectedUserId) setShowThread(true);
  }, [variant, selectedUserId]);

  const filteredContacts = contacts.filter((c) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const name = (c.full_name || c.username || '').toLowerCase();
    const role = (c.role || '').toLowerCase();
    return name.includes(q) || role.includes(q);
  });

  const openContact = (contact) => {
    selectContact(contact.id);
    setShowThread(true);
  };

  const backToList = () => {
    if (variant === 'floating') setShowThread(false);
  };

  const threadHeader = selectedContact ? (
    <div className="chat-header-back-wrapper">
      {variant === 'floating' && (
        <button type="button" className="chat-back-btn" onClick={backToList} aria-label="Back">
          ←
        </button>
      )}
      <div className="chat-active-user-info">
        <div
          className="chat-user-avatar-sm"
          style={{
            background: onlineIds.includes(String(selectedContact.id))
              ? 'linear-gradient(135deg,#10b981,#059669)'
              : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
          }}
        >
          {initials(selectedContact.full_name || selectedContact.username)}
        </div>
        <div className="chat-user-name-meta">
          <div className="chat-header-user-name">
            {selectedContact.full_name || selectedContact.username}
          </div>
          <div className="chat-header-user-role">
            {onlineIds.includes(String(selectedContact.id)) ? '● Online' : 'Offline'}
            {' · '}
            {(selectedContact.role || '').replace(/_/g, ' ')}
          </div>
        </div>
      </div>
    </div>
  ) : (
    <div className="chat-header-default-title">
      <span className="chat-header-icon">{headerIcon}</span>
      <div>
        <div className="chat-header-title">{title}</div>
        <div className="chat-header-subtitle">
          {subtitle}
          <span className={`chat-live-dot ${connected ? 'on' : ''}`}>
            {connected ? ' · Live' : ' · Connecting…'}
          </span>
        </div>
      </div>
    </div>
  );

  const listView = (
    <div className="chat-list-container">
      <div className="chat-search-wrapper">
        <span className="chat-search-icon">🔍</span>
        <input
          type="text"
          placeholder="Search people…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="chat-search-input"
        />
      </div>
      <div className="chat-online-hint">
        {onlineIds.length} online · {contacts.length} available
      </div>
      <div className="chat-list-scroller">
        {filteredContacts.length === 0 ? (
          <div className="chat-empty-state">
            <div className="chat-empty-icon">💬</div>
            <div className="chat-empty-text">No contacts available</div>
          </div>
        ) : (
          filteredContacts.map((contact) => {
            const id = String(contact.id);
            const isOnline = onlineIds.includes(id);
            const unread = unreadByUser[id] || 0;
            const preview = getLastPreview(id);
            return (
              <button
                type="button"
                key={id}
                className={`chat-item-row ${String(selectedUserId) === id ? 'active' : ''}`}
                onClick={() => openContact(contact)}
              >
                <div
                  className="chat-user-avatar"
                  style={{
                    background: isOnline
                      ? 'linear-gradient(135deg,#10b981,#059669)'
                      : 'linear-gradient(135deg,#64748b,#475569)',
                  }}
                >
                  {initials(contact.full_name || contact.username)}
                </div>
                <div className="chat-item-mid">
                  <div className="chat-item-row-top">
                    <span className="chat-item-name">{contact.full_name || contact.username}</span>
                    <span className="chat-item-time">{isOnline ? 'online' : ''}</span>
                  </div>
                  <div className="chat-item-row-bottom">
                    <span className="chat-item-preview">
                      {preview || (contact.role || '').replace(/_/g, ' ')}
                    </span>
                    {unread > 0 ? (
                      <span className="chat-item-unread-badge">{unread}</span>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  const threadView = (
    <div className="chat-thread-container">
      <div className="chat-messages-scroller">
        {loadingMessages ? (
          <div className="chat-loading">Loading messages…</div>
        ) : selectedMessages.length === 0 ? (
          <div className="chat-empty-state">
            <div className="chat-empty-icon">👋</div>
            <div className="chat-empty-text">Start the conversation</div>
          </div>
        ) : (
          selectedMessages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
        )}
        {selectedUserId && typingByUser[selectedUserId] ? (
          <div className="chat-typing-indicator">
            <span className="typing-dot" />
            <span className="typing-dot" style={{ animationDelay: '0.2s' }} />
            <span className="typing-dot" style={{ animationDelay: '0.4s' }} />
            <span>{typingByUser[selectedUserId]} is typing…</span>
          </div>
        ) : null}
        <div ref={messageEndRef} />
      </div>

      {file ? (
        <div className="chat-file-preview">
          <span>📎 {file.name}</span>
          <button type="button" onClick={() => setFile(null)} aria-label="Remove file">
            ✕
          </button>
        </div>
      ) : null}

      <form
        className="chat-input-form"
        onSubmit={sendMessage}
      >
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setFile(f);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          className="chat-attach-btn"
          onClick={() => fileInputRef.current?.click()}
          title="Attach file"
        >
          📎
        </button>
        <input
          type="text"
          placeholder={selectedContact ? 'Type a message…' : 'Select a contact'}
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          className="chat-input-field"
          disabled={!selectedContact || sending}
          maxLength={2000}
        />
        <button
          type="submit"
          className="chat-send-btn"
          disabled={!selectedContact || (!input.trim() && !file) || sending}
        >
          {sending ? '…' : 'Send'}
        </button>
      </form>
    </div>
  );

  const body =
    variant === 'page' ? (
      <div className="chat-layout chat-layout-page">
        <div className="chat-sidebar">{listView}</div>
        <div className="chat-messages-area chat-page-thread">
          <div className="chat-header chat-page-thread-header">{threadHeader}</div>
          {selectedContact ? threadView : (
            <div className="chat-empty-state chat-page-pick">
              <div className="chat-empty-icon">💬</div>
              <div className="chat-empty-text">Select someone to start chatting</div>
            </div>
          )}
        </div>
      </div>
    ) : showThread && selectedContact ? (
      threadView
    ) : (
      listView
    );

  if (variant === 'page') {
    return (
      <div className={`chat-messenger-page ${containerClassName}`}>
        <div className="chat-page-toolbar">
          <div>
            <h2 style={{ marginBottom: 4 }}>{title}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              Role-based messaging · {connected ? 'connected' : 'reconnecting'}
            </p>
          </div>
        </div>
        {body}
      </div>
    );
  }

  return (
    <div className={`floating-chat-container ${containerClassName}`}>
      <div className={`floating-chat-panel ${panelClassName} ${isOpen ? 'open' : ''}`}>
        <div className="chat-panel-header">
          {showThread && selectedContact ? threadHeader : (
            <div className="chat-header-default-title">
              <span className="chat-header-icon">{headerIcon}</span>
              <div>
                <div className="chat-header-title">{title}</div>
                <div className="chat-header-subtitle">
                  {subtitle}
                  <span className={`chat-live-dot ${connected ? 'on' : ''}`}>
                    {connected ? ' · Live' : ' · Connecting…'}
                  </span>
                </div>
              </div>
            </div>
          )}
          <button
            type="button"
            className="chat-close-panel-btn"
            onClick={() => setIsOpen(false)}
            aria-label="Close chat"
          >
            ✕
          </button>
        </div>
        {body}
      </div>
      <button
        type="button"
        className={`floating-chat-btn ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen((o) => !o)}
        title="Team Chat"
      >
        <span className="chat-btn-icon">💬</span>
        {totalUnread > 0 && !isOpen ? (
          <span className="chat-btn-unread-badge">{totalUnread > 99 ? '99+' : totalUnread}</span>
        ) : null}
      </button>
    </div>
  );
}
