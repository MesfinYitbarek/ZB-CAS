import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, RadarChart, Radar,
  PolarGrid, PolarAngleAxis
} from 'recharts';
import {
  Users, AlertCircle, TrendingUp, TrendingDown, Target,
  ChevronRight, RefreshCw, Clock, Award, CheckCircle,
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

const LEVEL_COLORS = {
  Expert:       { dot: 'bg-emerald-500', text: 'text-emerald-700', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  Advanced:     { dot: 'bg-blue-500',    text: 'text-blue-700',    badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  Intermediate: { dot: 'bg-amber-500',   text: 'text-amber-700',   badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  Basic:        { dot: 'bg-red-500',     text: 'text-red-700',     badge: 'bg-red-50 text-red-700 border-red-200' },
};

const PRIORITY_STYLE = {
  HIGH:   { bg: 'bg-red-50',    text: 'text-red-600',    border: 'border-red-200',    dot: 'bg-red-500' },
  MEDIUM: { bg: 'bg-amber-50',  text: 'text-amber-600',  border: 'border-amber-200',  dot: 'bg-amber-500' },
  LOW:    { bg: 'bg-green-50',  text: 'text-green-600',  border: 'border-green-200',  dot: 'bg-green-500' },
};

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1.5">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-500">{p.name}:</span>
          <span className="font-bold text-gray-800">{p.value}{p.name === 'avgScore' || p.name === 'avg' ? '%' : ''}</span>
        </div>
      ))}
    </div>
  );
};

export default function SupervisorDashboard() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [period, setPeriod] = useState('quarterly');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'team'

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
              <div className="w-1 h-6 bg-brand-red rounded-full" />
              <h1 className="text-xl font-bold text-gray-900">
                Hi, {user?.name?.split(' ')[0]} 👋
              </h1>
              {refreshing && <div className="w-4 h-4 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />}
            </div>
            <p className="text-sm text-gray-400 ml-3.5">
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

          {/* Team Trend */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-0.5">Team Performance Trend</h3>
            <p className="text-xs text-gray-400 mb-4">Average score over time · {periodLabel}</p>
            {(charts.trend || []).length === 0 ? (
              <div className="h-44 flex items-center justify-center text-gray-300 text-xs">No data for this period</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={charts.trend} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="gTeam" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#C8102E" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#C8102E" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="avgScore" stroke="#C8102E" strokeWidth={2.5} fill="url(#gTeam)" dot={false} activeDot={{ r: 4, fill: '#C8102E' }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Competency Breakdown */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-0.5">Competency Breakdown</h3>
            <p className="text-xs text-gray-400 mb-4">Team performance by competency · {periodLabel}</p>
            {(charts.competencyBreakdown || []).length === 0 ? (
              <div className="h-44 flex items-center justify-center text-gray-300 text-xs">No data for this period</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={charts.competencyBreakdown} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                    tickFormatter={v => v.length > 10 ? v.substring(0, 10) + '…' : v} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="avg" radius={[4, 4, 0, 0]} maxBarSize={32} fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* TABS: Pending Evaluations / Team Members */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setActiveTab('pending')}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold transition-colors relative
                ${activeTab === 'pending' ? 'text-brand-red' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <AlertCircle className="w-4 h-4" />
              Pending Evaluations
              {pendingEvaluations.length > 0 && (
                <span className="bg-brand-red text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {pendingEvaluations.length}
                </span>
              )}
              {activeTab === 'pending' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-red" />}
            </button>
            <button
              onClick={() => setActiveTab('team')}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold transition-colors relative
                ${activeTab === 'team' ? 'text-brand-red' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <Users className="w-4 h-4" />
              Team Members
              <span className="bg-gray-100 text-gray-500 text-xs font-bold px-1.5 py-0.5 rounded-full">
                {teamMembers.length}
              </span>
              {activeTab === 'team' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-red" />}
            </button>
          </div>

          {/* Pending Tab */}
          {activeTab === 'pending' && (
            <div className="p-5">
              {pendingEvaluations.length === 0 ? (
                <div className="text-center py-10">
                  <CheckCircle className="w-10 h-10 text-emerald-300 mx-auto mb-2" />
                  <p className="text-sm font-medium text-gray-500">All caught up!</p>
                  <p className="text-xs text-gray-400 mt-0.5">No pending evaluations</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingEvaluations.map((item, i) => {
                    const ps = PRIORITY_STYLE[item.priority];
                    return (
                      <div
                        key={i}
                        className={`flex items-center gap-4 p-3.5 rounded-xl border transition-all hover:shadow-sm
                          ${item.priority === 'HIGH' ? 'border-red-200 bg-red-50/30' : 'border-gray-100 hover:border-gray-200'}`}
                      >
                        <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-gray-600">
                            {item.employeeName?.charAt(0)?.toUpperCase() || '?'}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-900">{item.employeeName}</span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${ps.bg} ${ps.text} ${ps.border}`}>
                              {item.priority}
                            </span>
                            {item.daysLeft !== null && (
                              <span className="text-xs text-gray-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {item.daysLeft <= 0 ? 'Overdue' : `${item.daysLeft}d left`}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5 truncate">
                            {item.assessmentDescription} · {item.employeeDepartment || item.employeePosition || ''}
                          </p>
                        </div>
                        <button
                          onClick={() => nav(`/assessments/${item.assessmentId}/evaluate/${item.employeeId}`)}
                          className="px-3.5 py-1.5 bg-brand-red text-white rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity flex-shrink-0"
                        >
                          Evaluate
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Team Tab */}
          {activeTab === 'team' && (
            <div className="p-5">
              {sortedMembers.length === 0 ? (
                <div className="text-center py-10 text-gray-300 text-sm">No team members found</div>
              ) : (
                <div className="space-y-2">
                  {sortedMembers.map((member, i) => {
                    const levelCfg = LEVEL_COLORS[member.latestLevel];
                    const scoreColor = (member.avgScore || 0) >= 75 ? 'text-emerald-600' : (member.avgScore || 0) >= 55 ? 'text-blue-600' : 'text-amber-600';
                    return (
                      <div key={i} className="flex items-center gap-4 p-3.5 rounded-xl border border-gray-100 hover:border-gray-200 transition-all hover:shadow-sm">
                        <div className="w-9 h-9 bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-gray-600">
                            {member.name?.charAt(0)?.toUpperCase() || '?'}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900 truncate">{member.name}</span>
                            {member.latestLevel && (
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${levelCfg?.badge || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                                {member.latestLevel}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">{member.department} · {member.position || member.email}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          {member.avgScore !== null ? (
                            <>
                              <div className={`text-sm font-bold ${scoreColor}`}>{member.avgScore}%</div>
                              <div className="text-xs text-gray-400">{member.assessmentCount} assessment{member.assessmentCount !== 1 ? 's' : ''}</div>
                            </>
                          ) : (
                            <div className="text-xs text-gray-300">No data</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
