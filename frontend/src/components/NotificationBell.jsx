/* components/NotificationBell.jsx
 *
 * Bell icon with unread badge, dropdown panel, real-time Socket.IO updates.
 *
 * Features:
 *  - Unread count badge (red dot when ≥1, number when ≥1)
 *  - Dropdown with full notification list, grouped by read state
 *  - Click notification → navigate to link + mark as read
 *  - Mark all read / Clear read buttons
 *  - Socket.IO: receives 'notification:new' and increments count live
 *  - Falls back gracefully when socket is not connected (polling every 60s)
 */
import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Bell, X, CheckCheck, Trash2, ClipboardList,
  Award, Clock, UserCheck, Sparkles, Info,
  ShieldAlert, RotateCcw,
} from 'lucide-react';
import api from '../utils/api';
import { queryKeys } from '../hooks/queryKeys';

// ─── Type metadata ────────────────────────────────────────────────────────────
const TYPE_META = {
  ASSESSMENT_ASSIGNED: {
    icon: ClipboardList,
    color: 'text-gray-700',
    bg: 'bg-gray-100',
  },
  RESULT_READY: {
    icon: Award,
    color: 'text-brand-black',
    bg: 'bg-gray-200',
  },
  SUPERVISOR_REMINDER: {
    icon: UserCheck,
    color: 'text-gray-700',
    bg: 'bg-gray-100',
  },
  DEADLINE_REMINDER: {
    icon: Clock,
    color: 'text-brand-red',
    bg: 'bg-brand-red/10',
  },
  ACCOUNT_CREATED: {
    icon: Sparkles,
    color: 'text-brand-red',
    bg: 'bg-brand-red/10',
  },
  SECURITY_ALERT: {
    icon: ShieldAlert,
    color: 'text-red-700',
    bg: 'bg-red-100',
  },
  RETAKE_GRANTED: {
    icon: RotateCcw,
    color: 'text-brand-red',
    bg: 'bg-brand-red/10',
  },
};
const DEFAULT_META = { icon: Info, color: 'text-gray-500', bg: 'bg-gray-100' };

