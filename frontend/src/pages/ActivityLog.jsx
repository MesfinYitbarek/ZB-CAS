import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  Activity, User, ClipboardList, FileText, MessageSquare, Target, HelpCircle,
  Lightbulb, BookOpen, ClipboardCheck, CheckCircle, Download, Search,
} from 'lucide-react';
import { exportToExcel, generateFilename } from '../utils/exportUtils';
import api from '../utils/api';
import Pagination from '../components/Pagination';
import EmptyState from '../components/EmptyState';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../hooks/queries';

const ENTITY_FILTERS = [
  { value: '', label: 'All Entities' },
  { value: 'User', label: 'Users' },
  { value: 'Assessment', label: 'Assessments' },
  { value: 'Competency', label: 'Competencies' },
  { value: 'Question', label: 'Questions' },
  { value: 'Recommendation', label: 'Recommendations' },
  { value: 'FAQ', label: 'FAQs' },
  { value: 'GeneratedReport', label: 'Reports' },
];

const ENTITY_META = {
  User:                 { icon: User,            color: 'text-gray-700 bg-gray-200' },
  Assessment:           { icon: ClipboardList,   color: 'text-brand-red bg-brand-red/10' },
  Competency:           { icon: Target,          color: 'text-gray-700 bg-gray-200' },
  Question:             { icon: HelpCircle,      color: 'text-gray-700 bg-gray-200' },
  Recommendation:       { icon: Lightbulb,       color: 'text-gray-700 bg-gray-200' },
  FAQ:                  { icon: BookOpen,        color: 'text-gray-700 bg-gray-200' },
  GeneratedReport:      { icon: FileText,        color: 'text-gray-700 bg-gray-200' },
  // Legacy entries (no longer logged, kept so old rows still render sensibly)
  Result:               { icon: FileText,        color: 'text-gray-700 bg-gray-200' },
  Feedback:             { icon: MessageSquare,   color: 'text-gray-700 bg-gray-200' },
  SupervisorEvaluation: { icon: ClipboardCheck,  color: 'text-gray-700 bg-gray-200' },
  Response:             { icon: CheckCircle,     color: 'text-gray-700 bg-gray-200' },
};

const DEFAULT_META = { icon: Activity, color: 'text-gray-600 bg-gray-100' };

const formatAction = (action) => (action || '').replace(/_/g, ' ').toUpperCase();

