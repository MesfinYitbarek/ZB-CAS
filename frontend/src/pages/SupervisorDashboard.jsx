import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, AlertCircle, RefreshCw, Award,
  AlertTriangle, BarChart2, ChevronRight,
  Clock, User, Calendar, Star
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../hooks/queries';

const PERIOD_OPTIONS = [
  { key: 'monthly', label: '1M', full: 'Last Month' },
  { key: 'quarterly', label: '3M', full: 'Last Quarter' },
  { key: 'semi', label: '6M', full: 'Last 6 Months' },
  { key: 'yearly', label: '1Y', full: 'Last Year' },
  { key: 'all', label: 'All', full: 'All Time' },
];


export default function SupervisorDashboard() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { show } = useToast();
  const [period, setPeriod] = useState('quarterly');

  const { data, isLoading: loading, isFetching, refetch } = useQuery({
    queryKey: queryKeys.dashboard.supervisor(period),
    queryFn: async () => {
      try {
        const res = await api.get(`/dashboard/supervisor?period=${period}`);
        return res.data.data;
      } catch (err) {
        console.error(err);
        show('Failed to load dashboard', 'error');
        throw err;
      }
    },
  });
  const refreshing = isFetching && !loading;

  if (loading) {
    return (
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">Loading your dashboard…</p>
        </div>
      </div>
    );
  }

  const { stats = {}, teamMembers = [], pendingEvaluations = [], charts = {} } = data || {};
  const periodLabel = PERIOD_OPTIONS.find(p => p.key === period)?.full || '';
  const highPriority = pendingEvaluations.filter(e => e.priority === 'HIGH').length;
  const sortedMembers = [...teamMembers].sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0));

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-gray-50 overflow-hidden">
      {/* Ambient glow - fixed */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-brand-red/4 rounded-full blur-3xl" />
        <div className="absolute bottom-20 -left-16 w-56 h-56 bg-gray-500/4 rounded-full blur-3xl" />
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-6 lg:p-8 space-y-5 max-w-screen-xl mx-auto">

          {/* Sticky Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 bg-gray-50 z-10 pb-2">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <h1 className="text-xl  font-bold text-brand-black">
                  Hi, {user?.name?.split(' ')[0]} 👋
                </h1>
                {refreshing && <div className="w-4 h-4 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />}
              </div>
              <p className="text-sm text-gray-400">
                Team overview · <span className="text-gray-600 font-medium">{periodLabel}</span>
                {user?.department && <span className="text-gray-400"> · {user.department}</span>}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex bg-white rounded-xl border border-gray-200/80 p-1 gap-0.5 shadow-sm">
                {PERIOD_OPTIONS.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setPeriod(key)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150
                      ${period === key ? 'bg-brand-red text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => refetch()}
                className="w-9 h-9 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 shadow-sm"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Alert Banner - Sticky but scrolls */}
          {highPriority > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700 font-medium">
                {highPriority} evaluation{highPriority > 1 ? 's' : ''} require urgent attention — deadline within 48 hours
              </p>
              <button
                onClick={() => nav('/supervisor/pending')}
                className="ml-auto text-xs font-semibold text-red-600 hover:text-red-700 hover:underline flex items-center gap-1"
              >
                View now <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* KPI CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: Users, label: 'Team Members', value: stats.teamSize || 0, sub: 'Active employees', color: 'text-gray-700', bg: 'bg-gray-100', link: '/my-team' },
              { icon: AlertCircle, label: 'Pending Evals', value: stats.pendingEvaluations || 0, sub: `${highPriority} urgent`, color: 'text-gray-700', bg: 'bg-gray-100', urgent: highPriority > 0, link: '/evaluations' },
              { icon: Award, label: 'Team Avg Score', value: `${stats.teamAvgScore || 0}%`, sub: periodLabel, color: 'text-gray-700', bg: 'bg-gray-100' },

            ].map(({ icon: Icon, label, value, sub, color, bg, urgent, link }) => (
              <div
                key={label}
                onClick={link ? () => nav(link) : undefined}
                className={`bg-white rounded-2xl p-3 border shadow-sm transition-all
                  ${link ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md' : ''}
                  ${urgent ? 'border-gray-300' : 'border-gray-100/80'}`}
              >
                {urgent && <div className="h-0.5 bg-brand-red -mx-4 -mt-4 mb-4 rounded-t-2xl" />}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-2xl  font-bold text-brand-black tracking-tight mb-0.5">{value}</div>
                    <div className="text-xs font-semibold text-gray-700">{label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
                  </div>
                  {link && <ChevronRight className="w-4 h-4 text-gray-300" />}
                </div>

              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}