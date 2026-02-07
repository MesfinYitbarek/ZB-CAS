import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Menu, Bell, Search, X, User, LogOut, Settings, ChevronDown } from 'lucide-react';
import api from '../utils/api';

export default function Header({ onMobileToggle }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

  const searchRef = useRef(null);
  const notifRef = useRef(null);
  const profileRef = useRef(null);

  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768);
      setIsTablet(window.innerWidth >= 768 && window.innerWidth < 1024);
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSearchResults(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfileMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // Load notifications
  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [user?.role]);

  const loadNotifications = async () => {
    try {
      const { data: assessData } = await api.get('/assessments/active');
      const activeAssessments = assessData.data.assessments || [];

      let pendingResults = [];
      if (user?.role === 'HR_ADMIN') {
        const { data: resultsData } = await api.get('/results?status=PENDING');
        pendingResults = resultsData.data.results || [];
      }

      let unreviewedFeedback = [];
      if (user?.role === 'HR_ADMIN') {
        const { data: feedbackData } = await api.get('/feedback?reviewed=false');
        unreviewedFeedback = feedbackData.data.feedbacks || [];
      }

      const notifs = [
        ...activeAssessments.map(a => ({
          id: `assessment-${a._id}`,
          type: 'assessment',
          title: 'Active Assessment',
          message: a.description || 'New assessment available',
          link: `/assessments/${a._id}/take`,
          time: new Date(a.startDate).toISOString(),
          read: false,
        })),
        ...pendingResults.map(r => ({
          id: `result-${r._id}`,
          type: 'result',
          title: 'Pending Review',
          message: `Result for ${r.userId?.name} requires manual scoring`,
          link: '/results',
          time: r.createdAt,
          read: false,
        })),
        ...unreviewedFeedback.map(f => ({
          id: `feedback-${f._id}`,
          type: 'feedback',
          title: 'New Feedback',
          message: `Feedback from ${f.userId?.name}`,
          link: '/feedback',
          time: f.createdAt,
          read: false,
        })),
      ].sort((a, b) => new Date(b.time) - new Date(a.time));

      setNotifications(notifs.slice(0, 8));
      setUnreadCount(notifs.filter(n => !n.read).length);
    } catch (_) {
      // Silent error
    }
  };

  // Search functionality
  const handleSearch = async (query) => {
    setSearchQuery(query);

    if (query.length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    try {
      const results = [];

      if (user?.role === 'HR_ADMIN') {
        const { data: usersData } = await api.get('/users');
        const users = usersData.data.users || [];
        const matchedUsers = users.filter(u =>
          u.name.toLowerCase().includes(query.toLowerCase()) ||
          u.email.toLowerCase().includes(query.toLowerCase()) ||
          (u.employeeId || '').toLowerCase().includes(query.toLowerCase())
        ).slice(0, 2);

        results.push(...matchedUsers.map(u => ({
          id: u._id,
          type: 'user',
          title: u.name,
          subtitle: u.email,
          link: `/users/${u._id}`,
          icon: User,
        })));
      }

      const { data: assessData } = await api.get('/assessments');
      const assessments = assessData.data.assessments || [];
      const matchedAssessments = assessments.filter(a =>
        (a.description || '').toLowerCase().includes(query.toLowerCase()) ||
        (a.competencyId?.name || '').toLowerCase().includes(query.toLowerCase())
      ).slice(0, 2);

      results.push(...matchedAssessments.map(a => ({
        id: a._id,
        type: 'assessment',
        title: a.description || 'Assessment',
        subtitle: a.competencyId?.name,
        link: `/assessments/${a._id}`,
        icon: Bell,
      })));

      if (user?.role === 'HR_ADMIN') {
        const { data: compData } = await api.get('/competencies');
        const competencies = compData.data.competencies || [];
        const matchedComp = competencies.filter(c =>
          c.name.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 2);

        results.push(...matchedComp.map(c => ({
          id: c._id,
          type: 'competency',
          title: c.name,
          subtitle: c.category,
          link: '/competencies',
          icon: Bell,
        })));
      }

      setSearchResults(results);
      setShowSearchResults(results.length > 0);
    } catch (_) {
      setSearchResults([]);
    }
  };

  const handleNotificationClick = (notif) => {
    nav(notif.link);
    setShowNotifications(false);
  };

  const markAllAsRead = () => {
    setNotifications(notifs => notifs.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const handleLogout = async () => {
    await logout();
    nav('/login');
  };

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center px-4 sm:px-5 lg:px-7 gap-3 sm:gap-4 sticky top-0 z-40">
      {/* Mobile sidebar toggle */}
      <button
        onClick={onMobileToggle}
        className="lg:hidden p-2 hover:bg-gray-100 rounded-lg transition-base active:scale-95"
        aria-label="Toggle menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Search bar - Conditional rendering */}
      <div className={`${isMobile ? 'hidden' : 'flex-1 max-w-lg'} relative`} ref={searchRef}>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => searchResults.length > 0 && setShowSearchResults(true)}
            placeholder="Search users, assessments, competencies..."
            className="w-full h-10 pl-10 pr-10 rounded-lg border border-gray-200 focus-brand text-sm bg-gray-50/50"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
                setShowSearchResults(false);
              }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-base"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Search Results Dropdown */}
        {showSearchResults && (
          <div className="absolute top-full mt-2 w-full bg-white rounded-xl shadow-2xl border border-gray-200 py-2 max-h-80 overflow-y-auto custom-scrollbar z-50">
            <div className="px-4 py-2 border-b border-gray-100">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Search Results
              </span>
            </div>
            {searchResults.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <Search className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm text-gray-500">No results found</p>
              </div>
            ) : (
              searchResults.map((result) => {
                const Icon = result.icon;
                return (
                  <button
                    key={result.id}
                    onClick={() => {
                      nav(result.link);
                      setShowSearchResults(false);
                      setSearchQuery('');
                    }}
                    className="w-full px-4 py-3 hover:bg-gray-50 transition-base text-left flex items-center gap-3 group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 group-hover:bg-gray-200 transition-base">
                      <Icon className="w-4 h-4 text-gray-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-brand-black truncate">
                        {result.title}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {result.subtitle}
                      </div>
                    </div>
                    <div className="text-xs font-medium px-2 py-1 rounded bg-gray-100 text-gray-600 capitalize">
                      {result.type}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Notifications bell */}
      <div className="relative" ref={notifRef}>
        <button
          onClick={() => setShowNotifications(!showNotifications)}
          className="relative p-2 hover:bg-gray-100 rounded-lg transition-base active:scale-95 group"
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5 text-gray-500 group-hover:text-brand-red transition-base" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-brand-red text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Notifications Dropdown */}
        {showNotifications && (
          <div className="absolute top-full right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-50">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <span className="font-semibold text-sm text-brand-black">Notifications</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{unreadCount} unread</span>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-xs text-brand-red hover:text-brand-red-dark font-medium"
                  >
                    Mark all read
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-80 sm:max-h-96 overflow-y-auto custom-scrollbar">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Bell className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm text-gray-500">No notifications</p>
                </div>
              ) : (
                notifications.map((notif) => (
                  <button
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className="w-full px-4 py-3 hover:bg-gray-50 transition-base text-left border-b border-gray-100 last:border-0 group"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-2 ${notif.read ? 'bg-gray-300' : 'bg-brand-red'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="font-semibold text-sm text-brand-black truncate">
                            {notif.title}
                          </div>
                          <span className="text-[10px] text-gray-400 flex-shrink-0">
                            {new Date(notif.time).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric'
                            })}
                          </span>
                        </div>
                        <div className="text-xs text-gray-600 line-clamp-2 mb-1">
                          {notif.message}
                        </div>
                        <div className="text-[10px] text-gray-400">
                          {new Date(notif.time).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Profile Menu */}
      <div className="relative" ref={profileRef}>
        <button
          onClick={() => setShowProfileMenu(!showProfileMenu)}
          className="flex items-center gap-2 p-1 hover:bg-gray-100 rounded-lg transition-base group"
          aria-label="Profile menu"
        >
          <div className="w-8 h-8 rounded-full bg-brand-red flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-sm">
            {user?.name?.[0]?.toUpperCase() || 'U'}
          </div>
          {!isMobile && (
            <div className="text-left hidden sm:block">
              <div className="flex items-center gap-1">
                <div className="text-sm font-semibold text-brand-black leading-tight truncate max-w-[120px]">
                  {user?.name}
                </div>
                <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${showProfileMenu ? 'rotate-180' : ''}`} />
              </div>
              <div className="text-[10px] text-gray-500 uppercase">
                {user?.role?.replace('_', ' ')}
              </div>
            </div>
          )}
        </button>

        {/* Profile Dropdown */}
        {showProfileMenu && (
          <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-50">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <div className="font-semibold text-sm text-brand-black truncate">
                {user?.name}
              </div>
              <div className="text-xs text-gray-500 truncate">
                {user?.email}
              </div>
              <div className="text-[10px] font-medium text-brand-red mt-1">
                {user?.role?.replace('_', ' ')}
              </div>
            </div>
            <div className="py-2">
              <button
                onClick={() => {
                  nav('/profile');
                  setShowProfileMenu(false);
                }}
                className="w-full px-4 py-2.5 hover:bg-gray-50 transition-base text-left flex items-center gap-3 text-sm"
              >
                <User className="w-4 h-4 text-gray-500" />
                <span>My Profile</span>
              </button>
              <button
                onClick={() => {
                  nav('/results');
                  setShowProfileMenu(false);
                }}
                className="w-full px-4 py-2.5 hover:bg-gray-50 transition-base text-left flex items-center gap-3 text-sm"
              >
                <Bell className="w-4 h-4 text-gray-500" />
                <span>My Results</span>
              </button>
              <button
                onClick={() => {
                  nav('/feedback');
                  setShowProfileMenu(false);
                }}
                className="w-full px-4 py-2.5 hover:bg-gray-50 transition-base text-left flex items-center gap-3 text-sm"
              >
                <Settings className="w-4 h-4 text-gray-500" />
                <span>Feedback</span>
              </button>
            </div>
            <div className="border-t border-gray-100">
              <button
                onClick={handleLogout}
                className="w-full px-4 py-3 hover:bg-red-50 transition-base text-left flex items-center gap-3 text-sm text-brand-red font-semibold group"
              >
                <LogOut className="w-4 h-4 group-hover:rotate-12 transition-base" />
                <span>Log Out</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}