export default function ActivityLog() {
  const { isAdmin } = useAuth();
  const { show } = useToast();

  const [filterEntity, setFilterEntity] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');

  const [page, setPage] = useState(1);

  const { data: usersData } = useQuery({
    queryKey: queryKeys.users.list({ limit: 200, role: 'HR_ADMIN' }),
    queryFn: async () => {
      const { data } = await api.get('/users', { params: { limit: 200, role: 'HR_ADMIN' } });
      return data.data;
    },
    enabled: isAdmin,
  });

  const users = (usersData?.users || []).filter(
    (u) => !u.roles || u.roles.includes('HR_ADMIN') || u.roles.includes('ADMIN')
  );

  const activityParams = useMemo(() => {
    const params = { limit: 50, page };
    if (filterEntity) params.entity = filterEntity;
    if (filterUser)   params.actorId = filterUser;
    if (fromDate)     params.from = fromDate;
    if (toDate)       params.to = toDate;
    if (search.trim()) params.search = search.trim();
    return params;
  }, [page, filterEntity, filterUser, fromDate, toDate, search]);

  const { data: activitiesData, isLoading, isError } = useQuery({
    queryKey: queryKeys.activityLog.list(activityParams),
    queryFn: async () => {
      const { data } = await api.get('/activities', { params: activityParams });
      return data.data;
    },
  });

  useEffect(() => {
    if (isError) show('Failed to load activity log.', 'error');
  }, [isError, show]);

  const activities = activitiesData?.activities || [];
  const totalPages = activitiesData?.pagination?.totalPages || 1;
  const total = activitiesData?.pagination?.total || 0;

  const applyAndReset = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  const handleExport = async () => {
    try {
      await exportToExcel(
        {
          type: 'activities',
          activities: activities.map(a => ({
            date: a.createdAt,
            entity: a.entity,
            action: a.action,
            description: a.description,
            user: a.actorName || 'System',
            role: a.actorRole || '',
            ip: a.ipAddress || '',
            metadata: a.metadata,
          })),
        },
        generateFilename('activity_log', 'xlsx')
      );
      show('Activity log exported successfully!', 'success');
    } catch (_) {
      show('Export failed.', 'error');
    }
  };

  const currentMeta = (entity) => ENTITY_META[entity] || DEFAULT_META;

  return (
    <div className="h-[calc(100vh-2rem)] flex flex-col p-7">
      {/* Sticky Header */}
      <div className="flex justify-between items-start mb-3 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-brand-black">Activity Log</h1>
        </div>
        <button
          onClick={handleExport}
          disabled={activities.length === 0}
          className="flex items-center gap-1.5 px-2 py-1 text-sm bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-3 h-3" /> Export Log
        </button>
      </div>

      {/* Sticky Filters */}
      <div className="flex flex-wrap gap-3 mb-4 flex-shrink-0 items-center">
        <select
          value={filterEntity}
          onChange={(e) => applyAndReset(setFilterEntity)(e.target.value)}
          className="h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm"
        >
          {ENTITY_FILTERS.map(f => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>

        {isAdmin && (
          <select
            value={filterUser}
            onChange={(e) => applyAndReset(setFilterUser)(e.target.value)}
            className="h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm w-52"
          >
            <option value="">All Admins</option>
            {users.map(u => (
              <option key={u._id} value={u._id}>{u.name}</option>
            ))}
          </select>
        )}

        <input
          type="date"
          value={fromDate}
          onChange={(e) => applyAndReset(setFromDate)(e.target.value)}
          className="h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm text-gray-600"
          title="From date"
        />
        <span className="text-gray-400 text-sm">to</span>
        <input
          type="date"
          value={toDate}
          onChange={(e) => applyAndReset(setToDate)(e.target.value)}
          className="h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm text-gray-600"
          title="To date"
        />

        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => applyAndReset(setSearch)(e.target.value)}
            placeholder="Search description or user..."
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-gray-300 focus-brand text-sm"
          />
        </div>
      </div>

      {/* Scrollable Activity Timeline */}
      <div className="flex-1 overflow-y-auto scrollbar-none bg-white rounded-xl shadow-card border border-gray-100">
        {isLoading ? (
          <div className="flex items-center justify-center p-16">
            <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
          </div>
        ) : activities.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No activities found"
            description="Try adjusting or clearing the filters above. New events appear here as soon as they happen."
          />
        ) : (
          <div className="divide-y divide-gray-100">
            {activities.map((activity) => {
              const { icon: Icon, color: colorClass } = currentMeta(activity.entity);

              return (
                <div key={activity.id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-lg ${colorClass} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-semibold text-sm text-brand-black">{activity.description}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${colorClass}`}>
                          {formatAction(activity.action)}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>{activity.actorName || 'System'}</span>
                        {activity.actorRole && (
                          <>
                            <span>•</span>
                            <span className="text-gray-400">{activity.actorRole.replace('_', ' ')}</span>
                          </>
                        )}
                        <span>•</span>
                        <span>{new Date(activity.createdAt).toLocaleString()}</span>
                        {activity.entity && (
                          <>
                            <span>•</span>
                            <span className="text-gray-400">{activity.entity}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination Sticky Footer */}
      <div className="flex-shrink-0 border-t border-gray-100">
        {total > 0 && (
          <div className="pt-3 px-4 pb-0 text-xs text-gray-400">
            {total} event(s) · page {page} of {totalPages}
          </div>
        )}
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </div>
  );
}