import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  ArrowLeft, FileText, Check, ChevronDown, ChevronUp, User, Users,
  Scale, Info, Shield, AlertCircle, CheckCircle2, Award, Clock,
  Target, Building2, Briefcase, ListChecks, MessageSquare, RotateCcw,
  Globe, MonitorSmartphone, Gauge
} from 'lucide-react';
import api from '../utils/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../hooks/queries';

// ─── HR manual grading for ShortAnswer questions ─────────────────────────────
const ShortAnswerGrader = ({ grade, maxScore, saving, onSave }) => {
  const [val, setVal] = useState(grade?.manualScore ?? '');
  useEffect(() => { setVal(grade?.manualScore ?? ''); }, [grade?.manualScore]);
  const num = val === '' ? NaN : Number(val);
  const valid = !Number.isNaN(num) && num >= 0 && num <= maxScore;
  return (
    <div className="mt-4 p-3 rounded-xl border border-amber-200 bg-amber-50/70">
      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Manual grading (HR)</p>
      <div className="flex items-center gap-2">
        <input
          type="number" min={0} max={maxScore} step={0.5}
          value={val} onChange={e => setVal(e.target.value)}
          placeholder={`0 – ${maxScore}`}
          className="w-24 h-9 px-3 rounded-lg border border-gray-300 focus:border-brand-red focus:ring focus:ring-red-200 text-sm bg-white"
        />
        <span className="text-xs text-gray-500">/ {maxScore}</span>
        <button
          onClick={() => valid && onSave(grade._id, num)}
          disabled={!valid || saving}
          className="px-3 py-1.5 bg-brand-red text-white rounded-lg text-xs font-semibold hover:bg-brand-red-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {grade?.manualScore != null && (
          <span className="text-[11px] text-gray-500">Graded: {grade.manualScore}</span>
        )}
      </div>
    </div>
  );
};

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

const LevelBadge = ({ level }) => (
  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${LEVEL_COLORS[level] || 'bg-gray-100 text-gray-600'}`}>
    {level}
  </span>
);

const TypeBadge = ({ type }) => {
  const label = type === 'SelfAssessment' ? 'Self' : type === 'SupervisorOnly' ? 'Supervisor' : 'Combined';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[type] || 'bg-gray-100 text-gray-600'}`}>{label}</span>;
};

const formatViolationType = (type) => ({
  'FULLSCREEN_EXIT': 'Fullscreen Exit',
  'FULLSCREEN_DENIED': 'Fullscreen Denied',
  'TAB_SWITCH': 'Tab Switch',
  'WINDOW_BLUR': 'Window Blur',
  'RIGHT_CLICK': 'Right Click',
  'COPY_ATTEMPT': 'Copy Attempt',
  'CUT_ATTEMPT': 'Cut Attempt',
  'PASTE_ATTEMPT': 'Paste Attempt',
  'PRINT_ATTEMPT': 'Print Attempt',
  'SCREENSHOT_ATTEMPT': 'Screenshot Attempt',
  'DEVTOOLS': 'Developer Tools',
  'DEVTOOLS_ATTEMPT': 'Developer Tools',
  'DEV_TOOLS': 'Developer Tools',
  'VIEW_SOURCE_ATTEMPT': 'View Source',
  'SAVE_ATTEMPT': 'Save Attempt',
  'TIME_EXPIRED': 'Time Expired',
}[type] || String(type || '').replace(/_/g, ' '));

