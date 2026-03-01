/* components/Sidebar.jsx */
import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, Users, BookOpen, ClipboardList, FileText,
  BarChart3, MessageSquare, ChevronLeft, LogOut, Target,
  Lightbulb, Activity, UserCheck, ClipboardCheck, X,
  RefreshCw, ChevronDown,
} from 'lucide-react';
import logo from '../image/z.jpg';

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard', roles: null },

  // ── HR Admin ─────────────────────────────────────────
  { icon: Users, label: 'Users', path: '/users', roles: ['HR_ADMIN'] },
  { icon: Target, label: 'Competencies', path: '/competencies', roles: ['HR_ADMIN'] },
  { icon: BookOpen, label: 'Question Bank', path: '/questions', roles: ['HR_ADMIN'] },
  { icon: Lightbulb, label: 'Recommendations', path: '/recommendations', roles: ['HR_ADMIN'] },
  { icon: Target, label: 'Assessments', path: '/assessments', roles: ['HR_ADMIN'] },

  

  // ── Supervisor ───────────────────────────────────────
  { icon: UserCheck, label: 'My Team', path: '/my-team', roles: ['SUPERVISOR'] },
  { icon: ClipboardCheck, label: 'Pending Evaluations', path: '/evaluations', roles: ['SUPERVISOR'] },

  // ── Employee ─────────────────────────────────────────
  { icon: ClipboardList, label: 'Assessments', path: '/assessments', roles: ['EMPLOYEE'] },
  { icon: FileText, label: 'My Results', path: '/results', roles: ['EMPLOYEE'] },

  // ── Shared ───────────────────────────────────────────
  { icon: FileText, label: 'Results', path: '/results', roles: ['HR_ADMIN'] },
  { icon: BarChart3, label: 'Reports', path: '/reports', roles: ['HR_ADMIN'] },
  { icon: MessageSquare, label: 'Feedback', path: '/feedback', roles: ['EMPLOYEE', 'HR_ADMIN'] },

  // ✅ Activity Log moved to VERY BOTTOM
  { icon: Activity,   label: 'Activity Log',   path: '/activity-log',   roles: ['HR_ADMIN'] },
];

// Human-readable role labels
const ROLE_LABELS = {
  HR_ADMIN: 'HR Admin',
  SUPERVISOR: 'Supervisor',
  EMPLOYEE: 'Employee',
};

// Tailwind colour classes per role for the badge
const ROLE_COLORS = {
  HR_ADMIN: 'bg-red-600/20 text-red-400 border-red-600/30',
  SUPERVISOR: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
  EMPLOYEE: 'bg-green-600/20 text-green-400 border-green-600/30',
};

