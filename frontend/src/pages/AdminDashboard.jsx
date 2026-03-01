import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid
} from 'recharts';
import {
  Users, ClipboardList, Target, TrendingUp, TrendingDown,
  Activity, Award, AlertCircle, RefreshCw,
  BarChart2, Clock, Zap
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

const LEVEL_CONFIG = {
  Expert:       { color: '#10b981', bg: 'bg-emerald-500' },
  Advanced:     { color: '#3b82f6', bg: 'bg-blue-500' },
  Intermediate: { color: '#f59e0b', bg: 'bg-amber-500' },
  Basic:        { color: '#ef4444', bg: 'bg-red-500' },
};

const STATUS_COLORS = { ACTIVE: '#10b981', COMPLETED: '#3b82f6', DRAFT: '#94a3b8', SCHEDULED: '#f59e0b' };
const CHART_COLORS = ['#C8102E', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

const ACTIVITY_CONFIG = {
  assessment: { Icon: ClipboardList, bg: 'bg-blue-50',   color: 'text-blue-600' },
  result:     { Icon: Award,         bg: 'bg-emerald-50', color: 'text-emerald-600' },
  user:       { Icon: Users,         bg: 'bg-purple-50',  color: 'text-purple-600' },
  feedback:   { Icon: Activity,      bg: 'bg-amber-50',   color: 'text-amber-600' },
};

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

  useEffect(() => { load(period); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
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
    <div className="min-h-screen bg-[#f8f9fb]">
      {/* Subtle ambient glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-32 -right-32 w-80 h-80 bg-red-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 -left-16 w-64 h-64 bg-blue-500/4 rounded-full blur-3xl" />
      </div>

      <div className="relative p-6 lg:p-8 space-y-5 max-w-screen-2xl mx-auto">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-1 h-6 bg-brand-red rounded-full" />
              <h1 className="text-xl font-bold text-gray-900">Admin Dashboard</h1>
              {refreshing && <div className="w-4 h-4 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />}
            </div>
            <p className="text-sm text-gray-400 ml-3.5">System-wide overview · <span className="text-gray-600 font-medium">{periodLabel}</span></p>
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
              onClick={() => load(period, true)}
              className="w-9 h-9 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 transition-all shadow-sm"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* PRIMARY KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {[
            { icon: Users,      label: 'Total Users',    value: stats.totalUsers    || 0, sub: `${stats.activeUsers || 0} active`,      color: 'text-blue-600',   bg: 'bg-blue-50',      link: '/users' },
            { icon: Target,     label: 'Competencies',   value: stats.totalCompetencies || 0, sub: 'All categories', color: 'text-violet-600', bg: 'bg-violet-50',    link: '/competencies' },
            { icon: Zap,        label: 'Active',         value: stats.activeAssessments || 0, sub: `${stats.scheduledAssessments || 0} scheduled`, color: 'text-emerald-600', bg: 'bg-emerald-50', link: '/assessments' },
            { icon: ClipboardList, label: 'Results',     value: stats.totalResults  || 0, sub: periodLabel,          color: 'text-brand-red',  bg: 'bg-brand-red/10'                      },
            { icon: BarChart2,  label: 'Avg Score',      value: `${stats.avgScore   || 0}%`, sub: `±${stats.stdDev || 0}`, color: 'text-amber-600', bg: 'bg-amber-50'                    },
            { icon: AlertCircle, label: 'Pending',       value: stats.pendingResults || 0, sub: 'Need finalization',  color: 'text-orange-600', bg: 'bg-orange-50',                      urgent: (stats.pendingResults || 0) > 10 },
          ].map(({ icon: Icon, label, value, sub, color, bg, link, urgent }) => (
            <div
              key={label}
              onClick={link ? () => nav(link) : undefined}
              className={`bg-white rounded-2xl p-4 border shadow-sm transition-all duration-200
                ${link ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md' : ''}
                ${urgent ? 'border-orange-200' : 'border-gray-100/80'}`}
            >
              {urgent && <div className="h-0.5 bg-gradient-to-r from-orange-400 to-red-400 -mx-4 -mt-4 mb-4 rounded-t-2xl" />}
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

        {/* QUICK STATS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Completion Rate', value: `${quickStats.completionRate || 0}%`, dot: '#10b981' },
            { label: 'Avg / Employee',  value: quickStats.avgAssessmentsPerUser || 0, dot: '#3b82f6' },
            { label: 'Completed',       value: stats.completedAssessments || 0, dot: '#6366f1' },
            { label: 'Draft',           value: stats.draftAssessments || 0, dot: '#f59e0b' },
          ].map(({ label, value, dot }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3 shadow-sm">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dot }} />
              <div>
                <div className="text-base font-bold text-gray-900">{value}</div>
                <div className="text-xs text-gray-400">{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* CHARTS ROW 1 */}
        <div className="grid lg:grid-cols-3 gap-5">

          {/* Activity Trend */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Activity Trend</h3>
                <p className="text-xs text-gray-400 mt-0.5">Assessments & Results · {periodLabel}</p>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <div className="flex items-center gap-1"><div className="w-3 h-0.5 bg-brand-red" /><span>Results</span></div>
                <div className="flex items-center gap-1"><div className="w-3 h-0.5 bg-blue-400" /><span>Assessments</span></div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={charts.trend || []} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                <defs>
                  <linearGradient id="gRed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C8102E" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#C8102E" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gBlue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.12} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="results" stroke="#C8102E" strokeWidth={2} fill="url(#gRed)" dot={false} activeDot={{ r: 4 }} />
                <Area type="monotone" dataKey="assessments" stroke="#3b82f6" strokeWidth={2} fill="url(#gBlue)" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Assessment Status */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-1">Assessment Status</h3>
            <p className="text-xs text-gray-400 mb-4">All assessments</p>
            <ResponsiveContainer width="100%" height={150}>
              <PieChart>
                <Pie data={charts.assessmentStatus || []} cx="50%" cy="50%" innerRadius={44} outerRadius={68} paddingAngle={3} dataKey="value">
                  {(charts.assessmentStatus || []).map((e, i) => (
                    <Cell key={i} fill={STATUS_COLORS[e.name] || CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-2">
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

        {/* CHARTS ROW 2 */}
        <div className="grid lg:grid-cols-2 gap-5">

          {/* Department Performance */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-0.5">Department Performance</h3>
            <p className="text-xs text-gray-400 mb-4">Average score by dept · {periodLabel}</p>
            {(charts.departmentPerformance || []).length === 0 ? (
              <div className="h-40 flex items-center justify-center text-gray-300 text-xs">No data for this period</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={charts.departmentPerformance} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={80} />
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="avgScore" radius={[0, 4, 4, 0]} maxBarSize={12}>
                    {(charts.departmentPerformance || []).map((e, i) => (
                      <Cell key={i} fill={e.avgScore >= 75 ? '#10b981' : e.avgScore >= 55 ? '#3b82f6' : '#f59e0b'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Level Distribution + Competency Categories */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-0.5">Level Distribution</h3>
            <p className="text-xs text-gray-400 mb-4">Results breakdown · {periodLabel}</p>
            <div className="space-y-3">
              {['Expert', 'Advanced', 'Intermediate', 'Basic'].map(level => {
                const item = (charts.levelDistribution || []).find(l => l.name === level);
                const total = (charts.levelDistribution || []).reduce((s, l) => s + l.count, 0) || 1;
                const pct = item ? Math.round((item.count / total) * 100) : 0;
                const cfg = LEVEL_CONFIG[level];
                return (
                  <div key={level}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full`} style={{ background: cfg.color }} />
                        <span className="font-medium text-gray-600">{level}</span>
                      </div>
                      <span className="text-gray-400">{item?.count || 0} <span className="text-gray-300">·</span> {pct}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${cfg.bg} rounded-full`} style={{ width: `${pct}%`, transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {(charts.competencyDistribution || []).length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-50">
                <p className="text-xs text-gray-400 font-medium mb-2 uppercase tracking-wider">Competency Categories</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {charts.competencyDistribution.map((c, i) => (
                    <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-2.5 py-1.5 text-xs">
                      <span className="text-gray-500 truncate">{c.name}</span>
                      <span className="font-bold text-gray-800 ml-1">{c.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM: Score Trend + Activity Feed */}
        <div className="grid lg:grid-cols-3 gap-5">

          {/* Score avg trend */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-0.5">Avg Score Over Time</h3>
            <p className="text-xs text-gray-400 mb-4">Monthly average</p>
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={charts.trend || []} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                <defs>
                  <linearGradient id="gScore" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C8102E" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#C8102E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="avgScore" stroke="#C8102E" strokeWidth={2.5} fill="url(#gScore)" dot={false} activeDot={{ r: 4, fill: '#C8102E' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Recent Activity */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Recent Activity</h3>
                <p className="text-xs text-gray-400 mt-0.5">Latest system events</p>
              </div>
              <Clock className="w-4 h-4 text-gray-300" />
            </div>
            <div className="space-y-1">
              {recentActivity.slice(0, 7).map((item, i) => {
                const cfg = ACTIVITY_CONFIG[item.type] || ACTIVITY_CONFIG.assessment;
                const Icon = cfg.Icon;
                return (
                  <div key={i} className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
                    <div className={`w-8 h-8 ${cfg.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-4 h-4 ${cfg.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 leading-snug">{item.desc}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{item.user} · {item.time}</p>
                    </div>
                  </div>
                );
              })}
              {recentActivity.length === 0 && (
                <div className="py-8 text-center text-gray-300 text-sm">No recent activity</div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// missing import fix
const ChevronRight = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 18l6-6-6-6" /></svg>
);
