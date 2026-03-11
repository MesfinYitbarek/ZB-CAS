import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid
} from 'recharts';
import {
  Users, ClipboardList, Target, TrendingUp, TrendingDown,
  Activity, Award, AlertCircle, RefreshCw,
  BarChart2, Clock, Zap, ChevronRight
} from 'lucide-react';
import api from '../utils/api';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const PERIOD_OPTIONS = [
  { key: 'monthly',   label: '1M',  full: 'Last Month' },
  { key: 'quarterly', label: '3M',  full: 'Last Quarter' },
  { key: 'semi',      label: '6M',  full: 'Last 6 Months' },
  { key: 'yearly',    label: '1Y',  full: 'Last Year' },
  { key: 'all',       label: 'All', full: 'All Time' },
];

const STATUS_COLORS = { ACTIVE: '#10b981', COMPLETED: '#3b82f6', DRAFT: '#94a3b8', SCHEDULED: '#f59e0b' };
const CHART_COLORS = ['#C8102E', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1.5">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-500 capitalize">{p.name}:</span>
          <span className="font-bold text-gray-800">{p.value}{p.name === 'avgScore' ? '%' : ''}</span>
        </div>
      ))}
    </div>
  );
};

export default function AdminDashboard() {
  const nav = useNavigate();
  const [period, setPeriod] = useState('semi');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [extRequests, setExtRequests] = useState([]);

  const load = useCallback(async (p, silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await api.get(`/dashboard/admin?period=${p}`);
      setData(res.data.data);
    } catch (err) {
      console.error('Failed to load admin dashboard:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadExtRequests = useCallback(async () => {
    try {
      const res = await api.get('/external/assessment-requests');
      setExtRequests(res.data?.data?.requests || []);
    } catch (err) {
      console.error('Failed to load external requests:', err);
    }
  }, []);

  useEffect(() => { load(period); loadExtRequests(); }, [period, load, loadExtRequests]);

  if (loading) {
    return (
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  const { stats = {}, charts = {}, recentActivity = [], quickStats = {} } = data || {};
  const periodLabel = PERIOD_OPTIONS.find(p => p.key === period)?.full || '';


  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-[#f8f9fb] overflow-hidden">
      {/* Subtle ambient glow - fixed */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-32 -right-32 w-80 h-80 bg-red-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 -left-16 w-64 h-64 bg-blue-500/4 rounded-full blur-3xl" />
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-6 lg:p-8 space-y-5 max-w-screen-2xl mx-auto">

          {/* Sticky Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 bg-[#f8f9fb] z-10 pb-2">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <h1 className="text-2xl font-display font-bold text-brand-black">Admin Dashboard</h1>
                {refreshing && <div className="w-4 h-4 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />}
              </div>
              <p className="text-sm text-gray-400">System-wide overview · <span className="text-gray-600 font-medium">{periodLabel}</span></p>
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
              <button
                onClick={() => { load(period, true); loadExtRequests(); }}
                className="w-9 h-9 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 transition-all shadow-sm"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Compact External Requests Notification */}
          {(() => {
            const pending = extRequests.filter(r => r.status === 'PENDING' || r.status === 'IN_PROGRESS').length;
            return pending > 0 ? (
              <button
                onClick={() => nav('/assessment-requests')}
                className="w-full flex items-center gap-2 bg-orange-50 rounded-lg border border-orange-200/80 px-3 py-2 hover:bg-orange-100 transition-all text-left group"
              >
                <AlertCircle className="w-4 h-4 text-orange-500 flex-shrink-0" />
                <span className="text-xs font-medium text-gray-700 flex-1">
                  <span className="font-bold text-orange-700">{pending}</span> pending assessment request{pending !== 1 ? 's' : ''} from ZB Succession Planning
                </span>
                <span className="px-2 py-0.5 bg-orange-200 text-orange-800 rounded-full text-[10px] font-bold flex-shrink-0">
                  View
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-orange-400 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
              </button>
            ) : null;
          })()}

          {/* PRIMARY KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
            {[
              { icon: Users,      label: 'Total Users',    value: stats.totalUsers    || 0, sub: `${stats.activeUsers || 0} active`,      color: 'text-blue-600',   bg: 'bg-blue-50',      link: '/users' },
              { icon: Target,     label: 'Competencies',   value: stats.totalCompetencies || 0, sub: 'All categories', color: 'text-violet-600', bg: 'bg-violet-50',    link: '/competencies' },
              { icon: Zap,        label: 'Active',         value: stats.activeAssessments || 0, sub: `${stats.scheduledAssessments || 0} scheduled`, color: 'text-emerald-600', bg: 'bg-emerald-50', link: '/assessments' },
              { icon: ClipboardList, label: 'Total Results', value: stats.totalResults  || 0, sub: periodLabel, color: 'text-brand-red',  bg: 'bg-brand-red/10' },
            ].map(({ icon: Icon, label, value, sub, color, bg, link }) => (
              <div
                key={label}
                onClick={link ? () => nav(link) : undefined}
                className={`bg-white rounded-2xl p-4 border shadow-sm transition-all duration-200
                  ${link ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md' : ''}
                  border-gray-100/80`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                  {link && <ChevronRight className="w-4 h-4 text-gray-300" />}
                </div>
                <div className="text-2xl font-bold text-gray-900 tracking-tight mb-0.5">{value}</div>
                <div className="text-xs font-semibold text-gray-700">{label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
              </div>
            ))}
          </div>

          {/* CHARTS ROW */}
          <div className="grid lg:grid-cols-3 gap-5">

            {/* Activity Trend - Now only showing Assessments */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Activity Trend</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Assessments created · {periodLabel}</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <div className="flex items-center gap-1"><div className="w-3 h-0.5 bg-blue-400" /><span>Assessments</span></div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={charts.trend || []} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                  <defs>
                    <linearGradient id="gBlue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="assessments" stroke="#3b82f6" strokeWidth={2} fill="url(#gBlue)" dot={false} activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Assessment Status */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-1">Assessment Status</h3>
              <p className="text-xs text-gray-400 mb-4">All assessments</p>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={charts.assessmentStatus || []} cx="50%" cy="50%" innerRadius={44} outerRadius={68} paddingAngle={3} dataKey="value">
                    {(charts.assessmentStatus || []).map((e, i) => (
                      <Cell key={i} fill={STATUS_COLORS[e.name] || CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-4">
                {(charts.assessmentStatus || []).map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[item.name] || CHART_COLORS[i] }} />
                      <span className="text-gray-500">{item.name}</span>
                    </div>
                    <span className="font-semibold text-gray-800">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}