import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  ChevronLeft, Save, Send, User, Target, Calendar,
  AlertCircle, CheckCircle2, Shield, Briefcase,
  MessageSquare, Award, TrendingUp, X,
} from 'lucide-react';
import api from '../utils/api';
import { useAssessmentDetail } from '../hooks/queries';
import { queryKeys } from '../hooks/queryKeys';

// ── Score helpers ─────────────────────────────────────────────────────────────
const scoreLabel = (s) => {
  if (s >= 90) return { text: 'Exceptional',       color: 'text-gray-700', bar: 'bg-brand-black', ring: 'ring-gray-300' };
  if (s >= 80) return { text: 'Excellent',          color: 'text-gray-700',   bar: 'bg-brand-black',   ring: 'ring-gray-300'   };
  if (s >= 70) return { text: 'Good',               color: 'text-gray-700',    bar: 'bg-brand-black',    ring: 'ring-gray-300'    };
  if (s >= 60) return { text: 'Satisfactory',       color: 'text-gray-700',  bar: 'bg-brand-black',  ring: 'ring-gray-300'  };
  if (s >= 50) return { text: 'Needs Improvement',  color: 'text-gray-700',  bar: 'bg-brand-black',  ring: 'ring-gray-300'  };
  return           { text: 'Unsatisfactory',        color: 'text-red-600',     bar: 'bg-red-500',     ring: 'ring-red-200'     };
};

const avatar = (name = '') =>
  name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  : '—';

