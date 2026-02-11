import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import useAssessmentSecurity from '../hooks/useAssessmentSecurity';
import {
  CheckCircle, ArrowLeft, Star, AlertTriangle, Clock, Shield,
  TrendingUp, Award, Download, FileText, GripVertical, Check
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
  const debounceRef = useRef({});

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
        setAssessment(data.data.assessment);

        if (data.data.assessment.timeLimit) {
          security.startTimer(data.data.assessment.timeLimit);
        }

        const prog = await api.get(`/responses/progress/${assessmentId}`);
        if (prog.data.data.isSubmitted) {
          setSubmitted(true);
          await checkResult();
        }
      } catch (err) {
        show('Failed to load assessment.', 'error');
        nav('/assessments');
      }
      setLoading(false);
    };
    load();
  }, [assessmentId]);

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
      handleSubmit();
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

  const handleSubmit = async () => {
    const questions = assessment?.questionIds || [];
    const unanswered = questions.filter((q) => {
      const ans = answers[q._id];
      if (ans === undefined || ans === null || ans === '') return true;
      if (Array.isArray(ans) && ans.length === 0) return true;
      if (typeof ans === 'object' && Object.keys(ans).length === 0) return true;
      return false;
    });

    if (unanswered.length > 0 && !security.timeExpired) {
      show(`Please answer all ${unanswered.length} remaining question(s).`, 'warning');
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

  // Render question based on type
  const renderQuestion = (q) => {
    switch (q.type) {
      case 'MCQ':
        return (
          <div className="space-y-2">
            {(q.options || []).map((opt) => {
              const chosen = answers[q._id] === opt;
              return (
                <label
                  key={opt}
                  className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${chosen ? 'border-brand-red bg-brand-red-muted' : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${chosen ? 'border-brand-red' : 'border-gray-300'
                    }`}>
                    {chosen && <div className="w-2.5 h-2.5 rounded-full bg-brand-red" />}
                  </div>
                  <input
                    type="radio"
                    name={q._id}
                    checked={chosen}
                    onChange={() => handleAnswer(q._id, opt)}
                    className="hidden"
                  />
                  <span className={`text-sm ${chosen ? 'text-brand-red-dark font-semibold' : 'text-gray-700'}`}>
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
                  className={`p-4 rounded-lg border-2 font-semibold text-sm transition-all ${chosen ? 'border-brand-red bg-brand-red-muted text-brand-red-dark' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
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
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((val) => {
              const chosen = answers[q._id] >= val;
              return (
                <button
                  key={val}
                  onClick={() => handleAnswer(q._id, val)}
                  className="p-1 hover:scale-110 transition-transform"
                >
                  <Star
                    className="w-8 h-8"
                    fill={chosen ? '#EA580C' : 'none'}
                    color={chosen ? '#EA580C' : '#D1D5DB'}
                  />
                </button>
              );
            })}
            {answers[q._id] && <span className="text-sm text-gray-500 ml-2">{answers[q._id]} / 5</span>}
          </div>
        );

      case 'ShortAnswer':
        return (
          <textarea
            rows={4}
            value={answers[q._id] || ''}
            onChange={(e) => handleAnswer(q._id, e.target.value)}
            placeholder="Write your answer here..."
            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus-brand text-sm resize-none"
          />
        );

      case 'MultiSelect':
        return (
          <div className="space-y-2">
            {(q.options || []).map((opt) => {
              const selected = (answers[q._id] || []).includes(opt);
              return (
                <label
                  key={opt}
                  className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${selected ? 'border-brand-red bg-brand-red-muted' : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                >
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${selected ? 'border-brand-red bg-brand-red' : 'border-gray-300'
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
                  <span className={`text-sm ${selected ? 'text-brand-red-dark font-semibold' : 'text-gray-700'}`}>
                    {opt}
                  </span>
                </label>
              );
            })}
            <p className="text-xs text-gray-500 mt-2">Select all that apply</p>
          </div>
        );

      case 'Matching':
        return (
          <div className="space-y-4">
            <p className="text-xs text-gray-500 mb-3">Match each item on the left with the correct item on the right</p>
            {(q.matchingLeft || []).map((leftItem, idx) => {
              const currentMatch = (answers[q._id] || {})[leftItem];
              return (
                <div key={idx} className="flex items-center gap-3">
                  <div className="flex-1 p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm font-medium">
                    {leftItem}
                  </div>
                  <span className="text-gray-400">↔</span>
                  <select
                    value={currentMatch || ''}
                    onChange={(e) => {
                      const updated = { ...(answers[q._id] || {}), [leftItem]: e.target.value };
                      handleAnswer(q._id, updated);
                    }}
                    className="flex-1 h-11 px-3 rounded-lg border border-gray-300 focus-brand text-sm"
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
        );

      case 'Ordering':
        return (
          <div className="space-y-3">
            <p className="text-xs text-gray-500 mb-3">Arrange the items in the correct order (1 = first, {q.orderItems?.length || 0} = last)</p>
            {(q.orderItems || []).map((item, idx) => {
              const currentOrder = (answers[q._id] || {})[item];
              return (
                <div key={idx} className="flex items-center gap-3">
                  <select
                    value={currentOrder || ''}
                    onChange={(e) => {
                      const updated = { ...(answers[q._id] || {}), [item]: parseInt(e.target.value, 10) };
                      handleAnswer(q._id, updated);
                    }}
                    className="w-20 h-11 px-3 rounded-lg border border-gray-300 focus-brand text-sm font-semibold"
                  >
                    <option value="">—</option>
                    {(q.orderItems || []).map((_, i) => (
                      <option key={i} value={i + 1}>{i + 1}</option>
                    ))}
                  </select>
                  <GripVertical className="w-4 h-4 text-gray-300" />
                  <div className="flex-1 p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm">
                    {item}
                  </div>
                </div>
              );
            })}
          </div>
        );

      case 'ScenarioMCQ':
        return (
          <div className="space-y-4">
            {q.scenario && (
              <div className="p-4 bg-blue-50 border-l-4 border-blue-500 rounded-lg mb-4">
                <div className="text-xs font-bold text-blue-800 uppercase mb-2">Scenario</div>
                <p className="text-sm text-blue-900 leading-relaxed whitespace-pre-wrap">{q.scenario}</p>
              </div>
            )}
            <div className="space-y-2">
              {(q.options || []).map((opt) => {
                const chosen = answers[q._id] === opt;
                return (
                  <label
                    key={opt}
                    className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${chosen ? 'border-brand-red bg-brand-red-muted' : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${chosen ? 'border-brand-red' : 'border-gray-300'
                      }`}>
                      {chosen && <div className="w-2.5 h-2.5 rounded-full bg-brand-red" />}
                    </div>
                    <input
                      type="radio"
                      name={q._id}
                      checked={chosen}
                      onChange={() => handleAnswer(q._id, opt)}
                      className="hidden"
                    />
                    <span className={`text-sm ${chosen ? 'text-brand-red-dark font-semibold' : 'text-gray-700'}`}>
                      {opt}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        );

      case 'DragDropClassification':
        return (
          <div className="space-y-4">
            <p className="text-xs text-gray-500 mb-3">Classify each item into the correct category</p>
            <div className="grid gap-3">
              {(q.classificationItems || []).map((item, idx) => {
                const currentCategory = (answers[q._id] || {})[item];
                return (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="flex-1 p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm font-medium">
                      {item}
                    </div>
                    <span className="text-gray-400">→</span>
                    <select
                      value={currentCategory || ''}
                      onChange={(e) => {
                        const updated = { ...(answers[q._id] || {}), [item]: e.target.value };
                        handleAnswer(q._id, updated);
                      }}
                      className="flex-1 h-11 px-3 rounded-lg border border-gray-300 focus-brand text-sm"
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
          </div>
        );

      default:
        return <p className="text-sm text-gray-500">Unsupported question type: {q.type}</p>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-12 h-12 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!assessment) return null;

  const questions = assessment.questionIds || [];
  const answeredCount = questions.filter((q) => {
    const ans = answers[q._id];
    if (ans === undefined || ans === null || ans === '') return false;
    if (Array.isArray(ans) && ans.length === 0) return false;
    if (typeof ans === 'object' && Object.keys(ans).length === 0) return false;
    return true;
  }).length;
  const pct = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;

  // Security acknowledgment screen
  if (!securityAcknowledged && !submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-2xl shadow-xl p-10 max-w-2xl">
          <div className="w-16 h-16 rounded-full bg-brand-red/10 flex items-center justify-center mx-auto mb-6">
            <Shield className="w-8 h-8 text-brand-red" />
          </div>

          <h2 className="text-2xl font-display font-bold text-brand-black text-center mb-4">
            Assessment Security Notice
          </h2>

          <div className="space-y-4 mb-8 text-gray-600">
            <p className="text-center text-sm">
              This assessment is monitored for integrity. The following security measures are in place:
            </p>

            <div className="bg-gray-50 rounded-xl p-6 space-y-3">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-brand-red flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-brand-black">Tab Monitoring</div>
                  <div className="text-sm">Switching tabs or windows will be recorded</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-brand-red flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-brand-black">Time Limit</div>
                  <div className="text-sm">
                    {assessment.timeLimit ? `${assessment.timeLimit} minutes - Auto-submit when expired` : 'No time limit'}
                  </div>
                </div>
              </div>

              {assessment.type === 'SelfAssessment' && (
                <div className="flex items-start gap-3">
                  <TrendingUp className="w-5 h-5 text-brand-red flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-brand-black">Immediate Results</div>
                    <div className="text-sm">Your score and recommendations will be shown automatically</div>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded">
              <div className="flex gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                <div className="text-sm text-yellow-800">
                  <strong>Important:</strong> Excessive violations will be flagged for review.
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => nav('/assessments')}
              className="flex-1 px-6 py-3 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleStartSecure}
              className="flex-1 px-6 py-3 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors"
            >
              I Understand - Start Assessment
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Result display for Self Assessment (existing code remains the same)
  if (submitted && assessment.type === 'SelfAssessment') {
    if (scoringInProgress) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
          <div className="bg-white rounded-2xl shadow-lg p-12 max-w-md text-center">
            <div className="w-20 h-20 rounded-full bg-brand-red/10 flex items-center justify-center mx-auto mb-6">
              <div className="w-12 h-12 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
            </div>
            <h2 className="text-2xl font-display font-bold text-brand-black mb-2">Scoring Your Assessment...</h2>
            <p className="text-gray-500">Please wait while we calculate your results.</p>
          </div>
        </div>
      );
    }

    if (result) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
          <div className="bg-white rounded-2xl shadow-lg p-12 max-w-2xl w-full">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-display font-bold text-brand-black text-center mb-2">Assessment Completed!</h2>
            <p className="text-gray-500 text-center mb-8">Your results are ready</p>

            <div className="bg-gradient-to-br from-brand-red/5 to-brand-red/10 rounded-2xl p-8 mb-6 border-2 border-brand-red/20">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-white shadow-lg mb-4">
                  <div className="text-4xl font-display font-bold text-brand-red">{result.finalScore}%</div>
                </div>
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Award className="w-5 h-5 text-brand-red" />
                  <span className={`px-4 py-2 rounded-full text-sm font-bold uppercase tracking-wider badge badge-${result.level.toLowerCase()}`}>
                    {result.level}
                  </span>
                </div>
                <div className="text-sm text-gray-600">
                  {result.competencyId?.name} Competency
                </div>
              </div>

              <div className="mb-6">
                <div className="flex justify-between text-xs text-gray-600 mb-2">
                  <span>Basic</span>
                  <span>Intermediate</span>
                  <span>Advanced</span>
                  <span>Expert</span>
                </div>
                <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-brand-red to-brand-red-dark rounded-full transition-all duration-1000"
                    style={{ width: `${result.finalScore}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0-39%</span>
                  <span>40-59%</span>
                  <span>60-79%</span>
                  <span>80-100%</span>
                </div>
              </div>

              {result.recommendation && (
                <div className="bg-white rounded-xl p-6 border-l-4 border-brand-red">
                  <div className="flex items-start gap-3">
                    <TrendingUp className="w-5 h-5 text-brand-red flex-shrink-0 mt-1" />
                    <div>
                      <div className="text-xs font-bold text-brand-red uppercase tracking-wider mb-2">
                        Development Recommendation
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">
                        {result.recommendation}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {security.totalViolations > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <div className="text-xs font-semibold text-yellow-800 uppercase mb-2">Security Summary</div>
                <div className="text-sm text-yellow-700 space-y-1">
                  <div>Tab switches: {security.tabSwitchCount}</div>
                  <div>Total violations: {security.totalViolations}</div>
                </div>
              </div>
            )}

            <div className="flex gap-4">
              <button
                onClick={handleExportResult}
                className="flex-1 px-6 py-3 border border-brand-red text-brand-red rounded-lg font-semibold hover:bg-brand-red-muted transition-colors flex items-center justify-center gap-2"
              >
                <FileText className="w-4 h-4" /> Export PDF
              </button>
              <button
                onClick={() => nav('/results')}
                className="flex-1 px-6 py-3 border border-brand-red text-brand-red rounded-lg font-semibold hover:bg-brand-red-muted transition-colors"
              >
                View All Results
              </button>
              <button
                onClick={() => nav('/assessments')}
                className="flex-1 px-6 py-3 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors"
              >
                Back to Assessments
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-2xl shadow-lg p-12 max-w-md text-center">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-display font-bold text-brand-black mb-2">Assessment Submitted</h2>
          <p className="text-gray-500 mb-6">Your assessment has been submitted successfully. Results are being generated...</p>

          <button onClick={() => nav('/results')} className="px-6 py-3 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors">
            View Results
          </button>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-2xl shadow-lg p-12 max-w-md text-center">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-display font-bold text-brand-black mb-2">Assessment Submitted</h2>
          <p className="text-gray-500 mb-2">Your responses have been recorded successfully.</p>
          <p className="text-sm text-gray-400 mb-6">Results will be available after evaluation by your supervisor and HR.</p>

          {security.totalViolations > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-left">
              <div className="text-xs font-semibold text-yellow-800 uppercase mb-2">Security Summary</div>
              <div className="text-sm text-yellow-700 space-y-1">
                <div>Tab switches: {security.tabSwitchCount}</div>
                <div>Total violations: {security.totalViolations}</div>
              </div>
            </div>
          )}

          <button onClick={() => nav('/assessments')} className="px-6 py-3 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors">
            Back to Assessments
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {showWarning && (
        <div className="fixed top-0 left-0 right-0 bg-yellow-500 text-white px-4 py-3 z-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5" />
            <span className="font-semibold">
              Warning: Multiple security violations detected ({security.totalViolations}).
            </span>
          </div>
          <button onClick={() => setShowWarning(false)} className="hover:bg-yellow-600 px-3 py-1 rounded">
            Dismiss
          </button>
        </div>
      )}

      <SecurityMonitor violations={security.violations} isHighRisk={security.isHighRisk} />

      <div className={`sticky ${showWarning ? 'top-12' : 'top-0'} z-40 bg-white border-b border-gray-200 shadow-sm`}>
        <div className="max-w-3xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center mb-3">
            <button onClick={() => nav('/assessments')} className="flex items-center gap-2 text-gray-600 hover:text-brand-red transition-colors text-sm font-semibold">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>

            <div className="flex items-center gap-4">
              {security.timeRemaining !== null && (
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${security.timeRemaining < 300 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                  }`}>
                  <Clock className="w-4 h-4" />
                  <span className="font-mono font-bold">{security.formatTime(security.timeRemaining)}</span>
                </div>
              )}
              <span className="text-sm text-gray-500">{answeredCount} / {questions.length}</span>
            </div>
          </div>

          <h2 className="text-xl font-display font-bold text-brand-black mb-1">{assessment.description || 'Assessment'}</h2>
          <p className="text-sm text-gray-500 mb-3">{assessment.competencyId?.name} · {assessment.type}</p>

          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
            {security.totalViolations > 0 && (
              <div className="flex items-center gap-1 text-xs text-yellow-600">
                <AlertTriangle className="w-3 h-3" />
                <span>{security.totalViolations}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-5">
        {questions.map((q, idx) => (
          <div key={q._id} className="bg-white rounded-xl p-6 shadow-card border border-gray-100">
            <div className="flex justify-between items-start mb-4">
              <span className="text-xs text-gray-400 font-semibold">Q{idx + 1} of {questions.length}</span>
              <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-semibold">{q.type}</span>
            </div>
            <p className="text-base font-semibold text-brand-black mb-5 leading-relaxed">{q.text}</p>

            {renderQuestion(q)}
          </div>
        ))}

        <div className="text-center pt-6 pb-12">
          <button
            onClick={handleSubmit}
            disabled={security.timeRemaining === 0 && answeredCount < questions.length}
            className="px-8 py-4 bg-brand-red text-white rounded-xl font-bold text-base hover:bg-brand-red-dark transition-colors shadow-lg shadow-brand-red/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {security.timeExpired ? 'Time Expired - Auto-submitting...' : 'Submit Assessment'}
          </button>
          {assessment.type === 'SelfAssessment' && (
            <p className="text-xs text-gray-500 mt-3">Your results will be shown immediately after submission</p>
          )}
        </div>
      </div>
    </div>
  );
}
