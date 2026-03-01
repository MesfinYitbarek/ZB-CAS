import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, AlertCircle,  RefreshCw, Award, 
  AlertTriangle, BarChart2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';

const PERIOD_OPTIONS = [
  { key: 'monthly',   label: '1M',  full: 'Last Month' },
  { key: 'quarterly', label: '3M',  full: 'Last Quarter' },
  { key: 'semi',      label: '6M',  full: 'Last 6 Months' },
  { key: 'yearly',    label: '1Y',  full: 'Last Year' },
  { key: 'all',       label: 'All', full: 'All Time' },
];


export default function SupervisorDashboard() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [period, setPeriod] = useState('quarterly');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (p, silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await api.get(`/dashboard/supervisor?period=${p}`);
      setData(res.data.data);
    } catch (err) {
      console.error(err);
      showToast('Failed to load dashboard', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => { load(period); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">Loading…</p>
        </div>
      </div>
    );
  }

  const { stats = {}, teamMembers = [], pendingEvaluations = [], charts = {} } = data || {};
  const periodLabel = PERIOD_OPTIONS.find(p => p.key === period)?.full || '';
  const highPriority = pendingEvaluations.filter(e => e.priority === 'HIGH').length;
  const sortedMembers = [...teamMembers].sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0));

  return (
    <div className="min-h-screen bg-[#f8f9fb]">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-brand-red/4 rounded-full blur-3xl" />
        <div className="absolute bottom-20 -left-16 w-56 h-56 bg-emerald-500/4 rounded-full blur-3xl" />
      </div>

      <div className="relative p-6 lg:p-8 space-y-5 max-w-screen-xl mx-auto">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1">

              <h1 className="text-2xl font-display font-bold text-brand-black">
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
                  onClick={() => { setPeriod(key); load(key); }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150
                    ${period === key ? 'bg-brand-red text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button onClick={() => load(period, true)} className="w-9 h-9 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 shadow-sm">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ALERT BANNER */}
        {highPriority > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700 font-medium">
              {highPriority} evaluation{highPriority > 1 ? 's' : ''} require urgent attention — deadline within 48 hours
            </p>
          </div>
        )}

        {/* KPI CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: Users,       label: 'Team Members',     value: stats.teamSize || 0,             sub: 'Active employees',   color: 'text-blue-600',    bg: 'bg-blue-50' },
            { icon: AlertCircle, label: 'Pending Evals',    value: stats.pendingEvaluations || 0,   sub: `${highPriority} urgent`,              color: 'text-orange-600',  bg: 'bg-orange-50', urgent: highPriority > 0 },
            { icon: Award,       label: 'Team Avg Score',   value: `${stats.teamAvgScore || 0}%`,   sub: `${periodLabel}`,     color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { icon: BarChart2,   label: 'Period Results',   value: stats.periodResultCount || 0,    sub: periodLabel,          color: 'text-violet-600',  bg: 'bg-violet-50' },
          ].map(({ icon: Icon, label, value, sub, color, bg, urgent }) => (
            <div key={label} className={`bg-white rounded-2xl p-4 border shadow-sm transition-all
              ${urgent ? 'border-orange-200' : 'border-gray-100/80'}`}
            >
              {urgent && <div className="h-0.5 bg-gradient-to-r from-orange-400 to-red-400 -mx-4 -mt-4 mb-4 rounded-t-2xl" />}
              <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div className="text-2xl font-bold text-gray-900 tracking-tight mb-0.5">{value}</div>
              <div className="text-xs font-semibold text-gray-700">{label}</div>
              <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
            </div>
          ))}
        </div>

        {/* CHARTS ROW */}
        <div className="grid lg:grid-cols-2 gap-5">
        </div>
      </div>
    </div>
  );
}
