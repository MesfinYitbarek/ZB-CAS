import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  Download, BarChart3, ChevronLeft, ChevronRight, FileText,
  FileSpreadsheet, Filter, X, User as UserIcon, ChevronDown,
  Search, Loader2, TrendingUp, TrendingDown, Award, Building2,
  Users, Target, Calendar, Layers, SlidersHorizontal, RefreshCw,
  BookOpen, ArrowUpRight, ArrowDownRight, Minus as MinusIcon,
  PieChart, Activity, Star, CheckCircle2
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  LineChart, Line, PieChart as RechartsPieChart, Pie, Cell, CartesianGrid, Area, AreaChart
} from 'recharts';
import api from '../utils/api';

const LEVEL_COLORS = { Basic: '#F59E0B', Intermediate: '#EA580C', Advanced: '#2563EB', Expert: '#16A34A' };
const LEVELS = ['Basic', 'Intermediate', 'Advanced', 'Expert'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ─── small helpers ────────────────────────────────────────────────────────────
const ScoreBar = ({ score, max = 100, color = '#C8102E' }) => (
  <div className="flex items-center gap-2">
    <div className="flex-1 bg-gray-100 rounded-full h-2">
      <div className="h-2 rounded-full transition-all" style={{ width: `${(score / max) * 100}%`, background: color }} />
    </div>
    <span className="text-sm font-bold text-gray-800 w-12 text-right">{score.toFixed(1)}%</span>
  </div>
);

const LevelBadge = ({ level }) => {
  const colors = { Basic: 'bg-amber-100 text-amber-700', Intermediate: 'bg-orange-100 text-orange-700', Advanced: 'bg-blue-100 text-blue-700', Expert: 'bg-green-100 text-green-700' };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${colors[level] || 'bg-gray-100 text-gray-600'}`}>{level}</span>;
};

const KpiCard = ({ label, value, icon: Icon, color, sub, trend }) => (
  <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100 flex items-start gap-4">
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
      <Icon className="w-6 h-6" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-brand-black truncate">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
    {trend !== undefined && (
      <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${trend > 0 ? 'bg-green-50 text-green-600' : trend < 0 ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-500'}`}>
        {trend > 0 ? <ArrowUpRight className="w-3 h-3" /> : trend < 0 ? <ArrowDownRight className="w-3 h-3" /> : <MinusIcon className="w-3 h-3" />}
        {Math.abs(trend)}%
      </div>
    )}
  </div>
);

