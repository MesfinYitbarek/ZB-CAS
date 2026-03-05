import { useState, useEffect, useCallback, useRef } from 'react';
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
    if (type === 'ordering') return answer.map((item, idx) => `${idx + 1}. ${item}`).join(' → ');
    if (type === 'matching') return answer.map(p => `${p.left} → ${p.right}`).join('; ');
    return answer.join(', ');
  }
  if (typeof answer === 'object') {
    const entries = Object.entries(answer);
    if (entries.length === 0) return '—';
    return entries.map(([k, v]) => `${k} → ${v}`).join('; ');
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

// ─── Question detail components (admin only) ──────────────────────────────────
const QuestionDetailRow = ({ detail, isExpanded, onToggle }) => {
  const scoreColor = detail.isCorrect ? 'text-green-700' : detail.isPartial ? 'text-yellow-700' : detail.isUnanswered ? 'text-gray-400' : 'text-red-700';
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <span className="text-xs font-bold text-gray-600">{detail.questionNumber || '?'}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{detail.questionText}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">{detail.questionType}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${detail.isUnanswered ? 'bg-gray-100 text-gray-600' : detail.isCorrect ? 'bg-green-100 text-green-700' : detail.isPartial ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
              {detail.isUnanswered ? 'Unanswered' : detail.isCorrect ? 'Correct' : detail.isPartial ? 'Partial' : 'Incorrect'}
            </span>
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className={`text-sm font-bold ${scoreColor}`}>{detail.scoreAwarded} / {detail.maxScore}</p>
          <p className="text-xs text-gray-400">{detail.scorePercentage ?? 0}%</p>
        </div>
        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
      </button>
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 bg-gray-50 border-t border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Answer Given</p>
              <div className={`text-sm p-2 rounded border ${detail.isUnanswered ? 'bg-gray-50 border-gray-200 text-gray-400 italic' : detail.isCorrect ? 'bg-green-50 border-green-200 text-green-800' : detail.isPartial ? 'bg-yellow-50 border-yellow-200 text-yellow-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                {detail.isUnanswered ? 'No answer provided' : formatAnswer(detail.userAnswer, detail.questionType)}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Correct Answer</p>
              <div className="text-sm p-2 rounded border bg-blue-50 border-blue-200 text-blue-800">
                {formatAnswer(detail.correctAnswer, detail.questionType)}
              </div>
            </div>
          </div>
          <div className="mt-3">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className={`h-2 rounded-full ${detail.isCorrect ? 'bg-green-500' : detail.isPartial ? 'bg-yellow-500' : detail.isUnanswered ? 'bg-gray-300' : 'bg-red-500'}`}
                style={{ width: `${detail.scorePercentage ?? 0}%` }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const QuestionDetailsSection = ({ questionDetails, summary, loading }) => {
  const [expanded, setExpanded] = useState({});
  const [filterType, setFilterType] = useState('all');
  if (loading) return <div className="text-center py-6 text-gray-400 text-sm">Loading questions...</div>;
  if (!questionDetails?.length) return <div className="text-center py-6 text-gray-400 text-sm">No question details available.</div>;
  const filtered = questionDetails.filter(d => {
    if (filterType === 'correct') return d.isCorrect;
    if (filterType === 'partial') return d.isPartial;
    if (filterType === 'incorrect') return !d.isCorrect && !d.isPartial && !d.isUnanswered;
    if (filterType === 'unanswered') return d.isUnanswered;
    return true;
  });
  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2"><ListChecks className="w-4 h-4 text-indigo-600" />Question Breakdown</h4>
        <button onClick={() => setExpanded(prev => Object.keys(prev).some(k => prev[k]) ? {} : Object.fromEntries(questionDetails.map((_, i) => [i, true])))}
          className="text-xs text-indigo-600 font-medium">
          {Object.values(expanded).some(Boolean) ? 'Collapse All' : 'Expand All'}
        </button>
      </div>
      {summary && (
        <div className="grid grid-cols-5 gap-2 mb-3">
          {[['Total', summary.totalQuestions, 'text-gray-700'], ['Correct', summary.fullyCorrect, 'text-green-700'], ['Partial', summary.partialCredit, 'text-yellow-700'], ['Wrong', summary.incorrect, 'text-red-700'], ['Skipped', summary.unanswered, 'text-gray-400']].map(([label, val, cls]) => (
            <div key={label} className="bg-white rounded-lg p-2 text-center border border-gray-200">
              <p className={`text-base font-bold ${cls}`}>{val}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-1.5 flex-wrap mb-3">
        {[['all', 'All'], ['correct', 'Correct'], ['partial', 'Partial'], ['incorrect', 'Incorrect'], ['unanswered', 'Skipped']].map(([k, label]) => (
          <button key={k} onClick={() => setFilterType(k)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${filterType === k ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
        {filtered.map((d, i) => (
          <QuestionDetailRow key={i} detail={d} isExpanded={!!expanded[i]} onToggle={() => setExpanded(prev => ({ ...prev, [i]: !prev[i] }))} />
        ))}
      </div>
    </div>
  );
};

// ─── Result detail modal ──────────────────────────────────────────────────────
const ResultDetailModal = ({ result, isOpen, onClose, isAdmin, questionDetails, questionSummary, loadingQuestions, securityData, loadingSecurity }) => {
  if (!isOpen || !result) return null;

  // Helper function to format violation type for display
  const formatViolationType = (type) => {
    const types = {
      'FULLSCREEN_EXIT': 'Fullscreen Exit',
      'TAB_SWITCH': 'Tab Switch',
      'WINDOW_BLUR': 'Window Blur',
      'RIGHT_CLICK': 'Right Click',
      'COPY_ATTEMPT': 'Copy Attempt',
      'PRINT_ATTEMPT': 'Print Attempt',
      'DEV_TOOLS': 'Developer Tools'
    };
    return types[type] || type.replace(/_/g, ' ');
  };

  // Helper function to get violation icon and color
  const getViolationStyle = (type) => {
    const styles = {
      'FULLSCREEN_EXIT': { bg: 'bg-orange-100', text: 'text-orange-700', icon: '⛔' },
      'TAB_SWITCH': { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: '↹' },
      'WINDOW_BLUR': { bg: 'bg-blue-100', text: 'text-blue-700', icon: '👁️' },
      'RIGHT_CLICK': { bg: 'bg-red-100', text: 'text-red-700', icon: '🖱️' },
      'COPY_ATTEMPT': { bg: 'bg-purple-100', text: 'text-purple-700', icon: '📋' },
      'PRINT_ATTEMPT': { bg: 'bg-indigo-100', text: 'text-indigo-700', icon: '🖨️' },
      'DEV_TOOLS': { bg: 'bg-pink-100', text: 'text-pink-700', icon: '🔧' }
    };
    return styles[type] || { bg: 'bg-gray-100', text: 'text-gray-700', icon: '⚠️' };
  };

  const scoreColor = result.finalScore >= 75 ? 'text-green-600' : result.finalScore >= 50 ? 'text-amber-600' : 'text-red-600';
  const scoreBarColor = result.assessmentType === 'Combined' ? 'bg-purple-500' : result.assessmentType === 'SupervisorOnly' ? 'bg-orange-500' : 'bg-brand-red';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-red/10 flex items-center justify-center">
              <FileText className="w-4 h-4 text-brand-red" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Result Details</h3>
              {result.completedAt && (
                <p className="text-[11px] text-gray-400">
                  {new Date(result.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition">
            <XCircle className="w-4 h-4" />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* ── Employee (admin only) ── */}
          {isAdmin && (
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-red to-red-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {(result.userName || '?').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{result.userName || '—'}</p>
                <p className="text-xs text-gray-400 truncate">{result.userEmail || '—'}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-gray-500">{result.userDepartment || '—'}</p>
                <p className="text-xs text-gray-400 font-mono">{result.employeeId || '—'}</p>
              </div>
            </div>
          )}

          {/* ── Competency + Assessment meta ── */}
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            {/* Competency row */}
            <div className="px-4 py-3 bg-gray-50 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">Competency</p>
                <p className="text-sm font-bold text-gray-900 truncate">{result.competencyName || '—'}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{result.competencyCategory || ''}</p>
              </div>
              <TypeBadge type={result.assessmentType} />
            </div>

            {/* Meta rows */}
            <div className="divide-y divide-gray-50">
              {result.assessmentDescription && (
                <div className="px-4 py-2.5 flex items-baseline gap-2">
                  <span className="text-[11px] font-semibold text-gray-400 w-24 flex-shrink-0">Description</span>
                  <span className="text-sm text-gray-700">{result.assessmentDescription}</span>
                </div>
              )}
              {result.purpose && result.purpose !== 'N/A' && (
                <div className="px-4 py-2.5 flex items-baseline gap-2">
                  <span className="text-[11px] font-semibold text-gray-400 w-24 flex-shrink-0">Purpose</span>
                  <span className="text-sm text-gray-700">{result.purpose}</span>
                </div>
              )}
              {result.targetGroup && result.targetGroup !== 'N/A' && (
                <div className="px-4 py-2.5 flex items-baseline gap-2">
                  <span className="text-[11px] font-semibold text-gray-400 w-24 flex-shrink-0">Target Group</span>
                  <span className="text-sm text-gray-700 capitalize">{result.targetGroup.replace('-', ' ')}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Score block ── */}
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            {/* Score header with final score prominent */}
            <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Score</p>
              <div className="flex items-center gap-2">
                <LevelBadge level={result.level} />
                <span className={`text-lg font-black ${scoreColor}`}>{result.finalScore.toFixed(1)}%</span>
              </div>
            </div>

            {/* Score bar */}
            <div className="px-4 pt-2.5 pb-1">
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className={`h-2 rounded-full transition-all ${scoreBarColor}`} style={{ width: `${Math.min(result.finalScore, 100)}%` }} />
              </div>
            </div>

            {/* Score breakdown rows */}
            <div className="divide-y divide-gray-50 pb-1">
              {result.selfScore !== null && result.selfScore !== undefined && (
                <div className="px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-[11px] font-semibold text-gray-400">Self Score</span>
                  </div>
                  <span className="text-sm font-bold text-gray-800">{result.selfScore.toFixed(1)}%</span>
                </div>
              )}
              {result.supervisorScore !== null && result.supervisorScore !== undefined && (
                <div className="px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-purple-400" />
                    <span className="text-[11px] font-semibold text-gray-400">Supervisor Score</span>
                  </div>
                  <span className="text-sm font-bold text-gray-800">{result.supervisorScore.toFixed(1)}%</span>
                </div>
              )}
              {result.isCombined && result.weightUsed && (
                <div className="px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Scale className="w-3.5 h-3.5 text-orange-400" />
                    <span className="text-[11px] font-semibold text-gray-400">Weighting</span>
                  </div>
                  <span className="text-xs text-gray-500">
                    Self&nbsp;<strong>{result.weightUsed.selfAssessment}%</strong>
                    &nbsp;·&nbsp;
                    Supervisor&nbsp;<strong>{result.weightUsed.supervisor}%</strong>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ── Recommendation ── */}
          {result.recommendation && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-blue-100 flex items-center gap-2">
                <Info className="w-3.5 h-3.5 text-blue-500" />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-600">Development Recommendation</p>
              </div>
              <p className="px-4 py-3 text-sm text-blue-900 leading-relaxed">{result.recommendation}</p>
            </div>
          )}

          {/* ── Question details (admin) ── */}
          {isAdmin && (
            <QuestionDetailsSection
              questionDetails={questionDetails}
              summary={questionSummary}
              loading={loadingQuestions}
            />
          )}

          {/* ── Security (admin) ── */}
          {isAdmin && securityData && (
            <div className="rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 flex items-center justify-between border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-orange-400" />
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Security</p>
                </div>
                <div className="flex items-center gap-2">
                  {securityData.summary?.isHighRisk && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> HIGH RISK
                    </span>
                  )}
                  <span className="text-xs font-bold text-gray-600">{securityData.summary?.totalViolations || 0} violations</span>
                </div>
              </div>

              {securityData.violations && securityData.violations.length > 0 ? (
                <div className="divide-y divide-gray-50 max-h-52 overflow-y-auto">
                  {securityData.violations.map((v, i) => {
                    const style = getViolationStyle(v.type);
                    return (
                      <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-full ${style.bg} flex items-center justify-center text-xs flex-shrink-0`}>{style.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-semibold ${style.text}`}>{formatViolationType(v.type)}</p>
                          {v.details && <p className="text-[11px] text-gray-400 truncate">{v.details}</p>}
                        </div>
                        <span className="text-[11px] text-gray-400 flex-shrink-0 tabular-nums">
                          {new Date(v.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-4 py-3 flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <p className="text-xs font-medium">No violations detected</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex-shrink-0 px-5 py-3 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 bg-brand-red text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors">
            Close
          </button>
        </div>
      </div>
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
  return (
    <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-3 border-t border-gray-100">
      <p className="text-sm text-gray-500">Showing {(cp - 1) * pagination.limit + 1}–{Math.min(cp * pagination.limit, pagination.total)} of <strong>{pagination.total}</strong></p>
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
export default function Results() {
  const { user, isAdmin } = useAuth();
  const { show } = useToast();

  // ── filter options loaded from API ────────────────────────────────────────
  const [filterOptions, setFilterOptions] = useState({
    departments: [], positions: [], competencies: [], assessments: [],
    levels: ['Basic', 'Intermediate', 'Advanced', 'Expert'],
    assessmentTypes: ['SelfAssessment', 'SupervisorOnly', 'Combined'],
    targetGroups: ['managerial', 'non-managerial', 'common'],
    purposes: ['Career Development', 'Succession Planning', 'Performance Improvement', 'Training Needs Analysis', 'Promotion Readiness', 'Other'],
  });

  // ── results state ─────────────────────────────────────────────────────────
  const [results, setResults] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });

  // ── filters ───────────────────────────────────────────────────────────────
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    search: '', assessmentId: '', competencyId: '', department: '',
    position: '', level: '', status: '', assessmentType: '',
    targetGroup: '', purpose: '', dateFrom: '', dateTo: '',
    sortBy: 'createdAt', sortDir: 'desc',
  });
  const [pendingFilters, setPendingFilters] = useState({ ...filters });

  // ── modal state ───────────────────────────────────────────────────────────
  const [selectedResult, setSelectedResult] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [questionDetails, setQuestionDetails] = useState([]);
  const [questionSummary, setQuestionSummary] = useState(null);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [securityData, setSecurityData] = useState(null);
  const [loadingSecurity, setLoadingSecurity] = useState(false);

  // ── finalise state ────────────────────────────────────────────────────────
  const [finalisingId, setFinalisingId] = useState(null);

  // ── load filter options ────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/results/filter-options')
      .then(({ data }) => setFilterOptions(prev => ({ ...prev, ...data.data })))
      .catch(() => {});
  }, []);

  // ── load results ──────────────────────────────────────────────────────────
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

  // ── apply pending filters ─────────────────────────────────────────────────
  const applyFilters = () => { setFilters({ ...pendingFilters }); };
  const clearFilters = () => {
    const empty = { search: '', assessmentId: '', competencyId: '', department: '', position: '', level: '', status: '', assessmentType: '', targetGroup: '', purpose: '', dateFrom: '', dateTo: '', sortBy: 'createdAt', sortDir: 'desc' };
    setPendingFilters(empty);
    setFilters(empty);
  };
  const activeFilterCount = Object.entries(filters).filter(([k, v]) => v && !['sortBy', 'sortDir'].includes(k)).length;

  // ── open detail modal ─────────────────────────────────────────────────────
  const openDetail = async (result) => {
    setSelectedResult(result);
    setShowModal(true);
    setQuestionDetails([]);
    setQuestionSummary(null);
    setSecurityData(null);

    // Only fetch question details for admins
    if (isAdmin) {
      setLoadingQuestions(true);
      try {
        const { data } = await api.get(`/results/${result._id}/question-details`);
        setQuestionDetails(data.data.questionDetails || []);
        setQuestionSummary(data.data.summary || null);
      } catch { /* no question details */ }
      setLoadingQuestions(false);

      setLoadingSecurity(true);
      try {
        const userId = typeof result.userId === 'object' ? result.userId._id : result.userId;
        const { data } = await api.get(`/responses/security-violations/${result.assessmentId?._id || result.assessmentId}/${userId}`);
        setSecurityData(data.data.securityRecord || null);
      } catch { /* no security data */ }
      setLoadingSecurity(false);
    }
  };

  // ── Ref for the table header to handle sticky positioning ─────────────────
  const tableContainerRef = useRef(null);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — fixed outer shell, scrollable rows only
  // ─────────────────────────────────────────────────────────────────────────
  return (
    /* Full-height fixed container — fills whatever space the app shell gives */
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Sticky top section (header + filters + stats + count bar) ── */}
      <div className="flex-shrink-0 px-7 pt-7 pb-0 bg-white z-20 shadow-sm sticky top-0">

        {/* Page header */}
        <div className="flex justify-between items-start mb-4 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-brand-black">
              {isAdmin ? 'Assessment Results' : 'My Results'}
            </h1>
            <p className="text-gray-500 mt-1">
              {isAdmin ? 'View, filter, and manage all employee assessment results.' : 'Track your assessment performance and progress.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setPendingFilters({ ...filters }); setShowFilters(v => !v); }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border font-semibold text-sm transition-all ${showFilters || activeFilterCount > 0 ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filters
              {activeFilterCount > 0 && <span className="w-5 h-5 rounded-full bg-brand-red text-white text-xs flex items-center justify-center">{activeFilterCount}</span>}
            </button>
            <button onClick={() => loadResults(pagination.page)} className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-semibold transition-colors">
              <RefreshCw className="w-4 h-4" />
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
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Assessment</label>
                <select value={pendingFilters.assessmentId} onChange={e => setPendingFilters(p => ({ ...p, assessmentId: e.target.value }))}
                  className="w-full h-9 px-3 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red">
                  <option value="">All Assessments</option>
                  {filterOptions.assessments.map(a => <option key={a._id} value={a._id}>{a.description || 'Assessment'}</option>)}
                </select>
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

      {/* ── Scrollable table area with sticky header inside ── */}
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
                          <div className="font-semibold text-sm text-gray-900 whitespace-nowrap">{result.userName}</div>
                          <div className="text-xs text-gray-400 whitespace-nowrap">{result.userPosition}</div>
                        </td>
                      </>}
                      <td className="px-5 py-4">
                        <div className="font-medium text-sm text-gray-900 whitespace-nowrap">{result.competencyName}</div>
                        
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1">
                          <TypeBadge type={result.assessmentType} />
                          {result.targetGroup && result.targetGroup !== 'N/A' && (
                            <span className="text-xs text-gray-400 capitalize whitespace-nowrap">{result.targetGroup.replace('-', ' ')}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">{result.finalScore}</td>
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
                            <Eye className="w-3.5 h-3.5" /> Details
                          </button>
                          
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination — fixed at bottom of the card */}
            <div className="flex-shrink-0 px-5 py-3 border-t border-gray-100 bg-white">
              <Paginator pagination={pagination} goToPage={p => loadResults(p)} />
            </div>
          </div>
        )}
      </div>

      <ResultDetailModal
        result={selectedResult}
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        isAdmin={isAdmin}
        questionDetails={questionDetails}
        questionSummary={questionSummary}
        loadingQuestions={loadingQuestions}
        securityData={securityData}
        loadingSecurity={loadingSecurity}
      />
    </div>
  );
}