// ── Confirm modal ─────────────────────────────────────────────────────────────
function ConfirmModal({ open, onClose, onConfirm, loading, employee, score, hasExisting }) {
  if (!open) return null;
  const sl = scoreLabel(score);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900">
            {hasExisting ? 'Update Evaluation' : 'Submit Evaluation'}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-gray-600">
            You are about to {hasExisting ? 'update' : 'submit'} the evaluation for{' '}
            <strong className="text-gray-900">{employee?.name}</strong>.
          </p>

          {/* Score preview */}
          <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
            <span className="text-xs text-gray-500">Score</span>
            <div className="flex items-center gap-2">
              <span className={`text-xl font-black ${sl.color}`}>{score}</span>
              <span className="text-xs text-gray-400">/ 100</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ring-1 ${sl.ring} ${sl.color} bg-white`}>
                {sl.text}
              </span>
            </div>
          </div>

          {!hasExisting && (
            <p className="text-xs text-gray-700 bg-gray-100 rounded-lg px-3 py-2.5 flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              Once submitted, you can still update this evaluation while the assessment is active.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2 rounded-lg bg-brand-red text-white text-sm font-semibold hover:bg-red-700 transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? (
              <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Submitting…</>
            ) : (
              <><Send className="w-3.5 h-3.5" /> {hasExisting ? 'Update' : 'Submit'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SupervisorEvaluation() {
  const { assessmentId } = useParams();
  const [searchParams] = useSearchParams();
  const employeeId = searchParams.get('employeeId');
  const { user, isSupervisor, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { show } = useToast();
  const queryClient = useQueryClient();

  const [saving, setSaving]               = useState(false);
  const [submitting, setSubmitting]       = useState(false);
  const [showConfirm, setShowConfirm]     = useState(false);
  const [score, setScore]                 = useState(50);
  const [comments, setComments]           = useState('');
  const [hasExisting, setHasExisting]     = useState(false);
  const [permissionError, setPermError]   = useState(false);

  const canAccess = isSupervisor || isAdmin;

  const assessmentQuery = useAssessmentDetail(assessmentId, {
    enabled: canAccess && !!assessmentId && !!employeeId,
    onError: (err) => {
      if (err.response?.status === 403) setPermError(true);
    },
  });
  const assessment = assessmentQuery.data?.assessment || null;

  const employeeQuery = useQuery({
    queryKey: queryKeys.users.detail(employeeId),
    queryFn: async () => {
      const res = await api.get(`/users/${employeeId}`);
      return res.data.data.user;
    },
    enabled: canAccess && !!employeeId,
    onError: (err) => {
      if (err.response?.status === 403) setPermError(true);
    },
  });
  const employee = employeeQuery.data || null;
  const loading = assessmentQuery.isLoading || employeeQuery.isLoading;

  const { data: evaluationData } = useQuery({
    queryKey: queryKeys.responses.supervisor(assessmentId, employeeId),
    queryFn: async () => {
      const res = await api.get(`/responses/supervisor/${assessmentId}/${employeeId}`).catch(() => null);
      return res?.data?.data?.evaluation || null;
    },
    enabled: canAccess && !!assessmentId && !!employeeId,
  });

  useEffect(() => {
    if (!canAccess) { setPermError(true); return; }
  }, [isSupervisor, isAdmin]);

  const clamp = (v) => Math.min(100, Math.max(0, Math.round(v)));

  useEffect(() => {
    if (evaluationData) {
      setScore(evaluationData.score ?? 50);
      setComments(evaluationData.comments ?? '');
      setHasExisting(true);
    }
  }, [evaluationData]);

  const saveDraft = async () => {
    try {
      setSaving(true);
      await api.post('/responses/supervisor/save', { assessmentId, employeeId, score, comments });
      show('Draft saved.', 'success');
      setHasExisting(true);
    } catch (err) {
      show(err.response?.status === 403 ? 'Permission denied.' : 'Save failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const doSubmit = async () => {
    try {
      setSubmitting(true);
      await api.post('/responses/supervisor/submit', { assessmentId, employeeId, score, comments });
      show('Evaluation submitted!', 'success');
      setShowConfirm(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.assessments.pending });
      setTimeout(() => navigate('/evaluations'), 1200);
    } catch (err) {
      show(err.response?.data?.message || 'Submission failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Error / loading states ────────────────────────────────────────────────
  if (permissionError) return (
    <div className="h-[calc(100vh-4rem)] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center max-w-sm w-full">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <Shield className="w-6 h-6 text-red-500" />
        </div>
        <h2 className="text-base font-bold text-gray-900 mb-1">Access Denied</h2>
        <p className="text-sm text-gray-400 mb-5">You don't have permission to access this evaluation.</p>
        <button onClick={() => navigate('/supervisor/pending')}
          className="w-full py-2 bg-brand-red text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition">
          Back to Pending
        </button>
      </div>
    </div>
  );

  if (loading) return (
    <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
      <div className="w-8 h-8 border-[3px] border-brand-red border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!assessment || !employee) return (
    <div className="h-[calc(100vh-4rem)] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center max-w-sm w-full">
        <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500 mb-4">Evaluation could not be loaded.</p>
        <button onClick={() => navigate('/supervisor/pending')}
          className="w-full py-2 bg-brand-red text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition">
          Go Back
        </button>
      </div>
    </div>
  );

  const sl = scoreLabel(score);
  const isExpired = assessment.endDate && new Date(assessment.endDate) < new Date();

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-gray-50 overflow-hidden">

      {/* ── Sticky header ──────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/supervisor/pending')}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-sm  font-bold text-brand-black">Supervisor Evaluation</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasExisting && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-700 bg-gray-100 px-2.5 py-1 rounded-full border border-gray-200">
              <CheckCircle2 className="w-3 h-3" /> Saved
            </span>
          )}
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${isExpired ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-gray-100 text-gray-700 border border-gray-200'}`}>
            {isExpired ? 'Expired' : 'Active'}
          </span>
        </div>
      </div>

      {/* ── Scrollable body ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto px-4 py-5 space-y-4">

          {/* Employee + Assessment info row */}
          <div className="grid grid-cols-2 gap-3">
            {/* Employee */}
            <div className="bg-white rounded-xl border border-gray-100 p-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2.5">Employee</p>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-red to-red-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {avatar(employee.name)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{employee.name}</p>
                  <p className="text-[11px] text-gray-400 truncate">{employee.position || 'Employee'}</p>
                </div>
              </div>
              <div className="mt-2.5 pt-2.5 border-t border-gray-50 space-y-1">
                <p className="text-[11px] text-gray-400 truncate">{employee.email}</p>
                <p className="text-[11px] text-gray-400 font-mono">{employee.employeeId || '—'}</p>
              </div>
            </div>

            {/* Assessment */}
            <div className="bg-white rounded-xl border border-gray-100 p-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2.5">Assessment</p>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-brand-black flex items-center justify-center text-white flex-shrink-0">
                  <Target className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {assessment.competencyId?.name || '—'}
                  </p>
                  <p className="text-[11px] text-gray-400">{assessment.type}</p>
                </div>
              </div>
              <div className="mt-2.5 pt-2.5 border-t border-gray-50 space-y-1">
                <div className="flex items-center gap-1 text-[11px] text-gray-400">
                  <Calendar className="w-3 h-3" />
                  <span>Due {fmtDate(assessment.endDate)}</span>
                </div>
                {assessment.description && (
                  <p className="text-[11px] text-gray-400 line-clamp-2">{assessment.description}</p>
                )}
              </div>
            </div>
          </div>

          {/* Score card */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Score</p>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ring-1 ${sl.ring} ${sl.color} bg-white`}>
                {sl.text}
              </span>
            </div>

            {/* Big score display */}
            <div className="flex items-center justify-center gap-1.5 mb-4">
              <span className={`text-6xl  font-black tabular-nums ${sl.color}`}>{score}</span>
              <span className="text-lg text-gray-300 font-light self-end mb-2">/ 100</span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-gray-100 rounded-full h-2 mb-4 overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all duration-200 ${sl.bar}`}
                style={{ width: `${score}%` }}
              />
            </div>

            {/* Slider */}
            <input
              type="range"
              min="0" max="100" step="1"
              value={score}
              onChange={e => setScore(clamp(+e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-gray-200 accent-brand-red mb-4"
            />

            {/* Quick-score buttons */}
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5 flex-1">
                {[0, 25, 50, 75, 100].map(v => (
                  <button key={v} onClick={() => setScore(v)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${score === v ? `${sl.bar} text-white` : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    {v}
                  </button>
                ))}
              </div>
              {/* Manual input */}
              <input
                type="number" min="0" max="100"
                value={score}
                onChange={e => setScore(clamp(+e.target.value))}
                className="w-14 h-8 text-center border border-gray-200 rounded-lg text-sm font-bold text-gray-700 focus:outline-none focus:border-brand-red focus:ring-1 focus:ring-red-100 transition"
              />
            </div>
          </div>

          {/* Comments */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Comments</p>
              <span className="text-[10px] text-gray-300 ml-auto font-normal">optional</span>
            </div>
            <textarea
              value={comments}
              onChange={e => setComments(e.target.value)}
              placeholder="Share feedback on strengths, performance, and areas for growth…"
              rows={4}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-700 placeholder:text-gray-300 focus:outline-none focus:border-brand-red focus:ring-1 focus:ring-red-100 transition resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pb-2">
            <button
              onClick={saveDraft}
              disabled={saving}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving…' : 'Save Draft'}
            </button>
            <button
              onClick={() => setShowConfirm(true)}
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-brand-red text-white text-sm font-semibold hover:bg-red-700 transition disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              {hasExisting ? 'Update Evaluation' : 'Submit Evaluation'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Confirm modal ─────────────────────────────────────────────────── */}
      <ConfirmModal
        open={showConfirm}
        onClose={() => !submitting && setShowConfirm(false)}
        onConfirm={doSubmit}
        loading={submitting}
        employee={employee}
        score={score}
        hasExisting={hasExisting}
      />
    </div>
  );
}