// ─── Time formatter ───────────────────────────────────────────────────────────
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ─── Single notification row ──────────────────────────────────────────────────
function NotifRow({ notif, onRead, onDelete }) {
  const nav = useNavigate();
  const { icon: Icon, color, bg } = TYPE_META[notif.type] || DEFAULT_META;

  const handleClick = () => {
    if (!notif.read) onRead(notif._id);
    if (notif.link) nav(notif.link);
  };

  return (
    <div
      className={`group flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer
        ${!notif.read ? 'bg-gray-100/60' : ''}`}
      onClick={handleClick}
    >
      {/* Unread dot */}
      <div className="relative flex-shrink-0 mt-0.5">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${bg}`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
        {!notif.read && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-brand-red rounded-full border-2 border-white" />
        )}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${!notif.read ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
          {notif.title}
        </p>
        {notif.body && (
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed line-clamp-2">{notif.body}</p>
        )}
        <p className="text-[10px] text-gray-400 mt-1">{timeAgo(notif.createdAt)}</p>
      </div>

      {/* Delete */}
      <button
        onClick={e => { e.stopPropagation(); onDelete(notif._id); }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all flex-shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function NotificationBell({ socket }) {
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const panelRef = useRef(null);
  const queryClient = useQueryClient();

  // ── Notifications list (fetches when the panel opens) ──────────────────
  const listQuery = useQuery({
    queryKey: queryKeys.notifications.list({ page, limit: 20 }),
    queryFn: async () => {
      const { data } = await api.get('/notifications', { params: { page, limit: 20 } });
      return data.data;
    },
    enabled: open,
  });

  // ── Unread count (60s poll replaces the old setInterval) ───────────────
  const unreadQuery = useQuery({
    queryKey: queryKeys.notifications.unreadCount,
    queryFn: async () => {
      const { data } = await api.get('/notifications/unread-count');
      return data.data;
    },
    refetchInterval: 60_000,
  });

  const unread = unreadQuery.data?.count ?? 0;
  const loading = listQuery.isFetching;

  // ── Merge paginated pages into the displayed list ──────────────────────
  useEffect(() => {
    const d = listQuery.data;
    if (!d) return;
    setNotifs(prev => {
      const ids = new Set(prev.map(n => n._id));
      const fresh = d.notifications.filter(n => !ids.has(n._id));
      return d.page === 1 ? d.notifications : [...prev, ...fresh];
    });
    setHasMore(d.page * d.limit < d.total);
    queryClient.setQueryData(queryKeys.notifications.unreadCount, { count: d.unreadCount });
  }, [listQuery.data, queryClient]);

  // ── Socket.IO real-time ─────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const handleNew = (notif) => {
      setNotifs(prev => [notif, ...prev]);
      queryClient.setQueryData(queryKeys.notifications.unreadCount, (old) => ({ count: (Number(old?.count ?? 0) + 1) }));
    };
    socket.on('notification:new', handleNew);
    return () => socket.off('notification:new', handleNew);
  }, [socket, queryClient]);

  // ── Close on outside click ──────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // ── Reload full list when panel opens ──────────────────────────────────
  const handleToggle = () => {
    if (!open) setPage(1);
    setOpen(v => !v);
  };

  // ── Actions ─────────────────────────────────────────────────────────────
  const readMutation = useMutation({
    mutationFn: (id) => api.patch(`/notifications/${id}/read`),
    onMutate: (id) => {
      setNotifs(prev => prev.map(n => n._id === id ? { ...n, read: true } : n));
      queryClient.setQueryData(queryKeys.notifications.unreadCount, (old) => ({ count: Math.max(0, (Number(old?.count ?? 0) - 1)) }));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onMutate: () => {
      setNotifs(prev => prev.map(n => ({ ...n, read: true })));
      queryClient.setQueryData(queryKeys.notifications.unreadCount, { count: 0 });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/notifications/${id}`),
    onMutate: (id) => {
      const notif = notifs.find(n => n._id === id);
      setNotifs(prev => prev.filter(n => n._id !== id));
      if (notif && !notif.read) {
        queryClient.setQueryData(queryKeys.notifications.unreadCount, (old) => ({ count: Math.max(0, (Number(old?.count ?? 0) - 1)) }));
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  });

  const clearReadMutation = useMutation({
    mutationFn: () => api.delete('/notifications/clear-read'),
    onMutate: () => {
      setNotifs(prev => prev.filter(n => !n.read));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  });

  const handleRead = (id) => { readMutation.mutate(id); };
  const handleMarkAllRead = () => { markAllReadMutation.mutate(); };
  const handleDelete = (id) => { deleteMutation.mutate(id); };
  const handleClearRead = () => { clearReadMutation.mutate(); };

  const hasRead = notifs.some(n => n.read);

  return (
    <div className="relative" ref={panelRef}>
      {/* ── Bell button ────────────────────────────────────────────────── */}
      <button
        onClick={handleToggle}
        className={`relative w-9 h-9 flex items-center justify-center rounded-xl transition-colors
          ${open ? 'bg-brand-red/10 text-brand-red' : 'hover:bg-gray-100 text-gray-500'}`}
        aria-label="Notifications"
      >
        <Bell className={`w-5 h-5 ${unread > 0 ? 'text-gray-700' : ''}`} />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-brand-red text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* ── Dropdown panel ─────────────────────────────────────────────── */}
      {open && (
        <div
          className="absolute top-12 right-0 w-[calc(100vw-2rem)] sm:w-[280px] lg:w-[280px] max-h-[min(70vh,480px)] bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 flex flex-col overflow-hidden"
        >

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-gray-600" />
              <span className="text-sm font-bold text-gray-900">Notifications</span>
              {unread > 0 && (
                <span className="text-[10px] font-bold bg-brand-red text-white px-1.5 py-0.5 rounded-full">
                  {unread} unread
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  title="Mark all as read"
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-brand-red px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">All read</span>
                </button>
              )}
              {hasRead && (
                <button
                  onClick={handleClearRead}
                  title="Clear read notifications"
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Clear</span>
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none">
            {loading && notifs.length === 0 ? (
              <div className="flex items-center justify-center h-24">
                <div className="w-5 h-5 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />
              </div>
            ) : notifs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                  <Bell className="w-6 h-6 text-gray-300" />
                </div>
                <p className="text-sm font-medium text-gray-500">All caught up</p>
                <p className="text-xs text-gray-400 mt-0.5">No notifications yet</p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-gray-50">
                  {notifs.map(n => (
                    <NotifRow
                      key={n._id}
                      notif={n}
                      onRead={handleRead}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
                {hasMore && (
                  <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={loading}
                    className="w-full py-2.5 text-xs font-medium text-gray-500 hover:text-brand-red hover:bg-gray-50 transition-colors border-t border-gray-100"
                  >
                    {loading ? 'Loading…' : 'Load more'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}