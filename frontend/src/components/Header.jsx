/* components/Header.jsx */
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Menu, User, LogOut, ChevronDown, Home, Users, BookOpen, Target, FileText, MessageSquare, Clock, Zap, ChevronRight, Search, Plus, TrendingUp, Award, Lightbulb, ClipboardList, UserCheck, ClipboardCheck, BarChart3, Activity } from 'lucide-react';
import NotificationBell from './NotificationBell';
import { useSocket } from '../hooks/useSocket';

// Human-readable label + colour for each role
const ROLE_META = {
  HR_ADMIN:   { label: 'HR Admin',   color: 'text-red-500' },
  SUPERVISOR: { label: 'Supervisor', color: 'text-gray-600' },
  EMPLOYEE:   { label: 'Employee',   color: 'text-brand-black' },
};

// Breadcrumb mapping
const BREADCRUMB_MAP = {
  '/dashboard': { label: 'Dashboard', icon: Home },
  '/users': { label: 'Users', icon: Users },
  '/competencies': { label: 'Competencies', icon: Target },
  '/questions': { label: 'Question Bank', icon: BookOpen },
  '/recommendations': { label: 'Recommendations', icon: Lightbulb },
  '/assessments': { label: 'Assessments', icon: ClipboardList },
  '/results': { label: 'Results', icon: FileText },
  '/reports': { label: 'Reports', icon: BarChart3 },
  '/feedback': { label: 'Feedback', icon: MessageSquare },
  '/activity-log': { label: 'Activity Log', icon: Activity },
  '/my-team': { label: 'My Team', icon: UserCheck },
  '/my-team/evaluations': { label: 'Pending Evaluations', icon: ClipboardCheck },
  '/profile': { label: 'Profile', icon: User },
};

// Quick actions
// const QUICK_ACTIONS = [
//   { label: 'Create User', icon: Plus, path: '/users', shortcut: 'U' },
//   { label: 'Create Assessment', icon: Target, path: '/assessments', shortcut: 'A' },
//   { label: 'View Results', icon: FileText, path: '/results', shortcut: 'R' },
//   { label: 'View Reports', icon: TrendingUp, path: '/reports', shortcut: 'P' },
// ];

// Searchable items - matching actual sidebar navigation
const SEARCH_ITEMS = [
  { label: 'Dashboard', path: '/dashboard', icon: Home },
  { label: 'User Management', path: '/users', icon: Users },
  { label: 'Competencies', path: '/competencies', icon: Target },
  { label: 'Question Bank', path: '/questions', icon: BookOpen },
  { label: 'Recommendations', path: '/recommendations', icon: Lightbulb },
  { label: 'Assessments', path: '/assessments', icon: ClipboardList },
  { label: 'Results', path: '/results', icon: FileText },
  { label: 'Reports', path: '/reports', icon: BarChart3 },
  { label: 'Feedback', path: '/feedback', icon: MessageSquare },
  { label: 'Activity Log', path: '/activity-log', icon: Activity },
  { label: 'My Profile', path: '/profile', icon: User },
];

