import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Menu, Search, X, User, LogOut, ChevronDown } from 'lucide-react';
import api from '../utils/api';

export default function Header({ onMobileToggle }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

  const searchRef = useRef(null);
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
        icon: User,
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
          icon: User,
        })));
      }

      setSearchResults(results);
      setShowSearchResults(results.length > 0);
    } catch (_) {
      setSearchResults([]);
    }
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

      {/* Notifications bell - REMOVED COMPLETELY */}

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

        {/* Profile Dropdown - Simplified */}
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