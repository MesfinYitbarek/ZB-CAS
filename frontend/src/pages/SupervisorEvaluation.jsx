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
  MessageSquare
} from 'lucide-react';
import api from '../utils/api';

export default function SupervisorEvaluation() {
  const { assessmentId } = useParams();
  const [searchParams] = useSearchParams();
  const employeeId = searchParams.get('employeeId');
  const { user } = useAuth();
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

  useEffect(() => {
    loadEvaluationData();
  }, [assessmentId, employeeId]);

  const loadEvaluationData = async () => {
    try {
      setLoading(true);
      const assessRes = await api.get(`/assessments/${assessmentId}`);
      setAssessment(assessRes.data.data.assessment);
      
      const empRes = await api.get(`/users/${employeeId}`);
      setEmployee(empRes.data.data.user);
      
      // Updated Endpoint to match refactored routes
      const respRes = await api.get(`/responses/supervisor/${assessmentId}/${employeeId}`);
      
      if (respRes.data.data.evaluation) {
        const existing = respRes.data.data.evaluation;
        setScore(existing.score || 0);
        setComments(existing.comments || '');
        setHasExistingEvaluation(true);
      }
    } catch (err) {
      show('Failed to load data', 'error');
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
      // Updated Endpoint
      await api.post('/responses/supervisor/save', {
        assessmentId,
        employeeId,
        score,
        comments
      });
      show('Draft saved', 'success');
      setHasExistingEvaluation(true);
    } catch (err) {
      show('Save failed', 'error');
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
      
      setTimeout(() => navigate('/supervisor/pending'), 1500);
    } catch (err) {
      show(err.response?.data?.message || 'Submission failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-12 h-12 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!assessment || !employee) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="w-16 h-16 mx-auto text-red-500 mb-4" />
        <h2 className="text-xl font-semibold text-gray-700 mb-2">Evaluation Not Found</h2>
        <p className="text-gray-500">The requested evaluation could not be loaded.</p>
      </div>
    );
  }

  const performanceLevel = getPerformanceLevel(score);

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-card p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-brand-black mb-2">
                Supervisor Evaluation
              </h1>
              <p className="text-gray-600">
                Evaluate {employee.name}'s performance for this competency
              </p>
            </div>
            
            {hasExistingEvaluation && (
              <div className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg border border-blue-200">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm font-semibold">Draft Saved</span>
              </div>
            )}
          </div>

          {/* Assessment & Employee Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-100">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <User className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm font-medium text-blue-700">Employee</div>
                  <div className="font-bold text-lg text-brand-black">{employee.name}</div>
                  <div className="text-sm text-blue-600">
                    {employee.position} • {employee.department}
                  </div>
                </div>
              </div>
              <div className="text-sm text-blue-800 bg-blue-100/50 p-3 rounded-lg">
                Employee ID: {employee.employeeId || 'N/A'}
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-xl border border-purple-100">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <Target className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <div className="text-sm font-medium text-purple-700">Competency</div>
                  <div className="font-bold text-lg text-brand-black">
                    {assessment.competencyId?.name || 'General Skills'}
                  </div>
                  <div className="text-sm text-purple-600">{assessment.type} Assessment</div>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm text-purple-800">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>Due: {new Date(assessment.endDate).toLocaleDateString()}</span>
                </div>
                <div className={`px-2 py-1 rounded text-xs font-bold ${
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

        {/* Score Input Section */}
        <div className="bg-white rounded-xl shadow-card p-6 mb-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-brand-black mb-2">
              Overall Competency Score
            </h2>
            <p className="text-gray-600">
              Provide an overall score between 0-100 based on your evaluation of {employee.name}'s performance
            </p>
          </div>

          {/* Score Display */}
          <div className="flex flex-col items-center mb-8">
            <div className={`text-7xl font-bold mb-4 ${getScoreColor(score).split(' ')[0]}`}>
              {score}
              <span className="text-4xl text-gray-500">/100</span>
            </div>
            
            <div className={`px-6 py-3 rounded-full border-2 flex items-center gap-2 mb-4 ${getScoreColor(score)}`}>
              <performanceLevel.icon className="w-5 h-5" />
              <span className="font-bold text-lg">{performanceLevel.label}</span>
            </div>
          </div>

          {/* Score Slider */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <label className="text-lg font-semibold text-gray-700">
                Adjust Score
              </label>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => handleScoreChange(score - 5)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
                  disabled={score <= 0}
                >
                  -5
                </button>
                <button
                  onClick={() => handleScoreChange(score + 5)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
                  disabled={score >= 100}
                >
                  +5
                </button>
              </div>
            </div>
            
            <input
              type="range"
              min="0"
              max="100"
              value={score}
              onChange={(e) => handleScoreChange(e.target.value)}
              className="w-full h-3 bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-gray-300 [&::-webkit-slider-thumb]:shadow-lg"
            />
            
            <div className="flex justify-between mt-2 text-sm text-gray-500">
              <span>0 - Unsatisfactory</span>
              <span>50 - Needs Improvement</span>
              <span>75 - Good</span>
              <span>90 - Exceptional</span>
              <span>100</span>
            </div>
          </div>

          {/* Numeric Input */}
          <div className="mb-8">
            <label className="block text-lg font-semibold text-gray-700 mb-3">
              Enter Score Manually
            </label>
            <div className="flex items-center gap-4">
              <input
                type="number"
                min="0"
                max="100"
                value={score}
                onChange={(e) => handleScoreChange(e.target.value)}
                className="flex-1 px-6 py-4 text-3xl font-bold text-center border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-red focus:border-transparent"
              />
              <div className="text-sm text-gray-500">
                <div className="font-semibold mb-1">Quick Set:</div>
                <div className="flex gap-2">
                  {[50, 60, 70, 80, 90, 100].map((quickScore) => (
                    <button
                      key={quickScore}
                      onClick={() => handleScoreChange(quickScore)}
                      className={`px-3 py-1 rounded-lg text-sm font-semibold ${
                        score === quickScore
                          ? 'bg-brand-red text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {quickScore}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Comments Section */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="w-5 h-5 text-gray-600" />
              <label className="text-lg font-semibold text-gray-700">
                Evaluation Comments
              </label>
            </div>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder={`Provide detailed feedback for ${employee.name}...
• Strengths and achievements
• Areas for improvement
• Specific examples of performance
• Recommendations for development`}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-red focus:border-transparent text-lg"
              rows="8"
            />
            <div className="text-sm text-gray-500 mt-2">
              Your comments will be shared with the employee and used for development planning.
            </div>
          </div>

          {/* Performance Guidelines */}
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6">
            <h3 className="font-semibold text-gray-700 mb-3">Scoring Guidelines</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span className="text-sm"><strong>0-49:</strong> Unsatisfactory / Needs significant improvement</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                <span className="text-sm"><strong>50-59:</strong> Needs Improvement / Below expectations</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <span className="text-sm"><strong>60-69:</strong> Satisfactory / Meets basic expectations</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <span className="text-sm"><strong>70-79:</strong> Good / Consistently meets expectations</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-sm"><strong>80-89:</strong> Excellent / Exceeds expectations</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                <span className="text-sm"><strong>90-100:</strong> Exceptional / Outstanding performance</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white rounded-xl shadow-card p-6">
          <button
            onClick={() => navigate('/supervisor/pending')}
            className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors w-full sm:w-auto"
          >
            Cancel
          </button>
          
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <button
              onClick={saveDraft}
              disabled={saving}
              className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            
            <button
              onClick={submitEvaluation}
              disabled={submitting}
              className="px-8 py-3 bg-gradient-to-r from-brand-red to-red-600 text-white rounded-lg font-semibold hover:from-red-600 hover:to-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 w-full sm:w-auto shadow-lg"
            >
              <Send className="w-4 h-4" />
              {submitting ? 'Submitting...' : 'Submit Evaluation'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}