import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../store/AuthContext';

const API = '/api';
const getToken = () => localStorage.getItem('accessToken');

export const buildDmRoom = (userA, userB) =>
  `dm:${[String(userA), String(userB)].sort().join(':')}`;

export function otherUserIdFromRoom(room, myId) {
  if (!room || !room.startsWith('dm:')) return null;
  const ids = room.replace('dm:', '').split(':').filter(Boolean);
  return ids.find((id) => String(id) !== String(myId)) || null;
}

export function formatChatTime(value) {
  if (!value) return '';
  const d = new Date(value);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }
  return (
    d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) +
    ' ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  );
}

export function mapApiMessage(m, currentUserId) {
  const own = String(m.sender_id) === String(currentUserId);
  return {
    id: m.id,
    sender: own ? 'me' : 'them',
    sender_id: m.sender_id,
    sender_name: m.sender_name,
    text: m.text || '',
    filePath: m.filePath,
    mimeType: m.mimeType,
    type: m.type,
    created_at: m.created_at,
    seen: !!m.seen_at,
    delivered: !!m.delivered_at,
    time: formatChatTime(m.created_at),
    room: m.room,
  };
}

export function messagePreview(msg) {
  if (!msg) return '';
  if (msg.text) return msg.text;
  if (msg.filePath) {
    if (msg.mimeType?.startsWith('image/')) return '📷 Image';
    return '📎 Attachment';
  }
  return '';
}

export function statusLabel(msg) {
  if (!msg || msg.sender !== 'me') return '';
  if (msg.seen) return 'Seen';
  if (msg.delivered) return 'Delivered';
  return 'Sent';
}

/**
 * Shared real-time 1:1 chat state for Team Chat page and floating messenger.
 */
