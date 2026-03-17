import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  BarChart3, ChevronLeft, ChevronRight, FileText,
  FileSpreadsheet, X, User as UserIcon, ChevronDown,
  Search, Loader2, TrendingDown,
  Users, Layers, SlidersHorizontal,
  BookOpen, PieChart, ChevronUp,
  Briefcase, Sliders, RotateCcw, Building2, Calendar,
  Eye, Medal, AlertTriangle, ClipboardList, Target,
  Table2, GripVertical, RefreshCw
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  Cell, CartesianGrid
} from 'recharts';
import api from '../utils/api';

// ─── Constants ────────────────────────────────────────────────────────────────
const LEVEL_COLORS = { Basic: '#F59E0B', Intermediate: '#EA580C', Advanced: '#2563EB', Expert: '#16A34A' };
const LEVELS = ['Basic', 'Intermediate', 'Advanced', 'Expert'];

const PERIOD_OPTIONS = [
  { id: '1m', label: '1 Month' },
  { id: '3m', label: '3 Months' },
  { id: '6m', label: '6 Months' },
  { id: '1y', label: 'Yearly' },
  { id: 'all', label: 'All Time' },
];

const getPeriodDates = (period) => {
  if (period === 'all') return { dateFrom: '', dateTo: '' };
  const now = new Date();
  const from = new Date(now);
  if (period === '1m') from.setMonth(now.getMonth() - 1);
  else if (period === '3m') from.setMonth(now.getMonth() - 3);
  else if (period === '6m') from.setMonth(now.getMonth() - 6);
  else if (period === '1y') from.setFullYear(now.getFullYear() - 1);
  return {
    dateFrom: from.toISOString().split('T')[0],
    dateTo: now.toISOString().split('T')[0],
  };
};

const EMPTY_FILTERS = {
  employeeId: '', department: '', position: '', gender: '', employeeIdCode: '',
  assessmentId: '', assessmentType: '', purpose: '', targetGroup: '',
  assessmentStartFrom: '', assessmentStartTo: '', assessmentEndFrom: '', assessmentEndTo: '',
  competencyId: '', competencyCategory: '', competencyLevel: '',
  scoreMin: '', scoreMax: '', selfScoreMin: '', selfScoreMax: '',
  supervisorScoreMin: '', supervisorScoreMax: '',
  overallLevel: '', dateFrom: '', dateTo: '',
};

// ─── Tiny helpers ─────────────────────────────────────────────────────────────
const ScoreBar = ({ score }) => {
  const color = score >= 80 ? '#16A34A' : score >= 60 ? '#2563EB' : score >= 40 ? '#F59E0B' : '#ef4444';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div className="h-1.5 rounded-full" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-xs font-bold text-gray-800 w-10 text-right">{Number(score).toFixed(1)}%</span>
    </div>
  );
};

