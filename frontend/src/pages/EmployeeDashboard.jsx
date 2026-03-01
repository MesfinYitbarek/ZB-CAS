import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from 'recharts';
import {
  ClipboardList, Award, Target, Calendar, TrendingUp,
  TrendingDown, RefreshCw, ChevronRight, Star, Clock,
  BookOpen, User, AlertCircle, CheckCircle, ArrowRight
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

const LEVEL_CONFIG = {
  Expert:       { color: '#10b981', bg: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', stars: 4 },
  Advanced:     { color: '#3b82f6', bg: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700 border-blue-200',          stars: 3 },
  Intermediate: { color: '#f59e0b', bg: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 border-amber-200',        stars: 2 },
  Basic:        { color: '#ef4444', bg: 'bg-red-500',     badge: 'bg-red-50 text-red-700 border-red-200',              stars: 1 },
};

const CATEGORY_COLORS = {
  'Leadership':    '#C8102E',
  'Technical':     '#3b82f6',
  'Communication': '#10b981',
  'Management':    '#f59e0b',
  'Innovation':    '#8b5cf6',
};

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-brand-red" />
          <span className="text-gray-500">Score:</span>
          <span className="font-bold text-gray-800">{p.value}%</span>
        </div>
      ))}
    </div>
  );
};

const ScoreBar = ({ value, max = 100 }) => {
  const pct = Math.round((value / max) * 100);
  const color = pct >= 80 ? '#10b981' : pct >= 60 ? '#3b82f6' : pct >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
};

