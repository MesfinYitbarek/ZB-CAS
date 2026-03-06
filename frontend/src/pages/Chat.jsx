/* pages/Chat.jsx */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { LoadingPage } from '../components/LoadingSpinner';
import {
  Send,
  Search,
  MessageCircle,
  ChevronLeft,
  Clock,
  Check,
  CheckCheck,
  User,
  MessageSquare,
} from 'lucide-react';

export default function Chat() {
  const { user, isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [admins, setAdmins] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMobileList, setShowMobileList] = useState(true);
  const messagesEndRef = useRef(null);
  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch HR admins (for employees to chat with)
  const fetchAdmins = useCallback(async () => {
    try {
      const { data } = await api.get('/chat/admins');
      setAdmins(data.data || []);
    } catch (err) {
      console.error('Failed to fetch admins:', err);
    }
  }, []);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    try {
      const { data } = await api.get('/chat/conversations');
      setConversations(data.data || []);
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    }
  }, []);

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    try {
      const { data } = await api.get('/chat/unread');
      setUnreadCount(data.data?.count || 0);
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
    }
  }, []);

  // Fetch messages for selected conversation
  const fetchMessages = useCallback(async (userId) => {
    if (!userId) return;
    try {
      const { data } = await api.get(`/chat/conversation/${userId}`);
      setMessages(data.data || []);
      // Refresh conversations to update read status
      fetchConversations();
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  }, [fetchConversations]);

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchAdmins(), fetchConversations(), fetchUnreadCount()]);
      setLoading(false);
    };
    loadData();

    // Poll for new messages every 10 seconds
    const interval = setInterval(() => {
      fetchConversations();
      fetchUnreadCount();
      if (selectedUser) {
        fetchMessages(selectedUser._id);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchAdmins, fetchConversations, fetchUnreadCount, fetchMessages, selectedUser]);

  // Scroll to bottom of messages
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
      fetchConversations();
    } catch (err) {
      console.error('Failed to send message:', err);
      alert('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  // Select a user to chat with
  const handleSelectUser = async (userData) => {
    setSelectedUser(userData);
    setShowMobileList(false);
    await fetchMessages(userData._id);
  };

  // Format timestamp
  const formatTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // Get all possible chat contacts
  const getContacts = () => {
    const contactMap = new Map();

    // Add admins
    admins.forEach((admin) => {
      if (admin._id !== user?._id) {
        contactMap.set(admin._id, { partner: admin, lastMessage: null, unreadCount: 0 });
      }
    });

    // Add existing conversations (overwrites if exists)
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

  const filteredContacts = contacts.filter((contact) =>
    contact.partner.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contact.partner.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contact.partner.department?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) return <LoadingPage />;

  return (
    <div className="h-[calc(100vh-4rem)] flex bg-gray-50">
      {/* Contact List - Mobile toggle */}
      <div
        className={`${
          showMobileList ? 'flex' : 'hidden'
        } lg:flex flex-col w-full lg:w-80 bg-white border-r border-gray-200`}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-5 h-5 text-brand-red" />
            <h2 className="text-lg font-bold text-gray-900">Messages</h2>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 bg-brand-red text-white text-xs font-medium rounded-full">
                {unreadCount}
              </span>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-100 border-0 rounded-lg text-sm focus:ring-2 focus:ring-brand-red focus:bg-white transition-all"
            />
          </div>
        </div>

        {/* Contact List */}
        <div className="flex-1 overflow-y-auto">
          {filteredContacts.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <MessageCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-sm">No contacts found</p>
              <p className="text-xs mt-1">Start a conversation with an HR admin</p>
            </div>
          ) : (
            filteredContacts.map((contact) => (
              <button
                key={contact.partner._id}
                onClick={() => handleSelectUser(contact.partner)}
                className={`w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors border-b border-gray-100 text-left ${
                  selectedUser?._id === contact.partner._id ? 'bg-red-50 hover:bg-red-50' : ''
                }`}
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-red to-red-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                  {contact.partner.name?.[0]?.toUpperCase() ||
                    contact.partner.username?.[0]?.toUpperCase() || <User className="w-5 h-5" />}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-gray-900 truncate text-sm">
                      {contact.partner.name || contact.partner.username}
                    </p>
                    {contact.lastMessage && (
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {formatTime(contact.lastMessage.createdAt)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <p className="text-sm text-gray-500 truncate flex-1">
                      {contact.lastMessage ? (
                        <>
                          {contact.lastMessage.sender._id === user?._id && (
                            <span className="text-gray-400 mr-1">You:</span>
                          )}
                          {contact.lastMessage.message}
                        </>
                      ) : (
                        <span className="text-gray-400 italic">No messages yet</span>
                      )}
                    </p>
                    {contact.unreadCount > 0 && (
                      <span className="w-5 h-5 bg-brand-red text-white text-xs font-medium rounded-full flex items-center justify-center flex-shrink-0">
                        {contact.unreadCount}
                      </span>
                    )}
                  </div>

                  {contact.partner.roles?.includes('HR_ADMIN') && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 mt-1">
                      HR Admin
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div
        className={`${
          !showMobileList ? 'flex' : 'hidden'
        } lg:flex flex-1 flex-col bg-gray-50`}
      >
        {selectedUser ? (
          <>
            {/* Chat Header */}
            <div className="p-4 bg-white border-b border-gray-200 flex items-center gap-3">
              <button
                onClick={() => setShowMobileList(true)}
                className="lg:hidden p-1 hover:bg-gray-100 rounded-lg"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>

              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-red to-red-600 flex items-center justify-center text-white font-semibold text-sm">
                {selectedUser.name?.[0]?.toUpperCase() ||
                  selectedUser.username?.[0]?.toUpperCase() || <User className="w-5 h-5" />}
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 truncate">
                  {selectedUser.name || selectedUser.username}
                </h3>
                <p className="text-xs text-gray-500">
                  {selectedUser.department || 'HR Department'}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                  <MessageCircle className="w-16 h-16 mb-4 text-gray-200" />
                  <p className="text-sm">No messages yet</p>
                  <p className="text-xs mt-1">Send a message to start the conversation</p>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const isMe = msg.sender._id === user?._id;
                  const showAvatar =
                    idx === 0 || messages[idx - 1].sender._id !== msg.sender._id;

                  return (
                    <div
                      key={msg._id}
                      className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''}`}
                    >
                      {/* Avatar (only on first message in sequence) */}
                      <div className="w-8 h-8 flex-shrink-0">
                        {showAvatar && (
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold ${
                              isMe
                                ? 'bg-gradient-to-br from-blue-500 to-blue-600'
                                : 'bg-gradient-to-br from-brand-red to-red-600'
                            }`}
                          >
                            {msg.sender.name?.[0]?.toUpperCase() ||
                              msg.sender.username?.[0]?.toUpperCase()}
                          </div>
                        )}
                      </div>

                      {/* Message Bubble */}
                      <div
                        className={`max-w-[70%] px-4 py-2 rounded-2xl text-sm ${
                          isMe
                            ? 'bg-brand-red text-white rounded-br-md'
                            : 'bg-white text-gray-900 rounded-bl-md shadow-sm'
                        }`}
                      >
                        <p>{msg.message}</p>
                        <div
                          className={`flex items-center gap-1 mt-1 text-xs ${
                            isMe ? 'text-red-100' : 'text-gray-400'
                          }`}
                        >
                          <Clock className="w-3 h-3" />
                          {formatTime(msg.createdAt)}
                          {isMe && (
                            <span className="ml-1">
                              {msg.read ? (
                                <CheckCheck className="w-3 h-3" />
                              ) : (
                                <Check className="w-3 h-3" />
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <form
              onSubmit={handleSend}
              className="p-4 bg-white border-t border-gray-200 flex items-center gap-3"
            >
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-4 py-2.5 bg-gray-100 border-0 rounded-full text-sm focus:ring-2 focus:ring-brand-red focus:bg-white transition-all"
                maxLength={2000}
              />
              <button
                type="submit"
                disabled={!newMessage.trim() || sending}
                className="p-2.5 bg-brand-red text-white rounded-full hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          </>
        ) : (
          /* Empty State */
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8">
            <MessageSquare className="w-20 h-20 mb-4 text-gray-200" />
            <p className="text-lg font-medium text-gray-600">Select a contact</p>
            <p className="text-sm mt-1">Choose an HR admin to start chatting</p>
          </div>
        )}
      </div>
    </div>
  );
}
