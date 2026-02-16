import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, Users, BookOpen, ClipboardList, FileText,
  BarChart3, MessageSquare, ChevronLeft, LogOut, Target, Lightbulb, Activity,
  UserCheck, ClipboardCheck, Award, TrendingUp, X
} from 'lucide-react';
import logo from "../image/z.jpg"
const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard', roles: null },

  // Admin Only
  { icon: Users, label: 'Users', path: '/users', roles: ['HR_ADMIN'] },
  { icon: Target, label: 'Competencies', path: '/competencies', roles: ['HR_ADMIN'] },
  { icon: Lightbulb, label: 'Recommendations', path: '/recommendations', roles: ['HR_ADMIN'] },
  { icon: Target, label: 'Assessments', path: '/assessments', roles: ['HR_ADMIN'] },
  { icon: BookOpen, label: 'Question Bank', path: '/questions', roles: ['HR_ADMIN'] },
  { icon: Activity, label: 'Activity Log', path: '/activity-log', roles: ['HR_ADMIN'] },

  // Supervisor Only
  { icon: UserCheck, label: 'My Team', path: '/my-team', roles: ['SUPERVISOR'] },
  { icon: ClipboardCheck, label: 'Pending Evaluations', path: '/my-team/evaluations', roles: ['SUPERVISOR'] },

  // All Roles
  { icon: ClipboardList, label: 'Assessments', path: '/assessments', roles: ['EMPLOYEE'] },
  { icon: FileText, label: 'My Results', path: '/results', roles: ['EMPLOYEE'] },
  { icon: FileText, label: 'Results', path: '/results', roles: ['HR_ADMIN'] },
  { icon: BarChart3, label: 'Reports', path: '/reports', roles: [ 'HR_ADMIN'] },
  { icon: MessageSquare, label: 'Feedback', path: '/feedback', roles: ['EMPLOYEE', 'HR_ADMIN'] },
];

export default function Sidebar({
  collapsed,
  onToggle,
  mobileOpen = false,
  onNavClick,
  onMobileClose
}) {
  const loc = useLocation();
  const nav = useNavigate();
  const auth = useAuth();
  const [hovering, setHovering] = useState(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const visible = NAV_ITEMS.filter((n) => !n.roles || n.roles.includes(auth.user?.role));
  const isActive = (path) => loc.pathname === path || loc.pathname.startsWith(path + '/');

  const handleNavClick = (path) => {
    nav(path);
    if (onNavClick) {
      onNavClick();
    }
  };

  const handleCloseMobile = () => {
    if (isMobile && onMobileClose) {
      onMobileClose();
    }
  };

  // Close sidebar on escape key press (mobile only)
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isMobile && mobileOpen) {
        handleCloseMobile();
      }
    };

    if (isMobile && mobileOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => document.removeEventListener('keydown', handleEscape);
  }, [isMobile, mobileOpen, onToggle]);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (isMobile && mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMobile, mobileOpen]);

  const sidebarWidth = isMobile ? 'w-64' : (collapsed ? 'w-20' : 'w-64');
  const sidebarPosition = isMobile
    ? (mobileOpen ? 'translate-x-0' : '-translate-x-full')
    : 'translate-x-0';

  return (
    <>
      {/* Mobile Overlay */}
      {isMobile && mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm transition-base"
          onClick={handleCloseMobile}
          style={{ animation: 'fadeIn 0.2s ease' }}
        />
      )}

      <aside
        className={`fixed top-0 left-0 bottom-0 bg-black text-white flex flex-col transition-base z-50 ${sidebarWidth} ${sidebarPosition} shadow-xl`}
        style={{ animation: 'slideIn 0.3s ease' }}
      >
        {/* Logo and Mobile Close Button */}
        <div className={`border-b border-white/10  min-h-[70px] sm:min-h-[80px] flex items-center ${collapsed && !isMobile ? 'justify-center p-4' : 'px-5 p-6'}`}>
          <img
            src={logo}
            alt="Zemen Bank Logo"
            className="h-14 w-auto object-contain"
          />

          {(!collapsed || isMobile) && (
            <div className="ml-4 flex-1 flex items-center justify-between">
              <div>
                <div className="font-display text-lg font-bold tracking-tight">Zemen Bank</div>
                <div className="text-xs text-white/50 uppercase tracking-widest mt-0.5">CAS Platform</div>
              </div>

              {/* Mobile Close Button */}
              {isMobile && (
                <button
                  onClick={handleCloseMobile}
                  className="lg:hidden p-2 hover:bg-white/10 rounded-lg transition-base active:scale-95"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-4 overflow-y-auto custom-scrollbar">
          {visible.map((item) => {
            const active = isActive(item.path);
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                onClick={() => handleNavClick(item.path)}
                onMouseEnter={() => setHovering(item.label)}
                onMouseLeave={() => setHovering(null)}
                className={`w-full flex items-center gap-3 py-3.5 px-5 border-l-3 transition-base relative group ${active
                  ? 'bg-brand-red/20 border-brand-red text-white font-semibold'
                  : 'border-transparent text-white/70 hover:bg-white/10 hover:text-white font-medium'
                  } ${collapsed && !isMobile ? 'justify-center' : ''}`}
              >
                <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
                {(!collapsed || isMobile) && (
                  <span className="text-sm font-medium">{item.label}</span>
                )}

                {/* Tooltip when collapsed on desktop */}
                {collapsed && !isMobile && hovering === item.label && (
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 bg-gray-800 text-white px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap shadow-2xl z-50 pointer-events-none transition-base">
                    {item.label}
                    <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-gray-800 transform rotate-45" />
                  </div>
                )}

                {/* Active indicator dot for mobile collapsed */}
                {collapsed && !isMobile && active && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 w-2 h-2 bg-brand-red rounded-full" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom: Logout + Desktop Toggle */}
        <div className="border-t border-white/10 pt-3 pb-4">

          {/* Logout */}
          <button
            onClick={() => {
              auth.logout();
              if (isMobile) {
                handleCloseMobile();
              }
            }}
            className={`w-full flex items-center gap-3 py-3 px-5 text-white/60 hover:text-white transition-base group ${collapsed && !isMobile ? 'justify-center' : ''
              }`}
          >
            <LogOut className="w-5 h-5 group-hover:rotate-12 transition-base" />
            {(!collapsed || isMobile) && <span className="text-sm font-medium">Log Out</span>}
          </button>

          {/* Desktop Collapse Toggle - Hidden on mobile */}
          {!isMobile && (
            <button
              onClick={onToggle}
              className="w-full flex items-center justify-center py-3 text-white/40 hover:text-white/80 transition-base group"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <ChevronLeft className={`w-5 h-5 transition-base transform group-hover:scale-110 ${collapsed ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </aside>
    </>
  );
}