export default function EmployeeDashboard() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [period, setPeriod] = useState('yearly');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (p, silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await api.get(`/dashboard/employee?period=${p}`);
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

  const {
    stats = {}, pendingAssessments = [], recentResults = [],
    competencyProgress = [], charts = {}, supervisor, nextDeadline
  } = data || {};

  const periodLabel = PERIOD_OPTIONS.find(p => p.key === period)?.full || '';
  const topLevel = recentResults[0]?.level;
  const topLevelCfg = LEVEL_CONFIG[topLevel];

  // Derive trend direction
  const trend = charts.trend || [];
  const lastTwo = trend.filter(t => t.score !== null).slice(-2);
  const trendDir = lastTwo.length === 2
    ? lastTwo[1].score > lastTwo[0].score ? 'up'
      : lastTwo[1].score < lastTwo[0].score ? 'down' : 'flat'
    : 'flat';

  return (
    <div className="min-h-screen bg-[#f8f9fb]">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-brand-red/4 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -left-10 w-48 h-48 bg-blue-500/4 rounded-full blur-3xl" />
      </div>

      <div className="relative p-6 lg:p-8 space-y-5 max-w-screen-xl mx-auto">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            {/* Welcome */}
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-1 h-6 bg-brand-red rounded-full" />
              <h1 className="text-xl font-bold text-gray-900">
                Welcome back, {user?.name?.split(' ')[0]} 👋
              </h1>
              {refreshing && <div className="w-4 h-4 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />}
            </div>
            <p className="text-sm text-gray-400 ml-3.5">
              {user?.position || 'Employee'} · {user?.department || ''}
              {user?.employeeId && <span className="text-gray-300"> · {user.employeeId}</span>}
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

        {/* DEADLINE BANNER */}
        {nextDeadline && nextDeadline.daysLeft <= 3 && (
          <div className={`rounded-xl px-4 py-3 flex items-center gap-3 border
            ${nextDeadline.daysLeft <= 0 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
            <Clock className={`w-4 h-4 flex-shrink-0 ${nextDeadline.daysLeft <= 0 ? 'text-red-500' : 'text-amber-500'}`} />
            <p className={`text-sm font-medium ${nextDeadline.daysLeft <= 0 ? 'text-red-700' : 'text-amber-700'}`}>
              {nextDeadline.daysLeft <= 0
                ? `Overdue: "${nextDeadline.name}" — submit as soon as possible`
                : `"${nextDeadline.name}" is due in ${nextDeadline.daysLeft} day${nextDeadline.daysLeft !== 1 ? 's' : ''}`
              }
            </p>
            <button onClick={() => nav(`/assessments`)} className="ml-auto text-xs font-semibold text-brand-red hover:underline flex-shrink-0 flex items-center gap-1">
              Take now <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* KPI CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mb-3">
              <ClipboardList className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-gray-900 tracking-tight mb-0.5">{stats.pendingAssessments || 0}</div>
            <div className="text-xs font-semibold text-gray-700">Pending</div>
            <div className="text-xs text-gray-400 mt-0.5">{stats.completedAssessments || 0} completed</div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center mb-3">
              <Award className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <div className="text-2xl font-bold text-gray-900 tracking-tight">{stats.avgScore || 0}%</div>
              {trendDir === 'up' && <TrendingUp className="w-4 h-4 text-emerald-500" />}
              {trendDir === 'down' && <TrendingDown className="w-4 h-4 text-red-400" />}
            </div>
            <div className="text-xs font-semibold text-gray-700">Avg Score</div>
            <div className="text-xs text-gray-400 mt-0.5">{periodLabel}</div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center mb-3">
              <Target className="w-5 h-5 text-violet-600" />
            </div>
            <div className="text-2xl font-bold text-gray-900 tracking-tight mb-0.5">{stats.competenciesAssessed || 0}</div>
            <div className="text-xs font-semibold text-gray-700">Competencies</div>
            <div className="text-xs text-gray-400 mt-0.5">Assessed overall</div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center mb-3">
              <Calendar className="w-5 h-5 text-amber-600" />
            </div>
            <div className="text-2xl font-bold text-gray-900 tracking-tight mb-0.5">{stats.periodResultCount || 0}</div>
            <div className="text-xs font-semibold text-gray-700">Completed</div>
            <div className="text-xs text-gray-400 mt-0.5">{periodLabel}</div>
          </div>
        </div>

        {/* MAIN CONTENT: Chart + Pending */}
        <div className="grid lg:grid-cols-3 gap-5">

          {/* Score Trend Chart */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Score Progress</h3>
                <p className="text-xs text-gray-400 mt-0.5">Your assessment scores · {periodLabel}</p>
              </div>
              {stats.avgScore > 0 && (
                <div className={`text-xs font-semibold px-2.5 py-1 rounded-full
                  ${stats.avgScore >= 75 ? 'bg-emerald-50 text-emerald-600' : stats.avgScore >= 55 ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}
                >
                  Avg {stats.avgScore}%
                </div>
              )}
            </div>
            {trend.filter(t => t.score !== null).length === 0 ? (
              <div className="h-44 flex flex-col items-center justify-center gap-2 text-gray-300">
                <BookOpen className="w-8 h-8" />
                <p className="text-xs">No assessment data for this period</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trend.filter(t => t.score !== null)} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="gEmp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#C8102E" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#C8102E" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke="#C8102E"
                    strokeWidth={2.5}
                    fill="url(#gEmp)"
                    dot={{ r: 4, fill: '#C8102E', strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: '#C8102E' }}
                    connectNulls={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Pending Assessments */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Pending</h3>
                <p className="text-xs text-gray-400 mt-0.5">Awaiting your response</p>
              </div>
              {pendingAssessments.length > 0 && (
                <span className="w-6 h-6 bg-brand-red text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {pendingAssessments.length}
                </span>
              )}
            </div>
            <div className="flex-1 space-y-2">
              {pendingAssessments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <CheckCircle className="w-8 h-8 text-emerald-300" />
                  <p className="text-xs text-gray-400">All done! ✓</p>
                </div>
              ) : (
                pendingAssessments.map((a, i) => (
                  <div
                    key={i}
                    onClick={() => nav(`/assessments/${a._id}`)}
                    className="p-3 rounded-xl border border-gray-100 hover:border-brand-red/30 hover:bg-red-50/30 cursor-pointer transition-all group"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-brand-red/10 rounded-lg flex items-center justify-center flex-shrink-0">
                        <ClipboardList className="w-3.5 h-3.5 text-brand-red" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800 truncate">
                          {a.description || a.competencyId?.name || 'Assessment'}
                        </p>
                        <p className="text-xs text-gray-400">
                          {a.type}{a.endDate ? ` · Due ${new Date(a.endDate).toLocaleDateString()}` : ''}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-brand-red transition-colors flex-shrink-0" />
                    </div>
                  </div>
                ))
              )}
            </div>
            <button
              onClick={() => nav('/assessments')}
              className="mt-3 text-xs font-semibold text-brand-red hover:underline flex items-center gap-1 justify-center"
            >
              View all assessments <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* COMPETENCY PROGRESS */}
        {competencyProgress.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Competency Progress</h3>
                <p className="text-xs text-gray-400 mt-0.5">Your performance across all competencies</p>
              </div>
              <button onClick={() => nav('/results')} className="text-xs font-semibold text-brand-red hover:underline flex items-center gap-1">
                Full history <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {competencyProgress.slice(0, 6).map((c, i) => {
                const levelCfg = LEVEL_CONFIG[c.latestLevel];
                const catColor = CATEGORY_COLORS[c.category] || '#6366f1';
                return (
                  <div key={i} className="p-4 rounded-xl border border-gray-100 hover:border-gray-200 transition-all">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800 truncate">{c.name}</p>
                        <p className="text-xs mt-0.5" style={{ color: catColor }}>{c.category}</p>
                      </div>
                      {c.latestLevel && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ml-2 flex-shrink-0 ${levelCfg?.badge || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                          {c.latestLevel}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg font-bold text-gray-900">{c.latestScore}%</span>
                      {c.bestScore > c.latestScore && (
                        <span className="text-xs text-emerald-600">Best: {c.bestScore}%</span>
                      )}
                    </div>
                    <ScoreBar value={c.latestScore} />
                    <p className="text-xs text-gray-400 mt-1.5">{c.attempts} attempt{c.attempts !== 1 ? 's' : ''}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* BOTTOM: Recent Results + Supervisor */}
        <div className="grid lg:grid-cols-3 gap-5">

          {/* Recent Results */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Recent Results</h3>
                <p className="text-xs text-gray-400 mt-0.5">Latest finalized assessments</p>
              </div>
            </div>
            {recentResults.length === 0 ? (
              <div className="text-center py-8 text-gray-300 text-xs">No results yet</div>
            ) : (
              <div className="space-y-2">
                {recentResults.map((r, i) => {
                  const levelCfg = LEVEL_CONFIG[r.level];
                  return (
                    <div key={i} className="flex items-center gap-4 p-3 rounded-xl border border-gray-50 hover:border-gray-100 transition-all">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: `${levelCfg?.color}15` }}>
                        <span className="text-sm font-bold" style={{ color: levelCfg?.color || '#64748b' }}>
                          {r.finalScore}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold text-gray-800 truncate">
                            {r.competencyId?.name || 'Competency'}
                          </p>
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full border ${levelCfg?.badge || 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                            {r.level}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">
                          {r.assessmentId?.description || ''} · {r.assessmentId?.type || ''}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-bold text-gray-900">{r.finalScore}%</div>
                        <div className="text-xs text-gray-400">
                          {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sidebar: Supervisor + Level Summary */}
          <div className="space-y-3">
            {/* Level summary */}
            {Object.keys(stats.levelCounts || {}).length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <h3 className="text-xs font-bold text-gray-700 mb-3 uppercase tracking-wider">Level Summary</h3>
                <div className="space-y-2.5">
                  {['Expert', 'Advanced', 'Intermediate', 'Basic'].map(level => {
                    const count = stats.levelCounts?.[level] || 0;
                    const cfg = LEVEL_CONFIG[level];
                    if (count === 0) return null;
                    return (
                      <div key={level} className="flex items-center gap-2.5">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0`} style={{ background: cfg.color }} />
                        <span className="text-xs text-gray-600 flex-1">{level}</span>
                        <span className="text-xs font-bold text-gray-900">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Supervisor card */}
            {supervisor && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <h3 className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">Your Supervisor</h3>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-gray-600">
                      {supervisor.name?.charAt(0)?.toUpperCase() || '?'}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{supervisor.name}</p>
                    <p className="text-xs text-gray-400 truncate">{supervisor.position || supervisor.email}</p>
                    {supervisor.department && (
                      <p className="text-xs text-gray-400 truncate">{supervisor.department}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}