export function useTeamChat() {
  const { user } = useAuth();
  const userId = user?.id;

  const [contacts, setContacts] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [messagesByUser, setMessagesByUser] = useState({});
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [input, setInput] = useState('');
  const [file, setFile] = useState(null);
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [onlineIds, setOnlineIds] = useState([]);
  const [typingByUser, setTypingByUser] = useState({});
  const [unreadByUser, setUnreadByUser] = useState({});
  const [loadingMessages, setLoadingMessages] = useState(false);

  const socketRef = useRef(null);
  const typingTimerRef = useRef(null);
  const selectedUserIdRef = useRef(null);
  const userIdRef = useRef(null);

  useEffect(() => {
    selectedUserIdRef.current = selectedUserId;
  }, [selectedUserId]);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const selectedContact = useMemo(
    () => contacts.find((c) => String(c.id) === String(selectedUserId)) || null,
    [contacts, selectedUserId]
  );

  const selectedRoom = useMemo(() => {
    if (!selectedContact || !userId) return null;
    return buildDmRoom(userId, selectedContact.id);
  }, [selectedContact, userId]);

  const selectedMessages = useMemo(() => {
    if (!selectedUserId) return [];
    return (messagesByUser[selectedUserId] || []).map((m) =>
      m.sender ? m : mapApiMessage(m, userId)
    );
  }, [messagesByUser, selectedUserId, userId]);

  const totalUnread = useMemo(
    () => Object.values(unreadByUser).reduce((a, b) => a + (b || 0), 0),
    [unreadByUser]
  );

  const appendMessage = useCallback((otherUserId, rawMsg) => {
    const mapped = rawMsg.sender ? rawMsg : mapApiMessage(rawMsg, userIdRef.current);
    setMessagesByUser((prev) => {
      const list = prev[otherUserId] || [];
      if (list.some((m) => String(m.id) === String(mapped.id))) return prev;
      return { ...prev, [otherUserId]: [...list, mapped] };
    });
    return mapped;
  }, []);

  const loadContacts = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const res = await fetch(`${API}/chat/contacts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to load contacts');
    const data = await res.json();
    const users = Array.isArray(data.users) ? data.users : [];
    const convs = Array.isArray(data.conversations) ? data.conversations : [];
    setContacts(users);
    setConversations(convs);
    convs.forEach((c) => {
      const pid = c.participant?.id;
      if (!pid || !c.lastMessage?.created_at) return;
      setMessagesByUser((prev) => {
        if (prev[pid]?.length) return prev;
        return prev;
      });
    });
  }, []);

  const loadMessages = useCallback(async (otherUserId) => {
    const token = getToken();
    if (!token || !otherUserId) return;
    setLoadingMessages(true);
    try {
      const res = await fetch(
        `${API}/chat/conversations/${encodeURIComponent(otherUserId)}/messages?limit=200`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error('Failed to load messages');
      const data = await res.json();
      const messages = (data.messages || []).map((m) => mapApiMessage(m, userIdRef.current));
      setMessagesByUser((prev) => ({ ...prev, [otherUserId]: messages }));
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  const selectContact = useCallback(
    (otherUserId) => {
      const id = String(otherUserId);
      setSelectedUserId(id);
      setUnreadByUser((prev) => ({ ...prev, [id]: 0 }));
      const room = userIdRef.current ? buildDmRoom(userIdRef.current, id) : null;
      if (room && socketRef.current) {
        socketRef.current.emit('joinRoom', room);
        socketRef.current.emit('markSeen', { room });
      }
      loadMessages(id).catch(() => {});
      fetch(`${API}/chat/conversations/${encodeURIComponent(id)}/seen`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      }).catch(() => {});
    },
    [loadMessages]
  );

  // Socket connection
  useEffect(() => {
    const token = getToken();
    if (!token || !userId) return;

    const socket = io(window.location.origin, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 8,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      const room = selectedUserIdRef.current && userIdRef.current
        ? buildDmRoom(userIdRef.current, selectedUserIdRef.current)
        : null;
      if (room) socket.emit('joinRoom', room);
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('onlineUsers', (ids) => {
      setOnlineIds(Array.isArray(ids) ? ids.map(String) : []);
    });

    socket.on('newMessage', (msg) => {
      const me = userIdRef.current;
      const otherId =
        String(msg.sender_id) === String(me)
          ? otherUserIdFromRoom(msg.room, me)
          : String(msg.sender_id);
      if (!otherId) return;

      const mapped = appendMessage(otherId, msg);
      const isActive = String(selectedUserIdRef.current) === String(otherId);
      if (!isActive && mapped.sender === 'them') {
        setUnreadByUser((prev) => ({
          ...prev,
          [otherId]: (prev[otherId] || 0) + 1,
        }));
      }
      if (isActive && msg.room && socketRef.current) {
        socketRef.current.emit('markSeen', { room: msg.room });
      }
    });

    socket.on('messagesSeen', ({ room, userId: viewerId }) => {
      const me = userIdRef.current;
      if (String(viewerId) === String(me)) return;
      const otherId = otherUserIdFromRoom(room, me);
      if (!otherId) return;
      setMessagesByUser((prev) => ({
        ...prev,
        [otherId]: (prev[otherId] || []).map((m) =>
          m.sender === 'me' ? { ...m, seen: true } : m
        ),
      }));
    });

    socket.on('messagesDelivered', ({ room, userId: viewerId }) => {
      const me = userIdRef.current;
      if (String(viewerId) === String(me)) return;
      const otherId = otherUserIdFromRoom(room, me);
      if (!otherId) return;
      setMessagesByUser((prev) => ({
        ...prev,
        [otherId]: (prev[otherId] || []).map((m) =>
          m.sender === 'me' ? { ...m, delivered: true } : m
        ),
      }));
    });

    socket.on('typing', ({ room, userName }) => {
      const otherId = otherUserIdFromRoom(room, userIdRef.current);
      if (!otherId) return;
      setTypingByUser((prev) => ({ ...prev, [otherId]: userName }));
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        setTypingByUser((prev) => ({ ...prev, [otherId]: null }));
      }, 2000);
    });

    return () => {
      socket.disconnect();
      clearTimeout(typingTimerRef.current);
    };
  }, [userId, appendMessage]);

  useEffect(() => {
    if (!userId) return;
    loadContacts().catch(() => {});
  }, [userId, loadContacts]);

  useEffect(() => {
    if (!selectedRoom || !socketRef.current) return;
    socketRef.current.emit('joinRoom', selectedRoom);
    socketRef.current.emit('markSeen', { room: selectedRoom });
  }, [selectedRoom]);

  const sendMessage = useCallback(
    async (e) => {
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
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Upload failed');
          }
          const saved = await res.json();
          appendMessage(selectedUserId, saved);
          setFile(null);
        } else {
          socketRef.current?.emit('sendMessage', {
            recipientId: selectedContact.id,
            text: input.trim(),
          });
        }
        setInput('');
      } catch (err) {
        console.error(err);
        alert(err.message || 'Failed to send message');
      } finally {
        setSending(false);
      }
    },
    [selectedContact, input, file, sending, selectedUserId, appendMessage]
  );

  const onInputChange = useCallback(
    (value) => {
      setInput(value);
      if (value && selectedRoom && socketRef.current) {
        socketRef.current.emit('typing', {
          room: selectedRoom,
          userName: user?.fullName || user?.username || 'Someone',
        });
      }
    },
    [selectedRoom, user]
  );

  const getLastPreview = useCallback(
    (contactId) => {
      const msgs = messagesByUser[contactId];
      if (msgs?.length) {
        const last = msgs[msgs.length - 1];
        return messagePreview(last);
      }
      const conv = conversations.find((c) => String(c.participant?.id) === String(contactId));
      if (conv?.lastMessage) return messagePreview(conv.lastMessage);
      return '';
    },
    [messagesByUser, conversations]
  );

  return {
    user,
    userId,
    contacts,
    conversations,
    selectedUserId,
    setSelectedUserId,
    selectContact,
    selectedContact,
    selectedRoom,
    selectedMessages,
    input,
    setInput,
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
    loadContacts,
    getLastPreview,
  };
}