const Paginator = ({ pagination, goToPage }) => {
  if (!pagination || pagination.total <= pagination.limit) return null;
  const tp = pagination.totalPages;
  const cp = pagination.page;
  const start = Math.max(1, Math.min(cp - 2, tp - 4));
  const pages = Array.from({ length: Math.min(5, tp) }, (_, i) => start + i);
  return (
    <div className="flex justify-between items-center pt-4 border-t border-gray-100">
      <p className="text-sm text-gray-500">Page {cp} of {tp}</p>
      <div className="flex items-center gap-1">
        <button onClick={() => goToPage(cp - 1)} disabled={cp === 1} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"><ChevronLeft className="w-4 h-4" /></button>
        {pages.map(p => <button key={p} onClick={() => goToPage(p)} className={`w-9 h-9 rounded-lg text-sm font-medium ${cp === p ? 'bg-brand-red text-white' : 'border border-gray-200 text-gray-700 hover:bg-gray-50'}`}>{p}</button>)}
        <button onClick={() => goToPage(cp + 1)} disabled={cp === tp} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"><ChevronRight className="w-4 h-4" /></button>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function Reports() {
  const { user, isAdmin } = useAuth();
  const { show } = useToast();

  // ── tab management ────────────────────────────────────────────────────────
  const tabs = isAdmin
    ? [
        { id: 'overview', label: 'Overview', icon: BarChart3 },
        { id: 'department', label: 'By Department', icon: Building2 },
        { id: 'competency', label: 'By Competency', icon: Layers },
        { id: 'individual', label: 'Individual', icon: UserIcon },
        { id: 'all', label: 'All Reports', icon: FileText },
      ]
    : [{ id: 'individual', label: 'My Reports', icon: UserIcon }];
  const [tab, setTab] = useState(isAdmin ? 'overview' : 'individual');

  // ── filter options ────────────────────────────────────────────────────────
  const [filterOptions, setFilterOptions] = useState({ departments: [], competencies: [], assessments: [], levels: [] });

  // ── shared filters ────────────────────────────────────────────────────────
  const [filters, setFilters] = useState({ department: '', competencyId: '', level: '', dateFrom: '', dateTo: '', employeeId: '', assessmentId: '' });
  const [showFilters, setShowFilters] = useState(false);
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  // ── data states ───────────────────────────────────────────────────────────
  const [stats, setStats] = useState(null);
  const [individual, setIndividual] = useState([]);
  const [allReports, setAllReports] = useState([]);
  const [deptSummary, setDeptSummary] = useState([]);
  const [heatmap, setHeatmap] = useState({});
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // ── employee selector (admin) ─────────────────────────────────────────────
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [empSearch, setEmpSearch] = useState('');
  const [showEmpDropdown, setShowEmpDropdown] = useState(false);
  const empRef = useRef(null);

  // ── pagination ────────────────────────────────────────────────────────────
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });

  // ── dept selector ─────────────────────────────────────────────────────────
  const [selDept, setSelDept] = useState('');

  // ── close dropdown on outside click ──────────────────────────────────────
  useEffect(() => {
    const h = (e) => { if (empRef.current && !empRef.current.contains(e.target)) setShowEmpDropdown(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // ── load filter options ────────────────────────────────────────────────────
  useEffect(() => {
    if (isAdmin) {
      api.get('/reports/filter-options').then(({ data }) => setFilterOptions(data.data)).catch(() => {});
      api.get('/reports/employees').then(({ data }) => setEmployees(data.data.employees)).catch(() => {});
    }
  }, [isAdmin]);

  // ── load overview stats ───────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const params = {};
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const { data } = await api.get('/reports/stats', { params });
      setStats(data.data);
    } catch { show('Failed to load stats.', 'error'); }
    setLoading(false);
  }, [filters, isAdmin]);

  // ── load individual reports ───────────────────────────────────────────────
  const loadIndividual = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const targetId = selectedEmployee?._id || user._id;
      const { data } = await api.get(`/reports/individual/${targetId}`, {
        params: { page, limit: pagination.limit, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) },
      });
      setIndividual(data.data.reports || []);
      if (data.data.pagination) setPagination(prev => ({ ...prev, page, total: data.data.pagination.total, totalPages: Math.ceil(data.data.pagination.total / prev.limit) }));
    } catch { show('Failed to load individual reports.', 'error'); }
    setLoading(false);
  }, [selectedEmployee, user._id, filters, pagination.limit]);

  // ── load all reports (admin) ──────────────────────────────────────────────
  const loadAllReports = useCallback(async (page = 1) => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const params = { page, limit: pagination.limit };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const { data } = await api.get('/reports', { params });
      setAllReports(data.data.reports || []);
      const pg = data.data.pagination;
      setPagination(prev => ({ ...prev, page, total: pg.total, totalPages: Math.ceil(pg.total / prev.limit) }));
    } catch { show('Failed to load reports.', 'error'); }
    setLoading(false);
  }, [isAdmin, filters, pagination.limit]);

  // ── load heatmap ──────────────────────────────────────────────────────────
  const loadHeatmap = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const { data } = await api.get('/reports/heatmap');
      setHeatmap(data.data.heatmap);
    } catch {}
  }, [isAdmin]);

  // ── load dept summary ─────────────────────────────────────────────────────
  useEffect(() => {
    if (isAdmin && selDept && tab === 'department') {
      api.get(`/reports/department/${selDept}`).then(({ data }) => setDeptSummary(data.data.summary)).catch(() => {});
    }
  }, [selDept, isAdmin, tab]);

  // ── trigger loads on tab / filter change ─────────────────────────────────
  useEffect(() => {
    if (tab === 'overview') loadStats();
    else if (tab === 'individual') loadIndividual(1);
    else if (tab === 'all') loadAllReports(1);
    else if (tab === 'competency') { loadStats(); loadHeatmap(); }
    else if (tab === 'department') loadHeatmap();
  }, [tab, filters, selectedEmployee]);

  // ── export ────────────────────────────────────────────────────────────────
  const exportReport = async (format, type = 'filtered') => {
    setExporting(true);
    try {
      const params = {};
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      let url, filename;
      if (type === 'individual') {
        const targetId = selectedEmployee?._id || user._id;
        url = `/reports/export/individual/${targetId}/${format}`;
        filename = `report_${selectedEmployee ? `${selectedEmployee.firstName}_${selectedEmployee.lastName}` : 'my'}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      } else {
        url = `/reports/export/${format}`;
        filename = `reports_${new Date().toISOString().split('T')[0]}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      }
      const res = await api.get(url, { params, responseType: 'blob' });
      const blobUrl = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = blobUrl; a.download = filename; a.click();
      URL.revokeObjectURL(blobUrl);
      show(`Exported as ${format.toUpperCase()}.`, 'success');
    } catch (err) {
      show(err.response?.status === 404 ? 'No data found for export.' : 'Export failed.', 'error');
    }
    setExporting(false);
  };

  const clearFilters = () => setFilters({ department: '', competencyId: '', level: '', dateFrom: '', dateTo: '', employeeId: '', assessmentId: '' });

  // ── heatmap data ──────────────────────────────────────────────────────────
  const heatmapCompetencies = Object.keys(heatmap);
  const heatmapDepts = [...new Set(Object.values(heatmap).flatMap(arr => arr.map(d => d.department)))];
  const heatmapLookup = {};
  heatmapCompetencies.forEach(comp => { heatmap[comp]?.forEach(d => { if (!heatmapLookup[comp]) heatmapLookup[comp] = {}; heatmapLookup[comp][d.department] = d.avgScore; }); });
  const getHeatColor = (score) => {
    if (!score) return 'bg-gray-100 text-gray-400';
    if (score >= 80) return 'bg-green-500 text-white';
    if (score >= 65) return 'bg-blue-500 text-white';
    if (score >= 50) return 'bg-yellow-400 text-white';
    if (score >= 35) return 'bg-orange-500 text-white';
    return 'bg-red-500 text-white';
  };

  // ── trend data ────────────────────────────────────────────────────────────
  const trendChartData = (stats?.monthlyTrend || []).map(t => ({
    month: `${MONTH_NAMES[t._id.month - 1]} ${t._id.year}`,
    count: t.count,
    avgScore: parseFloat(t.avgScore.toFixed(1)),
  }));

  // ── level dist chart ──────────────────────────────────────────────────────
  const levelChartData = (stats?.levelDistribution || []).map(l => ({
    name: l._id, value: l.count, avgScore: parseFloat((l.avgScore || 0).toFixed(1)),
  }));

  // ── dept chart ─────────────────────────────────────────────────────────────
  const deptChartData = (stats?.departmentBreakdown || []).slice(0, 8).map(d => ({
    dept: (d._id || 'Unknown').length > 15 ? (d._id || 'Unknown').substring(0, 15) + '…' : (d._id || 'Unknown'),
    fullDept: d._id || 'Unknown',
    avgScore: parseFloat((d.avgScore || 0).toFixed(1)),
    count: d.count,
  }));

  // ── filteredEmployees ──────────────────────────────────────────────────────
  const filteredEmployees = employees.filter(e => {
    const q = empSearch.toLowerCase();
    return `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) || e.department?.toLowerCase().includes(q) || e.email?.toLowerCase().includes(q);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED FILTER PANEL
  // ─────────────────────────────────────────────────────────────────────────
  const FilterPanel = () => (
    <div className="bg-white rounded-xl shadow-card border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-900 flex items-center gap-2"><Filter className="w-4 h-4 text-brand-red" />Filter Reports</h3>
        <button onClick={() => setShowFilters(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {isAdmin && (
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Department</label>
            <select value={filters.department} onChange={e => setFilters(p => ({ ...p, department: e.target.value }))}
              className="w-full h-9 px-3 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red">
              <option value="">All Departments</option>
              {filterOptions.departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Competency</label>
          <select value={filters.competencyId} onChange={e => setFilters(p => ({ ...p, competencyId: e.target.value }))}
            className="w-full h-9 px-3 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red">
            <option value="">All Competencies</option>
            {filterOptions.competencies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Level</label>
          <select value={filters.level} onChange={e => setFilters(p => ({ ...p, level: e.target.value }))}
            className="w-full h-9 px-3 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red">
            <option value="">All Levels</option>
            {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">From Date</label>
          <input type="date" value={filters.dateFrom} onChange={e => setFilters(p => ({ ...p, dateFrom: e.target.value }))}
            className="w-full h-9 px-3 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">To Date</label>
          <input type="date" value={filters.dateTo} onChange={e => setFilters(p => ({ ...p, dateTo: e.target.value }))}
            className="w-full h-9 px-3 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red" />
        </div>
      </div>
      {activeFilterCount > 0 && (
        <div className="flex justify-end mt-4 pt-4 border-t border-gray-100">
          <button onClick={clearFilters} className="text-sm font-semibold text-brand-red hover:underline">Clear All Filters</button>
        </div>
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-7">
      {/* ── Header ── */}
      <div className="flex justify-between items-start mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-black">Reports & Analytics</h1>
          <p className="text-gray-500 mt-1">{isAdmin ? 'Comprehensive competency assessment reports and analytics.' : 'Your competency assessment history and progress.'}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <button onClick={() => setShowFilters(v => !v)}
              className={`flex items-center gap-2 px-4 py-2.5 border rounded-lg font-semibold text-sm transition-all ${showFilters || activeFilterCount > 0 ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
              <SlidersHorizontal className="w-4 h-4" />
              Filters
              {activeFilterCount > 0 && <span className="w-5 h-5 rounded-full bg-brand-red text-white text-xs flex items-center justify-center">{activeFilterCount}</span>}
            </button>
          )}
          <div className="flex items-center gap-1">
            <button onClick={() => exportReport('pdf', tab === 'individual' ? 'individual' : 'filtered')} disabled={exporting}
              className="flex items-center gap-2 px-3 py-2.5 border border-gray-300 rounded-l-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4 text-red-500" />}
              PDF
            </button>
            <button onClick={() => exportReport('excel', tab === 'individual' ? 'individual' : 'filtered')} disabled={exporting}
              className="flex items-center gap-2 px-3 py-2.5 border border-l-0 border-gray-300 rounded-r-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
              <FileSpreadsheet className="w-4 h-4 text-green-600" />
              Excel
            </button>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${tab === t.id ? 'bg-white text-brand-red shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {showFilters && isAdmin && <FilterPanel />}

      {loading ? (
        <div className="flex items-center justify-center p-20">
          <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* ════════════════════════════════════════════════════
              TAB: OVERVIEW
          ════════════════════════════════════════════════════ */}
          {tab === 'overview' && stats && (
            <div className="space-y-6">
              {/* KPI cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard label="Total Reports" value={stats.overall.total?.toLocaleString()} icon={FileText} color="bg-blue-50 text-blue-600" />
                <KpiCard label="Avg Score" value={`${stats.overall.avgScore || 0}%`} icon={TrendingUp} color="bg-green-50 text-green-600" sub={`Max: ${stats.overall.maxScore?.toFixed(1)}%`} />
                <KpiCard label="Employees Assessed" value={stats.overall.uniqueEmployees} icon={Users} color="bg-purple-50 text-purple-600" sub={`${stats.overall.uniqueDepts} departments`} />
                <KpiCard label="Competencies Covered" value={stats.overall.uniqueCompetencies} icon={Layers} color="bg-indigo-50 text-indigo-600" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Level distribution pie/bar */}
                <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
                  <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><PieChart className="w-4 h-4 text-brand-red" />Proficiency Level Distribution</h3>
                  {levelChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={levelChartData} barSize={40}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v, n) => [v, n === 'value' ? 'Count' : 'Avg Score']} />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {levelChartData.map((entry) => <Cell key={entry.name} fill={LEVEL_COLORS[entry.name] || '#888'} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <p className="text-center text-gray-400 py-8 text-sm">No data</p>}
                  <div className="flex justify-center gap-3 mt-2 flex-wrap">
                    {LEVELS.map(l => (
                      <div key={l} className="flex items-center gap-1.5 text-xs text-gray-600">
                        <div className="w-3 h-3 rounded-full" style={{ background: LEVEL_COLORS[l] }} />
                        {l}: {levelChartData.find(d => d.name === l)?.value || 0}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Monthly trend */}
                <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
                  <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Activity className="w-4 h-4 text-brand-red" />Monthly Trend (Last 12 Months)</h3>
                  {trendChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={trendChartData}>
                        <defs>
                          <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#C8102E" stopOpacity={0.15} />
                            <stop offset="95%" stopColor="#C8102E" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Area type="monotone" dataKey="avgScore" stroke="#C8102E" fill="url(#scoreGrad)" strokeWidth={2} name="Avg Score %" />
                        <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={false} name="Assessments" />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : <p className="text-center text-gray-400 py-8 text-sm">No trend data</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top performers */}
                <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
                  <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Star className="w-4 h-4 text-yellow-500" />Top Performers</h3>
                  <div className="space-y-3">
                    {(stats.topPerformers || []).map((p, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${i === 0 ? 'bg-yellow-400 text-white' : i === 1 ? 'bg-gray-300 text-gray-700' : i === 2 ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{p.name || 'Unknown'}</p>
                          <p className="text-xs text-gray-400 truncate">{p.dept || '—'} · {p.count} assessment{p.count !== 1 ? 's' : ''}</p>
                        </div>
                        <span className="text-sm font-bold text-green-600 flex-shrink-0">{parseFloat(p.avgScore.toFixed(1))}%</span>
                      </div>
                    ))}
                    {(!stats.topPerformers || stats.topPerformers.length === 0) && <p className="text-sm text-gray-400 text-center py-4">No data</p>}
                  </div>
                </div>

                {/* Needs support */}
                <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
                  <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><TrendingDown className="w-4 h-4 text-red-500" />Needs Development Support</h3>
                  <div className="space-y-3">
                    {(stats.bottomPerformers || []).map((p, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-red-400">{i + 1}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{p.name || 'Unknown'}</p>
                          <p className="text-xs text-gray-400 truncate">{p.dept || '—'} · {p.count} assessment{p.count !== 1 ? 's' : ''}</p>
                        </div>
                        <span className="text-sm font-bold text-red-500 flex-shrink-0">{parseFloat(p.avgScore.toFixed(1))}%</span>
                      </div>
                    ))}
                    {(!stats.bottomPerformers || stats.bottomPerformers.length === 0) && <p className="text-sm text-gray-400 text-center py-4">No data</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════
              TAB: BY DEPARTMENT
          ════════════════════════════════════════════════════ */}
          {tab === 'department' && (
            <div className="space-y-6">
              {/* Dept bar chart */}
              {stats && deptChartData.length > 0 && (
                <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
                  <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-brand-red" />Department Performance Comparison</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={deptChartData} barSize={30}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="dept" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v, n, p) => [`${v}%`, `Avg Score (${p.payload.count} reports)`]} labelFormatter={(l, payload) => payload?.[0]?.payload.fullDept || l} />
                      <Bar dataKey="avgScore" fill="#C8102E" radius={[4, 4, 0, 0]} name="Avg Score" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Dept selector + detail */}
              <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
                <div className="flex items-center gap-4 mb-5 flex-wrap">
                  <h3 className="font-bold text-gray-800">Department Deep-Dive</h3>
                  <select value={selDept} onChange={e => setSelDept(e.target.value)}
                    className="h-9 px-3 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red">
                    <option value="">— Select Department —</option>
                    {filterOptions.departments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                {selDept && deptSummary.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Competency</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Reports</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Avg Score</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider w-48">Distribution</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {deptSummary.map(row => (
                          <tr key={row.competencyName} className="hover:bg-gray-50/70">
                            <td className="px-4 py-3 font-medium text-gray-900">{row.competencyName}</td>
                            <td className="px-4 py-3 text-gray-600">{row.totalReports}</td>
                            <td className="px-4 py-3"><ScoreBar score={row.avgScore} /></td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                {LEVELS.map(l => row.levelDistribution[l] > 0 && (
                                  <span key={l} title={`${l}: ${row.levelDistribution[l]}`}
                                    className="text-xs px-1.5 py-0.5 rounded font-medium"
                                    style={{ background: `${LEVEL_COLORS[l]}20`, color: LEVEL_COLORS[l] }}>
                                    {l.charAt(0)}:{row.levelDistribution[l]}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : selDept ? (
                  <p className="text-center text-gray-400 py-8 text-sm">No data for this department.</p>
                ) : (
                  <p className="text-center text-gray-400 py-8 text-sm">Select a department to see detailed breakdown.</p>
                )}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════
              TAB: BY COMPETENCY / HEATMAP
          ════════════════════════════════════════════════════ */}
          {tab === 'competency' && (
            <div className="space-y-6">
              {/* Competency bar chart */}
              {stats && (stats.competencyBreakdown || []).length > 0 && (
                <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
                  <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-brand-red" />Competency Average Scores</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={stats.competencyBreakdown.slice(0, 10).map(c => ({ name: c._id?.length > 20 ? c._id.substring(0, 20) + '…' : c._id, score: parseFloat(c.avgScore.toFixed(1)), count: c.count }))} layout="vertical" barSize={18}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
                      <Tooltip formatter={(v) => [`${v}%`, 'Avg Score']} />
                      <Bar dataKey="score" fill="#C8102E" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Heatmap */}
              {heatmapCompetencies.length > 0 && heatmapDepts.length > 0 && (
                <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
                  <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2"><Layers className="w-4 h-4 text-brand-red" />Competency × Department Heatmap</h3>
                  <p className="text-xs text-gray-400 mb-4">Average score per competency per department</p>
                  <div className="overflow-x-auto">
                    <table className="text-xs min-w-max">
                      <thead>
                        <tr>
                          <th className="text-left px-2 py-2 text-gray-500 font-medium min-w-40">Competency</th>
                          {heatmapDepts.map(d => <th key={d} className="text-center px-2 py-2 text-gray-500 font-medium min-w-20">{d.length > 12 ? d.substring(0, 12) + '…' : d}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {heatmapCompetencies.map(comp => (
                          <tr key={comp} className="border-t border-gray-50">
                            <td className="px-2 py-1.5 font-medium text-gray-800 text-xs">{comp.length > 30 ? comp.substring(0, 30) + '…' : comp}</td>
                            {heatmapDepts.map(dept => {
                              const score = heatmapLookup[comp]?.[dept];
                              return (
                                <td key={dept} className="px-1 py-1 text-center">
                                  {score !== undefined ? (
                                    <div className={`inline-flex items-center justify-center w-14 h-7 rounded text-xs font-bold ${getHeatColor(score)}`} title={`${comp} / ${dept}: ${score}%`}>
                                      {score.toFixed(0)}%
                                    </div>
                                  ) : <div className="w-14 h-7 rounded bg-gray-50 inline-block" />}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center gap-3 mt-4">
                    <span className="text-xs text-gray-400">Legend:</span>
                    {[['≥80%', 'bg-green-500'], ['≥65%', 'bg-blue-500'], ['≥50%', 'bg-yellow-400'], ['≥35%', 'bg-orange-500'], ['<35%', 'bg-red-500']].map(([label, cls]) => (
                      <div key={label} className="flex items-center gap-1 text-xs text-gray-600">
                        <div className={`w-3 h-3 rounded ${cls}`} />{label}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════════════
              TAB: INDIVIDUAL
          ════════════════════════════════════════════════════ */}
          {tab === 'individual' && (
            <div className="space-y-5">
              {/* Employee selector (admin) */}
              {isAdmin && (
                <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
                  <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><UserIcon className="w-4 h-4 text-brand-red" />Select Employee</h3>
                  <div className="relative" ref={empRef}>
                    <button onClick={() => setShowEmpDropdown(v => !v)}
                      className="w-full flex items-center justify-between h-10 px-4 border border-gray-300 rounded-lg text-sm hover:border-brand-red/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-brand-red/10 flex items-center justify-center text-brand-red font-bold text-xs flex-shrink-0">
                          {selectedEmployee ? `${selectedEmployee.firstName?.charAt(0)}${selectedEmployee.lastName?.charAt(0)}` : user.name?.charAt(0) || '?'}
                        </div>
                        <span className="font-medium text-gray-800">
                          {selectedEmployee ? `${selectedEmployee.firstName} ${selectedEmployee.lastName} — ${selectedEmployee.department}` : `My Reports (${user.name})`}
                        </span>
                      </div>
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    </button>
                    {showEmpDropdown && (
                      <div className="absolute top-12 left-0 right-0 z-50 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
                        <div className="p-2 border-b border-gray-100">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input value={empSearch} onChange={e => setEmpSearch(e.target.value)} placeholder="Search employees..." autoFocus
                              className="w-full pl-9 pr-3 h-8 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-red" />
                          </div>
                        </div>
                        <div className="max-h-56 overflow-y-auto py-1">
                          <button onClick={() => { setSelectedEmployee(null); setShowEmpDropdown(false); setEmpSearch(''); loadIndividual(1); }}
                            className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 text-sm text-left">
                            <div className="w-7 h-7 rounded-full bg-brand-red/10 flex items-center justify-center text-brand-red font-bold text-xs">{user.name?.charAt(0)}</div>
                            <span>My Reports ({user.name})</span>
                          </button>
                          {filteredEmployees.map(emp => (
                            <button key={emp._id} onClick={() => { setSelectedEmployee(emp); setShowEmpDropdown(false); setEmpSearch(''); }}
                              className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 text-sm text-left">
                              <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold text-xs">{emp.firstName?.charAt(0)}</div>
                              <div>
                                <p className="font-medium text-gray-800">{emp.firstName} {emp.lastName}</p>
                                <p className="text-xs text-gray-400">{emp.department} · {emp.email}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {selectedEmployee && (
                    <div className="mt-3 flex items-center justify-between bg-blue-50 rounded-lg px-4 py-2.5">
                      <div className="text-sm text-blue-800 font-medium">Viewing: {selectedEmployee.firstName} {selectedEmployee.lastName} · {selectedEmployee.department}</div>
                      <button onClick={() => { setSelectedEmployee(null); loadIndividual(1); }} className="text-blue-600 hover:text-blue-800 text-xs font-semibold">Clear</button>
                    </div>
                  )}
                </div>
              )}

              {/* Individual reports table */}
              {individual.length === 0 ? (
                <div className="bg-white rounded-xl p-16 text-center shadow-card border border-gray-100">
                  <BookOpen className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-600 mb-2">No reports found</h3>
                  <p className="text-gray-400 text-sm">{isAdmin && !selectedEmployee ? 'Select an employee above to view their reports.' : 'No assessment reports are available yet.'}</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl shadow-card border border-gray-100 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-bold text-gray-800">{pagination.total} Report{pagination.total !== 1 ? 's' : ''}</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          {isAdmin && <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-600 uppercase tracking-wider">Employee</th>}
                          <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-600 uppercase tracking-wider">Competency</th>
                          <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-600 uppercase tracking-wider">Score</th>
                          <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-600 uppercase tracking-wider">Level</th>
                          <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-600 uppercase tracking-wider">Recommendation</th>
                          <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {individual.map(r => (
                          <tr key={r._id} className="hover:bg-gray-50/70 transition-colors">
                            {isAdmin && (
                              <td className="px-5 py-4">
                                <p className="font-semibold text-gray-900">{r.user?.name || '—'}</p>
                                <p className="text-xs text-gray-400">{r.user?.department || '—'}</p>
                              </td>
                            )}
                            <td className="px-5 py-4">
                              <p className="font-medium text-gray-900">{r.competencyName}</p>
                            </td>
                            <td className="px-5 py-4 w-40"><ScoreBar score={r.finalScore} /></td>
                            <td className="px-5 py-4"><LevelBadge level={r.level} /></td>
                            <td className="px-5 py-4 max-w-xs">
                              <p className="text-xs text-gray-500 line-clamp-2">{r.recommendation || '—'}</p>
                            </td>
                            <td className="px-5 py-4 text-xs text-gray-500 whitespace-nowrap">
                              <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />{r.generatedAt ? new Date(r.generatedAt).toLocaleDateString() : '—'}</div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-5 pb-4"><Paginator pagination={pagination} goToPage={loadIndividual} /></div>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════════════
              TAB: ALL REPORTS
          ════════════════════════════════════════════════════ */}
          {tab === 'all' && isAdmin && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-500"><strong className="text-gray-900">{pagination.total}</strong> reports</p>
                <select value={pagination.limit} onChange={e => setPagination(prev => ({ ...prev, limit: parseInt(e.target.value), page: 1 }))}
                  className="h-8 px-2 rounded-lg border border-gray-200 text-sm text-gray-600 focus:ring-2 focus:ring-brand-red">
                  {[20, 50, 100].map(n => <option key={n} value={n}>{n} per page</option>)}
                </select>
              </div>
              {allReports.length === 0 ? (
                <div className="bg-white rounded-xl p-16 text-center shadow-card border border-gray-100">
                  <FileText className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                  <p className="text-gray-400">No reports found matching the current filters.</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl shadow-card border border-gray-100 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-600 uppercase tracking-wider">Employee</th>
                          <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-600 uppercase tracking-wider">Department</th>
                          <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-600 uppercase tracking-wider">Competency</th>
                          <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-600 uppercase tracking-wider">Score</th>
                          <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-600 uppercase tracking-wider">Level</th>
                          <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {allReports.map(r => (
                          <tr key={r._id} className="hover:bg-gray-50/70">
                            <td className="px-5 py-3.5">
                              <p className="font-semibold text-gray-900">{r.user?.name || '—'}</p>
                              <p className="text-xs text-gray-400">{r.user?.position || '—'}</p>
                            </td>
                            <td className="px-5 py-3.5 text-gray-600 text-sm">{r.user?.department || '—'}</td>
                            <td className="px-5 py-3.5 font-medium text-gray-900">{r.competencyName}</td>
                            <td className="px-5 py-3.5 w-36"><ScoreBar score={r.finalScore} /></td>
                            <td className="px-5 py-3.5"><LevelBadge level={r.level} /></td>
                            <td className="px-5 py-3.5 text-xs text-gray-500 whitespace-nowrap">
                              <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />{r.generatedAt ? new Date(r.generatedAt).toLocaleDateString() : '—'}</div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-5 pb-4"><Paginator pagination={pagination} goToPage={p => loadAllReports(p)} /></div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
