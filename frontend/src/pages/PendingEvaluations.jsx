import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import { 
  ClipboardCheck, Calendar, Clock, Target, AlertCircle, 
  ChevronRight, AlertTriangle, Mail, Briefcase
} from 'lucide-react';
import api from '../utils/api';

export default function PendingEvaluations() {
  const nav = useNavigate();
  const { show } = useToast();
  const [pendingAssessments, setPendingAssessments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPending();
  }, []);

  const loadPending = async () => {
    try {
      const res = await api.get('/supervisors/pending');
      const pendingEvaluations = res.data.data.pendingEvaluations || [];

      // Transform data for display
      const transformed = pendingEvaluations.map(item => {
        const daysRemaining = calculateDaysRemaining(item.endDate);

        return {
          assessment: {
            _id: item.assessmentId,
            description: item.assessmentDescription,
            competencyId: item.competency,
            endDate: item.endDate,
            startDate: item.startDate,
            type: item.assessmentType,
            weight: item.weight
          },
          employee: item.employee,
          type: item.assessmentType,
          priority: item.priority,
          daysRemaining: daysRemaining,
          isCombined: item.assessmentType === 'Combined'
        };
      });

      setPendingAssessments(transformed);
    } catch (err) {
      show('Failed to load pending evaluations.', 'error');
      console.error(err);
    }
    setLoading(false);
  };

  const calculateDaysRemaining = (endDate) => {
    const end = new Date(endDate);
    const now = new Date();
    const diff = end - now;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };


  const getDaysRemainingColor = (days) => {
    if (days < 0) return 'text-red-600 bg-red-50';
    if (days === 0) return 'text-orange-600 bg-orange-50';
    if (days <= 2) return 'text-amber-600 bg-amber-50';
    return 'text-gray-600 bg-gray-50';
  };

  if (loading) {
    return (
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">Loading pending evaluations…</p>
        </div>
      </div>
    );
  }


  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-[#f8f9fb] overflow-hidden">
      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-6 lg:p-8 space-y-5 max-w-screen-2xl mx-auto">

          {/* Sticky Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 sticky top-0 bg-[#f8f9fb] z-10 pb-2">
            <div>
              <h1 className="text-2xl font-display font-bold text-brand-black">Pending Evaluations</h1>
              <p className="text-gray-500 mt-1">Team members awaiting your supervisor evaluation</p>
            </div>

            <div className="flex items-center gap-3">
              

              {/* Pending Count Badge */}
              <div className="flex items-center gap-2 px-4 py-2.5 bg-orange-100 text-orange-700 rounded-lg border border-orange-200">
                <AlertCircle className="w-5 h-5" />
                <span className="text-sm font-semibold">{pendingAssessments.length} Pending</span>
              </div>
            </div>
          </div>

          {/* Evaluations Grid */}
          {pendingAssessments.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl shadow-card border border-gray-100">
              <ClipboardCheck className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-semibold text-gray-600 mb-2">No Pending Evaluations</h3>
              <p className="text-gray-400 text-sm">
                All team members have been evaluated
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {pendingAssessments.map((item, idx) => (
                <div key={idx} className="bg-white rounded-xl shadow-card hover:shadow-lg transition-all border border-gray-100 overflow-hidden group">
                  

                  <div className="p-5">
                    {/* Header with Avatar and Priority */}
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-brand-red to-brand-red-dark flex items-center justify-center text-white text-xl font-bold flex-shrink-0 shadow-sm">
                        {item.employee.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-bold text-brand-black truncate group-hover:text-brand-red transition-colors">
                          {item.employee.name}
                        </h3>
                        
                        <div className="flex items-center gap-1 mt-0.5">
                          <Briefcase className="w-3 h-3 text-gray-400" />
                          <p className="text-xs text-gray-500 truncate">
                            {item.employee.position || 'Employee'}
                          </p>
                        </div>

                        <div className="flex items-center gap-1 mt-0.5">
                          <Mail className="w-3 h-3 text-gray-400" />
                          <p className="text-xs text-gray-500 truncate">
                            {item.employee.email}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Assessment Info */}
                    <div className="bg-gray-50 rounded-lg p-3 mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Target className="w-4 h-4 text-brand-red" />
                        <span className="text-sm font-semibold text-brand-black truncate">
                          {item.assessment.description}
                        </span>
                      </div>
                      
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center gap-2 text-gray-600">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          <span>Due {new Date(item.assessment.endDate).toLocaleDateString()}</span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getDaysRemainingColor(item.daysRemaining)}`}>
                            {item.daysRemaining > 0
                              ? `${item.daysRemaining} days left`
                              : item.daysRemaining === 0
                                ? 'Due today'
                                : `${Math.abs(item.daysRemaining)} days overdue`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={() => {
                        if (item.type === 'SupervisorOnly') {
                          nav(`/assessments/${item.assessment._id}/evaluate?employeeId=${item.employee._id}`);
                        } else if (item.type === 'Combined') {
                          nav(`/assessments/${item.assessment._id}/evaluate?employeeId=${item.employee._id}&type=combined`);
                        }
                      }}
                      className="w-full px-4 py-2.5 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors flex items-center justify-center gap-2 text-xs"
                    >
                      {item.type === 'Combined' ? 'Evaluate Employee' : 'Start Evaluation'}
                      <ChevronRight className="w-4 h-4 ml-auto" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}