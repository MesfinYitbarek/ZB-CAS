import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../hooks/queries';
import {
  TrendingUp, CheckCircle2, Download, ChevronLeft, ChevronRight,
  Award, User, Users, Scale, Calendar, Filter, X, FileText,
  SlidersHorizontal, Eye, XCircle, Info, ClipboardList, ChevronDown,
  ChevronUp, AlertCircle, HelpCircle, Hash, Minus, ListChecks,
  Shield, Search, BarChart3, Layers, Building2, Briefcase,
  Target, Clock, RefreshCw, SortAsc, SortDesc
} from 'lucide-react';
import api from '../utils/api';

// ─── helpers ─────────────────────────────────────────────────────────────────
const formatAnswer = (answer, questionType) => {
  if (answer === null || answer === undefined) return '—';
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
    if (entries.length === 0) return '—';
    return entries.map(([k, v]) => `${k} â†’ ${v}`).join('; ');
  }
  return String(answer);
};

const LEVEL_COLORS = {
  Basic: 'bg-gray-100 text-gray-600 border-gray-300',
  Intermediate: 'bg-gray-200 text-gray-800 border-gray-400',
  Advanced: 'bg-brand-black text-white border-brand-black',
  Expert: 'bg-brand-red text-white border-brand-red',
};
const TYPE_COLORS = {
  SelfAssessment: 'bg-gray-200 text-gray-800',
  SupervisorOnly: 'bg-brand-black text-white',
  Combined: 'bg-brand-red text-white',
};
const PURPOSE_COLORS = [
  'bg-gray-100 text-gray-700', 'bg-gray-100 text-gray-700',
  'bg-gray-100 text-gray-700', 'bg-red-50 text-red-700',
  'bg-gray-100 text-gray-700', 'bg-gray-100 text-gray-700',
];

