import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, Users, BookOpen, ClipboardList, FileText,
  BarChart3, MessageSquare, ChevronLeft, LogOut, Target, Lightbulb, Activity
} from 'lucide-react';

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard', roles: null },
  { icon: Users, label: 'Users', path: '/users', roles: ['HR_ADMIN'] },
  { icon: Target, label: 'Competencies', path: '/competencies', roles: ['HR_ADMIN'] },
  { icon: Lightbulb, label: 'Recommendations', path: '/recommendations', roles: ['HR_ADMIN'] },
  { icon: BookOpen, label: 'Question Bank', path: '/questions', roles: ['HR_ADMIN'] },
  { icon: ClipboardList, label: 'Assessments', path: '/assessments', roles: null },
  { icon: FileText, label: 'My Results', path: '/results', roles: ['EMPLOYEE', 'SUPERVISOR'] },
  { icon: FileText, label: 'Results', path: '/results', roles: ['HR_ADMIN'] },
  { icon: BarChart3, label: 'Reports', path: '/reports', roles: null },
  { icon: MessageSquare, label: 'Feedback', path: '/feedback', roles: null },
  { icon: Activity, label: 'Activity Log', path: '/activity-log', roles: ['HR_ADMIN'] },
];

export default function Sidebar({ collapsed, onToggle }) {
  const loc = useLocation();
  const nav = useNavigate();
  const auth = useAuth();
  const [hovering, setHovering] = useState(null);

  const visible = NAV_ITEMS.filter((n) => !n.roles || n.roles.includes(auth.user?.role));
  const isActive = (path) => loc.pathname === path || loc.pathname.startsWith(path + '/');

  return (
    <aside
      className={`fixed top-0 left-0 bottom-0 bg-gradient-to-b from-brand-black to-gray-900 text-white flex flex-col transition-all duration-200 z-50 ${collapsed ? 'w-20' : 'w-64'
        }`}
    >
      {/* Logo */}
      <div className={`border-b border-white/10 min-h-[80px] flex items-center ${collapsed ? 'justify-center py-5' : 'px-5 py-6'}`}>
        <div className="w-11 h-11 rounded-xl bg-brand-red flex items-center justify-center shadow-lg shadow-brand-red/40 flex-shrink-0">
          <span className="text-white font-display font-bold text-lg">ZB</span>
        </div>
        {!collapsed && (
          <div className="ml-3">
            <div className="font-display text-base font-bold tracking-tight">Zemen Bank</div>
            <div className="text-[11px] text-white/45 uppercase tracking-widest">CAS Platform</div>
          </div>
        )}
      </div>

      {/* Nav Items */}
      <nav className="flex-1 py-3 overflow-y-auto custom-scrollbar">
        {visible.map((item) => {
          const active = isActive(item.path);
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              onClick={() => nav(item.path)}
              onMouseEnter={() => setHovering(item.label)}
              onMouseLeave={() => setHovering(null)}
              className={`w-full flex items-center gap-3 py-3 px-5 border-l-3 transition-all relative ${active
                  ? 'bg-brand-red/20 border-brand-red text-white font-semibold'
                  : 'border-transparent text-white/60 hover:bg-white/5 hover:text-white font-medium'
                } ${collapsed ? 'justify-center' : ''}`}
            >
              <Icon className="w-[18px] h-[18px]" strokeWidth={active ? 2.5 : 2} />
              {!collapsed && <span className="text-sm">{item.label}</span>}

              {/* Tooltip when collapsed */}
              {collapsed && hovering === item.label && (
                <div className="absolute left-20 top-1/2 -translate-y-1/2 bg-gray-800 text-white px-3 py-1.5 rounded-lg text-sm whitespace-nowrap shadow-lg z-10 pointer-events-none">
                  {item.label}
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom: Logout + Toggle */}
      <div className="border-t border-white/10 py-3">
        {/* Logout */}
        <button
          onClick={auth.logout}
          className={`w-full flex items-center gap-3 py-2.5 px-5 text-white/50 hover:text-white text-sm transition-colors ${collapsed ? 'justify-center' : ''
            }`}
        >
          <LogOut className="w-4 h-4" />
          {!collapsed && <span>Log Out</span>}
        </button>

        {/* Collapse Toggle */}
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center py-2.5 text-white/30 hover:text-white/70 transition-colors"
        >
          <ChevronLeft className={`w-5 h-5 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>
    </aside>
  );
}
