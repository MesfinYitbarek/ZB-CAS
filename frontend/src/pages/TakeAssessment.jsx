import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import useAssessmentSecurity from '../hooks/useAssessmentSecurity';
import {
  CheckCircle, ArrowLeft, Star, AlertTriangle, Clock, Shield,
  TrendingUp, Award, Check, ChevronLeft, ChevronRight, X,
  Calendar, Target, Info, Lock, Eye, EyeOff, MonitorX, Wifi,
  BookOpen, AlertCircle, Ban, Loader2
} from 'lucide-react';
import SecurityMonitor from '../components/SecurityMonitor';
import api from '../utils/api';
import { useAssessmentDetail } from '../hooks/queries';
import { queryKeys } from '../hooks/queryKeys';

// ─── Loading Button ───────────────────────────────────────────────────────────
const LoadingButton = ({ onClick, loading, disabled, className, children, ...props }) => (
  <button
    onClick={onClick}
    disabled={loading || disabled}
    className={`relative transition-all disabled:cursor-not-allowed ${className}`}
    {...props}
  >
    {loading ? (
      <span className="flex items-center justify-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>Please wait...</span>
      </span>
    ) : children}
  </button>
);

// ─── Deterministic per-employee shuffle ─────────────────────────────────────────
// Same employee + assessment always sees the same order (stable across reloads
// and retakes, since answers are keyed by question _id); different employees
// see different orders.
const hashSeed = (str = '') => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

const mulberry32 = (seed) => () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const shuffleBySeed = (arr = [], seedStr = '') => {
  const rand = mulberry32(hashSeed(String(seedStr)));
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

// ─── Security Laws Screen ─────────────────────────────────────────────────────
const SecurityLawsScreen = ({ assessment, onAccept, onCancel }) => {
  const LAWS = [
    {
      icon: <MonitorX className="w-5 h-5 text-red-600" />,
      title: 'No Tab Switching',
      desc: 'Switching browser tabs or windows during the assessment is strictly prohibited and will be recorded as a violation.',
      color: 'red'
    },
    {
      icon: <EyeOff className="w-5 h-5 text-red-600" />,
      title: 'Full Screen Required',
      desc: 'You must remain in full-screen mode throughout. Exiting full screen will trigger a security alert.',
      color: 'red'
    },
    {
      icon: <Ban className="w-5 h-5 text-red-600" />,
      title: 'No External Resources',
      desc: 'Using any external help, websites, or materials during this assessment is not permitted.',
      color: 'red'
    },
    {
      icon: <Clock className="w-5 h-5 text-red-600" />,
      title: 'Time Limit Enforced',
      desc: assessment?.timeLimit
        ? `You have exactly ${assessment.timeLimit} minutes to complete this assessment. It will auto-submit when time expires.`
        : 'Complete the assessment within the allowed period. You may submit at any time.',
      color: 'red'
    },

  ];

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border-t-4 border-red-600">

        {/* Header */}
        <div className="bg-gradient-to-r from-red-700 to-red-600 px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Target className="w-5 h-5 text-white" />
            </div>
            <div>
              {assessment.competencyId?.name || 'Assessment'}
            </div>
          </div>
        </div>

        {/* Assessment info banner */}
        <div className="px-5 py-2.5 bg-red-50 border-b border-red-100 flex items-center gap-3">
          <Target className="w-4 h-4 text-red-600 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-900 truncate">
              Category: {assessment?.competencyId?.category || 'Competency Assessment'}
            </p>
            <p className="text-[10px] text-gray-500">
              Time Limit: {assessment?.timeLimit ? ` · ${assessment.timeLimit} min` : ' · No time limit'}
            </p>
          </div>
        </div>

        {/* Laws list - compact */}
        <div className="px-5 py-3 space-y-2 max-h-[320px] overflow-y-auto">
          {LAWS.map((law, i) => (
            <div key={i} className="flex items-start gap-2 p-2 bg-red-50/50 rounded-lg border-l-3 border-red-500">
              <div className="w-6 h-6 bg-white rounded flex items-center justify-center flex-shrink-0 shadow-sm">
                {law.icon}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-gray-900">{law.title}</p>
                <p className="text-[10px] text-gray-600 leading-tight">{law.desc}</p>
              </div>
            </div>
          ))}
        </div>


        {/* Actions */}
        <div className="flex gap-2 px-5 pb-5">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onAccept}
            className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-all shadow-sm"
          >
            Start Assessment
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Back Warning Modal ───────────────────────────────────────────────────────
const BackWarningModal = ({ answeredCount, totalCount, onStay, onLeave, isLeaving }) => (
  <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
      <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center mx-auto mb-4">
        <AlertTriangle className="w-6 h-6 text-gray-700" />
      </div>
      <h3 className="text-base font-bold text-gray-900 text-center mb-2">Leave Assessment?</h3>
      <p className="text-sm text-gray-600 text-center mb-1">
        You have answered <strong className="text-gray-900">{answeredCount}</strong> of <strong className="text-gray-900">{totalCount}</strong> questions.
      </p>
      <p className="text-xs text-gray-500 text-center mb-5">
        Leaving now will <strong className="text-red-600">automatically submit</strong> your current progress. Unanswered questions will receive 0 points.
      </p>
      <div className="space-y-2">
        <button
          onClick={onStay}
          className="w-full py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 transition-colors"
        >
          Continue Assessment
        </button>
        <LoadingButton
          onClick={onLeave}
          loading={isLeaving}
          className="w-full py-2.5 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Submit & Leave
        </LoadingButton>
      </div>
    </div>
  </div>
);

// ─── Security Violation Banner ────────────────────────────────────────────────
const SecurityViolationBanner = ({ violations, onDismiss }) => {
  const recent = violations[violations.length - 1];
  if (!recent) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-red-600 text-white px-4 py-2 flex items-center justify-between shadow-lg animate-in slide-in-from-top duration-300">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        <div>
          <span className="text-xs font-bold">Security Violation</span>
          <span className="text-xs ml-2 opacity-90">
            ({violations.length} total)
          </span>
        </div>
      </div>
      <button
        onClick={onDismiss}
        className="flex items-center gap-1 text-xs bg-red-700/60 hover:bg-red-700 px-3 py-1 rounded-lg font-semibold transition-colors"
      >
        <X className="w-3 h-3" /> Dismiss
      </button>
    </div>
  );
};

