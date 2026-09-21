/* components/SupportWidget.jsx — Real-time Telegram/Instagram-quality chat */
/* Socket.IO WebSocket | Optimistic sends | Typing indicators | Presence | Read receipts */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery, useQueries, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useAppSocket } from '../context/SocketContext';
import { queryKeys } from '../hooks/queryKeys';
import { usePublicFaqs, useFaqCategories } from '../hooks/queries';
import api from '../utils/api';
import {
  HelpCircle, X, MessageCircle, Search, Send,
  ChevronDown, Check, CheckCheck, User, Bot,
  ArrowLeft, Circle,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(d) {
  return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function formatDateSep(d) {
  const date = new Date(d);
  const today = new Date();
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yest.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'long', day: 'numeric' });
}
function isSameDay(a, b) {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}
function getInitials(name = '') {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// Raw senderId/receiverId scalars are always present on message payloads
// (REST + socket); nested sender/receiver objects may or may not carry _id.
const senderIdOf = (msg) => msg?.senderId || msg?.sender?._id || msg?.sender?.id || msg?.sender;
const receiverIdOf = (msg) => msg?.receiverId || msg?.receiver?._id || msg?.receiver?.id || msg?.receiver;

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = 'md', online = false }) {
  const dims = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  return (
    <div className="relative flex-shrink-0">
      <div className={`${dims} rounded-full bg-gradient-to-br from-red-400 to-brand-red flex items-center justify-center font-semibold text-white`}>
        {getInitials(name) || <User className="w-4 h-4" />}
      </div>
      {online && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-brand-black border-2 border-white rounded-full" />}
    </div>
  );
}

// ─── Typing Dots ──────────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map(i => (
        <span key={i} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.9s' }} />
      ))}
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg, isMe, isFirst, isLast }) {
  const isOpt = msg._optimistic;
  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${isLast ? 'mb-3' : 'mb-0.5'}`}>
      <div className={`
        relative max-w-[78%] px-3 py-2 text-sm leading-relaxed break-words transition-opacity duration-200
        ${isOpt ? 'opacity-70' : 'opacity-100'}
        ${isMe
          ? `bg-brand-red text-white rounded-2xl ${isFirst ? '' : ''} ${isLast ? 'rounded-br-sm' : ''}`
          : `bg-gray-100 text-gray-900 rounded-2xl ${isLast ? 'rounded-bl-sm' : ''}`
        }
      `}>
        <p className="whitespace-pre-wrap">{msg.message}</p>
        <div className={`flex items-center justify-end gap-1 mt-0.5 text-[10px] ${isMe ? 'text-white/60' : 'text-gray-400'}`}>
          <span>{formatTime(msg.createdAt || new Date())}</span>
          {isMe && (
            isOpt ? <Circle className="w-2.5 h-2.5 opacity-50" />
            : msg.read ? <CheckCheck className="w-3 h-3 text-white" />
            : <Check className="w-3 h-3" />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Chat View ────────────────────────────────────────────────────────────────

function ChatView({ partner, onBack, socket, connected, currentUserId, onlineUsers }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const endRef = useRef(null);
  const containerRef = useRef(null);
  const taRef = useRef(null);
  const typingTimer = useRef(null);
  const isOnline = onlineUsers.has(partner._id);

  // Telegram-style windowed history: newest chunk first, older chunks load on scroll-up
  const PAGE_SIZE = 30;
  const conversationQuery = useInfiniteQuery({
    queryKey: queryKeys.chat.conversation(partner._id),
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get(`/chat/conversation/${partner._id}`, {
        params: { limit: PAGE_SIZE, ...(pageParam ? { before: pageParam } : {}) },
      });
      return data.data; // { messages, hasMore }
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => {
      if (!lastPage?.hasMore || !lastPage.messages?.length) return undefined;
      return lastPage.messages[0]._id; // oldest of this chunk = cursor for older
    },
    enabled: !!partner._id,
  });
  const loading = conversationQuery.isLoading;

  useEffect(() => {
    const pages = conversationQuery.data?.pages;
    if (!pages) return;
    const serverMsgs = [...pages].reverse().flatMap(p => p.messages || []);
    setMessages(prev => {
      const serverIds = new Set(serverMsgs.map(m => m._id));
      const confirmedTexts = new Set(
        serverMsgs.filter(m => senderIdOf(m) === currentUserId).map(m => m.message)
      );
      // Optimistic sends still in flight + live socket arrivals newer than the snapshot
      const carry = prev.filter(m =>
        (m._optimistic && !confirmedTexts.has(m.message)) ||
        (!m._optimistic && !serverIds.has(m._id))
      );
      return [...serverMsgs, ...carry];
    });
  }, [conversationQuery.data, currentUserId]);

  useEffect(() => {
    socket?.emit('message:read', { senderId: partner._id });
  }, [partner._id, socket]);

  useEffect(() => {
    if (!socket) return;
    const onNew = (msg) => {
      const senderId = senderIdOf(msg);
      const receiverId = receiverIdOf(msg);
      const related = (senderId === partner._id && receiverId === currentUserId) ||
        (senderId === currentUserId && receiverId === partner._id);
      if (!related) return;
      setMessages(prev => {
        const withoutOpt = prev.filter(m => !(m._optimistic && m.message === msg.message && senderIdOf(m) === currentUserId));
        if (withoutOpt.some(m => m._id === msg._id)) return withoutOpt;
        return [...withoutOpt, msg];
      });
      if (senderId === partner._id) socket.emit('message:read', { senderId: partner._id });
    };
    const onRead = ({ byUserId }) => {
      if (byUserId === partner._id) setMessages(prev => prev.map(m =>
        senderIdOf(m) === currentUserId ? { ...m, read: true } : m
      ));
    };
    const onTypStart = ({ userId }) => { if (userId === partner._id) setPartnerTyping(true); };
    const onTypStop = ({ userId }) => { if (userId === partner._id) setPartnerTyping(false); };

    socket.on('message:new', onNew);
    socket.on('message:read', onRead);
    socket.on('typing:start', onTypStart);
    socket.on('typing:stop', onTypStop);
    return () => {
      socket.off('message:new', onNew);
      socket.off('message:read', onRead);
      socket.off('typing:start', onTypStart);
      socket.off('typing:stop', onTypStop);
    };
  }, [socket, partner._id, currentUserId]);

  // Scroll anchor kept across older-chunk prepends so the view doesn't jump
  const anchorRef = useRef(null);
  // Stick to the bottom (latest message) until the user scrolls up
  const followRef = useRef(true);
  const firstPaintRef = useRef(true);

  useEffect(() => {
    followRef.current = true;
    firstPaintRef.current = true;
    anchorRef.current = null;
  }, [partner._id]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (anchorRef.current != null) {
      el.scrollTop = el.scrollHeight - anchorRef.current;
      anchorRef.current = null;
      return;
    }
    if (!followRef.current) return;
    if (firstPaintRef.current) {
      el.scrollTop = el.scrollHeight; // open at the latest message, no sweep
      firstPaintRef.current = false;
    } else {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, partnerTyping, loading]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(dist > 100);
    followRef.current = dist < 120;
    // Telegram-style: near the top → load the next older chunk
    if (el.scrollTop < 120 && conversationQuery.hasNextPage && !conversationQuery.isFetchingNextPage) {
      anchorRef.current = el.scrollHeight;
      conversationQuery.fetchNextPage();
    }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    const ta = taRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`; }
    if (socket && e.target.value) {
      socket.emit('typing:start', { receiverId: partner._id });
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => socket.emit('typing:stop', { receiverId: partner._id }), 1500);
    } else if (socket) {
      socket.emit('typing:stop', { receiverId: partner._id });
    }
  };

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    socket?.emit('typing:stop', { receiverId: partner._id });
    clearTimeout(typingTimer.current);
    const opt = { _id: `opt-${Date.now()}`, _optimistic: true,
      sender: { _id: currentUserId }, receiver: { _id: partner._id },
      message: text, read: false, createdAt: new Date().toISOString() };
    setMessages(prev => [...prev, opt]);
    setInput('');
    if (taRef.current) taRef.current.style.height = 'auto';
    setSending(true);

    if (socket && connected) {
      socket.emit('message:send', { receiverId: partner._id, message: text }, (res) => {
        setSending(false);
        if (res?.error) { setMessages(prev => prev.filter(m => m._id !== opt._id)); setInput(text); }
      });
    } else {
      try {
        const { data } = await api.post('/chat/send', { receiverId: partner._id, message: text });
        setMessages(prev => [...prev.filter(m => m._id !== opt._id), data.data]);
      } catch { setMessages(prev => prev.filter(m => m._id !== opt._id)); setInput(text); }
      finally { setSending(false); }
    }
  }, [input, sending, socket, connected, partner._id, currentUserId]);

  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };

  const grouped = useMemo(() => messages.map((msg, i) => {
    const prev = messages[i - 1], next = messages[i + 1];
    const sid = senderIdOf(msg);
    const psid = prev ? (prev.sender?._id || prev.sender) : null;
    const nsid = next ? (next.sender?._id || next.sender) : null;
    const showDate = !prev || !isSameDay(prev.createdAt, msg.createdAt);
    return { msg, isFirst: sid !== psid || showDate, isLast: sid !== nsid || (next && !isSameDay(msg.createdAt, next.createdAt)), showDate };
  }), [messages]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-gray-100 flex items-center gap-2.5 bg-white flex-shrink-0">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Avatar name={partner.name} size="sm" online={isOnline} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{partner.name}</p>
          <p className="text-xs text-gray-500 leading-tight">
            {partnerTyping ? <span className="text-brand-red italic">typing…</span>
              : isOnline ? 'Online' : partner.position || 'HR Admin'}
          </p>
        </div>
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${connected ? 'bg-brand-black' : 'bg-gray-400'}`} />
      </div>

      {/* Messages */}
      <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-3 py-3" style={{ overscrollBehavior: 'contain' }}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex gap-1">{[0,1,2].map(i=><div key={i} className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{animationDelay:`${i*0.12}s`}}/>)}</div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-brand-red/10 flex items-center justify-center">
              <MessageCircle className="w-7 h-7 text-brand-red/50" />
            </div>
            <div><p className="text-sm font-medium text-gray-700">Start a conversation</p><p className="text-xs text-gray-400 mt-0.5">with {partner.name}</p></div>
          </div>
        ) : (<>
          {conversationQuery.isFetchingNextPage && (
            <div className="flex items-center justify-center py-2">
              <div className="flex gap-1">{[0,1,2].map(i=><div key={i} className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{animationDelay:`${i*0.12}s`}}/>)}</div>
            </div>
          )}
          {grouped.map(({ msg, isFirst, isLast, showDate }) => {
            const sid = senderIdOf(msg);
            return (
              <div key={msg._id}>
                {showDate && (
                  <div className="flex items-center gap-2 my-3">
                    <div className="flex-1 h-px bg-gray-100" />
                    <span className="text-[10px] font-medium text-gray-400">{formatDateSep(msg.createdAt)}</span>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>
                )}
                <MessageBubble msg={msg} isMe={sid === currentUserId} isFirst={isFirst} isLast={isLast} />
              </div>
            );
          })}
        </>)}
        {partnerTyping && (
          <div className="flex justify-start mb-2">
            <div className="bg-gray-100 rounded-2xl rounded-bl-sm"><TypingDots /></div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Scroll button */}
      {showScrollBtn && (
        <button onClick={() => endRef.current?.scrollIntoView({ behavior: 'smooth' })}
          className="absolute bottom-16 right-4 w-8 h-8 rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center hover:bg-gray-50 z-10">
          <ChevronDown className="w-4 h-4 text-gray-600" />
        </button>
      )}

      {/* Input */}
      <div className="px-3 py-2.5 border-t border-gray-100 bg-white flex items-end gap-2 flex-shrink-0">
        <textarea ref={taRef} value={input} onChange={handleInputChange} onKeyDown={handleKeyDown}
          placeholder="Message…" rows={1}
          className="flex-1 px-3 py-2 bg-gray-100 rounded-2xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:bg-white transition-all"
          style={{ minHeight: '36px', maxHeight: '120px' }}
        />
        <button onClick={handleSend} disabled={!input.trim() || sending}
          className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
            input.trim() ? 'bg-brand-red text-white hover:bg-red-700 shadow-md scale-100' : 'bg-gray-200 text-gray-400 scale-90'
          }`}>
          <Send className="w-4 h-4 translate-x-px" />
        </button>
      </div>
    </div>
  );
}

