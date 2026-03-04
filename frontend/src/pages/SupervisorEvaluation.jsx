import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { 
  Save, 
  Send, 
  User, 
  Target, 
  Calendar, 
  Clock,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  Award,
  MessageSquare,
  Shield,
  ChevronLeft,
  Star,
  Briefcase,
  Mail,
  FileText
} from 'lucide-react';
import api from '../utils/api';

export default function SupervisorEvaluation() {
  const { assessmentId } = useParams();
  const [searchParams] = useSearchParams();
  const employeeId = searchParams.get('employeeId');
  const { user, isSupervisor, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { show } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [assessment, setAssessment] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [score, setScore] = useState(0);
  const [comments, setComments] = useState('');
  const [hasExistingEvaluation, setHasExistingEvaluation] = useState(false);
  const [permissionError, setPermissionError] = useState(false);

  useEffect(() => {
    if (!isSupervisor && !isAdmin) {
      setPermissionError(true);
      return;
    }
    loadEvaluationData();
  }, [assessmentId, employeeId, isSupervisor, isAdmin]);

  const loadEvaluationData = async () => {
    try {
      setLoading(true);
      const assessRes = await api.get(`/assessments/${assessmentId}`);
      setAssessment(assessRes.data.data.assessment);
      
      const empRes = await api.get(`/users/${employeeId}`);
      setEmployee(empRes.data.data.user);
      
      const respRes = await api.get(`/responses/supervisor/${assessmentId}/${employeeId}`);
      
      if (respRes.data.data.evaluation) {
        const existing = respRes.data.data.evaluation;
        setScore(existing.score || 0);
        setComments(existing.comments || '');
        setHasExistingEvaluation(true);
      }
    } catch (err) {
      console.error('Error loading evaluation data:', err);
      if (err.response?.status === 403) {
        setPermissionError(true);
        show('You do not have permission to evaluate this employee', 'error');
      } else {
        show('Failed to load data', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleScoreChange = (value) => {
    const numValue = Math.min(100, Math.max(0, parseInt(value) || 0));
    setScore(numValue);
  };

  const getScoreColor = (score) => {
    if (score >= 90) return 'text-emerald-600 bg-emerald-100 border-emerald-200';
    if (score >= 80) return 'text-green-600 bg-green-100 border-green-200';
    if (score >= 70) return 'text-blue-600 bg-blue-100 border-blue-200';
    if (score >= 60) return 'text-yellow-600 bg-yellow-100 border-yellow-200';
    if (score >= 50) return 'text-orange-600 bg-orange-100 border-orange-200';
    return 'text-red-600 bg-red-100 border-red-200';
  };

  const getPerformanceLevel = (score) => {
    if (score >= 90) return { label: 'Exceptional', icon: Award, color: 'emerald' };
    if (score >= 80) return { label: 'Excellent', icon: TrendingUp, color: 'green' };
    if (score >= 70) return { label: 'Good', icon: CheckCircle, color: 'blue' };
    if (score >= 60) return { label: 'Satisfactory', icon: CheckCircle, color: 'yellow' };
    if (score >= 50) return { label: 'Needs Improvement', icon: AlertCircle, color: 'orange' };
    return { label: 'Unsatisfactory', icon: AlertCircle, color: 'red' };
  };

  const saveDraft = async () => {
    try {
      setSaving(true);
      await api.post('/responses/supervisor/save', {
        assessmentId,
        employeeId,
        score,
        comments
      });
      show('Draft saved', 'success');
      setHasExistingEvaluation(true);
    } catch (err) {
      console.error('Error saving draft:', err);
      if (err.response?.status === 403) {
        show('You do not have permission to evaluate this employee', 'error');
      } else {
        show('Save failed', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const submitEvaluation = async () => {
    if (!window.confirm('Submit this evaluation? This cannot be undone.')) return;

    try {
      setSubmitting(true);
 
      await api.post('/responses/supervisor/submit', {
        assessmentId,
        employeeId,
        score,
        comments
      });
      
      show('Evaluation submitted successfully!', 'success');
      
      setTimeout(() => navigate('/evaluations'), 1500);
    } catch (err) {
      console.error('Error submitting evaluation:', err);
      if (err.response?.status === 403) {
        show('You do not have permission to submit this evaluation', 'error');
      } else {
        show(err.response?.data?.message || 'Submission failed', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Permission error state
  if (permissionError) {
    return (
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-card p-8 text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-xl font-bold text-brand-black mb-2">
            Access Denied
          </h1>
          <p className="text-gray-600 text-sm mb-6">
            You do not have permission to access this evaluation page.
          </p>
          <button
            onClick={() => navigate('/evaluations')}
            className="w-full px-4 py-2 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors text-sm"
          >
            Return to Pending Evaluations
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">Loading evaluation…</p>
        </div>
      </div>
    );
  }

  if (!assessment || !employee) {
    return (
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-card p-8 text-center max-w-md">
          <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-3" />
          <h2 className="text-lg font-semibold text-gray-700 mb-2">Evaluation Not Found</h2>
          <p className="text-gray-500 text-sm mb-4">The requested evaluation could not be loaded.</p>
          <button
            onClick={() => navigate('/evaluations')}
            className="w-full px-4 py-2 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors text-sm"
          >
            Return to Pending Evaluations
          </button>
        </div>
      </div>
    );
  }

  const performanceLevel = getPerformanceLevel(score);
  const PerformanceIcon = performanceLevel.icon;

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-gray-50 overflow-hidden">
      {/* Sticky Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 shadow-sm z-10">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/supervisor/pending')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <h1 className="text-lg font-bold text-brand-black">Supervisor Evaluation</h1>
                <p className="text-xs text-gray-500">
                  {assessment.competencyId?.name || 'Competency Evaluation'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {hasExistingEvaluation && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg border border-blue-200">
                  <CheckCircle className="w-4 h-4" />
                  <span className="text-xs font-semibold">Draft Saved</span>
                </div>
              )}
              <div className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                new Date(assessment.endDate) > new Date() 
                  ? 'bg-green-100 text-green-700' 
                  : 'bg-red-100 text-red-700'
              }`}>
                {new Date(assessment.endDate) > new Date() ? 'Active' : 'Expired'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-4xl mx-auto p-4 space-y-4">
          
          {/* Employee & Assessment Info - Compact Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Employee Card */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold flex-shrink-0 shadow-sm">
                  {employee.name?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-brand-black truncate">{employee.name}</h3>
                  <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                    <Briefcase className="w-3 h-3" />
                    <span className="truncate">{employee.position || 'Employee'}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Mail className="w-3 h-3" />
                    <span className="truncate">{employee.email}</span>
                  </div>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
                ID: {employee.employeeId || 'N/A'} · {employee.department || 'No Dept'}
              </div>
            </div>

            {/* Assessment Card */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white flex-shrink-0 shadow-sm">
                  <Target className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-brand-black truncate">{assessment.competencyId?.name || 'General Skills'}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{assessment.type}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Calendar className="w-3 h-3" />
                      <span>Due {new Date(assessment.endDate).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Score Section */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            {/* Score Display */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-gray-400" />
                <h2 className="text-sm font-bold text-brand-black">Overall Score</h2>
              </div>
              <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${getScoreColor(score)}`}>
                <PerformanceIcon className="w-3 h-3" />
                {performanceLevel.label}
              </div>
            </div>

            {/* Score Value */}
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className={`text-5xl font-bold ${getScoreColor(score).split(' ')[0]}`}>
                {score}
              </span>
              <span className="text-xl text-gray-400">/100</span>
            </div>

            {/* Score Slider */}
            <div className="mb-4">
              <input
                type="range"
                min="0"
                max="100"
                value={score}
                onChange={(e) => handleScoreChange(e.target.value)}
                className="w-full h-2 bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 rounded-lg appearance-none cursor-pointer"
              />
              
              <div className="flex justify-between mt-1 text-[10px] text-gray-400">
                <span>0</span>
                <span>25</span>
                <span>50</span>
                <span>75</span>
                <span>100</span>
              </div>
            </div>

            {/* Score Controls */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleScoreChange(score - 5)}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-xs font-semibold hover:bg-gray-200 disabled:opacity-50"
                  disabled={score <= 0}
                >
                  -5
                </button>
                <button
                  onClick={() => handleScoreChange(score + 5)}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-xs font-semibold hover:bg-gray-200 disabled:opacity-50"
                  disabled={score >= 100}
                >
                  +5
                </button>
              </div>
              
              <div className="flex gap-1">
                {[50, 70, 85, 100].map((quickScore) => (
                  <button
                    key={quickScore}
                    onClick={() => handleScoreChange(quickScore)}
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      score === quickScore
                        ? 'bg-brand-red text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {quickScore}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Comments Section */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-bold text-brand-black">Evaluation Comments</h2>
            </div>
            
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Provide feedback on performance, strengths, and areas for improvement..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-red focus:border-transparent text-sm"
              rows="4"
            />
            
            <p className="text-[10px] text-gray-400 mt-1">
              Comments will be shared with the employee for development planning.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <div className="flex justify-end gap-2">
              <button
                onClick={saveDraft}
                disabled={saving}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Saving...' : 'Save Draft'}
              </button>
              
              <button
                onClick={submitEvaluation}
                disabled={submitting}
                className="px-4 py-2 bg-brand-red text-white rounded-lg text-xs font-semibold hover:bg-brand-red-dark transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                {submitting ? 'Submitting...' : 'Submit Evaluation'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}