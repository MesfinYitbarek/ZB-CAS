/* components/Header.jsx */
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Menu, User, LogOut, ChevronDown } from 'lucide-react';

// Human-readable label + colour for each role
const ROLE_META = {
  HR_ADMIN:   { label: 'HR Admin',   color: 'text-red-500' },
  SUPERVISOR: { label: 'Supervisor', color: 'text-blue-500' },
  EMPLOYEE:   { label: 'Employee',   color: 'text-green-500' },
};

export default function Header({ onMobileToggle }) {
  const { user, activeRole, logout } = useAuth();
  const nav = useNavigate();

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const profileRef = useRef(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfileMenu(false);
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

  const roleMeta = ROLE_META[activeRole] ?? {
    label: activeRole,
    color: 'text-gray-500',
  };

  const isMultiRole = (user?.roles?.length ?? 0) > 1;

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

      {/* Spacer */}
      <div className="flex-1" />

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
                <ChevronDown
                  className={`w-3 h-3 text-gray-400 transition-transform ${
                    showProfileMenu ? 'rotate-180' : ''
                  }`}
                />
              </div>

              {/* Active role badge */}
              <div className={`text-[10px] font-semibold uppercase flex items-center gap-1 ${roleMeta.color}`}>
                {roleMeta.label}
                {isMultiRole && (
                  <span className="text-gray-400 font-normal">
                    +{user.roles.length - 1}
                  </span>
                )}
              </div>
            </div>
          )}
        </button>

        {showProfileMenu && (
          <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-50">

            {/* User info */}
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <div className="font-semibold text-sm text-brand-black truncate">
                {user?.name}
              </div>
              <div className="text-xs text-gray-500 truncate">
                {user?.email}
              </div>

              {/* Roles */}
              <div className="flex flex-wrap gap-1 mt-1.5">
                {user?.roles?.map((r) => (
                  <span
                    key={r}
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                      r === activeRole
                        ? 'bg-brand-red/10 text-brand-red border-brand-red/20'
                        : 'bg-gray-100 text-gray-500 border-gray-200'
                    }`}
                  >
                    {ROLE_META[r]?.label ?? r}
                    {r === activeRole && ' ✓'}
                  </span>
                ))}
              </div>
            </div>

            {/* Profile link */}
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
            </div>

            {/* Logout */}
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