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
  Expert:       { color: '#C8102E', bg: 'bg-brand-red',   badge: 'bg-brand-red text-white border-brand-red',       stars: 4 },
  Advanced:     { color: '#111827', bg: 'bg-brand-black', badge: 'bg-brand-black text-white border-brand-black',   stars: 3 },
  Intermediate: { color: '#4B5563', bg: 'bg-gray-200',    badge: 'bg-gray-200 text-gray-800 border-gray-400',      stars: 2 },
  Basic:        { color: '#9CA3AF', bg: 'bg-gray-100',    badge: 'bg-gray-100 text-gray-600 border-gray-300',      stars: 1 },
};

const CATEGORY_COLORS = {
  'Leadership':    '#C8102E',
  'Technical':     '#4B5563',
  'Communication': '#111827',
  'Management':    '#6B7280',
  'Innovation':    '#9CA3AF',
};

const ScoreBar = ({ value, max = 100 }) => {
  const pct = Math.round((value / max) * 100);
  const color = pct >= 80 ? '#111827' : pct >= 60 ? '#4B5563' : pct >= 40 ? '#6B7280' : '#C8102E';
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

  useEffect(() => { load(period); }, [period, load]);

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

  const {
    stats = {}, pendingAssessments = [], 
    competencyProgress = [], charts = {}, supervisor, nextDeadline
  } = data || {};

  const periodLabel = PERIOD_OPTIONS.find(p => p.key === period)?.full || '';

  // Derive trend direction for the avg score card only
  const trend = charts.trend || [];
  const lastTwo = trend.filter(t => t.score !== null).slice(-2);
  const trendDir = lastTwo.length === 2
    ? lastTwo[1].score > lastTwo[0].score ? 'up'
      : lastTwo[1].score < lastTwo[0].score ? 'down' : 'flat'
    : 'flat';

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-gray-50 overflow-hidden">
      {/* Ambient glow - fixed */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-brand-red/4 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -left-10 w-48 h-48 bg-gray-500/4 rounded-full blur-3xl" />
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-6 lg:p-8 space-y-5 max-w-screen-xl mx-auto">

          {/* Sticky Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 sticky top-0 bg-gray-50 z-10 pb-2">
            <div>
              {/* Welcome */}
              <div className="flex items-center gap-2.5 mb-1">
                <h1 className="text-xl  font-bold text-brand-black">
                  Welcome back, {user?.name?.split(' ')[0]} 👋
                </h1>
                {refreshing && <div className="w-4 h-4 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />}
              </div>
              <p className="text-sm text-gray-400">
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
              <button 
                onClick={() => load(period, true)} 
                className="w-9 h-9 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 shadow-sm"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Deadline Banner - Sticky but scrolls */}
          {nextDeadline && nextDeadline.daysLeft <= 3 && (
            <div className={`rounded-xl px-4 py-3 flex items-center gap-3 border
              ${nextDeadline.daysLeft <= 0 ? 'bg-red-50 border-red-200' : 'bg-gray-100 border-gray-300'}`}>
              <Clock className={`w-4 h-4 flex-shrink-0 ${nextDeadline.daysLeft <= 0 ? 'text-red-500' : 'text-gray-500'}`} />
              <p className={`text-sm font-medium ${nextDeadline.daysLeft <= 0 ? 'text-red-700' : 'text-gray-700'}`}>
                {nextDeadline.daysLeft <= 0
                  ? `Overdue: "${nextDeadline.name}" — submit as soon as possible`
                  : `"${nextDeadline.name}" is due in ${nextDeadline.daysLeft} day${nextDeadline.daysLeft !== 1 ? 's' : ''}`
                }
              </p>
              <button 
                onClick={() => nav(`/assessments`)} 
                className="ml-auto text-xs font-semibold text-brand-red hover:underline flex-shrink-0 flex items-center gap-1"
              >
                Take now <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* KPI CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <div className="text-2xl  font-bold text-brand-black tracking-tight mb-0.5">{stats.pendingAssessments || 0}</div>
              <div className="text-xs font-semibold text-gray-700">Pending</div>
              <div className="text-xs text-gray-400 mt-0.5">{stats.completedAssessments || 0} completed</div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-1.5 mb-0.5">
                <div className="text-2xl  font-bold text-brand-black tracking-tight">{stats.avgScore || 0}%</div>
                {trendDir === 'up' && <TrendingUp className="w-4 h-4 text-gray-700" />}
                {trendDir === 'down' && <TrendingDown className="w-4 h-4 text-red-400" />}
              </div>
              <div className="text-xs font-semibold text-gray-700">Avg Score</div>
              <div className="text-xs text-gray-400 mt-0.5">{periodLabel}</div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <div className="text-2xl  font-bold text-brand-black tracking-tight mb-0.5">{stats.competenciesAssessed || 0}</div>
              <div className="text-xs font-semibold text-gray-700">Competencies</div>
              <div className="text-xs text-gray-400 mt-0.5">Assessed overall</div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <div className="text-2xl  font-bold text-brand-black tracking-tight mb-0.5">{stats.periodResultCount || 0}</div>
              <div className="text-xs font-semibold text-gray-700">Completed</div>
              <div className="text-xs text-gray-400 mt-0.5">{periodLabel}</div>
            </div>
          </div>

          {/* Two Column Layout: Pending Assessments (left) and Level Distribution (right) */}
          <div className="grid lg:grid-cols-2 gap-5">
            {/* Pending Assessments - Left Column */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 h-fit">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Pending Assessments</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Awaiting your response</p>
                </div>
                {pendingAssessments.length > 0 && (
                  <span className="w-8 h-8 bg-brand-red text-white text-sm font-bold rounded-full flex items-center justify-center">
                    {pendingAssessments.length}
                  </span>
                )}
              </div>
              
              {pendingAssessments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <CheckCircle className="w-12 h-12 text-gray-400" />
                  <p className="text-sm text-gray-500">All caught up! No pending assessments.</p>
                  
                </div>
              ) : (
                <>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                    {pendingAssessments.map((a, i) => (
                      <div
                        key={i}
                        onClick={() => nav('/assessments')}
                        className="p-3 rounded-xl border border-gray-100 hover:border-brand-red/30 hover:bg-red-50/30 cursor-pointer transition-all group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-brand-red/10 rounded-xl flex items-center justify-center flex-shrink-0">
                            <ClipboardList className="w-5 h-5 text-brand-red" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate group-hover:text-brand-red transition-colors">
                              {a.description || a.competencyId?.name || 'Assessment'}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full">
                                {a.type}
                              </span>
                              {a.endDate && (
                                <span className="text-xs text-gray-400 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  Due {new Date(a.endDate).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-brand-red transition-colors flex-shrink-0" />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 text-right">
                    <button
                      onClick={() => nav('/assessments')}
                      className="text-sm font-semibold text-brand-red hover:underline flex items-center gap-1 justify-end"
                    >
                      View all assessments <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Level Distribution - Right Column */}
            {Object.keys(stats.levelCounts || {}).length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 h-fit">
                <h3 className="text-sm font-bold text-gray-900 mb-4">Level Distribution</h3>
                <div className="grid grid-cols-4 gap-4">
                  {['Expert', 'Advanced', 'Intermediate', 'Basic'].map(level => {
                    const count = stats.levelCounts?.[level] || 0;
                    const cfg = LEVEL_CONFIG[level];
                    if (count === 0) return null;
                    return (
                      <div key={level} className="text-center p-4 rounded-xl border border-gray-100">
                        <div className="w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center" style={{ background: `${cfg.color}15` }}>
                          <span className="text-lg font-bold" style={{ color: cfg.color }}>{count}</span>
                        </div>
                        <p className="text-sm font-semibold text-gray-700">{level}</p>
                        <p className="text-xs text-gray-400 mt-1">assessments</p>
                      </div>
                    );
                  })}
                </div>
                
                {/* Supervisor card integrated below level distribution */}
                {supervisor && (
                  <div className="mt-5 pt-5 border-t border-gray-100">
                    <h3 className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">Your Supervisor</h3>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl flex items-center justify-center flex-shrink-0">
                        <span className="text-lg font-bold text-gray-600">
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
                    <button 
                      onClick={() => nav('/feedback')}
                      className="mt-4 w-full py-2 text-xs font-semibold text-brand-red border border-brand-red/30 rounded-lg hover:bg-brand-red/5 transition-colors"
                    >
                      Provide feedback
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}