const ScoreBadge = ({ score }) => {
  const s = Number(score) || 0;
  const cls = s >= 80 ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    : s >= 60 ? 'bg-blue-50 text-blue-700 ring-blue-200'
    : s >= 40 ? 'bg-amber-50 text-amber-700 ring-amber-200'
    : 'bg-red-50 text-red-600 ring-red-200';
  return <span className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-bold ring-1 ${cls}`}>{s.toFixed(1)}%</span>;
};

const LevelBadge = ({ level }) => {
  const cls = {
    Expert: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Advanced: 'bg-blue-50 text-blue-700 border-blue-200',
    Intermediate: 'bg-amber-50 text-amber-700 border-amber-200',
    Basic: 'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cls[level] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
      {level || '—'}
    </span>
  );
};

const Paginator = ({ pagination, goToPage }) => {
  if (!pagination || pagination.total <= pagination.limit) return null;
  const tp = pagination.totalPages, cp = pagination.page;
  const start = Math.max(1, Math.min(cp - 2, tp - 4));
  const pages = Array.from({ length: Math.min(5, tp) }, (_, i) => start + i);
  return (
    <div className="flex justify-between items-center pt-4 border-t border-gray-100">
      <p className="text-sm text-gray-500">Page {cp} of {tp} · {pagination.total} total</p>
      <div className="flex items-center gap-1">
        <button onClick={() => goToPage(cp - 1)} disabled={cp === 1} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"><ChevronLeft className="w-4 h-4" /></button>
        {pages.map(p => <button key={p} onClick={() => goToPage(p)} className={`w-9 h-9 rounded-lg text-sm font-medium ${cp === p ? 'bg-brand-red text-white' : 'border border-gray-200 text-gray-700 hover:bg-gray-50'}`}>{p}</button>)}
        <button onClick={() => goToPage(cp + 1)} disabled={cp === tp} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"><ChevronRight className="w-4 h-4" /></button>
      </div>
    </div>
  );
};

// ─── Report Detail Modal ──────────────────────────────────────────────────────
const ReportDetailModal = ({ report, onClose }) => {
  const overlayRef = useRef(null);

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!report) return null;

  const { user, assessment, competencyResults = [], overallScore, overallLevel, generatedAt, status } = report;

  const levelBarColor = {
    Expert: '#16A34A', Advanced: '#2563EB', Intermediate: '#EA580C', Basic: '#F59E0B',
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        {/* Modal Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-red/10 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-brand-red">{user?.name?.charAt(0) || '?'}</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">{user?.name || '—'}</h2>
              <p className="text-xs text-gray-400">
                {[user?.department, user?.position, user?.employeeId ? `#${user.employeeId}` : null]
                  .filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 custom-scrollbar">

          {/* Overall Score Strip */}
          <div className="px-6 py-4 bg-gray-50/60 border-b border-gray-100">
            <div className="flex items-center gap-6 flex-wrap">
              <div>
                <p className="text-xs text-gray-400 mb-1">Overall Score</p>
                <div className="flex items-center gap-2.5">
                  <span className="text-3xl font-bold text-gray-900 leading-none">{overallScore ?? '—'}%</span>
                  <LevelBadge level={overallLevel} />
                </div>
              </div>
              <div className="hidden sm:block h-10 w-px bg-gray-200" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 flex-1">
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Type</p>
                  <p className="text-xs font-semibold text-gray-700">{assessment?.type || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Purpose</p>
                  <p className="text-xs font-semibold text-gray-700">{assessment?.purpose || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Target Group</p>
                  <p className="text-xs font-semibold text-gray-700 capitalize">{assessment?.targetGroup || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Generated</p>
                  <p className="text-xs font-semibold text-gray-700">
                    {generatedAt ? new Date(generatedAt).toLocaleDateString() : '—'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Assessment Description */}
          {assessment?.description && (
            <div className="px-6 py-3 border-b border-gray-100 bg-blue-50/40">
              <p className="text-xs text-blue-700 italic">"{assessment.description}"</p>
            </div>
          )}

          {/* Competency Results */}
          <div className="px-6 py-4">
            <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <Target className="w-4 h-4 text-brand-red" />
              Competency Results
              <span className="text-xs font-normal text-gray-400">({competencyResults.length})</span>
            </h3>

            <div className="space-y-3">
              {competencyResults.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No competency results found.</p>
              ) : competencyResults.map((cr, i) => (
                <div key={cr._id || i} className="bg-gray-50/80 rounded-xl p-4 border border-gray-100">
                  {/* Name + badges */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900">{cr.competencyName}</p>
                      {cr.category && (
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded mt-1 inline-block">
                          {cr.category}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <ScoreBadge score={cr.finalScore} />
                      <LevelBadge level={cr.level} />
                    </div>
                  </div>

                  {/* Score bar */}
                  <div className="mb-3">
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${cr.finalScore || 0}%`, background: levelBarColor[cr.level] || '#94a3b8' }}
                      />
                    </div>
                  </div>

                  {/* Score breakdown */}
                  {cr.scoreDetails && (
                    <div className="flex items-center gap-4 text-xs text-gray-500 mb-2 flex-wrap">
                      {cr.scoreDetails.selfScore > 0 && (
                        <span>Self: <strong className="text-gray-700">{cr.scoreDetails.selfScore}%</strong></span>
                      )}
                      {cr.scoreDetails.supervisorScore > 0 && (
                        <span>Supervisor: <strong className="text-gray-700">{cr.scoreDetails.supervisorScore}%</strong></span>
                      )}
                      {cr.scoreDetails.calculation && (
                        <span className="text-gray-400 italic">{cr.scoreDetails.calculation}</span>
                      )}
                    </div>
                  )}

                  {/* Recommendation */}
                  {cr.recommendation && (
                    <div className="flex items-start gap-2 bg-white rounded-lg px-3 py-2 border border-gray-100">
                      <ClipboardList className="w-3.5 h-3.5 text-brand-red mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-gray-600">{cr.recommendation}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Assessment date range + status footer */}
          {(assessment?.startDate || assessment?.endDate || status) && (
            <div className="px-6 pb-5 flex items-center gap-4 text-xs text-gray-400 border-t border-gray-100 pt-4">
              <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
              {assessment?.startDate && <span>Start: {new Date(assessment.startDate).toLocaleDateString()}</span>}
              {assessment?.endDate && <span>End: {new Date(assessment.endDate).toLocaleDateString()}</span>}
              {status && (
                <span className={`ml-auto px-2.5 py-0.5 rounded-full font-semibold text-[10px]
                  ${status === 'COMPLETE' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                  {status}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex justify-end px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Performer Table (Top 5 / Bottom 5) ──────────────────────────────────────
const PerformerTable = ({ title, data = [], type = 'top', onDetail }) => {
  const isTop = type === 'top';
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className={`flex items-center gap-3 px-5 py-3.5 border-b border-gray-100
        ${isTop ? 'bg-gradient-to-r from-emerald-50/70 to-white' : 'bg-gradient-to-r from-red-50/50 to-white'}`}>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${isTop ? 'bg-emerald-100' : 'bg-red-100'}`}>
          {isTop ? <Medal className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-red-500" />}
        </div>
        <div>
          <h3 className="text-sm font-bold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-400">Top {data.length} by average score</p>
        </div>
      </div>
      <div className="grid grid-cols-[24px_1fr_60px_72px_36px] gap-3 px-5 py-2 bg-gray-50/80 border-b border-gray-100">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">#</span>
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Name</span>
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-center">Reports</span>
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-right">Avg Score</span>
        <span />
      </div>
      <div className="divide-y divide-gray-50">
        {data.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No data available</p>
        ) : data.map((row, i) => (
          <div key={i} className="grid grid-cols-[24px_1fr_60px_72px_36px] gap-3 px-5 py-2.5 items-center hover:bg-gray-50/60 transition-colors group">
            <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center
              ${isTop ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>{i + 1}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">{row.name || '—'}</p>
              {row.department && <p className="text-[11px] text-gray-400 truncate">{row.department}</p>}
            </div>
            <span className="text-sm text-gray-600 font-medium text-center">{row.count ?? '—'}</span>
            <div className="flex justify-end"><ScoreBadge score={row.avgScore} /></div>
            <button
              onClick={() => onDetail?.(row)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-brand-red hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
              title="View details"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Individual Reports Table ─────────────────────────────────────────────────
// Columns: competency name | target group | purpose | score | level | date | detail
const IndividualReportsTable = ({ reports = [], onDetail, pagination, goToPage, total }) => (
  <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
    <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/60">
      <p className="text-sm font-semibold text-gray-700">
        <span className="text-brand-red font-bold">{total ?? reports.length}</span> report{(total ?? reports.length) !== 1 ? 's' : ''}
      </p>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-100 bg-gray-50/80">
          <tr>
            <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Competency</th>
            <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Target Group</th>
            <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Purpose</th>
            <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Score</th>
            <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Level</th>
            <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Date</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {reports.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-16 text-center">
                <BookOpen className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">No reports found</p>
              </td>
            </tr>
          ) : reports.map(r => {
            const competencyNames = (r.competencyResults || []).map(c => c.competencyName).join(', ') || '—';
            return (
              <tr key={r._id} className="hover:bg-gray-50/70 transition-colors group">
                <td className="px-4 py-3">
                  <p className="text-sm font-medium text-gray-800 max-w-[180px] truncate" title={competencyNames}>
                    {competencyNames}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs bg-violet-50 text-violet-700 px-2 py-0.5 rounded capitalize font-medium">
                    {r.assessment?.targetGroup || '—'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium">
                    {r.assessment?.purpose || '—'}
                  </span>
                </td>
                <td className="px-4 py-3"><ScoreBadge score={r.overallScore} /></td>
                <td className="px-4 py-3"><LevelBadge level={r.overallLevel} /></td>
                <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                  {r.generatedAt ? new Date(r.generatedAt).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => onDetail?.(r)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-brand-red hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                    title="View detail"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    {pagination && (
      <div className="px-5 pb-4">
        <Paginator pagination={pagination} goToPage={goToPage} />
      </div>
    )}
  </div>
);

// ─── All Reports Table ────────────────────────────────────────────────────────
// Columns: employee | department | position | competency | target group | purpose | score | level | date | detail
const AllReportsTable = ({ reports = [], onDetail, pagination, goToPage, total }) => (
  <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
    <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/60">
      <p className="text-sm font-semibold text-gray-700">
        <span className="text-brand-red font-bold">{total ?? reports.length}</span> report{(total ?? reports.length) !== 1 ? 's' : ''}
      </p>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-100 bg-gray-50/80">
          <tr>
            <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Employee</th>
            <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Department</th>
            <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Position</th>
            <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Competency</th>
            <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Target Group</th>
            <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Purpose</th>
            <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Score</th>
            <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Level</th>
            <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Date</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {reports.length === 0 ? (
            <tr>
              <td colSpan={10} className="px-4 py-16 text-center">
                <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">No reports found matching the current filters.</p>
              </td>
            </tr>
          ) : reports.map(r => {
            const competencyNames = (r.competencyResults || []).map(c => c.competencyName).join(', ') || '—';
            return (
              <tr key={r._id} className="hover:bg-gray-50/70 transition-colors group">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-brand-red/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-brand-red">{r.user?.name?.charAt(0) || '?'}</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-800 whitespace-nowrap">{r.user?.name || '—'}</p>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{r.user?.department || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{r.user?.position || '—'}</td>
                <td className="px-4 py-3">
                  <p className="text-sm font-medium text-gray-800 max-w-[160px] truncate" title={competencyNames}>
                    {competencyNames}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs bg-violet-50 text-violet-700 px-2 py-0.5 rounded capitalize font-medium whitespace-nowrap">
                    {r.assessment?.targetGroup || '—'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium whitespace-nowrap">
                    {r.assessment?.purpose || '—'}
                  </span>
                </td>
                <td className="px-4 py-3"><ScoreBadge score={r.overallScore} /></td>
                <td className="px-4 py-3"><LevelBadge level={r.overallLevel} /></td>
                <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                  {r.generatedAt ? new Date(r.generatedAt).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => onDetail?.(r)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-brand-red hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                    title="View detail"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    {pagination && (
      <div className="px-5 pb-4">
        <Paginator pagination={pagination} goToPage={goToPage} />
      </div>
    )}
  </div>
);

// ─── Filter Section ───────────────────────────────────────────────────────────
const FilterSection = ({ title, icon: Icon, color, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button type="button" onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${open ? 'bg-gray-50' : 'bg-white hover:bg-gray-50'}`}>
        <div className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded-md flex items-center justify-center ${color}`}><Icon className="w-3.5 h-3.5" /></div>
          <span className="text-sm font-semibold text-gray-700">{title}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-3 bg-white grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {children}
        </div>
      )}
    </div>
  );
};

const FF = ({ label, children }) => (
  <div>
    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">{label}</label>
    {children}
  </div>
);

const sCls = "w-full h-9 px-3 rounded-lg border border-gray-200 text-sm text-gray-800 focus:ring-2 focus:ring-brand-red focus:border-brand-red bg-white";
const iCls = "w-full h-9 px-3 rounded-lg border border-gray-200 text-sm text-gray-800 focus:ring-2 focus:ring-brand-red focus:border-brand-red";

const FILTER_LABELS = {
  department: 'Department', position: 'Position', gender: 'Gender', employeeIdCode: 'Emp ID Code',
  assessmentId: 'Assessment', assessmentType: 'Assess Type', purpose: 'Purpose', targetGroup: 'Target Group',
  assessmentStartFrom: 'Assess Start ≥', assessmentStartTo: 'Assess Start ≤',
  assessmentEndFrom: 'Assess End ≥', assessmentEndTo: 'Assess End ≤',
  competencyId: 'Competency', competencyCategory: 'Category', competencyLevel: 'Comp Level',
  overallLevel: 'Overall Level',
  scoreMin: 'Score ≥', scoreMax: 'Score ≤',
  selfScoreMin: 'Self ≥', selfScoreMax: 'Self ≤',
  supervisorScoreMin: 'Sup ≥', supervisorScoreMax: 'Sup ≤',
  dateFrom: 'Generated ≥', dateTo: 'Generated ≤',
};

const ActiveFilterPills = ({ filters, filterOptions, onRemove }) => {
  const active = Object.entries(filters).filter(([k, v]) => v && k !== 'employeeId');
  if (!active.length) return null;
  const getVal = (key, val) => {
    if (key === 'assessmentId') return filterOptions.assessments?.find(a => String(a._id) === val)?.description?.substring(0, 25) || val;
    if (key === 'competencyId') return filterOptions.competencies?.find(c => String(c._id) === val)?.name || val;
    return val;
  };
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-gray-400 font-medium">Active:</span>
      {active.map(([key, val]) => (
        <span key={key} className="inline-flex items-center gap-1 text-xs bg-brand-red/10 text-brand-red px-2.5 py-1 rounded-full font-medium">
          <span className="text-brand-red/60">{FILTER_LABELS[key] || key}:</span>
          {getVal(key, val)}
          <button type="button" onClick={() => onRemove(key)} className="ml-0.5 hover:opacity-60"><X className="w-3 h-3" /></button>
        </span>
      ))}
    </div>
  );
};

const FilterDrawer = ({
  filters, filterOptions, isAdmin,
  onClose, onClear, onRemove,
  setDepartment, setPosition, setGender, setEmployeeIdCode,
  setAssessmentId, setAssessmentType, setPurpose, setTargetGroup,
  setAssessmentStartFrom, setAssessmentStartTo, setAssessmentEndFrom, setAssessmentEndTo,
  setCompetencyId, setCompetencyCategory, setCompetencyLevel,
  setScoreMin, setScoreMax, setSelfScoreMin, setSelfScoreMax,
  setSupervisorScoreMin, setSupervisorScoreMax,
  setOverallLevel, setDateFrom, setDateTo,
}) => {
  const activeCount = Object.entries(filters).filter(([k, v]) => v && k !== 'employeeId').length;
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-lg mb-6 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-red/10 rounded-lg flex items-center justify-center">
            <SlidersHorizontal className="w-4 h-4 text-brand-red" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-sm">Advanced Filters</h3>
            <p className="text-xs text-gray-400">Combine any filters to narrow results</p>
          </div>
          {activeCount > 0 && <span className="text-xs font-bold bg-brand-red text-white px-2 py-0.5 rounded-full">{activeCount} active</span>}
        </div>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <button type="button" onClick={onClear}
              className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-brand-red px-3 py-1.5 rounded-lg border border-gray-200 hover:border-brand-red/40 transition-colors">
              <RotateCcw className="w-3.5 h-3.5" /> Clear All
            </button>
          )}
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="p-4 space-y-3">
        {isAdmin && (
          <FilterSection title="Employee / User" icon={UserIcon} color="bg-blue-100 text-blue-600">
            <FF label="Department">
              <select value={filters.department} onChange={e => setDepartment(e.target.value)} className={sCls}>
                <option value="">All Departments</option>
                {filterOptions.departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </FF>
            <FF label="Position">
              <select value={filters.position} onChange={e => setPosition(e.target.value)} className={sCls}>
                <option value="">All Positions</option>
                {filterOptions.positions.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </FF>
            <FF label="Gender">
              <select value={filters.gender} onChange={e => setGender(e.target.value)} className={sCls}>
                <option value="">Any Gender</option>
                {(filterOptions.genders || ['Male', 'Female']).map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </FF>
            <FF label="Employee ID Code">
              <input value={filters.employeeIdCode} onChange={e => setEmployeeIdCode(e.target.value)} placeholder="e.g. EMP-001" className={iCls} />
            </FF>
          </FilterSection>
        )}
        <FilterSection title="Competency &amp; Assessment" icon={Layers} color="bg-emerald-100 text-emerald-600">
          <FF label="Competency">
            <select value={filters.competencyId} onChange={e => setCompetencyId(e.target.value)} className={sCls}>
              <option value="">All Competencies</option>
              {(filterOptions.competencies || []).map(c => (
                <option key={String(c._id)} value={String(c._id)}>{c.name}{c.category ? ` (${c.category})` : ''}</option>
              ))}
            </select>
          </FF>
          <FF label="Competency Category">
            <select value={filters.competencyCategory} onChange={e => setCompetencyCategory(e.target.value)} className={sCls}>
              <option value="">All Categories</option>
              {(filterOptions.competencyCategories || []).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </FF>
          <FF label="Competency Level">
            <select value={filters.competencyLevel} onChange={e => setCompetencyLevel(e.target.value)} className={sCls}>
              <option value="">Any Level</option>
              {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </FF>
          <FF label="Assessment Type">
            <select value={filters.assessmentType} onChange={e => setAssessmentType(e.target.value)} className={sCls}>
              <option value="">All Types</option>
              {(filterOptions.assessmentTypes || ['SelfAssessment', 'SupervisorOnly', 'Combined']).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </FF>
          <FF label="Purpose">
            <select value={filters.purpose} onChange={e => setPurpose(e.target.value)} className={sCls}>
              <option value="">All Purposes</option>
              {(filterOptions.purposes || []).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </FF>
          <FF label="Target Group">
            <select value={filters.targetGroup} onChange={e => setTargetGroup(e.target.value)} className={sCls}>
              <option value="">All Groups</option>
              {(filterOptions.targetGroups || ['managerial', 'non-managerial', 'common']).map(g => <option key={g} value={g} className="capitalize">{g}</option>)}
            </select>
          </FF>
        </FilterSection>
        <FilterSection title="Score Ranges" icon={Sliders} color="bg-amber-100 text-amber-600" defaultOpen={false}>
          <FF label="Overall Score Min (%)"><input type="number" min="0" max="100" value={filters.scoreMin} onChange={e => setScoreMin(e.target.value)} placeholder="0" className={iCls} /></FF>
          <FF label="Overall Score Max (%)"><input type="number" min="0" max="100" value={filters.scoreMax} onChange={e => setScoreMax(e.target.value)} placeholder="100" className={iCls} /></FF>
          <FF label="Self Score Min (%)"><input type="number" min="0" max="100" value={filters.selfScoreMin} onChange={e => setSelfScoreMin(e.target.value)} placeholder="0" className={iCls} /></FF>
          <FF label="Self Score Max (%)"><input type="number" min="0" max="100" value={filters.selfScoreMax} onChange={e => setSelfScoreMax(e.target.value)} placeholder="100" className={iCls} /></FF>
          <FF label="Supervisor Score Min (%)"><input type="number" min="0" max="100" value={filters.supervisorScoreMin} onChange={e => setSupervisorScoreMin(e.target.value)} placeholder="0" className={iCls} /></FF>
          <FF label="Supervisor Score Max (%)"><input type="number" min="0" max="100" value={filters.supervisorScoreMax} onChange={e => setSupervisorScoreMax(e.target.value)} placeholder="100" className={iCls} /></FF>
        </FilterSection>
        <FilterSection title="Period" icon={Calendar} color="bg-red-100 text-red-600">
          <FF label="From"><input type="date" value={filters.dateFrom} onChange={e => setDateFrom(e.target.value)} className={iCls} /></FF>
          <FF label="To"><input type="date" value={filters.dateTo} onChange={e => setDateTo(e.target.value)} className={iCls} /></FF>
        </FilterSection>
      </div>
      {activeCount > 0 && (
        <div className="px-5 pb-4">
          <ActiveFilterPills filters={filters} filterOptions={filterOptions} onRemove={onRemove} />
        </div>
      )}
      <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
        <p className="text-xs text-gray-400">{activeCount === 0 ? 'No filters active' : `${activeCount} filter(s) active`}</p>
        <button type="button" onClick={onClose}
          className="px-4 py-2 bg-brand-red text-white text-sm font-semibold rounded-lg hover:bg-brand-red/90 transition-colors">
          Apply &amp; Close
        </button>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOM REPORT BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

const PIVOT_FIELDS = [
  { id: 'employeeName',       label: 'Employee',          icon: '👤' },
  { id: 'department',         label: 'Department',        icon: '🏢' },
  { id: 'position',           label: 'Position',          icon: '💼' },
  { id: 'gender',             label: 'Gender',            icon: '⚧' },
  { id: 'competency',         label: 'Competency',        icon: '🎯' },
  { id: 'competencyCategory', label: 'Comp. Category',    icon: '📂' },
  { id: 'level',              label: 'Level',             icon: '⭐' },
  { id: 'purpose',            label: 'Purpose',           icon: '🏷' },
  { id: 'assessmentType',     label: 'Assessment Type',   icon: '📋' },
  { id: 'targetGroup',        label: 'Target Group',      icon: '👥' },
  { id: 'date',               label: 'Month (YYYY-MM)',   icon: '📅' },
];

const VALUE_OPTIONS = [
  { id: 'score',          label: 'Overall score' },
  { id: 'selfScore',      label: 'Self score' },
  { id: 'supervisorScore',label: 'Supervisor score' },
  { id: 'count',          label: 'Record count' },
];

const AGG_OPTIONS = [
  { id: 'avg',   label: 'Average' },
  { id: 'count', label: 'Count' },
  { id: 'sum',   label: 'Sum' },
];

const LEVEL_COLOR = { Expert: '#16A34A', Advanced: '#2563EB', Intermediate: '#EA580C', Basic: '#F59E0B' };

function scoreStyle(val, valueField) {
  if (val === null || val === undefined) return {};
  if (valueField === 'count') {
    const intensity = Math.min(val / 20, 1);
    return { background: `rgba(59,130,246,${0.08 + intensity * 0.22})`, color: '#1e40af', fontWeight: 600 };
  }
  if (val >= 80) return { background: 'rgba(16,185,129,0.1)', color: '#065f46', fontWeight: 600 };
  if (val >= 65) return { background: 'rgba(59,130,246,0.1)', color: '#1e40af', fontWeight: 600 };
  if (val >= 50) return { background: 'rgba(245,158,11,0.12)', color: '#92400e', fontWeight: 600 };
  if (val >= 35) return { background: 'rgba(234,88,12,0.1)', color: '#7c2d12', fontWeight: 600 };
  return { background: 'rgba(239,68,68,0.1)', color: '#991b1b', fontWeight: 600 };
}

function FieldPill({ field, zone, onDrop, children }) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); const id = e.dataTransfer.getData('fieldId'); if (id) onDrop(id, zone); }}
      className={`min-h-[36px] flex items-center gap-1.5 px-3 rounded-lg border transition-all text-sm flex-wrap
        ${over ? 'border-brand-red bg-brand-red/5' : 'border-dashed border-gray-300 bg-gray-50/60'}`}
    >
      {children || <span className="text-gray-400 text-xs italic">Drag field here</span>}
    </div>
  );
}

function CustomReportBuilder({ filterParams }) {
  const { show } = useToast();
  const [rowField, setRowField]   = useState('department');
  const [colField, setColField]   = useState('competency');
  const [valueField, setValueField] = useState('score');
  const [aggregation, setAgg]     = useState('avg');
  const [result, setResult]       = useState(null);
  const [loading, setLoading]     = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dragging, setDragging]   = useState(null);

  const runQuery = async () => {
    setLoading(true);
    try {
      const params = { ...filterParams(), rowField, valueField, aggregation };
      if (colField) params.colField = colField;
      const { data } = await api.get('/reports/custom/pivot', { params });
      setResult(data.data);
    } catch (err) {
      show(err.response?.data?.message || 'Failed to build report.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const doExport = async () => {
    setExporting(true);
    try {
      const params = { ...filterParams(), rowField, valueField, aggregation };
      if (colField) params.colField = colField;
      const res = await api.get('/reports/custom/export/excel', { params, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url;
      a.download = `custom_report_${rowField}_${Date.now()}.xlsx`; a.click();
      URL.revokeObjectURL(url);
      show('Exported to Excel.', 'success');
    } catch {
      show('Export failed.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleDrop = (fieldId, zone) => {
    if (zone === 'row') { setRowField(fieldId); }
    else if (zone === 'col') { setColField(fieldId === colField ? '' : fieldId); }
  };

  const fieldLabel = id => PIVOT_FIELDS.find(f => f.id === id)?.label || id;
  const cols = result?.columns;
  const rows = result?.rows || [];

  return (
    <div className="space-y-5">
      {/* ── Config card ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 bg-brand-red/10 rounded-xl flex items-center justify-center">
            <Table2 className="w-4 h-4 text-brand-red" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-sm">Pivot configuration</h3>
            <p className="text-xs text-gray-400">Drag fields to build any cross-tabulation you need</p>
          </div>
        </div>

        {/* Field palette */}
        <div className="mb-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Available fields</p>
          <div className="flex flex-wrap gap-2">
            {PIVOT_FIELDS.map(f => (
              <div
                key={f.id}
                draggable
                onDragStart={e => { e.dataTransfer.setData('fieldId', f.id); setDragging(f.id); }}
                onDragEnd={() => setDragging(null)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-grab active:cursor-grabbing transition-all select-none
                  ${dragging === f.id ? 'opacity-40' : ''}
                  ${rowField === f.id ? 'border-brand-red bg-brand-red/10 text-brand-red' :
                    colField === f.id ? 'border-blue-500 bg-blue-50 text-blue-700' :
                    'border-gray-200 bg-white text-gray-700 hover:border-gray-400'}`}
              >
                <GripVertical className="w-3 h-3 opacity-40" />
                {f.label}
                {rowField === f.id && <span className="text-[10px] font-bold ml-0.5 opacity-60">ROW</span>}
                {colField === f.id && <span className="text-[10px] font-bold ml-0.5 opacity-60">COL</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Drop zones + options */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1">
              <span className="w-4 h-4 rounded bg-brand-red/20 text-brand-red text-[9px] font-bold flex items-center justify-center">R</span>
              Row field
            </p>
            <FieldPill field={rowField} zone="row" onDrop={handleDrop}>
              {rowField && (
                <div className="flex items-center gap-1.5 w-full">
                  <span className="text-xs font-semibold text-brand-red">{fieldLabel(rowField)}</span>
                  <button onClick={() => setRowField('')} className="ml-auto text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                </div>
              )}
            </FieldPill>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1">
              <span className="w-4 h-4 rounded bg-blue-100 text-blue-700 text-[9px] font-bold flex items-center justify-center">C</span>
              Column field <span className="text-[10px] text-gray-400 font-normal">(optional)</span>
            </p>
            <FieldPill field={colField} zone="col" onDrop={handleDrop}>
              {colField && (
                <div className="flex items-center gap-1.5 w-full">
                  <span className="text-xs font-semibold text-blue-700">{fieldLabel(colField)}</span>
                  <button onClick={() => setColField('')} className="ml-auto text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                </div>
              )}
            </FieldPill>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-600 mb-1.5">Value</p>
            <select value={valueField} onChange={e => setValueField(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-brand-red bg-white">
              {VALUE_OPTIONS.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-600 mb-1.5">Aggregation</p>
            <select value={aggregation} onChange={e => setAgg(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-brand-red bg-white">
              {AGG_OPTIONS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={runQuery}
            disabled={!rowField || loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-red text-white rounded-xl text-sm font-semibold hover:bg-brand-red-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" />Building…</>
              : <><RefreshCw className="w-4 h-4" />Build report</>}
          </button>

          {result && (
            <button
              onClick={doExport}
              disabled={exporting}
              className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {exporting
                ? <><Loader2 className="w-4 h-4 animate-spin" />Exporting…</>
                : <><FileSpreadsheet className="w-4 h-4 text-green-600" />Export Excel</>}
            </button>
          )}

          {result && (
            <p className="text-xs text-gray-400 ml-auto">
              {result.rows.length} row{result.rows.length !== 1 ? 's' : ''}
              {result.columns ? ` × ${result.columns.length} column${result.columns.length !== 1 ? 's' : ''}` : ''}
              &nbsp;·&nbsp;{result.totalRows.toLocaleString()} source records
            </p>
          )}
        </div>
      </div>

      {/* ── Empty / hint state ───────────────────────────────────────────── */}
      {!result && !loading && (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center">
          <Table2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-600 mb-1">Your pivot table will appear here</p>
          <p className="text-xs text-gray-400">Set a row field, optionally a column field, choose a value and aggregation, then click Build report.</p>
        </div>
      )}

      {/* ── Pivot table ──────────────────────────────────────────────────── */}
      {result && rows.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
            <div>
              <span className="text-sm font-bold text-gray-800">
                {fieldLabel(result.rowField)}
                {result.colField ? <> <span className="text-gray-400 font-normal">×</span> {fieldLabel(result.colField)}</> : ''}
              </span>
              <span className="ml-2 text-xs text-gray-400">
                — {AGG_OPTIONS.find(a => a.id === result.aggregation)?.label} of {VALUE_OPTIONS.find(v => v.id === result.valueField)?.label}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-max">
              <thead className="border-b border-gray-100 bg-gray-50/80 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap min-w-[160px]">
                    {fieldLabel(result.rowField)}
                  </th>
                  {cols
                    ? cols.map(col => (
                        <th key={col} className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap min-w-[90px]">
                          {col.length > 20 ? col.slice(0, 20) + '…' : col}
                        </th>
                      ))
                    : null}
                  {cols && (
                    <th className="text-right px-3 py-2.5 text-xs font-bold text-gray-700 uppercase tracking-wide whitespace-nowrap bg-gray-100/80">
                      Total
                    </th>
                  )}
                  {!cols && (
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {AGG_OPTIONS.find(a => a.id === result.aggregation)?.label}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((row, ri) => (
                  <tr key={ri} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-gray-800 whitespace-nowrap">
                      {result.valueField === 'level'
                        ? <span className="inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ background: LEVEL_COLOR[row.rowLabel] || '#888' }} />
                            {row.rowLabel}
                          </span>
                        : row.rowLabel}
                    </td>
                    {cols
                      ? cols.map(col => {
                          const val = row.cells[col];
                          return (
                            <td key={col} className="px-3 py-2.5 text-right">
                              {val !== null && val !== undefined
                                ? <span className="inline-block px-2 py-0.5 rounded text-xs tabular-nums" style={scoreStyle(val, result.valueField)}>
                                    {result.valueField === 'count' || result.aggregation === 'count' ? val : `${val}%`}
                                  </span>
                                : <span className="text-gray-200 text-xs">—</span>}
                            </td>
                          );
                        })
                      : null}
                    {cols && (
                      <td className="px-3 py-2.5 text-right bg-gray-50/60">
                        {row.cells.__rowTotal !== null && row.cells.__rowTotal !== undefined
                          ? <span className="inline-block px-2 py-0.5 rounded text-xs font-bold tabular-nums" style={scoreStyle(row.cells.__rowTotal, result.valueField)}>
                              {result.valueField === 'count' || result.aggregation === 'count' ? row.cells.__rowTotal : `${row.cells.__rowTotal}%`}
                            </span>
                          : <span className="text-gray-200 text-xs">—</span>}
                      </td>
                    )}
                    {!cols && (
                      <td className="px-4 py-2.5 text-right">
                        {row.cells.__value !== null && row.cells.__value !== undefined
                          ? <span className="inline-block px-2 py-0.5 rounded text-xs tabular-nums" style={scoreStyle(row.cells.__value, result.valueField)}>
                              {result.valueField === 'count' || result.aggregation === 'count' ? row.cells.__value : `${row.cells.__value}%`}
                            </span>
                          : <span className="text-gray-200 text-xs">—</span>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              {/* Column totals row */}
              {cols && result.colTotals && (
                <tfoot className="border-t-2 border-gray-200 bg-gray-50/80">
                  <tr>
                    <td className="px-4 py-2.5 text-xs font-bold text-gray-700 uppercase tracking-wide">Total</td>
                    {cols.map(col => {
                      const val = result.colTotals[col];
                      return (
                        <td key={col} className="px-3 py-2.5 text-right">
                          {val !== null && val !== undefined
                            ? <span className="inline-block px-2 py-0.5 rounded text-xs font-bold tabular-nums" style={scoreStyle(val, result.valueField)}>
                                {result.valueField === 'count' || result.aggregation === 'count' ? val : `${val}%`}
                              </span>
                            : '—'}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-right bg-gray-100/80">
                      {result.colTotals.__rowTotal !== null && result.colTotals.__rowTotal !== undefined
                        ? <span className="inline-block px-2 py-0.5 rounded text-xs font-bold tabular-nums bg-brand-red/10 text-brand-red">
                            {result.valueField === 'count' || result.aggregation === 'count' ? result.colTotals.__rowTotal : `${result.colTotals.__rowTotal}%`}
                          </span>
                        : '—'}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {result && rows.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <BookOpen className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No data found for the current configuration and filters.</p>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function Reports() {
  const { user, isAdmin } = useAuth();
  const { show } = useToast();

  const tabs = isAdmin
    ? [
      { id: 'overview',   label: 'Overview',      icon: BarChart3 },
      { id: 'department', label: 'By Department', icon: Building2 },
      { id: 'competency', label: 'By Competency', icon: Layers },
      { id: 'individual', label: 'Individual',    icon: UserIcon },
      { id: 'all',        label: 'All Reports',   icon: FileText },
      { id: 'builder',    label: 'Custom Builder', icon: Table2 },
    ]
    : [{ id: 'individual', label: 'My Reports', icon: UserIcon }];

  const [tab, setTab] = useState(isAdmin ? 'overview' : 'individual');
  const [activePeriod, setActivePeriod] = useState('1m');

  // ── Detail Modal ──────────────────────────────────────────────────────────
  const [detailReport, setDetailReport] = useState(null);

  // ── Filter options ────────────────────────────────────────────────────────
  const [filterOptions, setFilterOptions] = useState({
    departments: [], positions: [], genders: [],
    competencies: [], competencyCategories: [],
    assessments: [], assessmentTypes: [], purposes: [], targetGroups: [],
    scoreRange: { min: 0, max: 100 },
  });

  const [filters, setFilters] = useState(() => {
    const { dateFrom, dateTo } = getPeriodDates('1m');
    return { ...EMPTY_FILTERS, dateFrom, dateTo };
  });

  const setF = useCallback((key, val) => setFilters(p => ({ ...p, [key]: val })), []);
  const setDepartment      = useCallback(v => setF('department', v), [setF]);
  const setPosition        = useCallback(v => setF('position', v), [setF]);
  const setGender          = useCallback(v => setF('gender', v), [setF]);
  const setEmployeeIdCode  = useCallback(v => setF('employeeIdCode', v), [setF]);
  const setAssessmentId    = useCallback(v => setF('assessmentId', v), [setF]);
  const setAssessmentType  = useCallback(v => setF('assessmentType', v), [setF]);
  const setPurpose         = useCallback(v => setF('purpose', v), [setF]);
  const setTargetGroup     = useCallback(v => setF('targetGroup', v), [setF]);
  const setAssessmentStartFrom = useCallback(v => setF('assessmentStartFrom', v), [setF]);
  const setAssessmentStartTo   = useCallback(v => setF('assessmentStartTo', v), [setF]);
  const setAssessmentEndFrom   = useCallback(v => setF('assessmentEndFrom', v), [setF]);
  const setAssessmentEndTo     = useCallback(v => setF('assessmentEndTo', v), [setF]);
  const setCompetencyId        = useCallback(v => setF('competencyId', v), [setF]);
  const setCompetencyCategory  = useCallback(v => setF('competencyCategory', v), [setF]);
  const setCompetencyLevel     = useCallback(v => setF('competencyLevel', v), [setF]);
  const setScoreMin        = useCallback(v => setF('scoreMin', v), [setF]);
  const setScoreMax        = useCallback(v => setF('scoreMax', v), [setF]);
  const setSelfScoreMin    = useCallback(v => setF('selfScoreMin', v), [setF]);
  const setSelfScoreMax    = useCallback(v => setF('selfScoreMax', v), [setF]);
  const setSupervisorScoreMin = useCallback(v => setF('supervisorScoreMin', v), [setF]);
  const setSupervisorScoreMax = useCallback(v => setF('supervisorScoreMax', v), [setF]);
  const setOverallLevel    = useCallback(v => setF('overallLevel', v), [setF]);
  const setDateFrom        = useCallback(v => setF('dateFrom', v), [setF]);
  const setDateTo          = useCallback(v => setF('dateTo', v), [setF]);

  const [showFilters, setShowFilters] = useState(false);
  const activeFilterCount = Object.entries(filters).filter(([k, v]) => v && k !== 'employeeId').length;
  const removeFilter = useCallback(key => setF(key, ''), [setF]);
  const clearFilters = useCallback(() => setFilters({ ...EMPTY_FILTERS }), []);

  const handlePeriodChange = useCallback((periodId) => {
    setActivePeriod(periodId);
    const { dateFrom, dateTo } = getPeriodDates(periodId);
    setFilters(p => ({ ...p, dateFrom, dateTo }));
  }, []);

  // ── Data ──────────────────────────────────────────────────────────────────
  const [stats, setStats]           = useState(null);
  const [individual, setIndividual] = useState([]);
  const [allReports, setAllReports] = useState([]);
  const [deptSummary, setDeptSummary] = useState([]);
  const [heatmap, setHeatmap]       = useState({});
  const [loading, setLoading]       = useState(false);
  const [exporting, setExporting]   = useState(null);

  const [employees, setEmployees]               = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [empSearch, setEmpSearch]               = useState('');
  const [showEmpDropdown, setShowEmpDropdown]   = useState(false);
  const empRef = useRef(null);

  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [selDept, setSelDept] = useState('');

  useEffect(() => {
    const h = e => { if (empRef.current && !empRef.current.contains(e.target)) setShowEmpDropdown(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    if (isAdmin) {
      api.get('/reports/filter-options').then(({ data }) => setFilterOptions(p => ({ ...p, ...data.data }))).catch(() => {});
      api.get('/reports/employees').then(({ data }) => setEmployees(data.data.employees)).catch(() => {});
    }
  }, [isAdmin]);

  const filterParams = useCallback(() => {
    const p = {};
    Object.entries(filters).forEach(([k, v]) => { if (v !== '' && v !== null) p[k] = v; });
    return p;
  }, [filters]);

  const loadStats = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const { data } = await api.get('/reports/stats', { params: filterParams() });
      setStats(data.data);
    } catch { show('Failed to load stats.', 'error'); }
    setLoading(false);
  }, [filters, isAdmin]);

  const loadIndividual = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const targetId = selectedEmployee?._id || user._id;
      const { data } = await api.get(`/reports/individual/${targetId}`, {
        params: { page, limit: pagination.limit, ...filterParams() },
      });
      setIndividual(data.data.reports || []);
      if (data.data.pagination) {
        const pg = data.data.pagination;
        setPagination(pv => ({ ...pv, page, total: pg.total, totalPages: Math.ceil(pg.total / pv.limit) }));
      }
    } catch { show('Failed to load reports.', 'error'); }
    setLoading(false);
  }, [selectedEmployee, user._id, filters, pagination.limit]);

  const loadAllReports = useCallback(async (page = 1) => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const { data } = await api.get('/reports', { params: { page, limit: pagination.limit, ...filterParams() } });
      setAllReports(data.data.reports || []);
      const pg = data.data.pagination;
      setPagination(pv => ({ ...pv, page, total: pg.total, totalPages: Math.ceil(pg.total / pv.limit) }));
    } catch { show('Failed to load reports.', 'error'); }
    setLoading(false);
  }, [isAdmin, filters, pagination.limit]);

  const loadHeatmap = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const { data } = await api.get('/reports/heatmap');
      setHeatmap(data.data.heatmap);
    } catch {}
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin && selDept && tab === 'department') {
      api.get(`/reports/department/${selDept}`).then(({ data }) => setDeptSummary(data.data.summary)).catch(() => {});
    }
  }, [selDept, isAdmin, tab]);

  useEffect(() => {
    if (tab === 'overview') loadStats();
    else if (tab === 'individual') loadIndividual(1);
    else if (tab === 'all') loadAllReports(1);
    else if (tab === 'competency') { loadStats(); loadHeatmap(); }
    else if (tab === 'department') { loadStats(); loadHeatmap(); }
  }, [tab, filters, selectedEmployee]);

  const doExport = async (format, type = 'filtered') => {
    setExporting(format);
    try {
      const params = filterParams();
      let url, filename;
      if (type === 'individual') {
        const targetId = selectedEmployee?._id || user._id;
        url = `/reports/export/individual/${targetId}/${format}`;
        filename = `report_${(selectedEmployee?.name || user.name || 'employee').replace(/\s+/g, '_')}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      } else {
        url = `/reports/export/${format}`;
        filename = `reports_${new Date().toISOString().split('T')[0]}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      }
      const res = await api.get(url, { params, responseType: 'blob' });
      const blobUrl = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = blobUrl; a.download = filename; a.click();
      URL.revokeObjectURL(blobUrl);
      show(`Exported as ${format.toUpperCase()} successfully.`, 'success');
    } catch (err) {
      show(err.response?.status === 404 ? 'No data found for export.' : 'Export failed.', 'error');
    }
    setExporting(null);
  };

  const handlePerformerDetail = useCallback((performer) => {
    if (performer?.userId) window.location.href = `/users/${performer.userId}`;
    else if (performer?._id) window.location.href = `/users/${performer._id}`;
  }, []);

  // Chart data
  const levelChartData = (stats?.levelDistribution || []).map(l => ({ name: l._id, value: l.count }));
  const deptChartData  = (stats?.departmentBreakdown || []).slice(0, 8).map(d => ({
    dept: (d._id || '?').length > 14 ? d._id.substring(0, 14) + '…' : (d._id || '?'),
    fullDept: d._id || '?', avgScore: parseFloat((d.avgScore || 0).toFixed(1)), count: d.count,
  }));
  const competencyChartData = (stats?.competencyBreakdown || []).slice(0, 10).map(c => ({
    name: (c._id || '?').length > 22 ? c._id.substring(0, 22) + '…' : (c._id || '?'),
    score: parseFloat((c.avgScore || 0).toFixed(1)),
  }));

  const heatmapCompetencies = Object.keys(heatmap);
  const heatmapDepts = [...new Set(Object.values(heatmap).flatMap(arr => arr.map(d => d.department)))];
  const heatmapLookup = {};
  heatmapCompetencies.forEach(comp => {
    heatmap[comp]?.forEach(d => {
      if (!heatmapLookup[comp]) heatmapLookup[comp] = {};
      heatmapLookup[comp][d.department] = d.avgScore;
    });
  });
  const getHeatColor = s => {
    if (!s) return 'bg-gray-100 text-gray-400';
    if (s >= 80) return 'bg-emerald-500 text-white';
    if (s >= 65) return 'bg-blue-500 text-white';
    if (s >= 50) return 'bg-amber-400 text-white';
    if (s >= 35) return 'bg-orange-500 text-white';
    return 'bg-red-500 text-white';
  };

  const filteredEmployees = employees.filter(e => {
    const q = empSearch.toLowerCase();
    return (e.name || '').toLowerCase().includes(q)
      || (e.department || '').toLowerCase().includes(q)
      || (e.employeeId || '').toLowerCase().includes(q)
      || (e.email || '').toLowerCase().includes(q);
  });

  const top5    = (stats?.topPerformers    || []).slice(0, 5);
  const bottom5 = (stats?.bottomPerformers || []).slice(0, 5);

  const drawerProps = {
    filters, filterOptions, isAdmin,
    onClose: () => setShowFilters(false),
    onClear: clearFilters, onRemove: removeFilter,
    setDepartment, setPosition, setGender, setEmployeeIdCode,
    setAssessmentId, setAssessmentType, setPurpose, setTargetGroup,
    setAssessmentStartFrom, setAssessmentStartTo, setAssessmentEndFrom, setAssessmentEndTo,
    setCompetencyId, setCompetencyCategory, setCompetencyLevel,
    setScoreMin, setScoreMax, setSelfScoreMin, setSelfScoreMax,
    setSupervisorScoreMin, setSupervisorScoreMax,
    setOverallLevel, setDateFrom, setDateTo,
  };

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-[#f8f9fb] overflow-hidden">

      {/* ── Detail Modal ─────────────────────────────────────────────────── */}
      {detailReport && (
        <ReportDetailModal report={detailReport} onClose={() => setDetailReport(null)} />
      )}

      {/* ── STICKY HEADER ────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-[#f8f9fb] border-b border-gray-200/70 shadow-sm flex-shrink-0">
        <div className="px-7 py-4">
          <div className="flex justify-between items-center gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-display font-bold text-brand-black">Reports &amp; Analytics</h1>
              <p className="text-gray-500 mt-0.5 text-sm">
                {isAdmin ? 'Comprehensive competency assessment reports and analytics.' : 'Your competency assessment history and progress.'}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {isAdmin && (
                <button type="button" onClick={() => setShowFilters(v => !v)}
                  className={`flex items-center gap-2 px-4 py-2.5 border rounded-lg font-semibold text-sm transition-all
                    ${showFilters || activeFilterCount > 0 ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                  <SlidersHorizontal className="w-4 h-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="w-5 h-5 rounded-full bg-brand-red text-white text-xs flex items-center justify-center">{activeFilterCount}</span>
                  )}
                </button>
              )}
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => doExport('pdf', tab === 'individual' ? 'individual' : 'filtered')} disabled={!!exporting}
                  className="flex items-center gap-2 px-3 py-2.5 border border-gray-300 rounded-l-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
                  {exporting === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4 text-red-500" />}PDF
                </button>
                <button type="button" onClick={() => doExport('excel', tab === 'individual' ? 'individual' : 'filtered')} disabled={!!exporting}
                  className="flex items-center gap-2 px-3 py-2.5 border border-l-0 border-gray-300 rounded-r-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
                  {exporting === 'excel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 text-green-600" />}Excel
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 mt-3 flex-wrap">
            {isAdmin && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide mr-1">Period:</span>
                {PERIOD_OPTIONS.map(p => (
                  <button key={p.id} type="button" onClick={() => handlePeriodChange(p.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all
                      ${activePeriod === p.id ? 'bg-brand-red text-white border-brand-red shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-red/40 hover:text-brand-red'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto ml-auto">
              {tabs.map(t => (
                <button key={t.id} type="button" onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap
                    ${tab === t.id ? 'bg-white text-brand-red shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
                  <t.icon className="w-3.5 h-3.5" />{t.label}
                </button>
              ))}
            </div>
          </div>

          {activeFilterCount > 0 && !showFilters && (
            <div className="flex items-center gap-3 flex-wrap mt-2">
              <ActiveFilterPills filters={filters} filterOptions={filterOptions} onRemove={removeFilter} />
              <button type="button" onClick={clearFilters} className="text-xs text-gray-400 hover:text-brand-red font-medium">Clear all</button>
            </div>
          )}
        </div>
      </div>

      {/* ── SCROLLABLE BODY ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-7 space-y-5">

          {showFilters && isAdmin && <FilterDrawer {...drawerProps} />}

          {loading ? (
            <div className="flex items-center justify-center p-20">
              <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* ══ TAB: OVERVIEW ══ */}
              {tab === 'overview' && stats && (
                <div className="space-y-5">
                  <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                      <PieChart className="w-4 h-4 text-brand-red" />Level Distribution
                    </h3>
                    {levelChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={levelChartData} barSize={40}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip formatter={v => [v, 'Count']} />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                            {levelChartData.map(e => <Cell key={e.name} fill={LEVEL_COLORS[e.name] || '#888'} />)}
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

                  <div className="grid lg:grid-cols-2 gap-5">
                    <PerformerTable title="Top 5 Performers" data={top5} type="top" onDetail={handlePerformerDetail} />
                    <PerformerTable title="Needs Development Support" data={bottom5} type="bottom" onDetail={handlePerformerDetail} />
                  </div>

                  {(stats.genderBreakdown?.length > 0 || stats.positionBreakdown?.length > 0) && (
                    <div className="grid lg:grid-cols-2 gap-5">
                      {stats.genderBreakdown?.length > 0 && (
                        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Users className="w-4 h-4 text-brand-red" />By Gender</h3>
                          <div className="space-y-3">
                            {stats.genderBreakdown.map(g => (
                              <div key={g._id} className="flex items-center gap-3">
                                <div className="w-20 text-sm text-gray-600">{g._id || 'N/A'}</div>
                                <div className="flex-1"><ScoreBar score={parseFloat((g.avgScore || 0).toFixed(1))} /></div>
                                <div className="text-xs text-gray-400 w-14 text-right">{g.count} reports</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {stats.positionBreakdown?.length > 0 && (
                        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Briefcase className="w-4 h-4 text-brand-red" />By Position</h3>
                          <div className="space-y-2">
                            {stats.positionBreakdown.map(p => (
                              <div key={p._id} className="flex items-center gap-3">
                                <div className="w-32 text-xs text-gray-600 truncate">{p._id || 'N/A'}</div>
                                <div className="flex-1"><ScoreBar score={parseFloat((p.avgScore || 0).toFixed(1))} /></div>
                                <div className="text-xs text-gray-400 w-12 text-right">{p.count}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ══ TAB: DEPARTMENT ══ */}
              {tab === 'department' && (
                <div className="space-y-5">
                  {stats && deptChartData.length > 0 && (
                    <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                      <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-brand-red" />Department Performance</h3>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={deptChartData} barSize={30}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="dept" tick={{ fontSize: 11 }} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v, n, p) => [`${v}%`, `Avg Score (${p.payload.count} reports)`]} labelFormatter={(l, payload) => payload?.[0]?.payload.fullDept || l} />
                          <Bar dataKey="avgScore" fill="#C8102E" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-4 mb-5 flex-wrap">
                      <h3 className="font-bold text-gray-800">Department Deep-Dive</h3>
                      <select value={selDept} onChange={e => setSelDept(e.target.value)} className="h-9 px-3 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red">
                        <option value="">— Select Department —</option>
                        {filterOptions.departments.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    {selDept && deptSummary.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Competency</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Reports</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Avg Score</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase w-48">Distribution</th>
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
                    ) : (
                      <p className="text-center text-gray-400 py-8 text-sm">
                        {selDept ? 'No data for this department.' : 'Select a department to see detailed breakdown.'}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* ══ TAB: COMPETENCY ══ */}
              {tab === 'competency' && (
                <div className="space-y-5">
                  {stats && competencyChartData.length > 0 && (
                    <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                      <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-brand-red" />Competency Average Scores</h3>
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={competencyChartData} layout="vertical" barSize={18}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={145} />
                          <Tooltip formatter={v => [`${v}%`, 'Avg Score']} />
                          <Bar dataKey="score" fill="#C8102E" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {heatmapCompetencies.length > 0 && heatmapDepts.length > 0 && (
                    <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
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
                                <td className="px-2 py-1.5 font-medium text-gray-800">{comp.length > 30 ? comp.substring(0, 30) + '…' : comp}</td>
                                {heatmapDepts.map(dept => {
                                  const score = heatmapLookup[comp]?.[dept];
                                  return (
                                    <td key={dept} className="px-1 py-1 text-center">
                                      {score !== undefined
                                        ? <div className={`inline-flex items-center justify-center w-14 h-7 rounded text-xs font-bold ${getHeatColor(score)}`}>{score.toFixed(0)}%</div>
                                        : <div className="w-14 h-7 rounded bg-gray-50 inline-block" />}
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
                        {[['≥80%', 'bg-emerald-500'], ['≥65%', 'bg-blue-500'], ['≥50%', 'bg-amber-400'], ['≥35%', 'bg-orange-500'], ['<35%', 'bg-red-500']].map(([lbl, cls]) => (
                          <div key={lbl} className="flex items-center gap-1 text-xs text-gray-600"><div className={`w-3 h-3 rounded ${cls}`} />{lbl}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ══ TAB: INDIVIDUAL ══ */}
              {tab === 'individual' && (
                <div className="space-y-5">
                  {isAdmin && (
                    <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                      <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><UserIcon className="w-4 h-4 text-brand-red" />Select Employee</h3>
                      <div className="relative" ref={empRef}>
                        <button type="button" onClick={() => setShowEmpDropdown(v => !v)}
                          className="w-full flex items-center justify-between h-10 px-4 border border-gray-300 rounded-lg text-sm hover:border-brand-red/50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-full bg-brand-red/10 flex items-center justify-center text-brand-red font-bold text-xs flex-shrink-0">
                              {selectedEmployee ? (selectedEmployee.name?.charAt(0) || '?') : user.name?.charAt(0) || '?'}
                            </div>
                            <span className="font-medium text-gray-800">
                              {selectedEmployee ? `${selectedEmployee.name} — ${selectedEmployee.department}` : `My Reports (${user.name})`}
                            </span>
                          </div>
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        </button>
                        {showEmpDropdown && (
                          <div className="absolute top-12 left-0 right-0 z-50 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
                            <div className="p-2 border-b border-gray-100">
                              <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input value={empSearch} onChange={e => setEmpSearch(e.target.value)} placeholder="Search by name, ID, department..." autoFocus
                                  className="w-full pl-9 pr-3 h-8 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-red" />
                              </div>
                            </div>
                            <div className="max-h-60 overflow-y-auto py-1">
                              <button type="button" onClick={() => { setSelectedEmployee(null); setShowEmpDropdown(false); setEmpSearch(''); loadIndividual(1); }}
                                className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 text-sm text-left">
                                <div className="w-7 h-7 rounded-full bg-brand-red/10 flex items-center justify-center text-brand-red font-bold text-xs">{user.name?.charAt(0)}</div>
                                <span>My Reports ({user.name})</span>
                              </button>
                              {filteredEmployees.map(emp => (
                                <button type="button" key={emp._id} onClick={() => { setSelectedEmployee(emp); setShowEmpDropdown(false); setEmpSearch(''); }}
                                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 text-sm text-left">
                                  <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold text-xs">{(emp.name || '?').charAt(0)}</div>
                                  <div>
                                    <p className="font-medium text-gray-800">{emp.name}</p>
                                    <p className="text-xs text-gray-400">{emp.department} · {emp.employeeId || emp.email}</p>
                                  </div>
                                </button>
                              ))}
                              {filteredEmployees.length === 0 && <p className="text-xs text-gray-400 px-4 py-3">No employees found</p>}
                            </div>
                          </div>
                        )}
                      </div>
                      {selectedEmployee && (
                        <div className="mt-3 flex items-center justify-between bg-blue-50 rounded-lg px-4 py-2.5">
                          <div className="text-sm text-blue-800 font-medium">
                            Viewing: {selectedEmployee.name} · {selectedEmployee.department}
                            {selectedEmployee.position && ` · ${selectedEmployee.position}`}
                          </div>
                          <button type="button" onClick={() => { setSelectedEmployee(null); loadIndividual(1); }} className="text-blue-600 hover:text-blue-800 text-xs font-semibold">Clear</button>
                        </div>
                      )}
                    </div>
                  )}

                  <IndividualReportsTable
                    reports={individual}
                    onDetail={setDetailReport}
                    pagination={pagination}
                    goToPage={loadIndividual}
                    total={pagination.total}
                  />
                </div>
              )}

              {/* ══ TAB: ALL REPORTS ══ */}
              {tab === 'all' && isAdmin && (
                <div className="space-y-4">
                  <div className="flex items-center justify-end">
                    <select value={pagination.limit}
                      onChange={e => setPagination(p => ({ ...p, limit: parseInt(e.target.value), page: 1 }))}
                      className="h-8 px-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-brand-red">
                      {[20, 50, 100].map(n => <option key={n} value={n}>{n} per page</option>)}
                    </select>
                  </div>
                  <AllReportsTable
                    reports={allReports}
                    onDetail={setDetailReport}
                    pagination={pagination}
                    goToPage={p => loadAllReports(p)}
                    total={pagination.total}
                  />
                </div>
              )}

              {/* ══ TAB: CUSTOM BUILDER ══ */}
              {tab === 'builder' && isAdmin && (
                <CustomReportBuilder filterParams={filterParams} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