// ─── small components ─────────────────────────────────────────────────────────
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
  const color = type === 'Combined' ? 'bg-brand-red' : type === 'SupervisorOnly' ? 'bg-gray-500' : 'bg-brand-red';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 bg-gray-100 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${Math.min(score, 100)}%` }} />
      </div>
      <span className="text-sm font-bold text-gray-900">{score.toFixed(1)}%</span>
    </div>
  );
};

// ─── pagination ────────────────────────────────────────────────────────────────
const Paginator = ({ pagination, goToPage }) => {
  if (!pagination.total || pagination.total <= pagination.limit) return null;
  const tp = pagination.totalPages;
  const cp = pagination.page;
  const start = Math.max(1, Math.min(cp - 2, tp - 4));
  const pages = Array.from({ length: Math.min(5, tp) }, (_, i) => start + i);
  const from = (cp - 1) * pagination.limit + 1;
  const to = Math.min(cp * pagination.limit, pagination.total);
  return (
    <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
      <p className="text-sm text-gray-500">Showing {from} to {to} of {pagination.total}</p>
      <div className="flex items-center gap-1">
        <button onClick={() => goToPage(cp - 1)} disabled={cp === 1} className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50">
          <ChevronLeft className="w-4 h-4" /> Prev
        </button>
        {pages.map(p => <button key={p} onClick={() => goToPage(p)} className={`w-9 h-9 rounded-lg text-sm font-medium ${cp === p ? 'bg-brand-red text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>{p}</button>)}
        <button onClick={() => goToPage(cp + 1)} disabled={cp === tp} className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50">
          Next <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MAIN COMPONENT
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export default function Results() {
const { user, isAdmin } = useAuth();
  const nav = useNavigate();

  // ── filter options loaded from API ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const { data: filterOptionsData } = useQuery({
    queryKey: queryKeys.results.filterOptions,
    queryFn: async () => {
      const { data } = await api.get('/results/filter-options');
      return data.data;
    },
    staleTime: 5 * 60 * 1000,
  });
  const filterOptions = filterOptionsData || {
    departments: [], positions: [], competencies: [], assessments: [],
    levels: ['Basic', 'Intermediate', 'Advanced', 'Expert'],
    assessmentTypes: ['SelfAssessment', 'SupervisorOnly', 'Combined'],
    targetGroups: ['managerial', 'non-managerial', 'common'],
    purposes: ['Career Development', 'Succession Planning', 'Performance Improvement', 'Training Needs Analysis', 'Promotion Readiness', 'Other'],
  };

  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    search: '', assessmentId: '', competencyId: '', department: '',
    position: '', level: '', status: '', assessmentType: '',
    targetGroup: '', purpose: '', dateFrom: '', dateTo: '',
    sortBy: 'createdAt', sortDir: 'desc',
  });
  const [pendingFilters, setPendingFilters] = useState({ ...filters });
  const { data, isLoading: loading, refetch } = useQuery({
    queryKey: queryKeys.results.list({ page: pagination.page, limit: pagination.limit, ...filters }),
    queryFn: async () => {
      const params = { page: pagination.page, limit: pagination.limit };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const { data } = await api.get('/results/filtered', { params });
      return data.data;
    },
  });
  const results = data?.results || [];
  const stats = data?.stats || null;
  const total = data?.pagination?.total ?? pagination.total;
  const totalPages = data?.pagination?.totalPages ?? pagination.totalPages;

  // ── filters ───────────────────────────────────────────────────────────────
  // ── finalise state ────────────────────────────────────────────────────────
  const [finalisingId, setFinalisingId] = useState(null);

  

  // ── apply pending filters ─────────────────────────────────────────────────
  const applyFilters = () => { setFilters({ ...pendingFilters }); setPagination(prev => ({ ...prev, page: 1 })); };
  const clearFilters = () => {
    const empty = { search: '', assessmentId: '', competencyId: '', department: '', position: '', level: '', status: '', assessmentType: '', targetGroup: '', purpose: '', dateFrom: '', dateTo: '', sortBy: 'createdAt', sortDir: 'desc' };
    setPendingFilters(empty);
    setFilters(empty);
    setPagination(prev => ({ ...prev, page: 1 }));
  };
  const activeFilterCount = Object.entries(filters).filter(([k, v]) => v && !['sortBy', 'sortDir'].includes(k)).length;

  // ── open result detail page ─────────────────────────────────────────────
  const openDetail = (result) => {
    nav(`/results/${result._id}`);
  };

  // ── Ref for the table header to handle sticky positioning ─────────────────
  const tableContainerRef = useRef(null);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — fixed outer shell, scrollable rows only
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-7 h-[calc(100vh-3rem)] flex flex-col">

      {/* ── Sticky Header ── */}
      <div className="flex justify-between items-start mb-3 flex-shrink-0">
        <div>
          <h1 className="text-xl  font-bold text-brand-black">
            {isAdmin ? 'Assessment Results' : 'My Results'}
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => { setPendingFilters({ ...filters }); setShowFilters(v => !v); }}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border font-semibold text-sm transition-colors ${showFilters || activeFilterCount > 0 ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-gray-300 bg-white text-brand-black hover:bg-gray-50'}`}
          >
            <SlidersHorizontal className="w-3 h-3" />
            Filters
            {activeFilterCount > 0 && <span className="w-5 h-5 rounded-full bg-brand-red text-white text-xs flex items-center justify-center">{activeFilterCount}</span>}
          </button>
          <button onClick={() => refetch()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-brand-black hover:bg-gray-50 text-sm font-semibold transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

        {/* ── Sticky Filters row ── */}
        <div className="flex justify-between items-center gap-3 mb-5 flex-wrap flex-shrink-0">
          <p className="text-sm text-gray-500">
            {loading ? 'Loading...' : <><strong className="text-gray-900">{total}</strong> result{total !== 1 ? 's' : ''}{activeFilterCount > 0 ? ' (filtered)' : ''}</>}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Show:</span>
            <select value={pagination.limit}
              onChange={e => setPagination(prev => ({ ...prev, limit: parseInt(e.target.value), page: 1 }))}
              className="px-2 py-1 rounded-lg border border-gray-300 focus-brand text-sm">
              {[10, 20, 30, 50, 100].map(n => <option key={n} value={n}>{n} per page</option>)}
            </select>
          </div>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="bg-white rounded-xl shadow-card border border-gray-100 p-5 mb-5 flex-shrink-0">
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
                    className="w-full h-10 pl-10 pr-4 rounded-lg border border-gray-300 focus-brand text-sm" />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Competency</label>
                <select value={pendingFilters.competencyId} onChange={e => setPendingFilters(p => ({ ...p, competencyId: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm">
                  <option value="">All Competencies</option>
                  {filterOptions.competencies.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>
              </div>
              {isAdmin && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Department</label>
                  <select value={pendingFilters.department} onChange={e => setPendingFilters(p => ({ ...p, department: e.target.value }))}
                    className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm">
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
                    className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm" />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Proficiency Level</label>
                <select value={pendingFilters.level} onChange={e => setPendingFilters(p => ({ ...p, level: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm">
                  <option value="">All Levels</option>
                  {filterOptions.levels.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Assessment Type</label>
                <select value={pendingFilters.assessmentType} onChange={e => setPendingFilters(p => ({ ...p, assessmentType: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm">
                  <option value="">All Types</option>
                  <option value="SelfAssessment">Self Assessment</option>
                  <option value="SupervisorOnly">Supervisor Only</option>
                  <option value="Combined">Combined</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Result Status</label>
                <select value={pendingFilters.status} onChange={e => setPendingFilters(p => ({ ...p, status: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm">
                  <option value="">All Statuses</option>
                  <option value="FINAL">Taken</option>
                  <option value="PENDING">Not Taken</option>
                </select>
              </div>
              {isAdmin && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Target Group</label>
                  <select value={pendingFilters.targetGroup} onChange={e => setPendingFilters(p => ({ ...p, targetGroup: e.target.value }))}
                    className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm">
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
                    className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm">
                    <option value="">All Purposes</option>
                    {filterOptions.purposes.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">From Date</label>
                <input type="date" value={pendingFilters.dateFrom}
                  onChange={e => setPendingFilters(p => ({ ...p, dateFrom: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">To Date</label>
                <input type="date" value={pendingFilters.dateTo}
                  onChange={e => setPendingFilters(p => ({ ...p, dateTo: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Sort By</label>
                <div className="flex gap-1.5">
                  <select value={pendingFilters.sortBy} onChange={e => setPendingFilters(p => ({ ...p, sortBy: e.target.value }))}
                    className="flex-1 h-10 px-2 rounded-lg border border-gray-300 focus-brand text-sm">
                    <option value="createdAt">Date</option>
                    <option value="score">Score</option>
                    <option value="level">Level</option>
                  </select>
                  <button onClick={() => setPendingFilters(p => ({ ...p, sortDir: p.sortDir === 'asc' ? 'desc' : 'asc' }))}
                    className="h-10 w-10 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 flex-shrink-0">
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
                    <button onClick={() => { const u = { ...filters, [key]: '' }; setFilters(u); setPendingFilters(u); setPagination(prev => ({ ...prev, page: 1 })); }}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-gray-100">
              <button onClick={clearFilters} className="px-3 py-1 text-sm font-semibold text-gray-600 hover:text-red-600 transition-colors">Clear All</button>
              <button onClick={applyFilters} className="px-3 py-1 bg-brand-red text-white rounded-lg text-sm font-semibold hover:bg-brand-red-dark transition-colors">Apply Filters</button>
            </div>
          </div>
        )}

      {/* Table card */}
      <div className="bg-white rounded-xl shadow-card border border-gray-100 overflow-hidden flex flex-col flex-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center p-16 flex-1">
            <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="overflow-auto flex-1 scrollbar-none" ref={tableContainerRef}>
              <table className="w-full text-sm">
                {/* Sticky column headers - now sticky within the scrollable container */}
                <thead className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
                  <tr>
                    {isAdmin && <>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap bg-gray-50">Employee</th>
                      
                    </>}
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap bg-gray-50">Competency</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap bg-gray-50">Assessment</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap bg-gray-50">Score</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap bg-gray-50">Level</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap bg-gray-50">Date</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap bg-gray-50 text-right">Actions</th>
                  </tr>
                </thead>
                {/* Scrollable rows */}
                <tbody className="divide-y divide-gray-100">
                  {results.length === 0 && (
                    <tr>
                      <td colSpan={isAdmin ? 7 : 6} className="text-center py-16 text-gray-400">
                        <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p className="text-sm font-semibold text-gray-500">No results found</p>
                        <p className="text-xs mt-1">{activeFilterCount > 0 ? 'Try adjusting your filters to see more results.' : 'No assessment results are available yet.'}</p>
                        {activeFilterCount > 0 && <button onClick={clearFilters} className="mt-3 text-sm text-brand-red font-semibold hover:underline">Clear all filters</button>}
                      </td>
                    </tr>
                  )}
                  {results.map(result => (
                    <tr key={result._id} className="hover:bg-gray-50 transition-colors">
                      {isAdmin && <>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-red to-red-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                              {(result.userName || '?').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                            </div>
                            <div className="font-semibold text-sm text-brand-black whitespace-nowrap">{result.userName}</div>
                          </div>
                        </td>
                      </>}
                      <td className="px-4 py-2">
                        <div className="font-medium text-sm text-gray-900 whitespace-nowrap">{result.competencyName}</div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1">
                          {result.assessmentType}  /
                          {result.targetGroup && result.targetGroup !== 'N/A' && (
                            <span className="text-xs text-gray-400 capitalize whitespace-nowrap">{result.targetGroup.replace('-', ' ')}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        {result.notTaken ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200 whitespace-nowrap">Not Taken</span>
                        ) : (
                          <div className="font-medium text-sm text-gray-900 whitespace-nowrap">{result.finalScore}%</div>
                        )}
                      </td>
                      <td className="px-4 py-2">{result.notTaken ? '—' : result.level}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5 text-xs text-gray-500 whitespace-nowrap">
                          <Calendar className="w-3.5 h-3.5" />
                          {result.formattedDate}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                          {!result.notTaken && (
                            <button onClick={() => openDetail(result)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                              <Eye className="w-3.5 h-3.5" /> View Detail
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination — fixed at bottom of the card */}
            <div className="flex-shrink-0 px-4 py-3 border-t border-gray-100 bg-white">
              <Paginator pagination={{ ...pagination, total, totalPages }} goToPage={p => setPagination(prev => ({ ...prev, page: p }))} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
