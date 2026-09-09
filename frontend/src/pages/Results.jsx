import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  TrendingUp, CheckCircle2, Download, ChevronLeft, ChevronRight,
  Award, User, Users, Scale, Calendar, Filter, X, FileText,
  SlidersHorizontal, Eye, XCircle, Info, ClipboardList, ChevronDown,
  ChevronUp, AlertCircle, HelpCircle, Hash, Minus, ListChecks,
  Shield, Search, BarChart3, Layers, Building2, Briefcase,
  Target, Clock, RefreshCw, SortAsc, SortDesc
} from 'lucide-react';
import api from '../utils/api';

// â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const formatAnswer = (answer, questionType) => {
  if (answer === null || answer === undefined) return 'â€”';
  const type = (questionType || '').toLowerCase();
  if (typeof answer === 'string' || typeof answer === 'number') {
    if (type === 'rating') return `${answer} / 5`;
    if (type === 'truefalse') return answer === 'true' || answer === true ? 'True' : 'False';
    return String(answer);
  }
  if (Array.isArray(answer)) {
    if (type === 'ordering') return answer.map((item, idx) => `${idx + 1}. ${item}`).join(' â†’ ');
    if (type === 'matching') return answer.map(p => `${p.left} â†’ ${p.right}`).join('; ');
    return answer.join(', ');
  }
  if (typeof answer === 'object') {
    const entries = Object.entries(answer);
    if (entries.length === 0) return 'â€”';
    return entries.map(([k, v]) => `${k} â†’ ${v}`).join('; ');
  }
  return String(answer);
};

const LEVEL_COLORS = {
  Basic: 'bg-amber-100 text-amber-700 border-amber-200',
  Intermediate: 'bg-orange-100 text-orange-700 border-orange-200',
  Advanced: 'bg-blue-100 text-blue-700 border-blue-200',
  Expert: 'bg-green-100 text-green-700 border-green-200',
};
const TYPE_COLORS = {
  SelfAssessment: 'bg-blue-100 text-blue-700',
  SupervisorOnly: 'bg-orange-100 text-orange-700',
  Combined: 'bg-purple-100 text-purple-700',
};
const PURPOSE_COLORS = [
  'bg-indigo-50 text-indigo-700', 'bg-cyan-50 text-cyan-700',
  'bg-teal-50 text-teal-700', 'bg-rose-50 text-rose-700',
  'bg-violet-50 text-violet-700', 'bg-fuchsia-50 text-fuchsia-700',
];

// â”€â”€â”€ small components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const LevelBadge = ({ level }) => (
  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${LEVEL_COLORS[level] || 'bg-gray-100 text-gray-600'}`}>
    {level}
  </span>
);

const TypeBadge = ({ type }) => {
  const label = type === 'SelfAssessment' ? 'Self' : type === 'SupervisorOnly' ? 'Supervisor' : 'Combined';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[type] || 'bg-gray-100 text-gray-600'}`}>{label}</span>;
};