export default function Sidebar({
  collapsed,
  onToggle,
  mobileOpen = false,
  onNavClick,
  onMobileClose,
}) {
  const loc = useLocation();
  const nav = useNavigate();
  const auth = useAuth();

  const [hovering, setHovering] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const [switchingRole, setSwitchingRole] = useState(false);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Filter nav items to those matching the current activeRole
  const visible = NAV_ITEMS.filter(
    (n) => !n.roles || n.roles.includes(auth.activeRole)
  );

  const isActive = (path) =>
    loc.pathname === path || loc.pathname.startsWith(path + '/');

  const handleNavClick = (path) => {
    nav(path);
    onNavClick?.();
  };

  const handleCloseMobile = () => {
    if (isMobile) onMobileClose?.();
  };

  // Keyboard close on mobile
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && isMobile && mobileOpen) handleCloseMobile();
    };
    if (isMobile && mobileOpen) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isMobile, mobileOpen]);

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = isMobile && mobileOpen ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isMobile, mobileOpen]);

  // Switch role handler
  const handleRoleSwitch = async (role) => {
    if (role === auth.activeRole) { setRoleMenuOpen(false); return; }
    setSwitchingRole(true);
    setRoleMenuOpen(false);
    try {
      await auth.switchRole(role);
      nav('/dashboard', { replace: true });
    } catch {
      // handle error silently – toast can be added here
    } finally {
      setSwitchingRole(false);
    }
  };

  const sidebarWidth = isMobile ? 'w-64' : (collapsed ? 'w-20' : 'w-64');
  const sidebarPosition = isMobile
    ? (mobileOpen ? 'translate-x-0' : '-translate-x-full')
    : 'translate-x-0';

  const isMultiRole = auth.isMultiRole;

  return (
    <>
      {/* Mobile overlay */}
      {isMobile && mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
          onClick={handleCloseMobile}
        />
      )}

      <aside
        className={`fixed top-0 left-0 bottom-0 bg-black text-white flex flex-col transition-base z-50 ${sidebarWidth} ${sidebarPosition} shadow-xl`}
      >
        {/* ── Logo ── */}
        <div
          className={`border-b border-white/10 min-h-[70px] sm:min-h-[80px] flex items-center ${collapsed && !isMobile ? 'justify-center p-4' : 'px-5 p-6'
            }`}
        >
          <img src={logo} alt="Zemen Bank Logo" className="h-14 w-auto object-contain" />

          {(!collapsed || isMobile) && (
            <div className="ml-4 flex-1 flex items-center justify-between">
              <div>
                <div className="font-display text-lg font-bold tracking-tight">Zemen Bank</div>
                <div className="text-xs text-white/50 uppercase tracking-widest mt-0.5">CAS Platform</div>
              </div>

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

        {/* ── Nav Items ── */}
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

                {/* Tooltip when collapsed (desktop) */}
                {collapsed && !isMobile && hovering === item.label && (
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 bg-gray-800 text-white px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap shadow-2xl z-50 pointer-events-none">
                    {item.label}
                    <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-gray-800 rotate-45" />
                  </div>
                )}

                {collapsed && !isMobile && active && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 w-2 h-2 bg-brand-red rounded-full" />
                )}
              </button>
            );
          })}
        </nav>

        {/* ── Bottom Section ── */}
        <div className="border-t border-white/10 pt-2 pb-4">

          {/* ── Switch Role (only for multi-role users) ─────────────────── */}
          {isMultiRole && (
            <div className="relative px-3 mb-1">
              {(!collapsed || isMobile) ? (
                /* Expanded state: full role switcher */
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-white/30 px-2 mb-1.5">
                    Active Role
                  </p>

                  <button
                    onClick={() => setRoleMenuOpen((p) => !p)}
                    disabled={switchingRole}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-white/10 hover:border-white/25 hover:bg-white/5 transition-base"
                  >
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${auth.activeRole === 'HR_ADMIN' ? 'bg-red-400' :
                          auth.activeRole === 'SUPERVISOR' ? 'bg-blue-400' : 'bg-green-400'
                        }`}
                    />
                    <span className="flex-1 text-left text-sm font-semibold text-white">
                      {switchingRole ? 'Switching…' : (ROLE_LABELS[auth.activeRole] ?? auth.activeRole)}
                    </span>
                    {switchingRole
                      ? <RefreshCw className="w-3.5 h-3.5 text-white/40 animate-spin" />
                      : <ChevronDown className={`w-3.5 h-3.5 text-white/40 transition-transform ${roleMenuOpen ? 'rotate-180' : ''}`} />
                    }
                  </button>

                  {/* Role dropdown */}
                  {roleMenuOpen && (
                    <div className="absolute bottom-full left-3 right-3 mb-1 bg-gray-900 border border-white/10 rounded-lg overflow-hidden shadow-2xl z-50">
                      {auth.user?.roles?.map((role) => (
                        <button
                          key={role}
                          onClick={() => handleRoleSwitch(role)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-base ${role === auth.activeRole
                              ? 'bg-white/10 text-white font-semibold'
                              : 'text-white/70 hover:bg-white/5 hover:text-white'
                            }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${role === 'HR_ADMIN' ? 'bg-red-400' :
                                role === 'SUPERVISOR' ? 'bg-blue-400' : 'bg-green-400'
                              }`}
                          />
                          <span className="flex-1 text-left">{ROLE_LABELS[role] ?? role}</span>
                          {role === auth.activeRole && (
                            <span className="text-[10px] font-semibold text-white/50 uppercase">Active</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* Collapsed state: icon-only role switcher with tooltip */
                <div
                  className="relative"
                  onMouseEnter={() => setHovering('__role__')}
                  onMouseLeave={() => setHovering(null)}
                >
                  <button
                    onClick={() => setRoleMenuOpen((p) => !p)}
                    disabled={switchingRole}
                    className="w-full flex justify-center py-2.5 hover:bg-white/10 rounded-lg transition-base"
                    aria-label="Switch role"
                  >
                    <RefreshCw
                      className={`w-4 h-4 text-white/50 ${switchingRole ? 'animate-spin' : ''}`}
                    />
                  </button>

                  {/* Collapsed: fly-out role picker */}
                  {roleMenuOpen && (
                    <div className="absolute left-full bottom-0 ml-3 bg-gray-900 border border-white/10 rounded-lg overflow-hidden shadow-2xl z-50 min-w-[160px]">
                      <p className="text-[10px] uppercase tracking-widest text-white/30 px-3 pt-2 pb-1">
                        Switch Role
                      </p>
                      {auth.user?.roles?.map((role) => (
                        <button
                          key={role}
                          onClick={() => handleRoleSwitch(role)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-base ${role === auth.activeRole
                              ? 'bg-white/10 text-white font-semibold'
                              : 'text-white/70 hover:bg-white/5 hover:text-white'
                            }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${role === 'HR_ADMIN' ? 'bg-red-400' :
                                role === 'SUPERVISOR' ? 'bg-blue-400' : 'bg-green-400'
                              }`}
                          />
                          {ROLE_LABELS[role] ?? role}
                        </button>
                      ))}
                    </div>
                  )}

                  {hovering === '__role__' && !roleMenuOpen && (
                    <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 bg-gray-800 text-white px-3 py-2 rounded-lg text-sm whitespace-nowrap shadow-2xl z-50 pointer-events-none">
                      Switch Role
                      <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-gray-800 rotate-45" />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Logout ────────────────────────────────────────────────────── */}
          <button
            onClick={() => {
              auth.logout();
              if (isMobile) handleCloseMobile();
            }}
            className={`w-full flex items-center gap-3 py-3 px-5 text-white/60 hover:text-white transition-base group ${collapsed && !isMobile ? 'justify-center' : ''
              }`}
          >
            <LogOut className="w-5 h-5 group-hover:rotate-12 transition-base" />
            {(!collapsed || isMobile) && <span className="text-sm font-medium">Log Out</span>}
          </button>

          {/* ── Desktop collapse toggle ────────────────────────────────────── */}
          {!isMobile && (
            <button
              onClick={onToggle}
              className="w-full flex items-center justify-center py-3 text-white/40 hover:text-white/80 transition-base group"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <ChevronLeft
                className={`w-5 h-5 transition-base group-hover:scale-110 ${collapsed ? 'rotate-180' : ''}`}
              />
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