const getViolationStyle = (type) => ({
  'FULLSCREEN_EXIT': { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500' },
  'FULLSCREEN_DENIED': { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500' },
  'TAB_SWITCH': { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500' },
  'WINDOW_BLUR': { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500' },
  'RIGHT_CLICK': { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' },
  'COPY_ATTEMPT': { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500' },
  'CUT_ATTEMPT': { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500' },
  'PASTE_ATTEMPT': { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
  'PRINT_ATTEMPT': { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500' },
  'SCREENSHOT_ATTEMPT': { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' },
  'DEVTOOLS': { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500' },
  'DEVTOOLS_ATTEMPT': { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500' },
  'DEV_TOOLS': { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500' },
  'VIEW_SOURCE_ATTEMPT': { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500' },
  'SAVE_ATTEMPT': { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500' },
  'TIME_EXPIRED': { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500' },
}[type] || { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-400' });

// ─── Question detail row (expandable) ────────────────────────────────────────
const QuestionDetailRow = ({ detail, isExpanded, onToggle, grade, canGrade, grading, onSaveGrade }) => {
  const scoreColor = detail.isCorrect ? 'text-brand-black' : detail.isPartial ? 'text-gray-500' : detail.isUnanswered ? 'text-gray-400' : 'text-red-700';
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left">
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
          detail.isCorrect ? 'bg-gray-200 text-brand-black' : detail.isPartial ? 'bg-gray-200 text-gray-700' : detail.isUnanswered ? 'bg-gray-100 text-gray-500' : 'bg-red-100 text-red-700'
        }`}>{detail.questionNumber || '?'}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{detail.questionText}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{detail.questionType}</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${detail.isUnanswered ? 'bg-gray-100 text-gray-600' : detail.isCorrect ? 'bg-gray-200 text-brand-black' : detail.isPartial ? 'bg-gray-100 text-gray-700' : 'bg-red-100 text-red-700'}`}>
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
        <div className="px-4 pb-4 pt-3 bg-white border-t border-gray-100">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Answer Given</p>
              <div className={`text-sm p-3 rounded-lg border ${detail.isUnanswered ? 'bg-gray-50 border-gray-200 text-gray-400 italic' : detail.isCorrect ? 'bg-gray-100 border-gray-300 text-gray-800' : detail.isPartial ? 'bg-gray-100 border-gray-300 text-gray-700' : 'bg-red-50 border-red-200 text-red-800'}`}>
                {detail.isUnanswered ? 'No answer provided' : formatAnswer(detail.userAnswer, detail.questionType)}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Correct Answer</p>
              <div className="text-sm p-3 rounded-lg border bg-gray-100 border-gray-300 text-gray-700">
                {formatAnswer(detail.correctAnswer, detail.questionType)}
              </div>
            </div>
          </div>
          <div className="mt-4">
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className={`h-2 rounded-full ${detail.isCorrect ? 'bg-brand-red' : detail.isPartial ? 'bg-gray-500' : detail.isUnanswered ? 'bg-gray-300' : 'bg-red-500'}`}
                style={{ width: `${detail.scorePercentage ?? 0}%` }} />
            </div>
          </div>
          {canGrade && detail.questionType === 'ShortAnswer' && grade && (
            <ShortAnswerGrader grade={grade} maxScore={detail.maxScore} saving={grading} onSave={onSaveGrade} />
          )}
        </div>
      )}
    </div>
  );
};

const QuestionDetailsSection = ({ questionDetails, summary, loading, gradeMap, canGrade, gradingId, onSaveGrade }) => {
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
    <div className="bg-gray-50/70 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wider flex items-center gap-2"><ListChecks className="w-4 h-4 text-gray-700" />Question Breakdown</h4>
        <button onClick={() => setExpanded(prev => Object.keys(prev).some(k => prev[k]) ? {} : Object.fromEntries(questionDetails.map((_, i) => [i, true])))}
          className="text-xs text-gray-700 font-semibold hover:underline">
          {Object.values(expanded).some(Boolean) ? 'Collapse All' : 'Expand All'}
        </button>
      </div>
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
          {[['Total', summary.totalQuestions, 'text-gray-700'], ['Correct', summary.fullyCorrect, 'text-brand-black'], ['Partial', summary.partialCredit, 'text-gray-500'], ['Wrong', summary.incorrect, 'text-red-700'], ['Skipped', summary.unanswered, 'text-gray-400']].map(([label, val, cls]) => (
            <div key={label} className="bg-white rounded-xl p-3 text-center border border-gray-200">
              <p className={`text-lg font-black ${cls}`}>{val}</p>
              <p className="text-[11px] text-gray-500">{label}</p>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-1.5 flex-wrap mb-3">
        {[['all', 'All'], ['correct', 'Correct'], ['partial', 'Partial'], ['incorrect', 'Incorrect'], ['unanswered', 'Skipped']].map(([k, label]) => (
          <button key={k} onClick={() => setFilterType(k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filterType === k ? 'bg-brand-black text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="space-y-2.5">
        {filtered.map((d, i) => {
          const g = gradeMap?.[d.questionId];
          return (
            <QuestionDetailRow key={i} detail={d} isExpanded={!!expanded[i]} onToggle={() => setExpanded(prev => ({ ...prev, [i]: !prev[i] }))}
              grade={g} canGrade={canGrade} grading={gradingId != null && gradingId === g?._id} onSaveGrade={onSaveGrade} />
          );
        })}
      </div>
    </div>
  );
};

// ─── Security panel ──────────────────────────────────────────────────────────
const SecuritySection = ({ securityData, loading, canGrantRetake, onGrantRetake, granting }) => {
  const [open, setOpen] = useState(true);
  const [showArchives, setShowArchives] = useState(false);
  if (loading) return <div className="text-center py-6 text-gray-400 text-sm">Loading security data...</div>;
  if (!securityData) return null;

  const summary = securityData.summary || {};
  const anomalies = securityData.anomalies || {};
  const archives = Array.isArray(securityData.attemptArchives) ? securityData.attemptArchives : [];
  const grants = Array.isArray(securityData.retakeGrants) ? securityData.retakeGrants : [];
  const counters = [
    ['Tab switches', summary.tabSwitches],
    ['Fullscreen exits', summary.fullscreenExits],
    ['Copy/cut', summary.copyAttempts],
    ['Paste', summary.pasteAttempts],
    ['DevTools', summary.devToolsAttempts],
    ['Print/screen', summary.printAttempts],
  ].filter(([, v]) => (v || 0) > 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-2.5">
          <span className="p-1.5 rounded-lg bg-gray-100"><Shield className="w-4 h-4 text-gray-700" /></span>
          <div className="text-left">
            <p className="text-sm font-bold text-gray-800">Security Monitoring</p>
            <p className="text-xs text-gray-400">Assessment conduct &amp; violation log</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {summary.isHighRisk && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> HIGH RISK
            </span>
          )}
          {summary.autoSubmitted && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-red text-white flex items-center gap-1">
              AUTO-SUBMITTED
            </span>
          )}
          <span className="text-xs font-bold text-gray-600">{summary.totalViolations || 0} violations</span>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && (
        <div className="border-t border-gray-100">
          {/* HR retake grant */}
          {canGrantRetake && (
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 bg-gray-50/60">
              <p className="text-xs text-gray-500">Grant this user a fresh attempt — they will get new re-exam questions when defined.</p>
              <button
                onClick={(e) => { e.stopPropagation(); onGrantRetake?.(); }}
                disabled={granting}
                className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-brand-red text-white rounded-lg hover:bg-brand-red-dark transition-colors disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" /> {granting ? 'Granting…' : 'Grant Retake'}
              </button>
            </div>
          )}

          {/* Per-type breakdown */}
          {counters.length > 0 && (
            <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap gap-1.5">
              {counters.map(([label, v]) => (
                <span key={label} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                  {label}: {v}
                </span>
              ))}
            </div>
          )}

          {/* Anomaly flags */}
          {(anomalies.ipChanged || anomalies.deviceChanged || anomalies.answerVelocity) && (
            <div className="px-5 py-3 border-b border-gray-100 space-y-1.5">
              {anomalies.ipChanged && (
                <p className="text-[11px] font-semibold text-amber-700 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" /> IP address changed mid-attempt ({(securityData.ipAddresses || []).length} seen)
                </p>
              )}
              {anomalies.deviceChanged && (
                <p className="text-[11px] font-semibold text-amber-700 flex items-center gap-1.5">
                  <MonitorSmartphone className="w-3.5 h-3.5" /> Device/browser changed mid-attempt
                </p>
              )}
              {anomalies.answerVelocity && (
                <p className="text-[11px] font-semibold text-amber-700 flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5" /> Abnormally rapid answer changes detected
                </p>
              )}
            </div>
          )}

          {/* Violation rows */}
          {securityData.violations && securityData.violations.length > 0 ? (
            <div className="divide-y divide-gray-50">
              {securityData.violations.map((v, i) => {
                const style = getViolationStyle(v.type);
                return (
                  <div key={i} className="px-5 py-3 flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${style.dot} flex-shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold ${style.text}`}>{formatViolationType(v.type)}</p>
                      {v.details && <p className="text-[11px] text-gray-400 truncate">{v.details}</p>}
                    </div>
                    <span className="text-[11px] text-gray-400 flex-shrink-0 tabular-nums">
                      {new Date(v.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-5 py-4 flex items-center gap-2 text-brand-black">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <p className="text-xs font-semibold">No violations detected</p>
            </div>
          )}

          {/* Retake grants ledger */}
          {grants.length > 0 && (
            <div className="border-t border-gray-100 px-5 py-3 space-y-1.5">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Retake grants</p>
              {grants.map((g) => (
                <div key={g._id} className="text-[11px] text-gray-600 bg-gray-50 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                  <span>
                    +{g.extraAttempts} attempt{g.extraAttempts !== 1 ? 's' : ''} by {g.grantedBy?.name || 'HR'}
                    {g.reason ? ` — “{g.reason}”` : ''}
                  </span>
                  <span className={`font-bold flex-shrink-0 ${g.remaining > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                    {g.remaining > 0 ? `${g.remaining} left` : 'used'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Archived prior attempts */}
          {archives.length > 0 && (
            <div className="border-t border-gray-100">
              <button onClick={() => setShowArchives(v => !v)} className="w-full px-5 py-2.5 flex items-center justify-between text-xs font-semibold text-gray-500 hover:bg-gray-50">
                <span>{archives.length} prior attempt{archives.length !== 1 ? 's' : ''} archived (kept for audit)</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showArchives ? 'rotate-180' : ''}`} />
              </button>
              {showArchives && (
                <div className="px-5 pb-3 space-y-1.5">
                  {archives.map((a, i) => (
                    <div key={i} className="text-[11px] text-gray-500 bg-gray-50 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                      <span>Attempt {a.attempt ?? i + 1}{a.autoSubmitted ? ' · auto-submitted' : ''}{a.isHighRisk ? ' · high-risk' : ''}</span>
                      <span className="font-semibold tabular-nums">{a.totalViolations || 0} violations · {a.archivedAt ? new Date(a.archivedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Main page ───────────────────────────────────────────────────────────────
export default function ResultDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { isAdmin } = useAuth();
  const { show } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading: loading, isError } = useQuery({
    queryKey: queryKeys.results.detail(id),
    queryFn: async () => {
      const { data } = await api.get(`/results/${id}`);
      return data.data;
    },
  });

  const detail = data || {};
  const result = detail.result || null;
  const supervisorEval = detail.supervisorEvaluation || null;
  const questionDetails = detail.questionDetails || [];
  const questionSummary = {
    totalQuestions: questionDetails.length,
    fullyCorrect: questionDetails.filter(q => q.isCorrect).length,
    partialCredit: questionDetails.filter(q => q.isPartial).length,
    incorrect: questionDetails.filter(q => !q.isCorrect && !q.isPartial && !q.isUnanswered).length,
    unanswered: questionDetails.filter(q => q.isUnanswered).length,
  };

  const userId = result ? (typeof result.userId === 'object' ? (result.userId._id || result.userId.id) : result.userId) : null;
  const assessmentId = result ? (result.assessmentId?._id || result.assessmentId) : null;

  // Security records are permission-checked server-side (owner, HR_ADMIN, or
  // direct supervisor). Any signed-in viewer may attempt the fetch; a 403
  // simply resolves to null and hides the panel.
  const { data: securityData, isLoading: loadingSecurity } = useQuery({
    queryKey: queryKeys.responses.securityViolations(assessmentId, userId),
    queryFn: async () => {
      try {
        const { data: sData } = await api.get(`/responses/security-violations/${assessmentId}/${userId}`);
        return sData.data.securityRecord || null;
      } catch (err) {
        if (err.response?.status === 403 || err.response?.status === 404) return null;
        throw err;
      }
    },
    enabled: !!assessmentId && !!userId,
  });

  // HR retake grant — gives the employee a fresh attempt (re-exam questions
  // when the assessment defines them).
  const [granting, setGranting] = useState(false);
  const handleGrantRetake = async () => {
    if (!assessmentId || !userId) return;
    const reason = window.prompt('Reason for granting a retake (stored in the audit log):', 'Violation appeal approved');
    if (reason === null) return;
    if (!window.confirm(`Grant ${result?.userName || 'this user'} an extra attempt? Their current answers will be cleared for a fresh start.`)) return;
    setGranting(true);
    try {
      const { data } = await api.post('/responses/admin/grant-retake', { assessmentId, userId, reason });
      show(data?.message || 'Retake granted.', 'success');
      queryClient.invalidateQueries({ queryKey: queryKeys.responses.securityViolations(assessmentId, userId) });
    } catch (err) {
      show(err.response?.data?.message || 'Could not grant retake.', 'error');
    } finally {
      setGranting(false);
    }
  };

  // HR manual grading: raw responses (carry response ids + manual scores) for
  // the viewed employee, keyed by question id.
  const { data: adminResponses } = useQuery({
    queryKey: queryKeys.responses.adminAll(assessmentId),
    queryFn: async () => {
      const { data } = await api.get(`/responses/admin/${assessmentId}/all`);
      return data.data.responses || [];
    },
    enabled: isAdmin && !!assessmentId,
  });
  const gradeMap = useMemo(() => {
    const map = {};
    (adminResponses || []).forEach(r => {
      const takerId = r.employee?.id || r.user?.id;
      if (takerId && takerId === userId && r.question?.id) map[r.question.id] = r;
    });
    return map;
  }, [adminResponses, userId]);

  const [gradingId, setGradingId] = useState(null);
  const gradeMutation = useMutation({
    mutationFn: async ({ responseId, score }) => {
      await api.patch(`/responses/admin/manual-score/${responseId}`, { manualScore: score });
      await api.post('/results/auto-score', { assessmentId, employeeId: userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.results.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.results.all });
      show('Score saved and result recalculated.', 'success');
    },
    onError: (err) => show(err.response?.data?.message || 'Failed to save score.', 'error'),
  });
  const handleSaveGrade = (responseId, score) => {
    setGradingId(responseId);
    gradeMutation.mutate({ responseId, score }, { onSettled: () => setGradingId(null) });
  };

  useEffect(() => {
    if (isError) {
      show('Failed to load result.', 'error');
      nav('/results');
    }
  }, [isError, show, nav]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-12 h-12 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!result) return null;

  const isNotTaken = result.notTaken || result.status === 'PENDING';
  if (isNotTaken) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-3">
            <button onClick={() => nav(-1)} className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0" title="Back to results">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="text-lg  font-bold text-brand-black truncate">{result.competencyName}</h1>
            <TypeBadge type={result.assessmentType} />
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <Clock className="w-7 h-7 text-gray-400" />
            </div>
            <h2 className="text-lg font-bold text-brand-black mb-1">Not Taken</h2>
            <p className="text-sm text-gray-500">
              {result.userName || 'This employee'} did not take this assessment before it closed, so there is no score to show.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const scoreColor = result.finalScore >= 75 ? 'text-brand-black' : result.finalScore >= 50 ? 'text-gray-500' : 'text-red-600';
  const scoreBarColor = result.assessmentType === 'Combined' ? 'bg-brand-red' : result.assessmentType === 'SupervisorOnly' ? 'bg-gray-500' : 'bg-brand-red';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => nav(-1)} className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0" title="Back to results">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg  font-bold text-brand-black truncate">{result.competencyName}</h1>
                <TypeBadge type={result.assessmentType} />
              </div>
            </div>
          </div>
          <div className="flex-shrink-0 ml-4 flex items-center gap-2">
            {result.partial && (
              <span title={result.missingSide ? `Awaiting ${result.missingSide} side — recalculated when both sides submit` : 'Partial result'} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">Partial</span>
            )}
            <LevelBadge level={result.level} />
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* ── Hero: Employee + Score ── */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className={`h-1.5 bg-gradient-to-r ${scoreColor === 'text-brand-black' ? 'from-brand-red to-red-700' : scoreColor === 'text-gray-500' ? 'from-gray-400 to-gray-600' : 'from-red-500 to-red-700'}`} />
          <div className="p-6 grid grid-cols-1 md:grid-cols-[1fr_auto] items-center gap-6">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-red to-red-700 flex items-center justify-center text-white text-lg font-black flex-shrink-0">
                {(result.userName || '?').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-gray-900 truncate">{result.userName}</h2>
                <p className="text-sm text-gray-500 truncate">{result.userEmail}</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><Building2 className="w-3 h-3 text-gray-400" />{result.userDepartment || '—'}</span>
                  {result.userPosition && <span className="flex items-center gap-1"><Briefcase className="w-3 h-3 text-gray-400" />{result.userPosition}</span>}
                  {result.userGender && result.userGender !== 'N/A' && <span>{result.userGender}</span>}
                </div>
              </div>
            </div>

            {/* Score block */}
            <div className="flex flex-col items-center md:items-end gap-1">
              <div className={`text-5xl  font-black tabular-nums ${scoreColor}`}>{result.finalScore.toFixed(1)}%</div>
              <div className="w-56">
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div className={`h-2.5 rounded-full transition-all ${scoreBarColor}`} style={{ width: `${Math.min(result.finalScore, 100)}%` }} />
                </div>
              </div>
              <div className="text-xs text-gray-400 mt-1">Final score</div>
            </div>
          </div>
        </div>

        {/* ── Stat mini cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MiniCard icon={Target} label="Purpose" value={result.purpose && result.purpose !== 'N/A' ? result.purpose : '—'} accent="text-gray-700 bg-gray-100" />
          <MiniCard icon={Users} label="Target Group" value={result.targetGroup && result.targetGroup !== 'N/A' ? result.targetGroup.replace('-', ' ') : '—'} accent="text-gray-700 bg-gray-100" />
          <MiniCard icon={Clock} label="Completed" value={new Date(result.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} accent="text-gray-700 bg-gray-100" />
          <MiniCard icon={Award} label="Level" value={result.level || '—'} accent="text-brand-black bg-gray-200" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Left column: assessment + score breakdown + recommendation ── */}
          <div className="lg:col-span-1 space-y-6">
            {/* Assessment meta */}
            <div className="bg-white rounded-2xl border border-gray-200">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-brand-red/10"><FileText className="w-4 h-4 text-brand-red" /></span>
                  <h3 className="text-sm font-bold text-gray-800">Assessment</h3>
                </div>
                <TypeBadge type={result.assessmentType} />
              </div>
              <div className="p-5 space-y-3.5 text-sm">
                {result.assessmentDescription && result.assessmentDescription !== 'N/A' && (
                  <div className="text-gray-600">{result.assessmentDescription}</div>
                )}
                <Row icon={Target} label="Purpose" value={result.purpose && result.purpose !== 'N/A' ? result.purpose : '—'} />
                <Row icon={Users} label="Target Group" value={result.targetGroup && result.targetGroup !== 'N/A' ? result.targetGroup.replace('-', ' ') : '—'} />
              </div>
            </div>

            {/* Score breakdown */}
            <div className="bg-white rounded-2xl border border-gray-200">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2"><Scale className="w-4 h-4 text-gray-700" /> Score Breakdown</h3>
              </div>
              <div className="p-5 space-y-4">
                {result.selfScore !== null && result.selfScore !== undefined && (
                  <ScoreRow icon={User} label="Self Assessment" value={result.selfScore} color="bg-brand-red" />
                )}
                {result.supervisorScore !== null && result.supervisorScore !== undefined && (
                  <ScoreRow icon={Users} label="Supervisor" value={result.supervisorScore} color="bg-brand-red" />
                )}
                {!result.hasBoth && (
                  <p className="text-xs text-gray-400">
                    {result.assessmentType === 'SelfAssessment' ? 'Scored from self-assessment responses.' : 'Scored from supervisor evaluations.'}
                  </p>
                )}
                {result.isCombined && result.weightUsed && (
                  <div className="pt-3 border-t border-gray-100 text-xs text-gray-500">
                    Weighting: Self <strong>{result.weightUsed.selfAssessment}%</strong> · Supervisor <strong>{result.weightUsed.supervisor}%</strong>
                  </div>
                )}
              </div>
            </div>

            {/* Recommendation */}
            {result.recommendation && (
              <div className="rounded-2xl border border-gray-300 bg-gray-100 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-2">
                  <Info className="w-4 h-4 text-gray-700" />
                  <h3 className="text-sm font-bold text-gray-800">Development Recommendation</h3>
                </div>
                <p className="px-5 py-4 text-sm text-gray-700 leading-relaxed">{result.recommendation}</p>
              </div>
            )}

            {/* Supervisor feedback (recorded with the supervisor evaluation) */}
            {supervisorEval && (supervisorEval.comments || supervisorEval.submittedAt) && (
              <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-brand-red" />
                  <h3 className="text-sm font-bold text-gray-800">Supervisor Feedback</h3>
                  {supervisorEval.submittedAt && (
                    <span className="ml-auto text-[11px] text-gray-400">
                      {new Date(supervisorEval.submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  )}
                </div>
                <div className="px-5 py-4">
                  {supervisorEval.supervisorName && (
                    <p className="text-xs font-semibold text-gray-500 mb-1.5">{supervisorEval.supervisorName}</p>
                  )}
                  {supervisorEval.comments ? (
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{supervisorEval.comments}</p>
                  ) : (
                    <p className="text-xs text-gray-400 italic">Evaluation submitted without written comments.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Right column: questions (admin) + security (owner/HR/supervisor) ── */}
          <div className="lg:col-span-2 space-y-6">
            {isAdmin ? (
              <>
                <QuestionDetailsSection questionDetails={questionDetails} summary={questionSummary} loading={loading}
          gradeMap={gradeMap} canGrade={isAdmin} gradingId={gradingId} onSaveGrade={handleSaveGrade} />
                <SecuritySection
                  securityData={securityData}
                  loading={loadingSecurity}
                  canGrantRetake={!!assessmentId && !!userId}
                  onGrantRetake={handleGrantRetake}
                  granting={granting}
                />
              </>
            ) : (
              <>
                <div className="bg-white rounded-2xl border border-gray-200 min-h-64 flex flex-col items-center justify-center text-center p-8">
                  <CheckCircle2 className="w-12 h-12 text-gray-300 mb-3" />
                  <p className="text-sm text-gray-600">No answer breakdown available for your role.</p>
                  <p className="text-xs text-gray-400 mt-1">Detailed question review is available to HR administrators and supervisors.</p>
                </div>
                <SecuritySection securityData={securityData} loading={loadingSecurity} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── small presentational helpers ────────────────────────────────────────────
const MiniCard = ({ icon: Icon, label, value, accent }) => (
  <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-start gap-3">
    <span className={`p-2 rounded-lg ${accent}`}><Icon className="w-4 h-4" /></span>
    <div className="min-w-0">
      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{label}</div>
      <div className="text-sm font-bold text-gray-900 capitalize truncate">{value}</div>
    </div>
  </div>
);

const Row = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-2.5">
    <Icon className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
    <span className="text-gray-500 w-24 flex-shrink-0">{label}</span>
    <span className="font-medium text-gray-800 capitalize">{value}</span>
  </div>
);

const ScoreRow = ({ icon: Icon, label, value, color }) => (
  <div>
    <div className="flex items-center justify-between text-sm mb-1.5">
      <span className="flex items-center gap-2 text-gray-600"><Icon className="w-3.5 h-3.5 text-gray-400" />{label}</span>
      <span className="font-bold text-gray-900">{value.toFixed(1)}%</span>
    </div>
    <div className="w-full bg-gray-100 rounded-full h-2">
      <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
    </div>
  </div>
);