// ─── Contact List ─────────────────────────────────────────────────────────────

function ContactList({ onSelect, socket, onlineUsers }) {
  const { user } = useAuth();
  const [contacts, setContacts] = useState([]);

  const [adminsQuery, convsQuery] = useQueries({
    queries: [
      {
        queryKey: queryKeys.chat.admins,
        queryFn: async () => { const { data } = await api.get('/chat/admins'); return data.data || []; },
      },
      {
        queryKey: queryKeys.chat.conversations,
        queryFn: async () => { const { data } = await api.get('/chat/conversations'); return data.data || []; },
      },
    ],
  });
  const loading = adminsQuery.isLoading || convsQuery.isLoading;

  useEffect(() => {
    const a = adminsQuery.data;
    const c = convsQuery.data;
    if (!a) return;
    const map = new Map();
    (a || []).forEach(adm => { if (adm._id !== user?._id) map.set(adm._id, { partner: adm, lastMessage: null, unreadCount: 0 }); });
    (c || []).forEach(conv => map.set(conv.partner._id, conv));
    const sorted = Array.from(map.values()).sort((a, b) => {
      if (a.lastMessage && b.lastMessage) return new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt);
      return a.lastMessage ? -1 : b.lastMessage ? 1 : 0;
    });
    setContacts(sorted);
  }, [adminsQuery.data, convsQuery.data, user?._id]);

  useEffect(() => {
    if (!socket) return;
    const onNew = (msg) => {
      const sid = senderIdOf(msg);
      const rid = receiverIdOf(msg);
      setContacts(prev => prev.map(c => {
        if (c.partner._id === sid || c.partner._id === rid) {
          return { ...c, lastMessage: msg, unreadCount: sid !== user?._id ? (c.unreadCount || 0) + 1 : c.unreadCount };
        }
        return c;
      }));
    };
    socket.on('message:new', onNew);
    return () => socket.off('message:new', onNew);
  }, [socket, user?._id]);

  if (loading) return <div className="flex-1 flex items-center justify-center"><div className="flex gap-1">{[0,1,2].map(i=><div key={i} className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{animationDelay:`${i*0.12}s`}}/>)}</div></div>;
  if (!contacts.length) return <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6"><div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center"><User className="w-6 h-6 text-gray-400" /></div><p className="text-sm text-gray-500">No HR admins available</p></div>;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-3 pt-2 pb-1"><p className="text-xs font-medium text-gray-400 uppercase tracking-wide">HR Admins</p></div>
      {contacts.map(c => (
        <button key={c.partner._id} onClick={() => onSelect(c.partner)}
          className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-gray-50 active:bg-gray-100 transition-colors">
          <Avatar name={c.partner.name} online={onlineUsers.has(c.partner._id)} />
          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-semibold text-gray-900 text-sm truncate">{c.partner.name}</p>
              {c.lastMessage && <span className="text-[10px] text-gray-400 flex-shrink-0">{formatTime(c.lastMessage.createdAt)}</span>}
            </div>
            <p className="text-xs text-gray-500 truncate mt-0.5">{c.lastMessage?.message || c.partner.position || 'HR Admin'}</p>
          </div>
          {c.unreadCount > 0 && (
            <span className="w-5 h-5 rounded-full bg-brand-red text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
              {c.unreadCount > 9 ? '9+' : c.unreadCount}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Chat Tab ─────────────────────────────────────────────────────────────────

function ChatTab({ socket, connected }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState(new Set());

  const handleSelect = (partner) => {
    // Fresh badges the moment a conversation is opened
    queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations });
    queryClient.invalidateQueries({ queryKey: queryKeys.chat.unread });
    setSelected(partner);
  };

  useEffect(() => {
    if (!socket) return;
    const onOnline = ({ userId }) => setOnlineUsers(p => new Set([...p, userId]));
    const onOffline = ({ userId }) => setOnlineUsers(p => { const s = new Set(p); s.delete(userId); return s; });
    socket.on('user:online', onOnline);
    socket.on('user:offline', onOffline);
    return () => { socket.off('user:online', onOnline); socket.off('user:offline', onOffline); };
  }, [socket]);

  return selected
    ? <ChatView partner={selected} onBack={() => setSelected(null)} socket={socket} connected={connected} currentUserId={user?._id} onlineUsers={onlineUsers} />
    : <ContactList onSelect={handleSelect} socket={socket} onlineUsers={onlineUsers} />;
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────

const CAT_DOT = {
  GENERAL: 'bg-gray-400', ASSESSMENT: 'bg-gray-500', TECHNICAL: 'bg-gray-500',
  HR: 'bg-red-400', POLICY: 'bg-gray-500', OTHER: 'bg-gray-500',
};

function FAQItem({ faq }) {
  const [open, setOpen] = useState(false);
  const dot = CAT_DOT[faq.category] || 'bg-gray-300';
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className={`w-full py-3 px-4 flex items-start justify-between text-left gap-3 transition-colors ${open ? 'bg-gray-50' : 'hover:bg-gray-50/70'}`}
      >
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 ${dot}`} />
          <span className="font-medium text-gray-800 text-sm leading-relaxed">{faq.question}</span>
        </div>
        <ChevronDown className={`flex-shrink-0 w-4 h-4 text-gray-400 mt-0.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`overflow-hidden transition-all duration-200 ${open ? 'max-h-96' : 'max-h-0'}`}>
        <p className="px-4 pb-4 pl-8 text-sm text-gray-600 leading-relaxed">{faq.answer}</p>
      </div>
    </div>
  );
}

function FAQTab() {
  const [selCat, setSelCat] = useState('ALL');
  const [q, setQ] = useState('');

  const { data: faqs, isLoading: faqsLoading } = usePublicFaqs();
  const { data: cats, isLoading: catsLoading } = useFaqCategories();
  const loading = faqsLoading || catsLoading;
  const catsData = [{ value: 'ALL', label: 'All' }, ...(cats || [])];

  const filtered = useMemo(() => {
    const list = faqs || [];
    return list.filter(f => {
      const mc = selCat === 'ALL' || f.category === selCat;
      const ms = !q || f.question.toLowerCase().includes(q.toLowerCase()) || f.answer.toLowerCase().includes(q.toLowerCase());
      return mc && ms;
    });
  }, [faqs, selCat, q]);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex gap-1">{[0,1,2].map(i=><div key={i} className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{animationDelay:`${i*0.12}s`}}/>)}</div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Search + categories */}
      <div className="p-3 space-y-2 border-b border-gray-100 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search FAQs…"
            className="w-full pl-9 pr-3 py-2 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-red/20 transition-all"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          {catsData.map(c => (
            <button
              key={c.value}
              onClick={() => setSelCat(c.value)}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                selCat === c.value ? 'bg-brand-red text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6 py-10">
            <HelpCircle className="w-8 h-8 text-gray-300" />
            <p className="text-sm text-gray-400">
              {q || selCat !== 'ALL' ? 'No FAQs match your search' : 'No FAQs available yet'}
            </p>
            {(q || selCat !== 'ALL') && (
              <button onClick={() => { setQ(''); setSelCat('ALL'); }} className="text-xs text-brand-red hover:underline mt-1">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            {filtered.map(f => <FAQItem key={f._id} faq={f} />)}
            <p className="text-center text-[10px] text-gray-300 py-3">
              {filtered.length} result{filtered.length !== 1 ? 's' : ''}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Widget ──────────────────────────────────────────────────────────────

export default function SupportWidget() {
  const { isAdmin, isSupervisor, isEmployee, user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('faq');
  const queryClient = useQueryClient();

  const unreadQuery = useQuery({
    queryKey: queryKeys.chat.unread,
    queryFn: async () => {
      const { data } = await api.get('/chat/unread');
      return data.data;
    },
    refetchInterval: 30_000,
  });
  const unread = unreadQuery.data?.count ?? 0;

  // ── Draggable floating button (position persisted per browser) ─────────────
  const [pos, setPos] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('support-widget-pos'));
      if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') return saved;
    } catch { /* ignore */ }
    return null; // null = default bottom-right corner
  });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ on: false, moved: false, startX: 0, startY: 0, origX: 0, origY: 0 });
  const BTN = 56; // w-14/h-14 button size

  const clampPos = (x, y) => ({
    x: Math.min(Math.max(x, 8), Math.max(window.innerWidth - BTN - 8, 8)),
    y: Math.min(Math.max(y, 8), Math.max(window.innerHeight - BTN - 8, 8)),
  });

  // Keep the button on-screen when the viewport resizes
  useEffect(() => {
    const onResize = () => setPos(p => (p ? clampPos(p.x, p.y) : p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onBtnPointerDown = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      on: true, moved: false,
      startX: e.clientX, startY: e.clientY,
      origX: pos ? pos.x : rect.left,
      origY: pos ? pos.y : rect.top,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onBtnPointerMove = (e) => {
    const d = dragRef.current;
    if (!d.on) return;
    if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 5) {
      if (!d.moved) { d.moved = true; setDragging(true); }
      const next = clampPos(d.origX + (e.clientX - d.startX), d.origY + (e.clientY - d.startY));
      setPos(next);
      try { localStorage.setItem('support-widget-pos', JSON.stringify(next)); } catch { /* ignore */ }
    }
  };

  const endBtnDrag = () => {
    if (!dragRef.current.on) return;
    dragRef.current.on = false;
    setDragging(false);
  };

  const onBtnClick = () => {
    // A drag ending on the button also fires click — swallow it
    if (dragRef.current.moved) { dragRef.current.moved = false; return; }
    if (!isOpen) queryClient.invalidateQueries({ queryKey: queryKeys.chat.unread });
    setIsOpen(v => !v);
  };

  const { socket, connected } = useAppSocket();

  useEffect(() => {
    if (!socket) return;
    const onNew = (msg) => {
      // New partners / corrected unread counts come from the server snapshot
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations });
      if (receiverIdOf(msg) === user?._id && (!isOpen || activeTab !== 'chat')) {
        queryClient.setQueryData(queryKeys.chat.unread, (old) => ({ count: (Number(old?.count ?? 0) + 1) }));
      }
    };
    socket.on('message:new', onNew);
    return () => socket.off('message:new', onNew);
  }, [socket, user?._id, isOpen, activeTab, queryClient]);

  useEffect(() => {
    if (isOpen && activeTab === 'chat') {
      queryClient.setQueryData(queryKeys.chat.unread, { count: 0 });
    }
  }, [isOpen, activeTab, queryClient]);

  if (!(isEmployee || isSupervisor || isAdmin)) return null;

  return (
    <>
      {/* Floating button — draggable, click toggles */}
      <button
        onPointerDown={onBtnPointerDown}
        onPointerMove={onBtnPointerMove}
        onPointerUp={endBtnDrag}
        onPointerCancel={endBtnDrag}
        onClick={onBtnClick}
        title="Drag to move · Click to open support"
        style={pos ? { left: pos.x, top: pos.y, transition: dragging ? 'none' : undefined } : undefined}
        className={`fixed ${pos ? '' : 'bottom-6 right-6 '}w-14 h-14 rounded-full shadow-lg z-50 flex items-center justify-center touch-none select-none ${
          dragging ? 'cursor-grabbing scale-105' : 'cursor-grab'
        } transition-all duration-300 ${
          isOpen ? 'bg-gray-700 text-white rotate-90 scale-95' : 'bg-brand-red text-white hover:scale-110 hover:shadow-xl'
        }`}>
        {isOpen ? <X className="w-6 h-6" /> : <HelpCircle className="w-7 h-7" />}
        {!isOpen && unread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-brand-black text-white text-[10px] font-bold flex items-center justify-center shadow">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Panel */}
      <div className={`fixed bottom-24 right-6 w-80 sm:w-[360px] bg-white rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden border border-gray-100 transition-all duration-300 origin-bottom-right ${
        isOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
      }`} style={{ height: 'min(540px, calc(100vh - 6rem))', maxHeight: 'calc(100vh - 6rem)' }}>

        {/* Header */}
        <div className="bg-brand-red text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <p className="font-semibold text-sm leading-tight">Support Center</p>
              <p className="text-[10px] text-white/70 flex items-center gap-1">
                {connected
                  ? <><span className="w-1.5 h-1.5 bg-white rounded-full inline-block" />Live</>
                  : <><span className="w-1.5 h-1.5 bg-white/50 rounded-full inline-block animate-pulse" />Connecting…</>
                }
              </p>
            </div>
          </div>
          <button onClick={() => setIsOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 flex-shrink-0">
          {[{ id: 'faq', label: 'FAQs', icon: HelpCircle }, { id: 'chat', label: 'Chat', icon: MessageCircle, badge: unread }].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors relative ${
                activeTab === t.id ? 'text-brand-red' : 'text-gray-400 hover:text-gray-600'
              }`}>
              <t.icon className="w-4 h-4" />
              {t.label}
              {t.badge > 0 && <span className="w-4 h-4 rounded-full bg-brand-red text-white text-[9px] font-bold flex items-center justify-center">{t.badge}</span>}
              {activeTab === t.id && <span className="absolute bottom-0 left-4 right-4 h-0.5 bg-brand-red rounded-full" />}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-h-0 relative">
          {activeTab === 'faq' ? <FAQTab /> : <ChatTab socket={socket} connected={connected} />}
        </div>
      </div>
    </>
  );
}