const ScoreBar = ({ score, type }) => {
  const color = type === 'Combined' ? 'bg-purple-500' : type === 'SupervisorOnly' ? 'bg-orange-500' : 'bg-brand-red';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 bg-gray-100 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${Math.min(score, 100)}%` }} />
      </div>
      <span className="text-sm font-bold text-gray-900">{score.toFixed(1)}%</span>
    </div>
  );
};

// â”€â”€â”€ pagination â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const Paginator = ({ pagination, goToPage }) => {
  if (!pagination.total || pagination.total <= pagination.limit) return null;
  const tp = pagination.totalPages;
  const cp = pagination.page;
  const start = Math.max(1, Math.min(cp - 2, tp - 4));
  const pages = Array.from({ length: Math.min(5, tp) }, (_, i) => start + i);
  return (
    <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-3 border-t border-gray-100">
      <p className="text-sm text-gray-500">Showing {(cp - 1) * pagination.limit + 1}â€“{Math.min(cp * pagination.limit, pagination.total)} of <strong>{pagination.total}</strong></p>
      <div className="flex items-center gap-1">
        <button onClick={() => goToPage(cp - 1)} disabled={cp === 1} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"><ChevronLeft className="w-4 h-4" /></button>
        {pages.map(p => <button key={p} onClick={() => goToPage(p)} className={`w-9 h-9 rounded-lg text-sm font-medium ${cp === p ? 'bg-brand-red text-white' : 'border border-gray-200 text-gray-700 hover:bg-gray-50'}`}>{p}</button>)}
        <button onClick={() => goToPage(cp + 1)} disabled={cp === tp} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"><ChevronRight className="w-4 h-4" /></button>
      </div>
    </div>
  );
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MAIN COMPONENT
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export default function Results() {
  const { user, isAdmin } = useAuth();
  const { show } = useToast();
  const nav = useNavigate();

  // â”€â”€ filter options loaded from API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [filterOptions, setFilterOptions] = useState({
    departments: [], positions: [], competencies: [], assessments: [],
    levels: ['Basic', 'Intermediate', 'Advanced', 'Expert'],
    assessmentTypes: ['SelfAssessment', 'SupervisorOnly', 'Combined'],
    targetGroups: ['managerial', 'non-managerial', 'common'],
    purposes: ['Career Development', 'Succession Planning', 'Performance Improvement', 'Training Needs Analysis', 'Promotion Readiness', 'Other'],
  });

  // â”€â”€ results state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [results, setResults] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });

  // â”€â”€ filters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    search: '', assessmentId: '', competencyId: '', department: '',
    position: '', level: '', status: '', assessmentType: '',
    targetGroup: '', purpose: '', dateFrom: '', dateTo: '',
    sortBy: 'createdAt', sortDir: 'desc',
  });
  const [pendingFilters, setPendingFilters] = useState({ ...filters });

  // â”€â”€ finalise state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [finalisingId, setFinalisingId] = useState(null);

  // â”€â”€ load filter options â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    api.get('/results/filter-options')
      .then(({ data }) => setFilterOptions(prev => ({ ...prev, ...data.data })))
      .catch(() => {});
  }, []);

  // â”€â”€ load results â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const loadResults = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: pagination.limit };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const { data } = await api.get('/results/filtered', { params });
      setResults(data.data.results || []);
      setStats(data.data.stats || null);
      setPagination(prev => ({
        ...prev, page,
        total: data.data.pagination.total,
        totalPages: data.data.pagination.totalPages,
      }));
    } catch {
      show('Failed to load results.', 'error');
    }
    setLoading(false);
  }, [filters, pagination.limit]);

  useEffect(() => { loadResults(1); }, [filters]);

  // â”€â”€ apply pending filters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const applyFilters = () => { setFilters({ ...pendingFilters }); };
  const clearFilters = () => {
    const empty = { search: '', assessmentId: '', competencyId: '', department: '', position: '', level: '', status: '', assessmentType: '', targetGroup: '', purpose: '', dateFrom: '', dateTo: '', sortBy: 'createdAt', sortDir: 'desc' };
    setPendingFilters(empty);
    setFilters(empty);
  };
  const activeFilterCount = Object.entries(filters).filter(([k, v]) => v && !['sortBy', 'sortDir'].includes(k)).length;

  // â”€â”€ open result detail page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const openDetail = (result) => {
    nav(`/results/${result._id}`);
  };

  // â”€â”€ Ref for the table header to handle sticky positioning â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const tableContainerRef = useRef(null);

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // RENDER â€” fixed outer shell, scrollable rows only
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    /* Full-height fixed container â€” fills whatever space the app shell gives */
    <div className="flex flex-col h-full overflow-hidden">

      {/* â”€â”€ Sticky top section (header + filters + stats + count bar) â”€â”€ */}
      <div className="flex-shrink-0 px-7 pt-7 pb-0  z-20 shadow-sm sticky top-0">

        {/* Page header */}
        <div className="flex justify-between items-start mb-3 flex-wrap gap-4">
          <div>
            <h1 className="text-xl  font-bold text-brand-black">
              {isAdmin ? 'Assessment Results' : 'My Results'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setPendingFilters({ ...filters }); setShowFilters(v => !v); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-semibold text-sm transition-all ${showFilters || activeFilterCount > 0 ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filters
              {activeFilterCount > 0 && <span className="w-5 h-5 rounded-full bg-brand-red text-white text-xs flex items-center justify-center">{activeFilterCount}</span>}
            </button>
            <button onClick={() => loadResults(pagination.page)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-semibold transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-900 flex items-center gap-2"><Filter className="w-4 h-4 text-brand-red" /> Filter Results</h3>
              <button onClick={() => setShowFilters(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {/* Search */}
              <div className="xl:col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="text" value={pendingFilters.search}
                    onChange={e => setPendingFilters(p => ({ ...p, search: e.target.value }))}
                    placeholder="Name, email, competency, assessment..."
                    className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red focus:border-transparent" />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Competency</label>
                <select value={pendingFilters.competencyId} onChange={e => setPendingFilters(p => ({ ...p, competencyId: e.target.value }))}
                  className="w-full h-9 px-3 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red">
                  <option value="">All Competencies</option>
                  {filterOptions.competencies.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>
              </div>
              {isAdmin && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Department</label>
                  <select value={pendingFilters.department} onChange={e => setPendingFilters(p => ({ ...p, department: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red">
                    <option value="">All Departments</option>
                    {filterOptions.departments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              )}
              {isAdmin && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Position</label>
                  <input type="text" value={pendingFilters.position}
                    onChange={e => setPendingFilters(p => ({ ...p, position: e.target.value }))}
                    placeholder="Filter by position..."
                    className="w-full h-9 px-3 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red" />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Proficiency Level</label>
                <select value={pendingFilters.level} onChange={e => setPendingFilters(p => ({ ...p, level: e.target.value }))}
                  className="w-full h-9 px-3 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red">
                  <option value="">All Levels</option>
                  {filterOptions.levels.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Assessment Type</label>
                <select value={pendingFilters.assessmentType} onChange={e => setPendingFilters(p => ({ ...p, assessmentType: e.target.value }))}
                  className="w-full h-9 px-3 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red">
                  <option value="">All Types</option>
                  <option value="SelfAssessment">Self Assessment</option>
                  <option value="SupervisorOnly">Supervisor Only</option>
                  <option value="Combined">Combined</option>
                </select>
              </div>
              {isAdmin && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Target Group</label>
                  <select value={pendingFilters.targetGroup} onChange={e => setPendingFilters(p => ({ ...p, targetGroup: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red">
                    <option value="">All Groups</option>
                    <option value="managerial">Managerial</option>
                    <option value="non-managerial">Non-Managerial</option>
                    <option value="common">Common</option>
                  </select>
                </div>
              )}
              {isAdmin && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Assessment Purpose</label>
                  <select value={pendingFilters.purpose} onChange={e => setPendingFilters(p => ({ ...p, purpose: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red">
                    <option value="">All Purposes</option>
                    {filterOptions.purposes.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">From Date</label>
                <input type="date" value={pendingFilters.dateFrom}
                  onChange={e => setPendingFilters(p => ({ ...p, dateFrom: e.target.value }))}
                  className="w-full h-9 px-3 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">To Date</label>
                <input type="date" value={pendingFilters.dateTo}
                  onChange={e => setPendingFilters(p => ({ ...p, dateTo: e.target.value }))}
                  className="w-full h-9 px-3 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Sort By</label>
                <div className="flex gap-1.5">
                  <select value={pendingFilters.sortBy} onChange={e => setPendingFilters(p => ({ ...p, sortBy: e.target.value }))}
                    className="flex-1 h-9 px-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red">
                    <option value="createdAt">Date</option>
                    <option value="score">Score</option>
                    <option value="level">Level</option>
                  </select>
                  <button onClick={() => setPendingFilters(p => ({ ...p, sortDir: p.sortDir === 'asc' ? 'desc' : 'asc' }))}
                    className="h-9 w-9 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50">
                    {pendingFilters.sortDir === 'asc' ? <SortAsc className="w-4 h-4 text-gray-600" /> : <SortDesc className="w-4 h-4 text-gray-600" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Active filter chips */}
            {activeFilterCount > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-2">
                <span className="text-xs text-gray-500 self-center">Active:</span>
                {Object.entries(filters).filter(([k, v]) => v && !['sortBy', 'sortDir'].includes(k)).map(([key, val]) => (
                  <span key={key} className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-red/10 text-brand-red text-xs rounded-full font-medium">
                    {key === 'assessmentId' ? 'Assessment' : key === 'competencyId' ? 'Competency' : key.charAt(0).toUpperCase() + key.slice(1)}: {key === 'assessmentId' ? (filterOptions.assessments.find(a => a._id === val)?.description || val) : key === 'competencyId' ? (filterOptions.competencies.find(c => c._id === val)?.name || val) : val}
                    <button onClick={() => { const u = { ...filters, [key]: '' }; setFilters(u); setPendingFilters(u); }}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-gray-100">
              <button onClick={clearFilters} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-red-600 transition-colors">Clear All</button>
              <button onClick={applyFilters} className="px-5 py-2 bg-brand-red text-white rounded-lg text-sm font-semibold hover:bg-brand-red-dark transition-colors">Apply Filters</button>
            </div>
          </div>
        )}

        {/* Results count bar */}
        <div className="flex items-center justify-between py-3 border-t border-gray-100">
          <p className="text-sm text-gray-500">
            {loading ? 'Loading...' : <><strong className="text-gray-900">{pagination.total}</strong> result{pagination.total !== 1 ? 's' : ''}{activeFilterCount > 0 ? ' (filtered)' : ''}</>}
          </p>
          <select value={pagination.limit}
            onChange={e => setPagination(prev => ({ ...prev, limit: parseInt(e.target.value), page: 1 }))}
            className="h-8 px-2 rounded-lg border border-gray-200 text-sm text-gray-600 focus:ring-2 focus:ring-brand-red">
            {[10, 20, 30, 50, 100].map(n => <option key={n} value={n}>{n} per page</option>)}
          </select>
        </div>
      </div>

      {/* â”€â”€ Scrollable table area with sticky header inside â”€â”€ */}
      <div className="flex-1 overflow-hidden flex flex-col px-7 pb-7 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center flex-1">
            <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
          </div>
        ) : results.length === 0 ? (
          <div className="bg-white rounded-xl shadow-card border border-gray-100 flex-1 flex flex-col items-center justify-center">
            <TrendingUp className="w-14 h-14 text-gray-200 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No results found</h3>
            <p className="text-gray-400 text-sm max-w-sm text-center">{activeFilterCount > 0 ? 'Try adjusting your filters to see more results.' : 'No assessment results are available yet.'}</p>
            {activeFilterCount > 0 && <button onClick={clearFilters} className="mt-4 text-sm text-brand-red font-semibold hover:underline">Clear all filters</button>}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-card border border-gray-100 flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* Table with sticky header - using a nested structure to ensure proper scrolling */}
            <div className="flex-1 overflow-auto" ref={tableContainerRef}>
              <table className="w-full border-collapse">
                {/* Sticky column headers - now sticky within the scrollable container */}
                <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                  <tr>
                    {isAdmin && <>
                      <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Employee</th>
                      
                    </>}
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Competency</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Assessment</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Score</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Level</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Date</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                {/* Scrollable rows */}
                <tbody className="divide-y divide-gray-50">
                  {results.map(result => (
                    <tr key={result._id} className="hover:bg-gray-50/70 transition-colors">
                      {isAdmin && <>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-red to-red-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                              {(result.userName || '?').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-semibold text-sm text-gray-900 whitespace-nowrap">{result.userName}</div>
                              <div className="text-xs text-gray-400 whitespace-nowrap">{result.userPosition || result.userDepartment}</div>
                            </div>
                          </div>
                        </td>
                      </>}
                      <td className="px-5 py-4">
                        <div className="font-medium text-sm text-gray-900 whitespace-nowrap">{result.competencyName}</div>
                        {result.assessmentDescription && result.assessmentDescription !== 'N/A' && (
                          <div className="text-xs text-gray-400 whitespace-nowrap max-w-[220px] truncate">{result.assessmentDescription}</div>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1">
                          <TypeBadge type={result.assessmentType} />
                          {result.targetGroup && result.targetGroup !== 'N/A' && (
                            <span className="text-xs text-gray-400 capitalize whitespace-nowrap">{result.targetGroup.replace('-', ' ')}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <ScoreBar score={result.finalScore} type={result.assessmentType} />
                      </td>
                      <td className="px-5 py-4"><LevelBadge level={result.level} /></td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5 text-xs text-gray-500 whitespace-nowrap">
                          <Calendar className="w-3.5 h-3.5" />
                          {result.formattedDate}
                        </div>
                      </td>
                    
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <button onClick={() => openDetail(result)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors">
                            <Eye className="w-3.5 h-3.5" /> View Result
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination â€” fixed at bottom of the card */}
            <div className="flex-shrink-0 px-5 py-3 border-t border-gray-100 bg-white">
              <Paginator pagination={pagination} goToPage={p => loadResults(p)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
