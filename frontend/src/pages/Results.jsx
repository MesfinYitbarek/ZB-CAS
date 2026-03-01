import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  TrendingUp, CheckCircle2, Download, ChevronLeft, ChevronRight,
  Award, User, Users, Scale, Calendar, Filter, X, FileText,
  SlidersHorizontal, Eye, XCircle, Info, ClipboardList, ChevronDown,
  ChevronUp, AlertCircle, HelpCircle, Hash, Minus, ListChecks,
  Shield
} from 'lucide-react';
import { exportToPDF, exportToExcel, generateFilename } from '../utils/exportUtils';
import api from '../utils/api';
import Select from 'react-select';

const formatAnswer = (answer, questionType) => {
  if (answer === null || answer === undefined) return '—';

  const type = (questionType || '').toLowerCase();

  if (typeof answer === 'string' || typeof answer === 'number') {
    if (type === 'rating') return `${answer} / 5`;
    if (type === 'truefalse') return answer === 'true' || answer === true ? 'True' : 'False';
    return String(answer);
  }

  if (Array.isArray(answer)) {
    if (type === 'ordering') {
      return answer.map((item, idx) => `${idx + 1}. ${item}`).join(' → ');
    }
    if (type === 'matching') {
      return answer.map(p => `${p.left} → ${p.right}`).join('; ');
    }
    return answer.join(', ');
  }

  if (typeof answer === 'object') {
    const entries = Object.entries(answer);
    if (entries.length === 0) return '—';
    if (type === 'matching' || type === 'dragdropclassification') {
      return entries.map(([k, v]) => `${k} → ${v}`).join('; ');
    }
    return entries.map(([k, v]) => `${k}: ${v}`).join('; ');
  }

  return String(answer);
};

const QuestionStatusBadge = ({ detail }) => {
  if (detail.isUnanswered) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
        <Minus className="w-3 h-3" /> Unanswered
      </span>
    );
  }
  if (detail.isCorrect) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <CheckCircle2 className="w-3 h-3" /> Correct
      </span>
    );
  }
  if (detail.isPartial) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
        <AlertCircle className="w-3 h-3" /> Partial
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
      <XCircle className="w-3 h-3" /> Incorrect
    </span>
  );
};

const QuestionTypeBadge = ({ type }) => {
  const typeLabels = {
    mcq: 'Multiple Choice',
    scenariomcq: 'Scenario MCQ',
    truefalse: 'True / False',
    rating: 'Rating',
    multiselect: 'Multi-Select',
    matching: 'Matching',
    ordering: 'Ordering',
    dragdropclassification: 'Classification',
    shortanswer: 'Short Answer'
  };

  const label = typeLabels[(type || '').toLowerCase()] || type || 'Unknown';

  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700">
      {label}
    </span>
  );
};