// ─── Serious Violation Modal (3+ violations) ──────────────────────────────────
const SeriousViolationModal = ({ count, onAcknowledge }) => (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 border-2 border-red-200">
      <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
        <Ban className="w-7 h-7 text-red-600" />
      </div>
      <h3 className="text-base font-bold text-red-700 text-center mb-2">
        Serious Security Warning
      </h3>
      <p className="text-sm text-gray-700 text-center mb-2">
        You have accumulated <strong className="text-red-600">{count} violations</strong>.
      </p>
      <p className="text-xs text-gray-500 text-center mb-5">
        Continued violations will be recorded and may affect your assessment record.
        Please stay focused on the assessment.
      </p>
      <button
        onClick={onAcknowledge}
        className="w-full py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 transition-colors"
      >
        I Understand — Continue Assessment
      </button>
    </div>
  </div>
);

// ─── Security Monitor Modal ───────────────────────────────────────────────────
const SecurityMonitorModal = ({ violations, isHighRisk, onDismiss }) => {
  if (!violations || violations.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm w-full bg-white rounded-lg shadow-xl border-l-4 border-red-500 overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
      
      
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TakeAssessment() {
  const { assessmentId } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const { show } = useToast();
  const queryClient = useQueryClient();

  // ── State ───────────────────────────────────────────────────────────────────
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState(null);
  const [scoringInProgress, setScoringInProgress] = useState(false);
  const [securityAcknowledged, setSecurityAcknowledged] = useState(false);
  const [showSecurityLaws, setShowSecurityLaws] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showSubmitWarning, setShowSubmitWarning] = useState(false);
  const [showBackWarning, setShowBackWarning] = useState(false);
  const [isWaitingForStart, setIsWaitingForStart] = useState(false);
  const [countdown, setCountdown] = useState(null);

  // Modal & violation display
  const [showViolationBanner, setShowViolationBanner] = useState(false);
  const [showSeriousModal, setShowSeriousModal] = useState(false);
  const [seriousModalShownAt, setSeriousModalShownAt] = useState(0);
  const [showSecurityMonitor, setShowSecurityMonitor] = useState(true); // New state for security monitor visibility

  // Button loading states
  const [submitting, setSubmitting] = useState(false);
  const [isLeavingBack, setIsLeavingBack] = useState(false);

  // Attempt tracking (maxAttempts null = unlimited)
  const [attempts, setAttempts] = useState({ used: 0, maxAttempts: null, remaining: null });
  const [retaking, setRetaking] = useState(false);

  const debounceRef = useRef({});
  const countdownRef = useRef(null);

  // Always employee / self
  const respondentType = 'self';
  const employeeId = user?._id;

  // Use a ref to count violations inside the callback — avoids stale closure
  const violationCountRef = useRef(0);

  const security = useAssessmentSecurity(assessmentId, (violation) => {
    api.post(`/responses/security-violation`, {
      assessmentId,
      userId: user?._id,
      violation,
    }).catch(() => { });

    violationCountRef.current += 1;
    const count = violationCountRef.current;

    setShowViolationBanner(true);
    setShowSecurityMonitor(true);

    // Show serious modal at every 3rd violation (3, 6, 9…)
    if (count >= 3 && count % 3 === 0) {
      setShowSeriousModal(true);
      setSeriousModalShownAt(count);
    }
  });

  // ── React Query data ────────────────────────────────────────────────────────
  const assessmentQuery = useAssessmentDetail(assessmentId, {
    onError: (err) => {
      if (err.response?.status === 403) {
        show('You do not have permission to access this assessment.', 'error');
      } else {
        show('Failed to load assessment.', 'error');
      }
      nav('/assessments');
    },
  });
  const assessment = assessmentQuery.data?.assessment || null;

  const needsProgress = assessment?.status === 'ACTIVE' || assessment?.status === 'COMPLETED';

  const progressQuery = useQuery({
    queryKey: queryKeys.responses.progress(assessmentId),
    queryFn: async () => {
      const res = await api.get(`/responses/progress/${assessmentId}`, {
        params: { employeeId, respondentType }
      });
      return res.data.data;
    },
    enabled: !!assessment && needsProgress,
  });

  const userResultsQuery = useQuery({
    queryKey: queryKeys.results.user(user?._id),
    queryFn: async () => {
      const { data } = await api.get(`/results/user/${user._id}`);
      return data.data.results || [];
    },
    enabled: !!user?._id && submitted && !scoringInProgress,
  });

  const securityQuery = useQuery({
    queryKey: queryKeys.responses.securityViolations(assessmentId, user?._id),
    queryFn: async () => {
      const { data } = await api.get(`/responses/security-violations/${assessmentId}/${user._id}`);
      return data.data.securityRecord;
    },
    enabled: !!user?._id && !!assessmentId && submitted,
  });

  const securitySummary = securityQuery.data || null;
  const securityLoaded = securityQuery.isSuccess;

  // Previous status tracking for SCHEDULED → ACTIVE transitions
  const prevStatusRef = useRef(null);

  useEffect(() => {
    if (!assessment) return;
    const prev = prevStatusRef.current;
    prevStatusRef.current = assessment.status;

    if (assessment.status === 'SCHEDULED') {
      setIsWaitingForStart(true);
    } else if (assessment.status === 'ACTIVE') {
      setIsWaitingForStart(false);
      setCountdown(null);
      if (prev === 'SCHEDULED') {
        setShowSecurityLaws(true);
        show('Assessment is now active! Review security guidelines.', 'success');
      }
      if (assessment.timeLimit && !security.timeRemaining) {
        security.startTimer(assessment.timeLimit);
      }
    }
  }, [assessment?.status, assessment?.startDate]);

  // Progress gating (submitted state / attempts / show security laws)
  useEffect(() => {
    if (!progressQuery.data) return;
    if (progressQuery.data.isSubmitted) {
      setSubmitted(true);
      setAttempts({
        used: progressQuery.data.attemptsUsed || 0,
        maxAttempts: progressQuery.data.maxAttempts ?? null,
        remaining: progressQuery.data.attemptsRemaining ?? null,
      });
    } else {
      setShowSecurityLaws(true);
    }
  }, [progressQuery.data]);

  // Restore previously-submitted result from the live results table on reload
  useEffect(() => {
    if (!userResultsQuery.data) return;
    const r = userResultsQuery.data.find(r =>
      r.assessmentId?._id === assessmentId || r.assessmentId === assessmentId
    );
    if (r) setResult(r);
  }, [userResultsQuery.data]);

  const pendingResultData = submitted && !scoringInProgress && !result && userResultsQuery.isLoading;
  const loading = assessmentQuery.isLoading
    || (!!assessment && needsProgress && progressQuery.isLoading)
    || pendingResultData
    || (submitted && !scoringInProgress && securityQuery.isLoading);

  // ── Countdown for scheduled assessments ────────────────────────────────────
  useEffect(() => {
    if (!assessment || assessment.status !== 'SCHEDULED') return;
    if (countdownRef.current) clearInterval(countdownRef.current);
    const tick = () => {
      const diff = new Date(assessment.startDate) - new Date();
      if (diff <= 0) {
        clearInterval(countdownRef.current);
        refetchAssessment();
      } else {
        setCountdown({
          days: Math.floor(diff / 86400000),
          hours: Math.floor((diff % 86400000) / 3600000),
          minutes: Math.floor((diff % 3600000) / 60000),
          seconds: Math.floor((diff % 60000) / 1000),
        });
      }
    };
    tick();
    countdownRef.current = setInterval(tick, 1000);
    return () => clearInterval(countdownRef.current);
  }, [assessment?.status, assessment?.startDate]);

  const refetchAssessment = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.assessments.detail(assessmentId) });
  };

  // ── Prevent accidental navigation ──────────────────────────────────────────
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!submitted && !isWaitingForStart && securityAcknowledged) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [submitted, isWaitingForStart, securityAcknowledged]);

  // ── Auto-submit on time expiry ──────────────────────────────────────────────
  useEffect(() => {
    if (security.timeExpired && !submitted) {
      handleSubmit(true);
    }
  }, [security.timeExpired]);

  // ── Auto-save ───────────────────────────────────────────────────────────────
  const autoSave = (questionId, value) => {
    if (debounceRef.current[questionId]) clearTimeout(debounceRef.current[questionId]);
    debounceRef.current[questionId] = setTimeout(async () => {
      try {
        await api.post('/responses/save', {
          assessmentId, questionId, selectedAnswer: value,
          employeeId, respondentType,
          securityLog: security.getViolationLog(),
        });
      } catch { }
    }, 600);
  };

  const handleAnswer = (questionId, value) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
    autoSave(questionId, value);
  };

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async (forceSubmit = false) => {
    const questions = assessment?.questionIds || [];
    const unanswered = questions.filter(q => {
      const ans = answers[q._id];
      if (ans === undefined || ans === null || ans === '') return true;
      if (Array.isArray(ans) && ans.length === 0) return true;
      if (typeof ans === 'object' && Object.keys(ans).length === 0) return true;
      return false;
    });

    if (unanswered.length > 0 && !security.timeExpired && !forceSubmit) {
      setShowSubmitWarning(true);
      return;
    }

    setSubmitting(true);
    try {
      const { data: submitData } = await api.post('/responses/submit', {
        assessmentId, employeeId, respondentType,
        securityLog: security.getViolationLog(),
        totalViolations: security.totalViolations,
      });
      if (submitData.data?.attempts) {
        const a = submitData.data.attempts;
        setAttempts({
          used: a.used || 0,
          maxAttempts: a.maxAttempts ?? null,
          remaining: a.maxAttempts == null ? null : Math.max(a.maxAttempts - (a.used || 0), 0),
        });
      }

      setSubmitted(true);
      setShowSubmitWarning(false);
      setShowBackWarning(false);
      show('Assessment submitted successfully!', 'success');
      securityQuery.refetch();

      setScoringInProgress(true);
      try {
        await api.post('/results/auto-score', { assessmentId, employeeId: user._id });
        await new Promise(r => setTimeout(r, 1500));
        let attempts = 0, assessmentResult = null;
        while (attempts < 3 && !assessmentResult) {
          try {
            const { data } = await api.get(`/results/user/${user._id}`);
            assessmentResult = data.data.results.find(r =>
              r.assessmentId?._id === assessmentId || r.assessmentId === assessmentId
            );
            if (!assessmentResult) await new Promise(r => setTimeout(r, 1000 * (attempts + 1)));
          } catch { }
          attempts++;
        }
        if (assessmentResult) setResult(assessmentResult);
        else show('Results will be available shortly.', 'success');
      } catch (err) {
        if (err.response?.data?.message?.includes('duplicate')) {
          show('Assessment already scored.', 'info');
        } else {
          show('Submitted! Check the results page.', 'info');
        }
      } finally {
        setScoringInProgress(false);
      }

      security.exitFullscreen();
    } catch (err) {
      show(err.response?.data?.message || 'Submission failed.', 'error');
    } finally {
      setSubmitting(false);
      setIsLeavingBack(false);
    }
  };

  // ── Retake (start a new attempt while attempts remain) ─────────────────────
  const handleRetake = async () => {
    setRetaking(true);
    try {
      const { data } = await api.post('/responses/start-attempt', { assessmentId });
      const a = data.data || {};
      setAttempts({
        used: a.attemptsUsed || 0,
        maxAttempts: a.maxAttempts ?? null,
        remaining: a.attemptsRemaining ?? null,
      });
      setAnswers({});
      setResult(null);
      queryClient.removeQueries({ queryKey: queryKeys.responses.securityViolations(assessmentId, user?._id) });
      queryClient.removeQueries({ queryKey: queryKeys.results.user(user?._id) });
      setCurrentQuestionIndex(0);
      violationCountRef.current = 0;
      setSubmitted(false);
      if (assessment?.timeLimit) security.startTimer(assessment.timeLimit);
      security.requestFullscreen();
      show('New attempt started. Good luck!', 'success');
    } catch (err) {
      show(err.response?.data?.message || 'Could not start a new attempt.', 'error');
    } finally {
      setRetaking(false);
    }
  };

  // ── Back button handler ─────────────────────────────────────────────────────
  const handleBackClick = () => {
    if (submitted) { nav('/assessments'); return; }
    setShowBackWarning(true);
  };

  const handleLeaveAndSubmit = async () => {
    setIsLeavingBack(true);
    await handleSubmit(true);

    // Navigate based on assessment type
    if (assessment?.type === 'CombinedAssessment') {
      nav(`/assessment/${assessmentId}`);
    } else {
      nav('/results');
    }
  };

  // ── Security acknowledgment from laws screen ────────────────────────────────
  const handleStartSecure = () => {
    setShowSecurityLaws(false);
    setSecurityAcknowledged(true);
    security.requestFullscreen();
  };

  // ── Navigator ───────────────────────────────────────────────────────────────
  const goToQuestion = (idx) => setCurrentQuestionIndex(idx);
  const goNext = () => { if (currentQuestionIndex < questions.length - 1) setCurrentQuestionIndex(i => i + 1); };
  const goPrevious = () => { if (currentQuestionIndex > 0) setCurrentQuestionIndex(i => i - 1); };

  const isAnswered = (q) => {
    const ans = answers[q._id];
    if (ans === undefined || ans === null || ans === '') return false;
    if (Array.isArray(ans) && ans.length === 0) return false;
    if (typeof ans === 'object' && Object.keys(ans).length === 0) return false;
    return true;
  };

  // Per-employee display order: questions and options are shuffled with a seed
  // derived from the employee + assessment so each employee sees a different order.
  const orderSeed = `${user?._id || 'anon'}:${assessmentId}`;
  const orderedQuestions = useMemo(
    () => shuffleBySeed(assessment?.questionIds || [], `${orderSeed}:questions`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assessment?.questionIds, orderSeed]
  );

  // ── Question renderer ───────────────────────────────────────────────────────
  const renderQuestion = (q) => {
    if (!q) return null;
    const optSeed = (field) => `${orderSeed}:${q._id}:${field}`;
    switch (q.type) {
      case 'MCQ':
      case 'ScenarioMCQ':
        return (
          <div className="space-y-2">
            {q.scenario && q.type === 'ScenarioMCQ' && (
              <div className="p-3 bg-gray-100 border-l-4 border-gray-700 rounded mb-4 max-h-48 overflow-y-auto">
                <div className="text-[10px] font-bold text-gray-700 uppercase tracking-wide mb-1">Scenario</div>
                <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap break-words">{q.scenario}</p>
              </div>
            )}
            {shuffleBySeed(q.options, optSeed('options')).map((opt, idx) => {
              const chosen = answers[q._id] === opt;
              return (
                <label key={idx} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${chosen ? 'border-red-600 bg-red-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${chosen ? 'border-red-600 bg-red-600' : 'border-gray-300'}`}>
                    {chosen && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                  <input type="radio" name={q._id} checked={chosen} onChange={() => handleAnswer(q._id, opt)} className="hidden" />
                  <span className={`text-sm flex-1 leading-relaxed break-words ${chosen ? 'text-red-800 font-medium' : 'text-gray-700'}`}>{opt}</span>
                </label>
              );
            })}
          </div>
        );

      case 'TrueFalse':
        return (
          <div className="grid grid-cols-2 gap-3">
            {['True', 'False'].map((opt) => {
              const chosen = answers[q._id] === opt;
              return (
                <button key={opt} onClick={() => handleAnswer(q._id, opt)}
                  className={`py-3 rounded-lg border font-semibold text-sm transition-all ${chosen ? 'border-red-600 bg-red-600 text-white shadow' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'}`}>
                  {opt}
                </button>
              );
            })}
          </div>
        );

      case 'Rating':
        return (
          <div className="flex flex-col items-center gap-2 py-2">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((val) => {
                const chosen = answers[q._id] >= val;
                return (
                  <button key={val} onClick={() => handleAnswer(q._id, val)} className="p-1 hover:scale-110 transition-transform">
                    <Star className="w-6 h-6" fill={chosen ? '#C8102E' : 'none'} color={chosen ? '#C8102E' : '#D1D5DB'} />
                  </button>
                );
              })}
            </div>
            {answers[q._id] && <span className="text-xs font-semibold text-gray-700">{answers[q._id]} / 5</span>}
          </div>
        );

      case 'ShortAnswer':
        return (
          <textarea
            rows={5}
            value={answers[q._id] || ''}
            onChange={(e) => handleAnswer(q._id, e.target.value)}
            placeholder="Type your answer here..."
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-red-600 focus:ring focus:ring-red-200 text-sm resize-y min-h-[100px]"
          />
        );

      case 'MultiSelect':
        return (
          <div className="space-y-2">
            {shuffleBySeed(q.options, optSeed('options')).map((opt, idx) => {
              const selected = (answers[q._id] || []).includes(opt);
              return (
                <label key={idx} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${selected ? 'border-red-600 bg-red-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${selected ? 'border-red-600 bg-red-600' : 'border-gray-300'}`}>
                    {selected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <input type="checkbox" checked={selected} onChange={(e) => {
                    const current = answers[q._id] || [];
                    handleAnswer(q._id, e.target.checked ? [...current, opt] : current.filter(i => i !== opt));
                  }} className="hidden" />
                  <span className={`text-sm flex-1 leading-relaxed break-words ${selected ? 'text-red-800 font-medium' : 'text-gray-700'}`}>{opt}</span>
                </label>
              );
            })}
            <p className="text-[10px] text-gray-500">Select all that apply</p>
          </div>
        );

      case 'Matching':
        return (
          <div className="space-y-3">
            <p className="text-[10px] text-gray-600 mb-2">Match items from left to right</p>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              {shuffleBySeed(q.matchingLeft, optSeed('left')).map((leftItem, idx) => (
                <div key={idx} className="flex items-center gap-2 mb-2 last:mb-0">
                  <div className="flex-1 p-2.5 bg-white rounded border border-gray-300 text-xs font-medium text-gray-800 break-words min-w-0">{leftItem}</div>
                  <span className="text-gray-400 text-lg flex-shrink-0">↔</span>
                  <select value={(answers[q._id] || {})[leftItem] || ''}
                    onChange={(e) => handleAnswer(q._id, { ...(answers[q._id] || {}), [leftItem]: e.target.value })}
                    className="flex-1 h-10 px-3 rounded border border-gray-300 focus:border-red-600 focus:ring focus:ring-red-200 text-xs bg-white min-w-0">
                    <option value="">— Select match —</option>
                    {shuffleBySeed(q.matchingRight, optSeed('right')).map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        );

      case 'Ordering':
        return (
          <div className="space-y-3">
            <p className="text-[10px] text-gray-600 mb-2">Arrange items in correct order — 1 = first</p>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              {shuffleBySeed(q.orderItems, optSeed('items')).map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 mb-2 last:mb-0">
                  <select value={(answers[q._id] || {})[item] || ''}
                    onChange={(e) => handleAnswer(q._id, { ...(answers[q._id] || {}), [item]: parseInt(e.target.value, 10) })}
                    className="w-20 h-10 px-2 rounded border border-gray-300 focus:border-red-600 focus:ring focus:ring-red-200 text-xs text-center font-semibold bg-white">
                    <option value="">—</option>
                    {(q.orderItems || []).map((_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
                  </select>
                  <div className="flex-1 p-2.5 bg-white rounded border border-gray-300 text-xs font-medium text-gray-800 break-words min-w-0">{item}</div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'DragDropClassification':
        return (
          <div className="space-y-3">
            <p className="text-[10px] text-gray-600 mb-2">Classify each item into a category</p>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              {shuffleBySeed(q.classificationItems, optSeed('items')).map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 mb-2 last:mb-0">
                  <div className="flex-1 p-2.5 bg-white rounded border border-gray-300 text-xs font-medium text-gray-800 break-words min-w-0">{item}</div>
                  <span className="text-gray-400 text-lg flex-shrink-0">→</span>
                  <select value={(answers[q._id] || {})[item] || ''}
                    onChange={(e) => handleAnswer(q._id, { ...(answers[q._id] || {}), [item]: e.target.value })}
                    className="flex-1 h-10 px-3 rounded border border-gray-300 focus:border-red-600 text-xs bg-white">
                    <option value="">— Select category —</option>
                    {shuffleBySeed(q.categoryNames, optSeed('cats')).map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        );

      default:
        return <p className="text-xs text-gray-500">Unsupported question type: {q.type}</p>;
    }
  };

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER STATES
  // ────────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!assessment) return null;

  const questions = orderedQuestions;
  const currentQuestion = questions[currentQuestionIndex];
  const answeredCount = questions.filter(isAnswered).length;
  const progressPercent = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;
  const isLastQuestion = currentQuestionIndex === questions.length - 1;
  const isCurrentAnswered = currentQuestion ? isAnswered(currentQuestion) : false;

  // ── Waiting for start ───────────────────────────────────────────────────────
  if (isWaitingForStart && !submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-xl shadow-lg p-6 max-w-lg w-full">
          <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-gray-700" />
          </div>
          <h2 className="text-xl  font-bold text-brand-black text-center mb-5">Assessment Scheduled</h2>

          <div className="bg-gray-50 rounded-lg p-4 mb-5 border border-gray-200">
            <p className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2">
              <Target className="w-4 h-4 text-red-600" />
              {assessment.competencyId?.name || 'N/A'}
            </p>
            <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${assessment.type === 'SelfAssessment' ? 'bg-gray-200 text-gray-800' : 'bg-brand-black text-white'}`}>
                {assessment.type}
              </span>
              {assessment.timeLimit && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{assessment.timeLimit} min</span>}
            </div>
          </div>

          {countdown && (
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-600 text-center mb-3 uppercase tracking-wide">Starts In</p>
              <div className="grid grid-cols-4 gap-3">
                {[{ label: 'Days', value: countdown.days }, { label: 'Hours', value: countdown.hours }, { label: 'Minutes', value: countdown.minutes }, { label: 'Seconds', value: countdown.seconds }].map(({ label, value }) => (
                  <div key={label} className="text-center">
                    <div className="bg-gradient-to-b from-gray-100 to-white rounded-lg p-3 border border-gray-300">
                      <div className="text-2xl font-bold font-mono text-gray-700">{String(value).padStart(2, '0')}</div>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-1 font-medium">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-gray-100 border-l-4 border-gray-700 p-3 rounded mb-5 text-xs text-gray-700 space-y-1">
            <p><strong>Starts:</strong> {new Date(assessment.startDate).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
            <p><strong>Ends:</strong> {new Date(assessment.endDate).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
          </div>

          <div className="bg-gray-100 border-l-4 border-gray-700 p-3 rounded mb-5">
            <div className="flex gap-2">
              <AlertTriangle className="w-4 h-4 text-gray-700 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-gray-700">This page will automatically refresh when the assessment starts.</p>
            </div>
          </div>

          <button onClick={() => nav('/assessments')}
            className="w-full py-2.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to Assessments
          </button>
        </div>
      </div>
    );
  }

  // ── Security Laws Screen ────────────────────────────────────────────────────
  if (showSecurityLaws && !submitted) {
    return (
      <SecurityLawsScreen
        assessment={assessment}
        onAccept={handleStartSecure}
        onCancel={() => nav('/assessments')}
      />
    );
  }

  // ── Scoring in progress ─────────────────────────────────────────────────────
  if (submitted && scoringInProgress) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-sm text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
          </div>
          <h2 className="text-xl  font-bold text-brand-black mb-2">Calculating Results...</h2>
        </div>
      </div>
    );
  }

  // ── Result view ─────────────────────────────────────────────────────────────
  if (submitted && result) {
    const effectiveViolations = securityLoaded
      ? (securitySummary?.summary?.totalViolations ?? 0)
      : security.totalViolations;
    const effectiveTabSwitches = securityLoaded
      ? (securitySummary?.summary?.tabSwitches ?? 0)
      : security.tabSwitchCount;
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-xl shadow-lg p-6 max-w-lg w-full">
          <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-brand-black" />
          </div>
          <h2 className="text-xl  font-bold text-brand-black text-center mb-4">Assessment Completed!</h2>

          <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-5 mb-4 border border-red-200">
            <div className="text-center mb-4">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white shadow mb-2">
                <div className="text-3xl  font-bold text-red-600">{result.finalScore}%</div>
              </div>
              <div className="flex items-center justify-center gap-2 mb-1">
                <Award className="w-4 h-4 text-red-600" />
                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase badge badge-${result.level?.toLowerCase()}`}>
                  {result.level}
                </span>
              </div>
              <div className="text-xs text-gray-600">{result.competencyId?.name}</div>
            </div>

            <div className="mb-4">
              <div className="flex justify-between text-[9px] text-gray-600 mb-1">
                <span>Basic</span><span>Int.</span><span>Adv.</span><span>Exp.</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-red-600 to-red-700 rounded-full" style={{ width: `${result.finalScore}%` }} />
              </div>
            </div>

            {result.recommendation && (
              <div className="bg-white rounded-lg p-3 border-l-4 border-red-600">
                <div className="flex items-start gap-2">
                  <TrendingUp className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[9px] font-bold text-red-600 uppercase mb-1">Recommendation</div>
                    <p className="text-xs text-gray-700 leading-relaxed">{result.recommendation}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {effectiveViolations > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2 mb-4">
              <div className="text-[9px] font-semibold text-red-800">
                Security: {effectiveViolations} violation{effectiveViolations !== 1 ? 's' : ''} recorded
                {effectiveTabSwitches > 0 && ` (${effectiveTabSwitches} tab switch${effectiveTabSwitches !== 1 ? 'es' : ''})`}
              </div>
            </div>
          )}

          <div className="text-center text-[11px] text-gray-500 mb-4">
            {attempts.maxAttempts != null
              ? `Attempt ${attempts.used} of ${attempts.maxAttempts}`
              : attempts.used > 0 ? `Attempt ${attempts.used} · Unlimited attempts` : 'Unlimited attempts'}
          </div>

          <div className="flex gap-2">
            {(attempts.maxAttempts == null || (attempts.remaining ?? 0) > 0) && (
              <button onClick={handleRetake} disabled={retaking} className="flex-1 py-2 bg-brand-red text-white rounded-lg text-xs font-semibold hover:bg-brand-red-dark disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1">
                {retaking ? 'Starting…' : `Retake${attempts.maxAttempts != null ? ` (${attempts.remaining} left)` : ''}`}
              </button>
            )}
            <button onClick={() => nav('/results')} className="flex-1 py-2 border border-red-600 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-50">
              View All
            </button>
            <button onClick={() => nav('/assessments')} className="flex-1 py-2 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700">
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Generic submitted (no result yet) ──────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm text-center">
          <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-brand-black" />
          </div>
          <h2 className="text-xl  font-bold text-brand-black mb-4">Submitted!</h2>
          <button
            onClick={() => {
              if (assessment?.type === 'CombinedAssessment') {
                nav(`/assessment/${assessmentId}`);
              } else {
                nav('/results');
              }
            }}
            className="px-6 py-2 bg-red-600 text-white rounded-lg text-xs font-semibold"
          >
            {assessment?.type === 'CombinedAssessment' ? 'Continue to Assessment' : 'View Results'}
          </button>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // MAIN ASSESSMENT UI
  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Security Violation Banner (dismissible) ── */}
      {showViolationBanner && (
        <SecurityViolationBanner
          violations={security.violations}
          onDismiss={() => setShowViolationBanner(false)}
        />
      )}

      {/* ── Serious Violation Modal (3+ violations) ── */}
      {showSeriousModal && (
        <SeriousViolationModal
          count={security.totalViolations}
          onAcknowledge={() => setShowSeriousModal(false)}
        />
      )}

      {/* ── Security Monitor Modal (dismissible) ── */}
      {showSecurityMonitor && security.violations.length > 0 && (
        <SecurityMonitorModal
          violations={security.violations}
          isHighRisk={security.isHighRisk}
          onDismiss={() => setShowSecurityMonitor(false)}
        />
      )}

      {/* ── Back Warning Modal ── */}
      {showBackWarning && (
        <BackWarningModal
          answeredCount={answeredCount}
          totalCount={questions.length}
          onStay={() => setShowBackWarning(false)}
          onLeave={handleLeaveAndSubmit}
          isLeaving={isLeavingBack}
        />
      )}

      {/* ── Submit Warning Modal (unanswered questions) ── */}
      {showSubmitWarning && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-gray-700" />
            </div>
            <h3 className="text-lg font-bold text-brand-black text-center mb-2">Incomplete Assessment</h3>
            <p className="text-sm text-gray-600 text-center mb-4">
              You have <strong>{questions.length - answeredCount}</strong> unanswered question{questions.length - answeredCount !== 1 ? 's' : ''}.
              These will receive 0 points.
            </p>
            <div className="bg-gray-100 border-l-4 border-gray-700 p-3 rounded mb-4">
              <p className="text-xs text-gray-700">Go back to answer remaining questions, or submit with incomplete answers.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowSubmitWarning(false)}
                className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50">
                Go Back
              </button>
              <LoadingButton
                onClick={() => handleSubmit(true)}
                loading={submitting}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-60"
              >
                Submit Anyway
              </LoadingButton>
            </div>
          </div>
        </div>
      )}

      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-2">
          <div className="flex justify-between items-center mb-2">
            <button
              onClick={handleBackClick}
              className="flex items-center gap-1 text-xs text-gray-600 hover:text-red-600 transition-colors"
            >
              <ArrowLeft className="w-3 h-3" /> Back
            </button>

            <div className="flex items-center gap-3">
              {security.timeRemaining !== null && (
                <div className={`flex items-center gap-1 px-2 py-1 rounded-lg font-semibold text-xs ${security.timeRemaining < 300 ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-gray-100 text-gray-700'}`}>
                  <Clock className="w-3 h-3" />
                  <span className="font-mono">{security.formatTime(security.timeRemaining)}</span>
                </div>
              )}
              <span className="text-xs text-gray-500 font-medium">{answeredCount}/{questions.length}</span>
            </div>
          </div>

          {/* Competency name only in header */}
          <h2 className="text-base  font-bold text-brand-black mb-1 truncate">
            {assessment.competencyId?.name || 'Assessment'}
          </h2>

          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-red-600 rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }} />
            </div>
            <span className="text-xs font-bold text-red-600">{progressPercent}%</span>
          </div>
        </div>
      </div>

      {/* ── Main Content: question + right-side navigator ── */}
      <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col lg:flex-row gap-4 items-start">

        <div className="flex-1 min-w-0 w-full space-y-4">

        {/* Question Card */}
        <div className="bg-white rounded-xl shadow border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-red-50 to-red-100 px-5 pt-3 pb-4 border-b border-gray-200">
            <div className="flex justify-between items-start gap-2 mb-2">
              <span className="text-[10px] font-semibold text-gray-500 uppercase flex-shrink-0 mt-0.5">
                Q{currentQuestionIndex + 1}/{questions.length}
              </span>
              <span className="px-2 py-0.5 bg-white rounded-full text-[9px] font-semibold text-gray-700 border border-gray-200 flex-shrink-0">
                {currentQuestion?.type}
              </span>
            </div>
            <p className="text-sm font-medium text-brand-black leading-relaxed whitespace-pre-wrap break-words">
              {currentQuestion?.text}
            </p>
          </div>

          <div className="px-5 py-4">
            {renderQuestion(currentQuestion)}
          </div>

          <div className="bg-gray-50 px-5 py-3 border-t border-gray-200">
            <div className="flex justify-between items-center">
              <button
                onClick={goPrevious}
                disabled={currentQuestionIndex === 0}
                className="flex items-center gap-1 px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed border border-gray-300 text-gray-700 hover:bg-gray-100"
              >
                <ChevronLeft className="w-3 h-3" /> Prev
              </button>

              <div className="flex items-center gap-2">
                {isCurrentAnswered && (
                  <span className="flex items-center gap-1 text-brand-black text-xs">
                    <Check className="w-3 h-3" /> Answered
                  </span>
                )}
              </div>

              {!isLastQuestion ? (
                <button
                  onClick={goNext}
                  className="flex items-center gap-1 px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700"
                >
                  Next <ChevronRight className="w-3 h-3" />
                </button>
              ) : (
                <LoadingButton
                  onClick={() => handleSubmit(false)}
                  loading={submitting}
                  disabled={submitting}
                  className="px-5 py-2 bg-brand-black text-white rounded-lg text-xs font-bold hover:bg-gray-800 disabled:opacity-60 disabled:bg-gray-500"
                >
                  Submit
                </LoadingButton>
              )}
            </div>
          </div>
        </div>
        {/* Question Navigator — right side, sticky, scrollable */}
        </div>

        <aside className="w-full lg:w-56 flex-shrink-0 bg-white rounded-xl shadow border border-gray-100 p-4 lg:sticky lg:top-32 lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto scrollbar-none">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-brand-black">Navigator</h3>
            <span className="text-xs text-gray-500 font-medium">{answeredCount}/{questions.length}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {questions.map((q, idx) => {
              const ans = isAnswered(q);
              const isCurrent = idx === currentQuestionIndex;
              return (
                <button key={q._id} onClick={() => goToQuestion(idx)} title={`Question ${idx + 1}`}
                  className={`w-9 h-9 rounded-lg text-xs font-semibold transition-all flex items-center justify-center flex-shrink-0 ${isCurrent ? 'bg-red-600 text-white shadow scale-105' : ans ? 'bg-green-300 text-gray-700 border border-gray-400' : 'bg-gray-100 text-gray-600 border border-gray-200 hover:border-gray-300'}`}>
                  {idx + 1}
                </button>
              );
            })}
          </div>
          <div className="flex lg:flex-col flex-wrap gap-x-3 gap-y-1.5 mt-4 text-[10px]">
            <div className="flex items-center gap-1.5"><div className="w-3.5 h-3.5 rounded bg-red-600 flex-shrink-0" /><span className="text-gray-600">Current</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3.5 h-3.5 rounded bg-green-300 border border-gray-400 flex-shrink-0" /><span className="text-gray-600">Answered</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3.5 h-3.5 rounded bg-gray-100 border border-gray-200 flex-shrink-0" /><span className="text-gray-600">Unanswered</span></div>
          </div>
        </aside>
      </div>
    </div>
  );
}