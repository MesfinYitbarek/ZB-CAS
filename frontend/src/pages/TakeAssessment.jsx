import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import useAssessmentSecurity from '../hooks/useAssessmentSecurity';
import {
  CheckCircle, ArrowLeft, Star, AlertTriangle, Clock, Shield,
  TrendingUp, Award, FileText, Check, ChevronLeft, ChevronRight, X,
  Calendar, Target, Info
} from 'lucide-react';
import SecurityMonitor from '../components/SecurityMonitor';
import { exportToPDF, generateFilename } from '../utils/exportUtils';
import api from '../utils/api';

export default function TakeAssessment() {
  const { assessmentId } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const { show } = useToast();

  const [assessment, setAssessment] = useState(null);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState(null);
  const [scoringInProgress, setScoringInProgress] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [securityAcknowledged, setSecurityAcknowledged] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showSubmitWarning, setShowSubmitWarning] = useState(false);
  const debounceRef = useRef({});

  const [isWaitingForStart, setIsWaitingForStart] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const countdownRef = useRef(null);

  const respondentType = user?.role === 'SUPERVISOR' ? 'supervisor' : 'self';
  const employeeId = respondentType === 'supervisor'
    ? new URLSearchParams(window.location.search).get('employeeId') || user?._id
    : user?._id;

  const security = useAssessmentSecurity(assessmentId, (violation) => {
    api.post(`/responses/security-violation`, {
      assessmentId,
      userId: user._id,
      violation,
    }).catch(() => { });

    if (security.totalViolations >= 3) {
      setShowWarning(true);
    }
  });

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get(`/assessments/${assessmentId}`);
        const fetched = data.data.assessment;
        setAssessment(fetched);

        if (fetched.status === 'SCHEDULED') {
          setIsWaitingForStart(true);
        } else if (fetched.status === 'ACTIVE') {
          setIsWaitingForStart(false);
          if (fetched.timeLimit) {
            security.startTimer(fetched.timeLimit);
          }
        }

        if (fetched.status === 'ACTIVE' || fetched.status === 'COMPLETED') {
          const prog = await api.get(`/responses/progress/${assessmentId}`);
          if (prog.data.data.isSubmitted) {
            setSubmitted(true);
            await checkResult();
          }
        }
      } catch (err) {
        show('Failed to load assessment.', 'error');
        nav('/assessments');
      }
      setLoading(false);
    };
    load();
  }, [assessmentId]);

  useEffect(() => {
    if (!assessment || assessment.status !== 'SCHEDULED') return;

    if (countdownRef.current) clearInterval(countdownRef.current);

    const tick = () => {
      const now = new Date();
      const start = new Date(assessment.startDate);
      const diff = start - now;

      if (diff <= 0) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
        refetchAssessment();
      } else {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setCountdown({ days, hours, minutes, seconds });
      }
    };

    tick();
    countdownRef.current = setInterval(tick, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [assessment?.status, assessment?.startDate]);

  const refetchAssessment = async () => {
    try {
      const { data } = await api.get(`/assessments/${assessmentId}`);
      const fetched = data.data.assessment;
      setAssessment(fetched);

      if (fetched.status === 'ACTIVE') {
        setIsWaitingForStart(false);
        setCountdown(null);
        show('Assessment is now active! You can start.', 'success');

        if (fetched.timeLimit) {
          security.startTimer(fetched.timeLimit);
        }
      } else if (fetched.status === 'SCHEDULED') {
        setIsWaitingForStart(true);
      }
    } catch (err) {
      show('Failed to refresh assessment status.', 'error');
    }
  };

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!submitted && !isWaitingForStart) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    const handlePopState = async (e) => {
      if (!submitted && !isWaitingForStart) {
        e.preventDefault();
        await handleSubmit(true);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [submitted, answers, isWaitingForStart]);

  const checkResult = async () => {
    try {
      const { data } = await api.get(`/results/user/${user._id}`);
      const assessmentResult = data.data.results.find(r => r.assessmentId?._id === assessmentId);
      if (assessmentResult) {
        setResult(assessmentResult);
      }
    } catch (_) { }
  };

  useEffect(() => {
    if (security.timeExpired && !submitted) {
      handleSubmit(true);
    }
  }, [security.timeExpired]);

  useEffect(() => {
    if (!security.isTabActive && securityAcknowledged && !submitted) {
      show('⚠️ Assessment tab is inactive!', 'warning');
    }
  }, [security.isTabActive]);

  const autoSave = (questionId, value) => {
    if (debounceRef.current[questionId]) clearTimeout(debounceRef.current[questionId]);
    debounceRef.current[questionId] = setTimeout(async () => {
      try {
        await api.post('/responses/save', {
          assessmentId,
          questionId,
          selectedAnswer: value,
          employeeId,
          respondentType,
          securityLog: security.getViolationLog(),
        });
      } catch (_) { }
    }, 600);
  };

  const handleAnswer = (questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    autoSave(questionId, value);
  };

  const handleSubmit = async (forceSubmit = false) => {
    const questions = assessment?.questionIds || [];
    const unanswered = questions.filter((q) => {
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

    try {
      await api.post('/responses/submit', {
        assessmentId,
        employeeId,
        respondentType,
        securityLog: security.getViolationLog(),
        totalViolations: security.totalViolations,
      });

      setSubmitted(true);
      setShowSubmitWarning(false);
      show('Assessment submitted successfully!', 'success');

      if (assessment.type === 'SelfAssessment') {
        setScoringInProgress(true);
        try {
          await api.post(`/results/auto-score`, {
            assessmentId,
            employeeId: user._id
          });
          await new Promise(resolve => setTimeout(resolve, 1500));

          let attempts = 0;
          let assessmentResult = null;

          while (attempts < 3 && !assessmentResult) {
            try {
              const { data } = await api.get(`/results/user/${user._id}`);
              assessmentResult = data.data.results.find(r =>
                r.assessmentId?._id === assessmentId || r.assessmentId === assessmentId
              );

              if (!assessmentResult) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempts + 1)));
              }
            } catch (err) {
              console.warn(`Attempt ${attempts + 1} failed:`, err.message);
            }
            attempts++;
          }

          if (assessmentResult) {
            setResult(assessmentResult);
          } else {
            show('Assessment submitted! Results will be available shortly.', 'success');
          }
        } catch (err) {
          console.error('Scoring error:', err);
          if (err.response?.data?.message?.includes('duplicate') ||
            err.response?.data?.message?.includes('unique')) {
            show('Assessment already scored. Check your results.', 'info');
          } else {
            show('Assessment submitted but scoring encountered an issue. Check results page.', 'info');
          }
        } finally {
          setScoringInProgress(false);
        }
      }

      security.exitFullscreen();
    } catch (err) {
      show(err.response?.data?.message || 'Submit failed.', 'error');
    }
  };

  const handleExportResult = async () => {
    try {
      const exportData = {
        type: 'results',
        user: user,
        results: [{
          ...result,
          competencyName: result.competencyId?.name,
        }],
      };

      await exportToPDF(exportData, generateFilename(`result_${assessment.competencyId?.name}`, 'pdf'));
      show('Result exported to PDF!', 'success');
    } catch (err) {
      show('Export failed: ' + err.message, 'error');
    }
  };

  const handleStartSecure = () => {
    setSecurityAcknowledged(true);
    security.requestFullscreen();
  };

  const goToQuestion = (index) => {
    setCurrentQuestionIndex(index);
  };

  const goNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const goPrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const isCurrentQuestionAnswered = () => {
    const currentQ = questions[currentQuestionIndex];
    if (!currentQ) return false;

    const ans = answers[currentQ._id];
    if (ans === undefined || ans === null || ans === '') return false;
    if (Array.isArray(ans) && ans.length === 0) return false;
    if (typeof ans === 'object' && Object.keys(ans).length === 0) return false;
    return true;
  };

  const renderQuestion = (q) => {
    switch (q.type) {
      case 'MCQ':
      case 'ScenarioMCQ':
        return (
          <div className="space-y-2">
            {q.scenario && q.type === 'ScenarioMCQ' && (
              <div className="p-3 bg-blue-50 border-l-4 border-blue-500 rounded mb-4">
                <div className="text-[10px] font-bold text-blue-800 uppercase tracking-wide mb-1">Scenario</div>
                <p className="text-xs text-blue-900 leading-relaxed whitespace-pre-wrap">{q.scenario}</p>
              </div>
            )}
            {(q.options || []).map((opt, idx) => {
              const chosen = answers[q._id] === opt;
              return (
                <label
                  key={idx}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${chosen
                      ? 'border-brand-red bg-brand-red/5'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${chosen ? 'border-brand-red bg-brand-red' : 'border-gray-300'
                    }`}>
                    {chosen && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                  <input
                    type="radio"
                    name={q._id}
                    checked={chosen}
                    onChange={() => handleAnswer(q._id, opt)}
                    className="hidden"
                  />
                  <span className={`text-xs flex-1 ${chosen ? 'text-brand-red-dark font-medium' : 'text-gray-700'}`}>
                    {opt}
                  </span>
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
                <button
                  key={opt}
                  onClick={() => handleAnswer(q._id, opt)}
                  className={`py-3 rounded-lg border font-semibold text-sm transition-all ${chosen
                      ? 'border-brand-red bg-brand-red text-white shadow'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                >
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
                  <button
                    key={val}
                    onClick={() => handleAnswer(q._id, val)}
                    className="p-1 hover:scale-110 transition-transform"
                  >
                    <Star
                      className="w-6 h-6"
                      fill={chosen ? '#EA580C' : 'none'}
                      color={chosen ? '#EA580C' : '#D1D5DB'}
                    />
                  </button>
                );
              })}
            </div>
            {answers[q._id] && (
              <span className="text-xs font-semibold text-gray-700">
                {answers[q._id]} / 5
              </span>
            )}
          </div>
        );

      case 'ShortAnswer':
        return (
          <textarea
            rows={4}
            value={answers[q._id] || ''}
            onChange={(e) => handleAnswer(q._id, e.target.value)}
            placeholder="Type your answer here..."
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-brand-red focus:ring focus:ring-brand-red/20 text-xs resize-none"
          />
        );

      case 'MultiSelect':
        return (
          <div className="space-y-2">
            {(q.options || []).map((opt, idx) => {
              const selected = (answers[q._id] || []).includes(opt);
              return (
                <label
                  key={idx}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${selected
                      ? 'border-brand-red bg-brand-red/5'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                >
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${selected ? 'border-brand-red bg-brand-red' : 'border-gray-300'
                    }`}>
                    {selected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(e) => {
                      const current = answers[q._id] || [];
                      const updated = e.target.checked
                        ? [...current, opt]
                        : current.filter((item) => item !== opt);
                      handleAnswer(q._id, updated);
                    }}
                    className="hidden"
                  />
                  <span className={`text-xs flex-1 ${selected ? 'text-brand-red-dark font-medium' : 'text-gray-700'}`}>
                    {opt}
                  </span>
                </label>
              );
            })}
            <p className="text-[10px] text-gray-500">Select all that apply</p>
          </div>
        );

      case 'Matching':
        return (
          <div className="space-y-3">
            <p className="text-[10px] text-gray-600 mb-2 flex items-center gap-2">
              <span className="font-semibold">Match items from left to right</span>
              <span className="text-gray-400">•</span>
              <span>Items will be shuffled for security</span>
            </p>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              {(q.matchingLeft || []).map((leftItem, idx) => {
                const currentMatch = (answers[q._id] || {})[leftItem];
                return (
                  <div key={idx} className="flex items-center gap-2 mb-2 last:mb-0">
                    <div className="flex-1 p-2.5 bg-white rounded border border-gray-300 text-xs font-medium text-gray-800">
                      {leftItem}
                    </div>
                    <span className="text-gray-400 text-lg">↔</span>
                    <select
                      value={currentMatch || ''}
                      onChange={(e) => {
                        const updated = { ...(answers[q._id] || {}), [leftItem]: e.target.value };
                        handleAnswer(q._id, updated);
                      }}
                      className="flex-1 h-10 px-3 rounded border border-gray-300 focus:border-brand-red focus:ring focus:ring-brand-red/20 text-xs bg-white"
                    >
                      <option value="">— Select match —</option>
                      {(q.matchingRight || []).map((rightItem) => (
                        <option key={rightItem} value={rightItem}>{rightItem}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-gray-500 italic">
              Match each item on the left with its corresponding item on the right
            </p>
          </div>
        );

      case 'Ordering':
        return (
          <div className="space-y-3">
            <p className="text-[10px] text-gray-600 mb-2 flex items-center gap-2">
              <span className="font-semibold">Arrange items in correct order</span>
              <span className="text-gray-400">•</span>
              <span>1 = first, {(q.orderItems || []).length} = last</span>
            </p>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              {(q.orderItems || []).map((item, idx) => {
                const currentOrder = (answers[q._id] || {})[item];
                return (
                  <div key={idx} className="flex items-center gap-2 mb-2 last:mb-0">
                    <select
                      value={currentOrder || ''}
                      onChange={(e) => {
                        const updated = { ...(answers[q._id] || {}), [item]: parseInt(e.target.value, 10) };
                        handleAnswer(q._id, updated);
                      }}
                      className="w-20 h-10 px-2 rounded border border-gray-300 focus:border-brand-red focus:ring focus:ring-brand-red/20 text-xs text-center font-semibold bg-white"
                    >
                      <option value="">—</option>
                      {(q.orderItems || []).map((_, i) => (
                        <option key={i} value={i + 1}>{i + 1}</option>
                      ))}
                    </select>
                    <div className="flex-1 p-2.5 bg-white rounded border border-gray-300 text-xs font-medium text-gray-800">
                      {item}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-gray-500 italic">
              Assign a position number to each item (items are shuffled)
            </p>
          </div>
        );

      case 'DragDropClassification':
        return (
          <div className="space-y-3">
            <p className="text-[10px] text-gray-600 mb-2 flex items-center gap-2">
              <span className="font-semibold">Classify each item into a category</span>
              <span className="text-gray-400">•</span>
              <span>Items are shuffled</span>
            </p>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              {(q.classificationItems || []).map((item, idx) => {
                const currentCategory = (answers[q._id] || {})[item];
                return (
                  <div key={idx} className="flex items-center gap-2 mb-2 last:mb-0">
                    <div className="flex-1 p-2.5 bg-white rounded border border-gray-300 text-xs font-medium text-gray-800">
                      {item}
                    </div>
                    <span className="text-gray-400 text-lg">→</span>
                    <select
                      value={currentCategory || ''}
                      onChange={(e) => {
                        const updated = { ...(answers[q._id] || {}), [item]: e.target.value };
                        handleAnswer(q._id, updated);
                      }}
                      className="flex-1 h-10 px-3 rounded border border-gray-300 focus:border-brand-red focus:ring focus:ring-brand-red/20 text-xs bg-white"
                    >
                      <option value="">— Select category —</option>
                      {(q.categoryNames || []).map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="text-[10px] text-gray-500">Available categories:</span>
              {(q.categoryNames || []).map((cat, i) => (
                <span key={i} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium">
                  {cat}
                </span>
              ))}
            </div>
          </div>
        );

      default:
        return <p className="text-xs text-gray-500">Unsupported question type: {q.type}</p>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!assessment) return null;

  const questions = assessment.questionIds || [];
  const currentQuestion = questions[currentQuestionIndex];

  const answeredCount = questions.filter((q) => {
    const ans = answers[q._id];
    if (ans === undefined || ans === null || ans === '') return false;
    if (Array.isArray(ans) && ans.length === 0) return false;
    if (typeof ans === 'object' && Object.keys(ans).length === 0) return false;
    return true;
  }).length;

  const progressPercent = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;
  const isLastQuestion = currentQuestionIndex === questions.length - 1;

  if (isWaitingForStart && !submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-xl shadow-lg p-6 max-w-lg w-full">
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-xl font-display font-bold text-brand-black text-center mb-1">
            Assessment Scheduled
          </h2>
          <p className="text-xs text-gray-500 text-center mb-5">
            This assessment has not started yet
          </p>

          <div className="bg-gray-50 rounded-lg p-4 mb-5 border border-gray-200">
            <h3 className="text-sm font-bold text-brand-black mb-2 flex items-center gap-2">
              <Info className="w-4 h-4 text-gray-500" />
              Assessment Details
            </h3>
            <p className="text-sm text-gray-700 leading-relaxed mb-3">
              {assessment.description || 'No description provided.'}
            </p>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex items-center gap-2 text-gray-600">
                <Target className="w-3 h-3 text-brand-red" />
                <span>{assessment.competencyId?.name || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  assessment.type === 'SelfAssessment' ? 'bg-blue-100 text-blue-800' :
                  assessment.type === 'Combined' ? 'bg-purple-100 text-purple-800' :
                  'bg-green-100 text-green-800'
                }`}>
                  {assessment.type}
                </span>
              </div>
              {assessment.timeLimit && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Clock className="w-3 h-3 text-brand-red" />
                  <span>{assessment.timeLimit} min time limit</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-gray-600">
                <FileText className="w-3 h-3 text-brand-red" />
                <span>{questions.length} question{questions.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>

          {countdown && (
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-600 text-center mb-3 uppercase tracking-wide">
                Starts In
              </p>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Days', value: countdown.days },
                  { label: 'Hours', value: countdown.hours },
                  { label: 'Minutes', value: countdown.minutes },
                  { label: 'Seconds', value: countdown.seconds },
                ].map(({ label, value }) => (
                  <div key={label} className="text-center">
                    <div className="bg-gradient-to-b from-blue-50 to-blue-100 rounded-lg p-3 border border-blue-200">
                      <div className="text-2xl font-bold font-mono text-blue-800">
                        {String(value).padStart(2, '0')}
                      </div>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-1 font-medium">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded mb-5">
            <div className="text-xs text-blue-800 space-y-1">
              <p>
                <strong>Starts:</strong>{' '}
                {new Date(assessment.startDate).toLocaleString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                  hour: '2-digit', minute: '2-digit'
                })}
              </p>
              <p>
                <strong>Ends:</strong>{' '}
                {new Date(assessment.endDate).toLocaleString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                  hour: '2-digit', minute: '2-digit'
                })}
              </p>
            </div>
          </div>

          <div className="bg-yellow-50 border-l-4 border-yellow-500 p-3 rounded mb-5">
            <div className="flex gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-yellow-800">
                This page will automatically refresh when the assessment starts.
                You can also leave and come back at the scheduled start time.
              </p>
            </div>
          </div>

          <button
            onClick={() => nav('/assessments')}
            className="w-full py-2.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Assessments
          </button>
        </div>
      </div>
    );
  }

  if (!securityAcknowledged && !submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full">
          <div className="w-12 h-12 rounded-full bg-brand-red/10 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-6 h-6 text-brand-red" />
          </div>

          <h2 className="text-xl font-display font-bold text-brand-black text-center mb-3">
            Assessment Security Notice
          </h2>

          <div className="space-y-3 mb-6 text-gray-600">
            <p className="text-xs text-center">
              This assessment is monitored for integrity:
            </p>

            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-brand-red flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-brand-black text-sm">Tab Monitoring</div>
                  <div className="text-[10px] mt-0.5">Switching tabs will be recorded</div>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Clock className="w-4 h-4 text-brand-red flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-brand-black text-sm">Time Limit</div>
                  <div className="text-[10px] mt-0.5">
                    {assessment.timeLimit ? `${assessment.timeLimit} minutes` : 'No time limit'}
                  </div>
                </div>
              </div>

              {assessment.type === 'SelfAssessment' && (
                <div className="flex items-start gap-2">
                  <TrendingUp className="w-4 h-4 text-brand-red flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-brand-black text-sm">Immediate Results</div>
                    <div className="text-[10px] mt-0.5">Score shown after submission</div>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-3 rounded">
              <div className="flex gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="text-[10px] text-yellow-800">
                  <strong>Note:</strong> Multiple violations will be flagged. Using the back button will auto-submit your assessment.
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => nav('/assessments')}
              className="flex-1 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleStartSecure}
              className="flex-1 py-2 bg-brand-red text-white rounded-lg text-xs font-semibold hover:bg-brand-red-dark"
            >
              Start Assessment
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (submitted && assessment.type === 'SelfAssessment') {
    if (scoringInProgress) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-sm text-center">
            <div className="w-16 h-16 rounded-full bg-brand-red/10 flex items-center justify-center mx-auto mb-4">
              <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
            </div>
            <h2 className="text-xl font-display font-bold text-brand-black mb-2">Scoring...</h2>
            <p className="text-xs text-gray-500">Please wait while we calculate your results.</p>
          </div>
        </div>
      );
    }

    if (result) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-lg w-full">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-display font-bold text-brand-black text-center mb-1">Assessment Completed!</h2>
            <p className="text-xs text-gray-500 text-center mb-4">Your results are ready</p>

            <div className="bg-gradient-to-br from-brand-red/5 to-brand-red/10 rounded-xl p-5 mb-4 border border-brand-red/20">
              <div className="text-center mb-4">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white shadow mb-2">
                  <div className="text-3xl font-display font-bold text-brand-red">{result.finalScore}%</div>
                </div>
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Award className="w-4 h-4 text-brand-red" />
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase badge badge-${result.level.toLowerCase()}`}>
                    {result.level}
                  </span>
                </div>
                <div className="text-xs text-gray-600">
                  {result.competencyId?.name}
                </div>
              </div>

              <div className="mb-4">
                <div className="flex justify-between text-[9px] text-gray-600 mb-1">
                  <span>Basic</span>
                  <span>Int.</span>
                  <span>Adv.</span>
                  <span>Exp.</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-brand-red to-brand-red-dark rounded-full"
                    style={{ width: `${result.finalScore}%` }}
                  />
                </div>
              </div>

              {result.recommendation && (
                <div className="bg-white rounded-lg p-3 border-l-4 border-brand-red">
                  <div className="flex items-start gap-2">
                    <TrendingUp className="w-4 h-4 text-brand-red flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-[9px] font-bold text-brand-red uppercase mb-1">Recommendation</div>
                      <p className="text-xs text-gray-700 leading-relaxed">
                        {result.recommendation}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {security.totalViolations > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mb-4">
                <div className="text-[9px] font-semibold text-yellow-800 uppercase mb-1">Security</div>
                <div className="text-[9px] text-yellow-700">Tab switches: {security.tabSwitchCount}</div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleExportResult}
                className="flex-1 py-2 border border-brand-red text-brand-red rounded-lg text-xs font-semibold hover:bg-brand-red-muted flex items-center justify-center gap-1"
              >
                <FileText className="w-3 h-3" /> Export
              </button>
              <button
                onClick={() => nav('/results')}
                className="flex-1 py-2 border border-brand-red text-brand-red rounded-lg text-xs font-semibold hover:bg-brand-red-muted"
              >
                View All
              </button>
              <button
                onClick={() => nav('/assessments')}
                className="flex-1 py-2 bg-brand-red text-white rounded-lg text-xs font-semibold hover:bg-brand-red-dark"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-display font-bold text-brand-black mb-1">Submitted!</h2>
          <p className="text-xs text-gray-500 mb-4">Assessment submitted successfully.</p>
          <button onClick={() => nav('/results')} className="px-6 py-2 bg-brand-red text-white rounded-lg text-xs font-semibold">
            View Results
          </button>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-display font-bold text-brand-black mb-1">Assessment Submitted</h2>
          <p className="text-xs text-gray-500 mb-3">Your responses have been recorded.</p>

          {security.totalViolations > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mb-4 text-left">
              <div className="text-[9px] font-semibold text-yellow-800">Security: {security.totalViolations} violations</div>
            </div>
          )}

          <button onClick={() => nav('/assessments')} className="px-6 py-2 bg-brand-red text-white rounded-lg text-xs font-semibold">
            Back to Assessments
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {showWarning && (
        <div className="fixed top-0 left-0 right-0 bg-yellow-500 text-white px-4 py-2 z-50 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="font-medium">Warning: {security.totalViolations} security violations</span>
          </div>
          <button onClick={() => setShowWarning(false)} className="hover:bg-yellow-600 px-2 py-1 rounded">
            Dismiss
          </button>
        </div>
      )}

      <SecurityMonitor violations={security.violations} isHighRisk={security.isHighRisk} />

      {showSubmitWarning && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
            <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-yellow-600" />
            </div>
            <h3 className="text-lg font-bold text-brand-black text-center mb-2">
              Incomplete Assessment
            </h3>
            <p className="text-sm text-gray-600 text-center mb-4">
              You have {questions.length - answeredCount} unanswered question{questions.length - answeredCount !== 1 ? 's' : ''}.
              Unanswered questions will receive 0 points.
            </p>
            <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded mb-4">
              <p className="text-xs text-blue-900">
                You can go back and answer remaining questions, or submit now with incomplete answers.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSubmitWarning(false)}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Go Back
              </button>
              <button
                onClick={() => handleSubmit(true)}
                className="flex-1 py-2.5 bg-brand-red text-white rounded-lg text-sm font-semibold hover:bg-brand-red-dark"
              >
                Submit Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`sticky ${showWarning ? 'top-8' : 'top-0'} z-40 bg-white border-b border-gray-200 shadow-sm`}>
        <div className="max-w-4xl mx-auto px-4 py-2">
          <div className="flex justify-between items-center mb-2">
            <button
              onClick={async () => {
                if (!submitted) {
                  await handleSubmit(true);
                } else {
                  nav('/assessments');
                }
              }}
              className="flex items-center gap-1 text-xs text-gray-600 hover:text-brand-red"
            >
              <ArrowLeft className="w-3 h-3" /> Back
            </button>

            <div className="flex items-center gap-3">
              {security.timeRemaining !== null && (
                <div className={`flex items-center gap-1 px-2 py-1 rounded-lg font-semibold text-xs ${security.timeRemaining < 300
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-700'
                  }`}>
                  <Clock className="w-3 h-3" />
                  <span className="font-mono">{security.formatTime(security.timeRemaining)}</span>
                </div>
              )}
              <span className="text-xs text-gray-500">
                {answeredCount}/{questions.length}
              </span>
            </div>
          </div>

          <h2 className="text-lg font-display font-bold text-brand-black mb-1">
            {assessment.description || 'Assessment'}
          </h2>
          <p className="text-xs text-gray-500 mb-2">
            {assessment.competencyId?.name} · {assessment.type}
          </p>

          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-red rounded-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-brand-red">
              {progressPercent}%
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-4">
        <div className="bg-white rounded-xl shadow border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-brand-red/5 to-brand-red/10 px-5 py-3 border-b border-gray-200">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-semibold text-gray-500 uppercase">
                Q{currentQuestionIndex + 1}/{questions.length}
              </span>
              <span className="px-2 py-0.5 bg-white rounded-full text-[9px] font-semibold text-gray-700 border border-gray-200">
                {currentQuestion?.type}
              </span>
            </div>
            <p className="text-sm font-medium text-brand-black leading-relaxed">
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
                <ChevronLeft className="w-3 h-3" />
                Prev
              </button>

              <div className="flex items-center gap-2">
                {isCurrentQuestionAnswered() && (
                  <span className="flex items-center gap-1 text-green-600 text-xs">
                    <Check className="w-3 h-3" />
                    Answered
                  </span>
                )}
              </div>

              {!isLastQuestion ? (
                <button
                  onClick={goNext}
                  className="flex items-center gap-1 px-4 py-2 bg-brand-red text-white rounded-lg text-xs font-semibold hover:bg-brand-red-dark"
                >
                  Next
                  <ChevronRight className="w-3 h-3" />
                </button>
              ) : (
                <button
                  onClick={() => handleSubmit(false)}
                  disabled={security.timeRemaining === 0 && answeredCount < questions.length}
                  className="px-5 py-2 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 disabled:opacity-50"
                >
                  {security.timeExpired ? 'Submitting...' : 'Submit'}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 bg-white rounded-xl shadow border border-gray-100 p-3">
          <h3 className="text-xs font-bold text-brand-black mb-2">Navigator</h3>
          <div className="grid grid-cols-10 gap-1">
            {questions.map((q, idx) => {
              const isAnswered = (() => {
                const ans = answers[q._id];
                if (ans === undefined || ans === null || ans === '') return false;
                if (Array.isArray(ans) && ans.length === 0) return false;
                if (typeof ans === 'object' && Object.keys(ans).length === 0) return false;
                return true;
              })();
              const isCurrent = idx === currentQuestionIndex;

              return (
                <button
                  key={q._id}
                  onClick={() => goToQuestion(idx)}
                  className={`w-full aspect-square rounded-md text-[10px] font-medium transition-all ${isCurrent
                      ? 'bg-brand-red text-white shadow scale-105'
                      : isAnswered
                        ? 'bg-green-100 text-green-700 border border-green-300'
                        : 'bg-gray-100 text-gray-600 border border-gray-200'
                    }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-center gap-4 mt-3 text-[9px]">
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-brand-red" />
              <span className="text-gray-600">Current</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-green-100 border border-green-300" />
              <span className="text-gray-600">Answered</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-gray-100 border border-gray-200" />
              <span className="text-gray-600">Unanswered</span>
            </div>
          </div>
        </div>

        {assessment.type === 'SelfAssessment' && (
          <p className="text-center text-[10px] text-gray-500 mt-3">
            Results shown immediately after submission
          </p>
        )}
      </div>
    </div>
  );
}