const QuestionDetailRow = ({ detail, isExpanded, onToggle }) => {
  const scoreColor = detail.isCorrect
    ? 'text-green-700'
    : detail.isPartial
      ? 'text-yellow-700'
      : detail.isUnanswered
        ? 'text-gray-400'
        : 'text-red-700';

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <span className="text-xs font-bold text-gray-600">
            {detail.questionNumber || '?'}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {detail.questionText}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <QuestionTypeBadge type={detail.questionType} />
            <QuestionStatusBadge detail={detail} />
          </div>
        </div>

        <div className="flex-shrink-0 text-right">
          <p className={`text-sm font-bold ${scoreColor}`}>
            {detail.scoreAwarded} / {detail.maxScore}
          </p>
          <p className="text-xs text-gray-400">
            {detail.scorePercentage ?? 0}%
          </p>
        </div>

        <div className="flex-shrink-0 ml-1">
          {isExpanded
            ? <ChevronUp className="w-4 h-4 text-gray-400" />
            : <ChevronDown className="w-4 h-4 text-gray-400" />
          }
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 pt-2 bg-gray-50 border-t border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Employee&apos;s Answer
              </p>
              <div className={`text-sm p-2 rounded border ${
                detail.isUnanswered
                  ? 'bg-gray-50 border-gray-200 text-gray-400 italic'
                  : detail.isCorrect
                    ? 'bg-green-50 border-green-200 text-green-800'
                    : detail.isPartial
                      ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
                      : 'bg-red-50 border-red-200 text-red-800'
              }`}>
                {detail.isUnanswered
                  ? 'No answer provided'
                  : formatAnswer(detail.userAnswer, detail.questionType)
                }
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Correct Answer
              </p>
              <div className="text-sm p-2 rounded border bg-blue-50 border-blue-200 text-blue-800">
                {formatAnswer(detail.correctAnswer, detail.questionType)}
              </div>
            </div>
          </div>

          {detail.options && detail.options.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Available Options
              </p>
              <div className="flex flex-wrap gap-1.5">
                {detail.options.map((opt, idx) => {
                  const optValue = typeof opt === 'object' ? (opt.text || opt.label || opt.value || JSON.stringify(opt)) : opt;
                  const isSelected = Array.isArray(detail.userAnswer)
                    ? detail.userAnswer.includes(optValue)
                    : detail.userAnswer === optValue;
                  const isCorrectOpt = Array.isArray(detail.correctAnswer)
                    ? detail.correctAnswer.includes(optValue)
                    : detail.correctAnswer === optValue;

                  return (
                    <span
                      key={idx}
                      className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${
                        isSelected && isCorrectOpt
                          ? 'bg-green-100 border-green-300 text-green-800'
                          : isSelected && !isCorrectOpt
                            ? 'bg-red-100 border-red-300 text-red-800'
                            : isCorrectOpt
                              ? 'bg-blue-50 border-blue-200 text-blue-700'
                              : 'bg-white border-gray-200 text-gray-600'
                      }`}
                    >
                      {isSelected && isCorrectOpt && <CheckCircle2 className="w-3 h-3 mr-1" />}
                      {isSelected && !isCorrectOpt && <XCircle className="w-3 h-3 mr-1" />}
                      {optValue}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Score Progress</span>
              <span className={`font-semibold ${scoreColor}`}>
                {detail.scoreAwarded} / {detail.maxScore} pts ({detail.scorePercentage ?? 0}%)
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  detail.isCorrect ? 'bg-green-500'
                    : detail.isPartial ? 'bg-yellow-500'
                      : detail.isUnanswered ? 'bg-gray-300'
                        : 'bg-red-500'
                }`}
                style={{ width: `${detail.scorePercentage ?? 0}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const QuestionDetailsSection = ({ questionDetails, summary, loading, error }) => {
  const [expandedQuestions, setExpandedQuestions] = useState({});
  const [expandAll, setExpandAll] = useState(false);
  const [filterType, setFilterType] = useState('all');

  const toggleQuestion = (idx) => {
    setExpandedQuestions(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const toggleExpandAll = () => {
    const newState = !expandAll;
    setExpandAll(newState);
    const newExpanded = {};
    if (newState && questionDetails) {
      questionDetails.forEach((_, idx) => { newExpanded[idx] = true; });
    }
    setExpandedQuestions(newExpanded);
  };

  if (loading) {
    return (
      <div className="bg-gray-50 rounded-xl p-6 text-center">
        <div className="w-8 h-8 border-3 border-brand-red border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">Loading question details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 rounded-xl p-4 border border-red-100">
        <div className="flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm font-medium">Failed to load question details: {error}</p>
        </div>
      </div>
    );
  }

  if (!questionDetails || questionDetails.length === 0) {
    return (
      <div className="bg-gray-50 rounded-xl p-6 text-center">
        <HelpCircle className="w-10 h-10 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500">No question-level details available for this result.</p>
        <p className="text-xs text-gray-400 mt-1">
          Question details are stored when assessments are scored. Previously scored results may not have this data.
        </p>
      </div>
    );
  }

  const filteredDetails = questionDetails.filter(d => {
    if (filterType === 'all') return true;
    if (filterType === 'correct') return d.isCorrect;
    if (filterType === 'partial') return d.isPartial;
    if (filterType === 'incorrect') return !d.isCorrect && !d.isPartial && !d.isUnanswered;
    if (filterType === 'unanswered') return d.isUnanswered;
    return true;
  });

  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-indigo-600" />
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Question-by-Question Breakdown
          </h4>
        </div>
        <button
          onClick={toggleExpandAll}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
        >
          {expandAll ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expandAll ? 'Collapse All' : 'Expand All'}
        </button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
          <div className="bg-white rounded-lg p-2.5 border border-gray-200 text-center">
            <p className="text-lg font-bold text-gray-900">{summary.totalQuestions}</p>
            <p className="text-xs text-gray-500">Total</p>
          </div>
          <div className="bg-white rounded-lg p-2.5 border border-green-200 text-center">
            <p className="text-lg font-bold text-green-700">{summary.fullyCorrect}</p>
            <p className="text-xs text-green-600">Correct</p>
          </div>
          <div className="bg-white rounded-lg p-2.5 border border-yellow-200 text-center">
            <p className="text-lg font-bold text-yellow-700">{summary.partialCredit}</p>
            <p className="text-xs text-yellow-600">Partial</p>
          </div>
          <div className="bg-white rounded-lg p-2.5 border border-red-200 text-center">
            <p className="text-lg font-bold text-red-700">{summary.incorrect}</p>
            <p className="text-xs text-red-600">Incorrect</p>
          </div>
          <div className="bg-white rounded-lg p-2.5 border border-gray-200 text-center">
            <p className="text-lg font-bold text-gray-400">{summary.unanswered}</p>
            <p className="text-xs text-gray-500">Unanswered</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mb-4">
        {[
          { key: 'all', label: 'All', count: questionDetails.length },
          { key: 'correct', label: 'Correct', count: summary?.fullyCorrect || 0 },
          { key: 'partial', label: 'Partial', count: summary?.partialCredit || 0 },
          { key: 'incorrect', label: 'Incorrect', count: summary?.incorrect || 0 },
          { key: 'unanswered', label: 'Unanswered', count: summary?.unanswered || 0 }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilterType(tab.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filterType === tab.key
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {summary && (
        <div className="bg-white rounded-lg p-3 border border-gray-200 mb-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-gray-600">Total Score</span>
            <span className="font-bold text-gray-900">
              {summary.totalScore?.toFixed(1)} / {summary.totalPossible} pts
              ({summary.totalPossible > 0
                ? ((summary.totalScore / summary.totalPossible) * 100).toFixed(1)
                : 0}%)
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="h-2.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all"
              style={{
                width: `${summary.totalPossible > 0
                  ? (summary.totalScore / summary.totalPossible) * 100
                  : 0}%`
              }}
            />
          </div>
        </div>
      )}

      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {filteredDetails.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-gray-500">No questions match the selected filter.</p>
          </div>
        ) : (
          filteredDetails.map((detail, idx) => (
            <QuestionDetailRow
              key={detail.questionId || idx}
              detail={detail}
              isExpanded={!!expandedQuestions[idx]}
              onToggle={() => toggleQuestion(idx)}
            />
          ))
        )}
      </div>
    </div>
  );
};

const ViolationTypeBadge = ({ type }) => {
  const typeMap = {
    TAB_SWITCH:      { label: 'Tab Switch',      color: 'bg-yellow-100 text-yellow-700' },
    COPY_ATTEMPT:    { label: 'Copy Attempt',    color: 'bg-red-100 text-red-700' },
    RIGHT_CLICK:     { label: 'Right Click',     color: 'bg-orange-100 text-orange-700' },
    FULLSCREEN_EXIT: { label: 'Fullscreen Exit', color: 'bg-blue-100 text-blue-700' },
    DEVTOOLS:        { label: 'DevTools',        color: 'bg-red-100 text-red-700' },
    WINDOW_BLUR:     { label: 'Window Blur',     color: 'bg-yellow-100 text-yellow-700' },
    PRINT_ATTEMPT:   { label: 'Print Attempt',   color: 'bg-orange-100 text-orange-700' },
  };

  const key = (type || '').toUpperCase().replace(/[-\s]/g, '_');
  const info = typeMap[key] || { label: type || 'Unknown', color: 'bg-gray-100 text-gray-700' };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${info.color}`}>
      {info.label}
    </span>
  );
};

const SecurityViolationsSection = ({ securityData, loading, error }) => {
  if (loading) {
    return (
      <div className="bg-gray-50 rounded-xl p-6 text-center">
        <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">Loading security data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 rounded-xl p-4 border border-red-100">
        <div className="flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm font-medium">Failed to load security data: {error}</p>
        </div>
      </div>
    );
  }

  if (!securityData || securityData.summary?.totalViolations === 0) {
    return (
      <div className="bg-green-50 rounded-xl p-4 border border-green-100">
        <div className="flex items-center gap-2 text-green-700">
          <Shield className="w-5 h-5" />
          <p className="text-sm font-medium">No security violations recorded</p>
        </div>
      </div>
    );
  }

  const { summary, violations } = securityData;

  const summaryCards = [
    { label: 'Total',           value: summary.totalViolations || 0, border: 'border-orange-200', text: 'text-orange-700' },
    { label: 'Tab Switches',    value: summary.tabSwitches || 0,     border: 'border-yellow-200', text: 'text-yellow-700' },
    { label: 'Copy Attempts',   value: summary.copyAttempts || 0,    border: 'border-red-200',    text: 'text-red-700' },
    { label: 'Right Clicks',    value: summary.rightClickAttempts || 0, border: 'border-orange-200', text: 'text-orange-700' },
    { label: 'Fullscreen Exits', value: summary.fullscreenExits || 0, border: 'border-blue-200',   text: 'text-blue-700' },
    { label: 'DevTools',        value: summary.devToolsAttempts || 0, border: 'border-red-200',    text: 'text-red-700' },
  ].filter(item => item.value > 0 || item.label === 'Total');

  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-orange-600" />
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Security Violations
          </h4>
        </div>
        {summary.isHighRisk && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold animate-pulse">
            <AlertCircle className="w-3.5 h-3.5" />
            HIGH RISK
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
        {summaryCards.map((item, idx) => (
          <div key={idx} className={`bg-white rounded-lg p-2.5 border ${item.border} text-center`}>
            <p className={`text-lg font-bold ${item.text}`}>{item.value}</p>
            <p className="text-xs text-gray-500">{item.label}</p>
          </div>
        ))}
      </div>

      {violations && violations.length > 0 && (
        <div className="bg-white rounded-lg p-3 border border-gray-200">
          <h5 className="text-xs font-semibold text-gray-600 mb-2">
            Violation Timeline ({violations.length} event{violations.length !== 1 ? 's' : ''})
          </h5>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {violations.map((v, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 text-xs border-b border-gray-50 last:border-0 pb-1.5 last:pb-0"
              >
                <span className="text-gray-400 font-mono text-[10px] flex-shrink-0 w-16 text-right">
                  {new Date(v.timestamp).toLocaleTimeString()}
                </span>
                <ViolationTypeBadge type={v.type} />
                {v.details && (
                  <span className="text-gray-500 truncate">{v.details}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const ResultDetailModal = ({
  result, isOpen, onClose, isAdmin,
  questionDetails, questionSummary, loadingQuestions, questionError,
  securityData, loadingSecurity, securityError
}) => {
  if (!isOpen || !result) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div
          className="fixed inset-0 bg-gray-900 bg-opacity-50 transition-opacity"
          onClick={onClose}
        />

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>

        <div className="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
          <div className="bg-gradient-to-r from-brand-red to-brand-red-dark px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-white" />
              <h3 className="text-lg font-semibold text-white">
                Assessment Result Details
              </h3>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>

          <div className="px-6 py-5 max-h-[80vh] overflow-y-auto">
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
                <div className="flex items-center gap-2 mb-2">
                  <ClipboardList className="w-5 h-5 text-blue-600" />
                  <h4 className="text-sm font-semibold text-blue-900">{result.assessmentDescription}</h4>
                </div>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium
                  ${result.assessmentType === 'Combined'
                    ? 'bg-purple-100 text-purple-700'
                    : result.assessmentType === 'SelfAssessment'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-orange-100 text-orange-700'
                  }`}>
                  {result.assessmentType === 'SelfAssessment' ? 'Self Assessment' :
                    result.assessmentType === 'SupervisorOnly' ? 'Supervisor Assessment' : 'Combined Assessment'}
                </span>
              </div>

              {isAdmin && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    Employee Information
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500">Name</p>
                      <p className="text-sm font-medium text-gray-900">{result.userName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Position</p>
                      <p className="text-sm font-medium text-gray-900">{result.userPosition}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Department</p>
                      <p className="text-sm font-medium text-gray-900">{result.userDepartment}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Email</p>
                      <p className="text-sm font-medium text-gray-900">{result.userEmail}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-gray-50 rounded-xl p-4">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Competency Details
                </h4>
                <div>
                  <p className="text-sm font-medium text-gray-900">{result.competencyName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{result.competencyCategory}</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Score Breakdown
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <div className="flex items-center gap-2 mb-1">
                      <User className="w-4 h-4 text-blue-600" />
                      <p className="text-xs text-gray-600">Self Score</p>
                    </div>
                    <p className="text-xl font-bold text-gray-900">
                      {result.selfScore !== null ? `${result.selfScore.toFixed(1)}%` : '—'}
                    </p>
                  </div>

                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-4 h-4 text-purple-600" />
                      <p className="text-xs text-gray-600">Supervisor Score</p>
                    </div>
                    <p className="text-xl font-bold text-gray-900">
                      {result.supervisorScore !== null ? `${result.supervisorScore.toFixed(1)}%` : '—'}
                    </p>
                  </div>

                  <div className="bg-white rounded-lg p-3 border-2 border-brand-red/20 bg-brand-red/5">
                    <div className="flex items-center gap-2 mb-1">
                      <Award className="w-4 h-4 text-brand-red" />
                      <p className="text-xs text-gray-600">Final Score</p>
                    </div>
                    <p className="text-xl font-bold text-brand-red">
                      {result.finalScore.toFixed(1)}%
                    </p>
                  </div>
                </div>

                {result.isCombined && result.weightUsed && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Scale className="w-4 h-4 text-orange-500" />
                      <span className="text-xs font-medium text-gray-700">Weight Configuration</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600">Self:</span>
                        <span className="text-sm font-semibold text-gray-900">{result.weightUsed.selfAssessment}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600">Supervisor:</span>
                        <span className="text-sm font-semibold text-gray-900">{result.weightUsed.supervisor}%</span>
                      </div>
                    </div>
                  </div>
                )}

                {result.calculation && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-xs text-gray-500 mb-1">Calculation Method</p>
                    <p className="text-sm bg-white p-2 rounded border border-gray-200 font-mono text-gray-700">
                      {result.calculation}
                    </p>
                  </div>
                )}
              </div>

              <QuestionDetailsSection
                questionDetails={questionDetails}
                summary={questionSummary}
                loading={loadingQuestions}
                error={questionError}
              />

              <SecurityViolationsSection
                securityData={securityData}
                loading={loadingSecurity}
                error={securityError}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    Proficiency Level
                  </h4>
                  <div className="flex items-center gap-3">
                    <span className={`badge badge-${result.level.toLowerCase()} text-sm px-3 py-1.5`}>
                      {result.level}
                    </span>
                    <div className="flex-1">
                      <div className="progress-bar h-2">
                        <div
                          className={`progress-fill ${result.assessmentType === 'Combined' ? 'bg-purple-600' : 'bg-brand-red'
                            }`}
                          style={{ width: `${result.finalScore}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    Status
                  </h4>
                  <div className="flex items-center gap-2">
                    <span className={`badge badge-${result.status.toLowerCase()}`}>
                      {result.status}
                    </span>
                    {result.status === 'FINAL' && (
                      <span className="text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Finalised
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {result.recommendation && (
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-semibold text-blue-800 uppercase tracking-wider mb-1">
                        Development Recommendation
                      </h4>
                      <p className="text-sm text-blue-900">
                        {result.recommendation}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-gray-50 px-6 py-4 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-brand-red text-white rounded-lg font-medium text-sm hover:bg-brand-red-dark transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const getResultUserId = (result) => {
  if (result.userId) {
    return typeof result.userId === 'object' ? result.userId._id : result.userId;
  }
  if (result.employeeId) {
    return typeof result.employeeId === 'object' ? result.employeeId._id : result.employeeId;
  }
  return null;
};

export default function Results() {
  const { user, isAdmin } = useAuth();
  const { show } = useToast();
  const [results, setResults] = useState([]);
  const [selectedAssessment, setSelectedAssessment] = useState('');
  const [assessments, setAssessments] = useState([]);
  const [currentAssessment, setCurrentAssessment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingAssessments, setLoadingAssessments] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedResult, setSelectedResult] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const [questionDetails, setQuestionDetails] = useState([]);
  const [questionSummary, setQuestionSummary] = useState(null);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [questionError, setQuestionError] = useState(null);

  const [securityData, setSecurityData] = useState(null);
  const [loadingSecurity, setLoadingSecurity] = useState(false);
  const [securityError, setSecurityError] = useState(null);

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0
  });

  const [filters, setFilters] = useState({
    competency: '',
    level: '',
    dateRange: '',
    search: '',
    hasBothScores: false,
    status: ''
  });

  const [exportFormat, setExportFormat] = useState('pdf');

  useEffect(() => {
    const loadAssessments = async () => {
      try {
        setLoadingAssessments(true);
        const { data } = await api.get('/results/assessments/available');
        setAssessments(data.data.assessments);

        if (data.data.assessments.length > 0) {
          setSelectedAssessment(data.data.assessments[0]._id);
        }
      } catch (error) {
        console.error('Error loading assessments:', error);
        show('Failed to load assessments.', 'error');
      } finally {
        setLoadingAssessments(false);
      }
    };
    loadAssessments();
  }, []);

  useEffect(() => {
    const loadResultsByAssessment = async () => {
      if (!selectedAssessment) {
        setResults([]);
        setCurrentAssessment(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const { data } = await api.get(`/results/by-assessment/${selectedAssessment}`, {
          params: {
            page: pagination.page,
            limit: pagination.limit
          }
        });

        setResults(data.data.results || []);
        setCurrentAssessment(data.data.assessment);
        setPagination(prev => ({
          ...prev,
          total: data.data.pagination.total,
          totalPages: data.data.pagination.totalPages
        }));
      } catch (error) {
        console.error('Error loading results:', error);
        show('Failed to load results.', 'error');
      } finally {
        setLoading(false);
      }
    };

    loadResultsByAssessment();
  }, [selectedAssessment, pagination.page, pagination.limit]);

  const fetchQuestionDetails = useCallback(async (resultId) => {
    if (!resultId) return;

    setLoadingQuestions(true);
    setQuestionError(null);
    setQuestionDetails([]);
    setQuestionSummary(null);

    try {
      const { data } = await api.get(`/results/${resultId}/question-details`);
      setQuestionDetails(data.data.questionDetails || []);
      setQuestionSummary(data.data.summary || null);
    } catch (error) {
      console.error('Error loading question details:', error);
      const errMsg = error.response?.data?.message || error.message || 'Failed to load question details';
      setQuestionError(errMsg);
    } finally {
      setLoadingQuestions(false);
    }
  }, []);

  const fetchSecurityData = useCallback(async (assessmentId, userId) => {
    if (!assessmentId || !userId) return;

    setLoadingSecurity(true);
    setSecurityError(null);
    setSecurityData(null);

    try {
      const { data } = await api.get(`/responses/security-violations/${assessmentId}/${userId}`);
      setSecurityData(data.data.securityRecord || null);
    } catch (error) {
      console.error('Error loading security data:', error);
      const errMsg = error.response?.data?.message || error.message || 'Failed to load security data';
      setSecurityError(errMsg);
    } finally {
      setLoadingSecurity(false);
    }
  }, []);

  const getFilteredResults = () => {
    return results.filter(result => {
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch =
          result.competencyName?.toLowerCase().includes(searchLower) ||
          result.recommendation?.toLowerCase().includes(searchLower) ||
          result.userName?.toLowerCase().includes(searchLower) ||
          result.level?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      if (filters.competency && result.competencyName !== filters.competency) return false;
      if (filters.level && result.level !== filters.level) return false;
      if (filters.status && result.status !== filters.status) return false;
      if (filters.hasBothScores && !result.hasBoth) return false;

      if (filters.dateRange) {
        const resultDate = new Date(result.date);
        const now = new Date();
        const daysDiff = (now - resultDate) / (1000 * 60 * 60 * 24);

        switch (filters.dateRange) {
          case 'today':   if (daysDiff > 1) return false; break;
          case 'week':    if (daysDiff > 7) return false; break;
          case 'month':   if (daysDiff > 30) return false; break;
          case 'quarter': if (daysDiff > 90) return false; break;
          default: break;
        }
      }

      return true;
    });
  };

  const filteredResults = getFilteredResults();

  const getUniqueValues = (key) => {
    const values = new Set();
    results.forEach(result => {
      if (key === 'competency') values.add(result.competencyName);
      if (key === 'level') values.add(result.level);
      if (key === 'status') values.add(result.status);
    });
    return Array.from(values).sort();
  };

  const finalise = async (id) => {
    try {
      await api.patch(`/results/${id}/finalise`);
      show('Result finalised successfully.', 'success');
      setResults((prev) =>
        prev.map((r) => (r._id === id ? { ...r, status: 'FINAL' } : r))
      );
    } catch (err) {
      show(err.response?.data?.message || 'Failed to finalise result.', 'error');
    }
  };

  const clearFilters = () => {
    setFilters({
      competency: '',
      level: '',
      dateRange: '',
      search: '',
      hasBothScores: false,
      status: ''
    });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      if (filteredResults.length === 0) {
        show('No results to export.', 'warning');
        return;
      }

      const filename = generateFilename(
        `results_${currentAssessment?.title?.replace(/\s+/g, '_') || 'assessment'}`,
        exportFormat
      );

      const exportData = {
        type: 'results',
        assessment: currentAssessment,
        user: {
          name: isAdmin ? 'All Employees' : user?.name || 'N/A',
          employeeId: isAdmin ? 'ALL' : user?.employeeId || user?._id || 'N/A',
          department: isAdmin ? 'All Departments' : user?.department || 'N/A',
          position: isAdmin ? 'Administrator' : user?.position || 'N/A'
        },
        results: filteredResults.map(r => ({
          competencyName: r.competencyName,
          competencyId: r.competencyId,
          selfScore: r.selfScore,
          supervisorScore: r.supervisorScore,
          finalScore: r.finalScore,
          level: r.level,
          status: r.status,
          recommendation: r.recommendation,
          createdAt: r.date,
          ...(isAdmin && {
            userName: r.userName,
            userDepartment: r.userDepartment,
            userPosition: r.userPosition
          })
        }))
      };

      if (exportFormat === 'pdf') {
        await exportToPDF(exportData, filename);
        show('Results exported to PDF successfully!', 'success');
      } else if (exportFormat === 'excel') {
        await exportToExcel(exportData, filename);
        show('Results exported to Excel successfully!', 'success');
      }
    } catch (err) {
      console.error('Export Error:', err);
      show(`Export failed: ${err.message}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  const goToPage = (page) => {
    if (page >= 1 && page <= pagination.totalPages) {
      setPagination(prev => ({ ...prev, page }));
    }
  };

  const handlePageSizeChange = (e) => {
    const newLimit = parseInt(e.target.value, 10);
    setPagination({
      page: 1,
      limit: newLimit,
      total: pagination.total,
      totalPages: Math.ceil(pagination.total / newLimit)
    });
  };

  const openDetailModal = (result) => {
    setSelectedResult(result);
    setShowDetailModal(true);
    fetchQuestionDetails(result._id);

    const assessId = result.assessmentId?._id ||result.assessmentId || selectedAssessment;
    const empId = getResultUserId(result) || user._id;
    fetchSecurityData(assessId, empId);
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedResult(null);
    setQuestionDetails([]);
    setQuestionSummary(null);
    setQuestionError(null);
    setSecurityData(null);
    setSecurityError(null);
  };

  const handleAssessmentChange = (e) => {
    setSelectedAssessment(e.target.value);
    setPagination(prev => ({ ...prev, page: 1 }));
    clearFilters();
  };

  const FilterPanel = () => (
    <div className="bg-white rounded-xl shadow-card border border-gray-200 p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-brand-red" />
          <h3 className="font-semibold text-gray-900">Filter Results</h3>
          {Object.values(filters).some(v => v && v !== '') && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-brand-red ml-2"
            >
              <X className="w-3 h-3" /> Clear all
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters(false)}
          className="text-gray-400 hover:text-gray-600 lg:hidden"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Search</label>
          <input
            type="text"
            placeholder="Search by competency, employee..."
            value={filters.search}
            onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Competency</label>
          <select
            value={filters.competency}
            onChange={(e) => setFilters(prev => ({ ...prev, competency: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
          >
            <option value="">All Competencies</option>
            {getUniqueValues('competency').map(value => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Proficiency Level</label>
          <select
            value={filters.level}
            onChange={(e) => setFilters(prev => ({ ...prev, level: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
          >
            <option value="">All Levels</option>
            {getUniqueValues('level').map(value => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Status</label>
          <select
            value={filters.status}
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
          >
            <option value="">All Status</option>
            {getUniqueValues('status').map(value => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Date Range</label>
          <select
            value={filters.dateRange}
            onChange={(e) => setFilters(prev => ({ ...prev, dateRange: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
          >
            <option value="">All Time</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
          </select>
        </div>

        <div className="flex items-center gap-4 pt-6">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={filters.hasBothScores}
              onChange={(e) => setFilters(prev => ({ ...prev, hasBothScores: e.target.checked }))}
              className="rounded border-gray-300 text-brand-red focus:ring-brand-red/20"
            />
            Has both scores
          </label>
        </div>

        <div className="col-span-full mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-gray-700">Export Format:</span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  value="pdf"
                  checked={exportFormat === 'pdf'}
                  onChange={(e) => setExportFormat(e.target.value)}
                  className="text-brand-red focus:ring-brand-red/20"
                />
                PDF
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  value="excel"
                  checked={exportFormat === 'excel'}
                  onChange={(e) => setExportFormat(e.target.value)}
                  className="text-brand-red focus:ring-brand-red/20"
                />
                Excel
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (loadingAssessments) {
    return (
      <div className="flex items-center justify-center p-16">
        <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-7">
      <ResultDetailModal
        result={selectedResult}
        isOpen={showDetailModal}
        onClose={closeDetailModal}
        isAdmin={isAdmin}
        questionDetails={questionDetails}
        questionSummary={questionSummary}
        loadingQuestions={loadingQuestions}
        questionError={questionError}
        securityData={securityData}
        loadingSecurity={loadingSecurity}
        securityError={securityError}
      />

      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-black">Competency Results</h1>
          <p className="text-gray-500 mt-1">
            {isAdmin
              ? 'View results filtered by assessment — click any result to see per-question details'
              : 'Your competency assessment history — click any result to see per-question details'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            disabled={!selectedAssessment || results.length === 0}
            className={`flex items-center gap-2 px-4 py-2 border rounded-lg font-semibold transition-colors ${!selectedAssessment || results.length === 0
                ? 'opacity-50 cursor-not-allowed border-gray-200 text-gray-400'
                : showFilters
                  ? 'border-brand-red bg-brand-red/10 text-brand-red'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
            {Object.values(filters).filter(v => v && v !== '').length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-brand-red text-white text-xs rounded-full">
                {Object.values(filters).filter(v => v && v !== '').length}
              </span>
            )}
          </button>

          <button
            onClick={handleExport}
            disabled={exporting || filteredResults.length === 0 || !selectedAssessment}
            className="flex items-center gap-2 px-4 py-2 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            {exporting ? 'Exporting...' : `Export ${exportFormat.toUpperCase()}`}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-card border border-gray-200 p-5 mb-6">
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          <div className="max-w-md">
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Select Assessment
            </label>
            <div className="relative">
              <Select
                options={assessments.map(a => ({
                  value: a._id,
                  label: `${a.title || a.description} (${a.type})`
                }))}
                value={
                  assessments
                    .map(a => ({
                      value: a._id,
                      label: `${a.title || a.description} (${a.type})`
                    }))
                    .find(opt => opt.value === selectedAssessment) || null
                }
                onChange={(selected) => {
                  setSelectedAssessment(selected?.value || '');
                  setPagination(prev => ({ ...prev, page: 1 }));
                  clearFilters();
                }}
                placeholder="Search assessment..."
                isClearable
                className="text-sm"
                styles={{
                  control: (base) => ({
                    ...base,
                    minHeight: '40px',
                    height: '40px',
                    borderRadius: '8px',
                    borderColor: '#d1d5db',
                    boxShadow: 'none'
                  }),
                  valueContainer: (base) => ({
                    ...base,
                    padding: '0 12px'
                  }),
                  indicatorsContainer: (base) => ({
                    ...base,
                    height: '40px'
                  })
                }}
              />
              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {currentAssessment && (
            <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 rounded-lg text-blue-800">
              <ClipboardList className="w-5 h-5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wider">Current Assessment</p>
                <p className="text-sm font-semibold">{currentAssessment.title || currentAssessment.description}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {showFilters && selectedAssessment && <FilterPanel />}

      {selectedAssessment && results.length > 0 && (
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-gray-600">
            Showing <span className="font-medium">{filteredResults.length}</span> of{' '}
            <span className="font-medium">{pagination.total}</span> results
            {Object.values(filters).some(v => v && v !== '') && ' (filtered)'}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Show:</span>
            <select
              value={pagination.limit}
              onChange={handlePageSizeChange}
              className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
            >
              <option value="10">10 per page</option>
              <option value="20">20 per page</option>
              <option value="30">30 per page</option>
              <option value="50">50 per page</option>
              <option value="100">100 per page</option>
            </select>
          </div>
        </div>
      )}

      {!selectedAssessment && (
        <div className="bg-white rounded-xl shadow-card border border-gray-200 p-12 text-center">
          <ClipboardList className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Assessment Selected</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            Please select an assessment from the dropdown above to view its results.
          </p>
        </div>
      )}

      {selectedAssessment && (
        <>
          {loading ? (
            <div className="flex items-center justify-center p-16">
              <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-card border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {isAdmin && (
                        <>
                          <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Employee</th>
                          <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Department</th>
                        </>
                      )}
                      <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Competency</th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Type</th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Final Score</th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Level</th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                      {isAdmin && <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>}
                      <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Details</th>
                      {isAdmin && <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredResults.length === 0 ? (
                      <tr>
                        <td colSpan={isAdmin ? 11 : 8} className="px-6 py-12 text-center">
                          <div className="flex flex-col items-center">
                            <TrendingUp className="w-12 h-12 text-gray-300 mb-3" />
                            <p className="text-gray-500 text-sm font-medium">No results found</p>
                            <p className="text-gray-400 text-xs mt-1">
                              {Object.values(filters).some(v => v && v !== '')
                                ? 'Try adjusting your filters'
                                : 'No results available for this assessment.'}
                            </p>
                            {Object.values(filters).some(v => v && v !== '') && (
                              <button
                                onClick={clearFilters}
                                className="mt-4 text-sm text-brand-red hover:text-brand-red-dark font-medium"
                              >
                                Clear all filters
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredResults.map((result) => (
                        <tr key={result._id} className="hover:bg-gray-50/80 transition-colors">
                          {isAdmin && (
                            <>
                              <td className="px-6 py-4">
                                <div className="font-medium text-sm text-gray-900">{result.userName}</div>
                                <div className="text-xs text-gray-500">{result.userPosition}</div>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-sm text-gray-600">{result.userDepartment}</span>
                              </td>
                            </>
                          )}
                          <td className="px-6 py-4">
                            <div className="font-medium text-sm text-gray-900">{result.competencyName}</div>
                            <div className="text-xs text-gray-500">{result.competencyCategory}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium
                              ${result.assessmentType === 'Combined'
                                ? 'bg-purple-100 text-purple-700'
                                : result.assessmentType === 'SelfAssessment'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-orange-100 text-orange-700'
                              }`}>
                              {result.assessmentType === 'SelfAssessment' ? 'Self' :
                                result.assessmentType === 'SupervisorOnly' ? 'Supervisor' : 'Combined'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-16">
                                <div className="progress-bar">
                                  <div
                                    className={`progress-fill ${result.assessmentType === 'Combined' ? 'bg-purple-600' : 'bg-brand-red'
                                      }`}
                                    style={{ width: `${result.finalScore}%` }}
                                  />
                                </div>
                              </div>
                              <span className="text-sm font-bold text-gray-900">
                                {result.finalScore.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`badge badge-${result.level.toLowerCase()}`}>
                              {result.level}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5 text-sm text-gray-600">
                              <Calendar className="w-3.5 h-3.5" />
                              {result.formattedDate}
                            </div>
                          </td>
                          {isAdmin && (
                            <td className="px-6 py-4">
                              <span className={`badge badge-${result.status.toLowerCase()}`}>
                                {result.status}
                              </span>
                            </td>
                          )}
                          <td className="px-6 py-4">
                            <button
                              onClick={() => openDetailModal(result)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              View Details
                            </button>
                          </td>
                          {isAdmin && (
                            <td className="px-6 py-4">
                              {result.status === 'PENDING' && (
                                <button
                                  onClick={() => finalise(result._id)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-brand-red text-white rounded-lg hover:bg-brand-red-dark transition-colors"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Finalise
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {pagination.total > pagination.limit && !loading && (
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-6 pt-6 border-t border-gray-200">
              <div className="text-sm text-gray-600">
                Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                <span className="font-medium">{pagination.total}</span> results
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => goToPage(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" /> Previous
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                    let pageNum;
                    if (pagination.totalPages <= 5) {
                      pageNum = i + 1;
                    } else {
                      const start = Math.max(1, Math.min(pagination.page - 2, pagination.totalPages - 4));
                      pageNum = start + i;
                    }

                    return (
                      <button
                        key={pageNum}
                        onClick={() => goToPage(pageNum)}
                        className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${pagination.page === pageNum
                            ? 'bg-brand-red text-white'
                            : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => goToPage(pagination.page + 1)}
                  disabled={pagination.page === pagination.totalPages}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}