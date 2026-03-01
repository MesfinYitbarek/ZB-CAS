import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ClipboardCheck, Calendar, Clock, Target, AlertCircle, Filter } from 'lucide-react';
import api from '../utils/api';

export default function PendingEvaluations() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { show } = useToast();
  const [pendingAssessments, setPendingAssessments] = useState([]);
  const [filteredAssessments, setFilteredAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');

  useEffect(() => {
    loadPending();
  }, []);

  useEffect(() => {
    if (filterType) {
      setFilteredAssessments(pendingAssessments.filter(p => p.type.includes(filterType)));
    } else {
      setFilteredAssessments(pendingAssessments);
    }
  }, [filterType, pendingAssessments]);

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
    setFilteredAssessments(transformed);
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

  const getPriorityColor = (priority) => {
    return priority === 'High' ? 'text-red-600 bg-red-100' : 'text-orange-600 bg-orange-100';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-7">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-brand-black">Pending Evaluations</h1>
          <p className="text-gray-500 mt-1">Team members awaiting your supervisor evaluation</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-orange-100 text-orange-700 rounded-lg border border-orange-200">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm font-semibold">{pendingAssessments.length} Pending</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setFilterType('')}
          className={`px-4 py-2 rounded-lg border-2 font-semibold text-sm transition-all ${
            filterType === '' ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
          }`}
        >
          All ({pendingAssessments.length})
        </button>
        <button
          onClick={() => setFilterType('SupervisorOnly')}
          className={`px-4 py-2 rounded-lg border-2 font-semibold text-sm transition-all ${
            filterType === 'SupervisorOnly' ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
          }`}
        >
          Supervisor Only ({pendingAssessments.filter(p => p.type === 'SupervisorOnly').length})
        </button>
        <button
          onClick={() => setFilterType('Combined')}
          className={`px-4 py-2 rounded-lg border-2 font-semibold text-sm transition-all ${
            filterType === 'Combined' ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
          }`}
        >
          Combined ({pendingAssessments.filter(p => p.type === 'Combined').length})
        </button>
      </div>

      {/* Evaluations List */}
      {filteredAssessments.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl shadow-card border border-gray-100">
          <ClipboardCheck className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-semibold text-gray-600 mb-2">No Pending Evaluations</h3>
          <p className="text-gray-400 text-sm">
            {filterType ? 'No evaluations match this filter' : 'All team members have been evaluated'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredAssessments.map((item, idx) => (
            <div key={idx} className="bg-white rounded-xl p-6 shadow-card hover:shadow-card-hover transition-all border border-gray-100">
              <div className="flex items-start gap-4">
                {/* Employee Avatar */}
                <div className="w-12 h-12 rounded-full bg-brand-red flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
                  {item.employee.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                </div>

                {/* Main Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-lg font-bold text-brand-black">{item.employee.name}</h3>
                      <p className="text-sm text-gray-500">{item.employee.position || 'Employee'} • {item.employee.employeeId}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${getPriorityColor(item.priority)}`}>
                        {item.priority} Priority
                      </span>
                    </div>
                  </div>

                  {/* Assessment Details */}
                  <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="w-4 h-4 text-brand-red" />
                      <span className="font-semibold text-brand-black">{item.assessment.description}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Target className="w-3.5 h-3.5 text-gray-400" />
                        <span>{item.assessment.competencyId?.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        <span>Due {new Date(item.assessment.endDate).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        <span>
                          {item.daysRemaining > 0 
                            ? `${item.daysRemaining} days left` 
                            : item.daysRemaining === 0 
                            ? 'Due today' 
                            : `${Math.abs(item.daysRemaining)} days overdue`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Type Badge */}
                  <div className="flex items-center gap-3 mb-4">
                    <span className={`px-3 py-1 rounded-lg text-xs font-bold ${
                      item.type === 'SupervisorOnly' 
                        ? 'bg-blue-100 text-blue-700' 
                        : 'bg-purple-100 text-purple-700'
                    }`}>
                      {item.type === 'SupervisorOnly' ? '👤 Supervisor Only' : '🤝 Combined Assessment'}
                    </span>
                    {item.type === 'Combined' && (
                      <span className="text-xs text-green-600 flex items-center gap-1">
                        <ClipboardCheck className="w-3 h-3" />
                        Employee self-assessment completed
                      </span>
                    )}
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
  className="w-full px-6 py-3 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors flex items-center justify-center gap-2"
>
  <ClipboardCheck className="w-5 h-5" />
  {item.type === 'Combined' ? 'Evaluate Employee' : 'Start Evaluation'}
</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary Stats */}
      {pendingAssessments.length > 0 && (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase font-semibold">High Priority</div>
                <div className="text-2xl font-bold text-brand-black">
                  {pendingAssessments.filter(p => p.priority === 'High').length}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                <Clock className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase font-semibold">Due Soon</div>
                <div className="text-2xl font-bold text-brand-black">
                  {pendingAssessments.filter(p => p.daysRemaining <= 3 && p.daysRemaining >= 0).length}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <ClipboardCheck className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase font-semibold">Combined</div>
                <div className="text-2xl font-bold text-brand-black">
                  {pendingAssessments.filter(p => p.type === 'Combined').length}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