export default function Header({ onMobileToggle }) {
  const { user, activeRole, logout, getAccessToken } = useAuth();
  const { socket } = useSocket(getAccessToken ? getAccessToken() : null);
  const nav = useNavigate();
  const location = useLocation();

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [showSpotlight, setShowSpotlight] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const profileRef = useRef(null);
  const quickActionsRef = useRef(null);
  const searchInputRef = useRef(null);

  // Build breadcrumbs from current path
  const getBreadcrumbs = () => {
    const paths = location.pathname.split('/').filter(Boolean);
    const crumbs = [{ label: 'Home', path: '/', icon: Home }];
    let currentPath = '';
    paths.forEach((segment, index) => {
      currentPath += `/${segment}`;
      const mapped = BREADCRUMB_MAP[currentPath];
      if (mapped) {
        crumbs.push({ ...mapped, path: currentPath });
      } else if (index === paths.length - 1) {
        crumbs.push({
          label: segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' '),
          path: currentPath,
          icon: FileText
        });
      }
    });
    return crumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  // // Filtered search results
  // const filteredSearch = searchQuery.trim()
  //   ? SEARCH_ITEMS.filter(item => item.label.toLowerCase().includes(searchQuery.toLowerCase()))
  //   : SEARCH_ITEMS;

  // Keyboard shortcuts
  // useEffect(() => {
  //   const handleKeyDown = (e) => {
  //     if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
  //       e.preventDefault();
  //       setShowSpotlight(true);
  //     }
  //     if (e.key === 'Escape') {
  //       setShowSpotlight(false);
  //       setShowQuickActions(false);
  //     }
  //     if (e.altKey && !e.ctrlKey && !e.metaKey) {
  //       const action = QUICK_ACTIONS.find(a => a.shortcut.toLowerCase() === e.key.toLowerCase());
  //       if (action) {
  //         e.preventDefault();
  //         nav(action.path);
  //       }
  //     }
  //   };
  //   window.addEventListener('keydown', handleKeyDown);
  //   return () => window.removeEventListener('keydown', handleKeyDown);
  // }, [nav]);

  useEffect(() => {
    if (showSpotlight && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSpotlight]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfileMenu(false);
      }
      if (quickActionsRef.current && !quickActionsRef.current.contains(e.target)) {
        setShowQuickActions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    nav('/login');
  };

  const roleMeta = ROLE_META[activeRole] ?? { label: activeRole, color: 'text-gray-500' };
  const isMultiRole = (user?.roles?.length ?? 0) > 1;

  const handleSearchSelect = (path) => {
    nav(path);
    setShowSpotlight(false);
    setSearchQuery('');
  };

  return (
    <>
      <header className="h-14 bg-white border-b border-gray-200 flex items-center px-3 sm:px-4 lg:px-5 gap-2 sm:gap-3 sticky top-0 z-40">
        <button onClick={onMobileToggle} className="lg:hidden p-2 hover:bg-gray-100 rounded-lg transition-base active:scale-95" aria-label="Toggle menu">
          <Menu className="w-5 h-5" />
        </button>

        <nav className="hidden md:flex items-center gap-1 text-sm overflow-hidden">
          {breadcrumbs.map((crumb, index) => {
            const Icon = crumb.icon;
            const isLast = index === breadcrumbs.length - 1;
            return (
              <div key={crumb.path} className="flex items-center">
                {index > 0 && <ChevronRight className="w-4 h-4 text-gray-400 mx-1 flex-shrink-0" />}
                <button onClick={() => nav(crumb.path)} className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors ${isLast ? 'font-semibold text-brand-black bg-white' : 'text-gray-400 hover:text-brand-red hover:bg-gray-50'}`}>
                  {/* <Icon className="w-4 h-4 flex-shrink-0" /> */}
                  <span className="truncate max-w-[120px]">{crumb.label}</span>
                </button>
              </div>
            );
          })}
        </nav>

        <div className="flex-1" />

        {/* <div className="relative" ref={quickActionsRef}>
          <button onClick={() => setShowQuickActions(!showQuickActions)} className="hidden sm:flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm font-medium">
            <Zap className="w-4 h-4 text-brand-red" />
            Quick Actions
          </button>
          {showQuickActions && (
            <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <div className="font-semibold text-sm text-brand-black">Quick Actions</div>
                <div className="text-xs text-gray-500">Alt + shortcut key</div>
              </div>
              <div className="py-2">
                {QUICK_ACTIONS.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button key={action.label} onClick={() => { nav(action.path); setShowQuickActions(false); }} className="w-full px-4 py-2.5 hover:bg-gray-50 transition-colors text-left flex items-center gap-3">
                      <Icon className="w-4 h-4 text-gray-500" />
                      <span className="text-sm flex-1">{action.label}</span>
                      <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">Alt {action.shortcut}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div> */}

        {/* <button onClick={() => setShowSpotlight(true)} className="hidden sm:flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm">
          <Search className="w-4 h-4 text-gray-500" />
          <span className="text-gray-500">Search...</span>
          <span className="text-xs font-mono bg-white px-1.5 py-0.5 rounded text-gray-400 border border-gray-200">⌘K</span>
        </button> */}

        <NotificationBell socket={socket} />

        <div className="relative" ref={profileRef}>
          <button onClick={() => setShowProfileMenu(!showProfileMenu)} className="flex items-center gap-2 p-1 hover:bg-gray-100 rounded-lg transition-base group" aria-label="Profile menu">
            <div className="w-8 h-8 rounded-full bg-brand-red flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-sm">
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </div>
            {!isMobile && (
              <div className="text-left hidden sm:block">
                <div className="flex items-center gap-1">
                  <div className="text-sm font-semibold text-brand-black leading-tight truncate max-w-[120px]">{user?.name}</div>
                  <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${showProfileMenu ? 'rotate-180' : ''}`} />
                </div>
                <div className={`text-[10px] font-semibold uppercase flex items-center gap-1 ${roleMeta.color}`}>
                  {roleMeta.label}{isMultiRole && <span className="text-gray-400 font-normal">+{user.roles.length - 1}</span>}
                </div>
              </div>
            )}
          </button>

          {showProfileMenu && (
            <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <div className="font-semibold text-sm text-brand-black truncate">{user?.name}</div>
                <div className="text-xs text-gray-500 truncate">{user?.email}</div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {user?.roles?.map((r) => (
                    <span key={r} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${r === activeRole ? 'bg-brand-red/10 text-brand-red border-brand-red/20' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                      {ROLE_META[r]?.label ?? r}{r === activeRole && ' ✓'}
                    </span>
                  ))}
                </div>
              </div>
              <div className="py-2">
                <button onClick={() => { nav('/profile'); setShowProfileMenu(false); }} className="w-full px-4 py-2.5 hover:bg-gray-50 transition-base text-left flex items-center gap-3 text-sm">
                  <User className="w-4 h-4 text-gray-500" />
                  <span>My Profile</span>
                </button>
              </div>
              <div className="border-t border-gray-100">
                <button onClick={handleLogout} className="w-full px-4 py-3 hover:bg-red-50 transition-base text-left flex items-center gap-3 text-sm text-brand-red font-semibold group">
                  <LogOut className="w-4 h-4 group-hover:rotate-12 transition-base" />
                  <span>Log Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* {showSpotlight && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-[15vh]" onClick={() => setShowSpotlight(false)}>
          <div className="w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-200">
              <Search className="w-5 h-5 text-gray-400" />
              <input ref={searchInputRef} type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search pages, features..." className="flex-1 text-lg outline-none placeholder:text-gray-400" />
              <button onClick={() => setShowSpotlight(false)} className="px-2 py-1 text-xs font-mono bg-gray-100 rounded text-gray-500">ESC</button>
            </div>
            <div className="max-h-[50vh] overflow-y-auto">
              {filteredSearch.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-400">No results found for "{searchQuery}"</div>
              ) : (
                <div className="py-2">
                  {filteredSearch.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button key={item.path} onClick={() => handleSearchSelect(item.path)} className="w-full px-4 py-3 hover:bg-gray-50 transition-colors flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center"><Icon className="w-4 h-4 text-gray-600" /></div>
                        <div className="text-left flex-1">
                          <div className="font-medium text-brand-black">{item.label}</div>
                          <div className="text-xs text-gray-400">{item.path}</div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-400 flex items-center justify-between">
              <span>{filteredSearch.length} results</span>
              <span>↑↓ Navigate · Enter Select</span>
            </div>
          </div>
        </div>
      )} */}
    </>
  );
}