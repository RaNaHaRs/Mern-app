import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { io } from 'socket.io-client';
import { buildDmRoom, otherUserIdFromRoom, getSocketUrl } from '../utils/chatHelpers';

const API = '/api';
const getToken = () => localStorage.getItem('accessToken');

export default function useInternalChat(currentUser) {
  const [contacts, setContacts] = useState([]);
  const [messagesByUser, setMessagesByUser] = useState({});
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [connected, setConnected] = useState(false);
  const [onlineIds, setOnlineIds] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  const socketRef = useRef(null);
  const userIdRef = useRef(null);
  userIdRef.current = currentUser?.id ? String(currentUser.id) : null;

  const selectedContact = useMemo(
    () => contacts.find((c) => String(c.id) === String(selectedUserId)) || null,
    [contacts, selectedUserId]
  );

  const selectedRoom = useMemo(() => {
    if (!selectedContact || !currentUser?.id) return null;
    return buildDmRoom(currentUser.id, selectedContact.id);
  }, [selectedContact, currentUser?.id]);

  const selectedMessages = useMemo(
    () => (selectedUserId ? (messagesByUser[selectedUserId] || []) : []),
    [messagesByUser, selectedUserId]
  );

  const appendMessage = useCallback((otherUserId, msg) => {
    if (!otherUserId || !msg?.id) return;
    setMessagesByUser((prev) => {
      const current = prev[otherUserId] || [];
      if (current.some((m) => String(m.id) === String(msg.id))) return prev;
      let next = current;
      if (!String(msg.id).startsWith('tmp-')) {
        next = current.filter(
          (m) =>
            !(
              String(m.id).startsWith('tmp-') &&
              String(m.sender_id) === String(msg.sender_id) &&
              (m.text || '') === (msg.text || '')
            )
        );
      }
      return { ...prev, [otherUserId]: [...next, msg] };
    });
  }, []);

  const loadContacts = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const res = await fetch(`${API}/chat/contacts`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      console.warn('Chat contacts failed', res.status);
      return;
    }
    const data = await res.json();
    const users = Array.isArray(data.users) ? data.users : [];
    const convos = Array.isArray(data.conversations) ? data.conversations : [];
    const previewById = new Map();
    convos.forEach((c) => {
      const pid = c.participant?.id;
      if (!pid || !c.lastMessage) return;
      const preview = c.lastMessage.text
        || (c.lastMessage.type === 'file' || c.lastMessage.filePath ? 'Attachment' : '');
      previewById.set(String(pid), {
        preview,
        at: c.lastMessage.created_at,
        room: c.room,
      });
    });
    const merged = users.map((u) => {
      const meta = previewById.get(String(u.id));
      return {
        ...u,
        lastMessagePreview: meta?.preview || '',
        lastMessageAt: meta?.at || null,
        room: meta?.room || (currentUser?.id ? buildDmRoom(currentUser.id, u.id) : null),
      };
    });
    merged.sort((a, b) => {
      const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      if (tb !== ta) return tb - ta;
      return (a.full_name || a.username || '').localeCompare(b.full_name || b.username || '');
    });
    setContacts(merged);
  }, [currentUser?.id]);

  const loadMessages = useCallback(async (otherUserId) => {
    const token = getToken();
    if (!token || !otherUserId) return;
    setLoadingMessages(true);
    try {
      const res = await fetch(`${API}/chat/conversations/${otherUserId}/messages?limit=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const messages = Array.isArray(data.messages) ? data.messages : [];
      setMessagesByUser((prev) => ({ ...prev, [otherUserId]: messages }));
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    loadContacts().catch(() => {});
  }, [loadContacts, currentUser?.id]);

  // Socket lifecycle — create ONCE when currentUser is available, do NOT recreate on room changes.
  // Room joining is handled by the separate useEffect below.
  useEffect(() => {
    const token = getToken();
    const myId = currentUser?.id ? String(currentUser.id) : null;
    if (!token || !myId) return;

    const socket = io(getSocketUrl(), { auth: { token }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('onlineUsers', (ids) => setOnlineIds((ids || []).map(String)));

    socket.on('newMessage', (msg) => {
      const meId = userIdRef.current;
      if (!meId) return;

      // Determine who the "other" person is in this message
      let otherId;
      if (String(msg.sender_id) === meId) {
        // I sent it — other is the recipient derived from room
        otherId = otherUserIdFromRoom(msg.room, meId);
      } else {
        // Someone sent to me
        otherId = String(msg.sender_id);
        // Ensure I have joined the DM room so future msgs also arrive
        if (msg.room && socketRef.current) {
          socketRef.current.emit('joinRoom', msg.room);
        }
      }
      if (!otherId) return;

      appendMessage(otherId, msg);
      setContacts((prev) =>
        prev.map((c) =>
          String(c.id) === String(otherId)
            ? {
                ...c,
                lastMessagePreview: msg.text || (msg.filePath ? 'Attachment' : ''),
                lastMessageAt: msg.created_at || new Date().toISOString(),
              }
            : c
        )
      );
    });

    socket.on('messagesSeen', ({ room, userId }) => {
      const meId = userIdRef.current;
      if (!meId || String(userId) === meId) return;
      const otherId = otherUserIdFromRoom(room, meId);
      if (!otherId) return;
      setMessagesByUser((prev) => ({
        ...prev,
        [otherId]: (prev[otherId] || []).map((m) =>
          String(m.sender_id) !== meId ? { ...m, seen_at: m.seen_at || new Date().toISOString() } : m
        ),
      }));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  useEffect(() => {
    if (!selectedUserId) return;
    loadMessages(selectedUserId).catch(() => {});
  }, [selectedUserId, loadMessages]);

  useEffect(() => {
    if (!selectedRoom || !connected || !socketRef.current) return;
    socketRef.current.emit('joinRoom', selectedRoom);
    socketRef.current.emit('markSeen', { room: selectedRoom });
    fetch(`${API}/chat/conversations/${selectedUserId}/seen`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
    }).catch(() => {});
  }, [selectedRoom, selectedUserId, connected]);

  const selectContact = useCallback((userId) => {
    setSelectedUserId(String(userId));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedUserId(null);
  }, []);

  const sendText = useCallback(async (text) => {
    if (!selectedContact || !text?.trim() || sending) return false;
    setSending(true);
    try {
      const payload = {
        recipientId: selectedContact.id,
        room: selectedRoom,
        text: text.trim(),
      };
      socketRef.current?.emit('sendMessage', payload);
      const optimistic = {
        id: `tmp-${Date.now()}`,
        sender_id: userIdRef.current,
        text: text.trim(),
        created_at: new Date().toISOString(),
        room: selectedRoom,
      };
      appendMessage(String(selectedContact.id), optimistic);
      setContacts((prev) =>
        prev.map((c) =>
          String(c.id) === String(selectedContact.id)
            ? { ...c, lastMessagePreview: text.trim(), lastMessageAt: optimistic.created_at }
            : c
        )
      );
      return true;
    } finally {
      setSending(false);
    }
  }, [selectedContact, selectedRoom, sending]);

  const sendFile = useCallback(async (file, text = '') => {
    if (!selectedContact || !file || sending) return null;
    setSending(true);
    try {
      const fd = new FormData();
      fd.append('recipientId', selectedContact.id);
      fd.append('file', file);
      if (text?.trim()) fd.append('text', text.trim());
      const res = await fetch(`${API}/chat/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      if (!res.ok) throw new Error('Upload failed');
      const saved = await res.json();
      appendMessage(String(selectedContact.id), saved);
      return saved;
    } finally {
      setSending(false);
    }
  }, [selectedContact, sending, appendMessage]);

  return {
    contacts,
    selectedUserId,
    selectedContact,
    selectedMessages,
    selectedRoom,
    onlineIds,
    connected,
    loadingMessages,
    sending,
    selectContact,
    clearSelection,
    sendText,
    sendFile,
    reloadContacts: loadContacts,
  };
}
