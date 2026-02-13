import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users,  TrendingUp, AlertCircle, Award, Target } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';

export default function SupervisorDashboard() {
  const nav = useNavigate();
  const { showToast } = useToast();
  const [stats, setStats] = useState({
    teamSize: 0,
    pendingEvaluations: 0,
    teamAvgScore: 0,
  });
 
  const [pendingEvaluations, setPendingEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      // Single API call to fetch supervisor dashboard stats
      const res = await api.get('/dashboard/supervisor');
      const data = res.data.data;

      setPendingEvaluations(data.pendingEvaluations || []);
      setStats(data.stats);
    } catch (err) {
      console.error('Failed to load supervisor dashboard:', err);
      showToast('Failed to load dashboard. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'HIGH': return 'text-red-600 bg-red-100';
      case 'MEDIUM': return 'text-orange-600 bg-orange-100';
      case 'LOW': return 'text-green-600 bg-green-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className="p-7 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-black">Supervisor Dashboard</h1>
          <p className="text-gray-500 mt-1">Manage your team's competency assessments</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <TrendingUp className="w-4 h-4 text-green-500 ml-auto" />
          </div>
          <div className="text-3xl font-display font-bold text-brand-black mb-1">{stats.teamSize}</div>
          <div className="text-sm font-semibold text-gray-700">Team Members</div>
          <div className="text-xs text-gray-500 mt-1">Under your supervision</div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-orange-600" />
            </div>
          </div>
          <div className="text-3xl font-display font-bold text-brand-black mb-1">{stats.pendingEvaluations}</div>
          <div className="text-sm font-semibold text-gray-700">Pending Evaluations</div>
          <div className="text-xs text-gray-500 mt-1">Require your input</div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-brand-red/10 flex items-center justify-center">
              <Award className="w-6 h-6 text-brand-red" />
            </div>
          </div>
          <div className="text-3xl font-display font-bold text-brand-black mb-1">{stats.teamAvgScore}%</div>
          <div className="text-sm font-semibold text-gray-700">Team Average</div>
          <div className="text-xs text-gray-500 mt-1">Across all assessments</div>
        </div>
      </div>

      {/* Pending Evaluations */}
      {pendingEvaluations.length > 0 && (
        <div className="bg-white rounded-xl shadow-card border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
            <div>
              <h3 className="text-lg font-display font-bold text-brand-black">Pending Evaluations</h3>
              <p className="text-sm text-gray-500">Team members awaiting your evaluation</p>
            </div>
            <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-semibold">
              {stats.pendingEvaluations} total
            </span>
          </div>
          <div className="p-6 space-y-3">
            {pendingEvaluations.slice(0, 5).map((item, idx) => (
              <div
                key={idx}
                className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:border-brand-red transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-brand-red/10 flex items-center justify-center flex-shrink-0">
                  <Target className="w-5 h-5 text-brand-red" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-sm text-brand-black">{item.employeeName}</div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getPriorityColor(item.priority)}`}>
                      {item.priority}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {item.assessmentDescription} • Due: {item.dueDate ? new Date(item.dueDate).toLocaleDateString() : 'No deadline'}
                  </div>
                </div>
                <button
                  onClick={() => nav(`/assessments/${item.assessmentId}/evaluate/${item.employeeId}`)}
                  className="px-4 py-2 bg-brand-red text-white rounded-lg text-sm font-semibold hover:bg-brand-red-dark transition-colors flex-shrink-0"
                >
                  Evaluate Now
                </button>
              </div>
            ))}
            {pendingEvaluations.length > 5 && (
              <button
                onClick={() => nav('/evaluations/pending')}
                className="w-full mt-4 px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                View All ({pendingEvaluations.length} total)
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  );
}