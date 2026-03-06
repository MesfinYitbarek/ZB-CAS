/* components/SupportWidget.jsx */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import {
  HelpCircle,
  X,
  MessageCircle,
  Search,
  Send,
  ChevronDown,
  ChevronUp,
  Clock,
  Check,
  CheckCheck,
  User,
  Bot,
} from 'lucide-react';

// FAQ Item Component
function FAQItem({ faq }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-3 px-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
      >
        <span className="font-medium text-gray-800 text-sm pr-4">{faq.question}</span>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}
      </button>
      {isOpen && (
        <div className="px-4 pb-4 text-sm text-gray-600 leading-relaxed">
          {faq.answer}
        </div>
      )}
    </div>
  );
}

// Chat Tab Component
function ChatTab({ onBack }) {
  const { user, isAdmin } = useAuth();
  const [admins, setAdmins] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);

  // Fetch HR admins and conversations
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [adminsRes, convRes] = await Promise.all([
        api.get('/chat/admins'),
        api.get('/chat/conversations'),
      ]);
      setAdmins(adminsRes.data.data || []);
      setConversations(convRes.data.data || []);
    } catch (err) {
      console.error('Failed to load chat data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Poll for new messages every 10 seconds
    const interval = setInterval(() => {
      loadData();
      if (selectedUser) {
        fetchMessages(selectedUser._id);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [loadData, selectedUser]);

  // Fetch messages
  const fetchMessages = useCallback(async (userId) => {
    if (!userId) return;
    try {
      const { data } = await api.get(`/chat/conversation/${userId}`);
      setMessages(data.data || []);
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  }, []);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send message
  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUser || sending) return;

    setSending(true);
    try {
      const { data } = await api.post('/chat/send', {
        receiverId: selectedUser._id,
        message: newMessage.trim(),
      });
      setMessages((prev) => [...prev, data.data]);
      setNewMessage('');
      loadData();
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  };

  // Select user
  const handleSelectUser = async (userData) => {
    setSelectedUser(userData);
    await fetchMessages(userData._id);
  };

  // Format time
  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Get all contacts
  const getContacts = () => {
    const contactMap = new Map();

    // Add admins
    admins.forEach((admin) => {
      if (admin._id !== user?._id) {
        contactMap.set(admin._id, { partner: admin, lastMessage: null, unreadCount: 0 });
      }
    });

    // Add conversations
    conversations.forEach((conv) => {
      contactMap.set(conv.partner._id, conv);
    });

    return Array.from(contactMap.values()).sort((a, b) => {
      if (a.lastMessage && b.lastMessage) {
        return new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt);
      }
      if (a.lastMessage) return -1;
      if (b.lastMessage) return 1;
      return 0;
    });
  };

  const contacts = getContacts();

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  // Chat view
  if (selectedUser) {
    return (
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
          <button
            onClick={() => setSelectedUser(null)}
            className="text-gray-400 hover:text-gray-600"
          >
            <ChevronDown className="w-5 h-5 rotate-90" />
          </button>
          <div className="w-8 h-8 rounded-full bg-brand-red/10 flex items-center justify-center">
            <User className="w-4 h-4 text-brand-red" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 text-sm truncate">{selectedUser.name}</p>
            <p className="text-xs text-gray-500">{selectedUser.position || 'HR Admin'}</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-8">
              Start a conversation with {selectedUser.name}
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.sender._id === user?._id;
              return (
                <div
                  key={msg._id}
                  className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                      isMe
                        ? 'bg-brand-red text-white rounded-br-md'
                        : 'bg-gray-100 text-gray-800 rounded-bl-md'
                    }`}
                  >
                    <p>{msg.message}</p>
                    <div className={`flex items-center gap-1 mt-1 text-xs ${isMe ? 'text-white/70' : 'text-gray-400'}`}>
                      <span>{formatTime(msg.createdAt)}</span>
                      {isMe && (
                        msg.read ? (
                          <CheckCheck className="w-3 h-3" />
                        ) : (
                          <Check className="w-3 h-3" />
                        )
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSend} className="p-3 border-t border-gray-100 flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-brand-red/20"
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || sending}
            className="w-10 h-10 rounded-full bg-brand-red text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-700 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    );
  }

  // Contact list view
  return (
    <div className="flex-1 flex flex-col">
      <div className="p-4 border-b border-gray-100">
        <p className="text-sm text-gray-500 mb-1">Select an HR admin to chat with</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {contacts.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8">
            No HR admins available
          </div>
        ) : (
          contacts.map((contact) => (
            <button
              key={contact.partner._id}
              onClick={() => handleSelectUser(contact.partner)}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
            >
              <div className="w-10 h-10 rounded-full bg-brand-red/10 flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-brand-red" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="font-medium text-gray-900 text-sm truncate">{contact.partner.name}</p>
                <p className="text-xs text-gray-500 truncate">
                  {contact.lastMessage?.message || contact.partner.position || 'HR Admin'}
                </p>
              </div>
              {contact.unreadCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-brand-red text-white text-xs flex items-center justify-center">
                  {contact.unreadCount}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// FAQ Tab Component
function FAQTab() {
  const [faqs, setFaqs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [faqsRes, catsRes] = await Promise.all([
          api.get('/faq/public'),
          api.get('/faq/categories'),
        ]);
        setFaqs(faqsRes.data.data || []);
        setCategories([{ value: 'ALL', label: 'All Categories' }, ...(catsRes.data.data || [])]);
      } catch (err) {
        console.error('Failed to load FAQs:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const filteredFAQs = faqs.filter((faq) => {
    const matchesCategory = selectedCategory === 'ALL' || faq.category === selectedCategory;
    const matchesSearch =
      !searchQuery ||
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading FAQs...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Search */}
      <div className="p-3 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search FAQs..."
            className="w-full pl-9 pr-3 py-2 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-red/20"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="px-3 py-2 border-b border-gray-100 flex gap-2 overflow-x-auto">
        {categories.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setSelectedCategory(cat.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              selectedCategory === cat.value
                ? 'bg-brand-red text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* FAQ List */}
      <div className="flex-1 overflow-y-auto">
        {filteredFAQs.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8">
            No FAQs found
          </div>
        ) : (
          filteredFAQs.map((faq) => <FAQItem key={faq._id} faq={faq} />)
        )}
      </div>
    </div>
  );
}

// Main Support Widget Component
export default function SupportWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('faq'); // 'faq' | 'chat'
  const { isAdmin, isSupervisor, isEmployee } = useAuth();
  
  // Draggable position state
  const [position, setPosition] = useState(() => {
    const saved = localStorage.getItem('supportWidgetPosition');
    if (saved) {
      try {
        const pos = JSON.parse(saved);
        // Ensure position is valid (not off-screen after resize)
        return {
          x: Math.min(Math.max(pos.x, 20), window.innerWidth - 76),
          y: Math.min(Math.max(pos.y, 20), window.innerHeight - 76),
        };
      } catch {
        return { x: window.innerWidth - 80, y: window.innerHeight - 80 };
      }
    }
    return { x: window.innerWidth - 80, y: window.innerHeight - 80 };
  });
  
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, initialX: 0, initialY: 0 });

  // Only show for employees, supervisors, and HR admins
  const canAccess = isEmployee || isSupervisor || isAdmin;
  if (!canAccess) return null;

  // Handle drag start
  const handleMouseDown = (e) => {
    if (e.button !== 0) return; // Only left click
    e.preventDefault();
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: position.x,
      initialY: position.y,
    };
  };

  // Handle touch start for mobile
  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    setIsDragging(true);
    dragRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      initialX: position.x,
      initialY: position.y,
    };
  };

  // Handle drag move
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      
      const deltaX = e.clientX - dragRef.current.startX;
      const deltaY = e.clientY - dragRef.current.startY;
      
      const newX = Math.min(
        Math.max(dragRef.current.initialX + deltaX, 20),
        window.innerWidth - 76
      );
      const newY = Math.min(
        Math.max(dragRef.current.initialY + deltaY, 20),
        window.innerHeight - 76
      );
      
      setPosition({ x: newX, y: newY });
    };

    const handleTouchMove = (e) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      
      const deltaX = touch.clientX - dragRef.current.startX;
      const deltaY = touch.clientY - dragRef.current.startY;
      
      const newX = Math.min(
        Math.max(dragRef.current.initialX + deltaX, 20),
        window.innerWidth - 76
      );
      const newY = Math.min(
        Math.max(dragRef.current.initialY + deltaY, 20),
        window.innerHeight - 76
      );
      
      setPosition({ x: newX, y: newY });
    };

    const handleDragEnd = () => {
      if (isDragging) {
        setIsDragging(false);
        // Save position to localStorage
        localStorage.setItem('supportWidgetPosition', JSON.stringify({
          x: Math.round(position.x),
          y: Math.round(position.y),
        }));
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleDragEnd);
      document.addEventListener('touchmove', handleTouchMove, { passive: true });
      document.addEventListener('touchend', handleDragEnd);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleDragEnd);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleDragEnd);
    };
  }, [isDragging, position.x, position.y]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => ({
        x: Math.min(Math.max(prev.x, 20), window.innerWidth - 76),
        y: Math.min(Math.max(prev.y, 20), window.innerHeight - 76),
      }));
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle button click (prevent opening when dragging)
  const handleClick = (e) => {
    if (!isDragging) {
      setIsOpen(true);
    }
  };

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onClick={handleClick}
          onDoubleClick={() => {
            // Reset position on double click
            setPosition({ x: window.innerWidth - 80, y: window.innerHeight - 80 });
            localStorage.removeItem('supportWidgetPosition');
          }}
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
            position: 'fixed',
          }}
          className={`w-14 h-14 rounded-full bg-brand-red text-white shadow-lg hover:shadow-xl hover:scale-110 transition-all z-50 flex items-center justify-center cursor-${isDragging ? 'grabbing' : 'grab'} ${isDragging ? 'scale-95' : ''}`}
          title="Get Support (drag to move, double-click to reset)"
        >
          <HelpCircle className="w-7 h-7 pointer-events-none" />
        </button>
      )}

      {/* Support Panel */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-80 sm:w-96 h-[500px] bg-white rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
          {/* Header */}
          <div className="bg-brand-red text-white px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5" />
              <span className="font-semibold">Support Center</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setActiveTab('faq')}
              className={`flex-1 py-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
                activeTab === 'faq'
                  ? 'text-brand-red border-b-2 border-brand-red'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <HelpCircle className="w-4 h-4" />
              FAQs
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 py-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
                activeTab === 'chat'
                  ? 'text-brand-red border-b-2 border-brand-red'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <MessageCircle className="w-4 h-4" />
              Chat
            </button>
          </div>

          {/* Content */}
          {activeTab === 'faq' ? <FAQTab /> : <ChatTab />}
        </div>
      )}
    </>
  );
}
