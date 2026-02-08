import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, ClipboardCheck, TrendingUp, AlertCircle, Award, Target } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';

export default function SupervisorDashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { show } = useToast();
  const [stats, setStats] = useState({
    teamMembers: 0,
    pendingEvaluations: 0,
    completedEvaluations: 0,
    teamAvgScore: 0,
  });
  const [teamMembers, setTeamMembers] = useState([]);
  const [pendingAssessments, setPendingAssessments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      // 🔹 Single API call to fetch all supervisor dashboard stats
      const res = await api.get(`/supervisors/${user._id}/dashboard`);
      const data = res.data.data;

      setTeamMembers(data.teamMembers || []);
      setPendingAssessments(data.pendingEvaluations || []);

      setStats({
        teamMembers: data.stats?.teamMembers || 0,
        pendingEvaluations: data.stats?.pendingEvaluations || 0,
        completedEvaluations: data.stats?.completedEvaluations || 0,
        teamAvgScore: data.stats?.teamAvgScore || 0,
      });
    } catch (err) {
      console.error(err);
      show('Failed to load dashboard.', 'error');
    }
    setLoading(false);
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
      <div className="mb-6">
        <h1 className="text-3xl font-display font-bold text-brand-black">Supervisor Dashboard</h1>
        <p className="text-gray-500 mt-1">Manage your team's competency assessments</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <TrendingUp className="w-4 h-4 text-green-500 ml-auto" />
          </div>
          <div className="text-3xl font-display font-bold text-brand-black mb-1">{stats.teamMembers}</div>
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
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
              <ClipboardCheck className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <div className="text-3xl font-display font-bold text-brand-black mb-1">{stats.completedEvaluations}</div>
          <div className="text-sm font-semibold text-gray-700">Completed</div>
          <div className="text-xs text-gray-500 mt-1">Finalized assessments</div>
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
      {pendingAssessments.length > 0 && (
        <div className="bg-white rounded-xl shadow-card border border-gray-100 mb-6">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-lg font-display font-bold text-brand-black">Pending Evaluations</h3>
            <p className="text-sm text-gray-500">Team members awaiting your evaluation</p>
          </div>
          <div className="p-6 space-y-3">
            {pendingAssessments.slice(0, 5).map((item, idx) => (
              <div key={idx} className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:border-brand-red transition-colors">
                <div className="w-10 h-10 rounded-full bg-brand-red/10 flex items-center justify-center flex-shrink-0">
                  <Target className="w-5 h-5 text-brand-red" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-brand-black">{item.employeeName}</div>
                  <div className="text-xs text-gray-500">
                    {item.assessmentDescription} • {item.competencyName}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-semibold">
                    {item.type}
                  </span>
                </div>
                <button
                  onClick={() => nav(`/assessments/${item.assessmentId}/take?employeeId=${item.employeeId}`)}
                  className="px-4 py-2 bg-brand-red text-white rounded-lg text-sm font-semibold hover:bg-brand-red-dark transition-colors"
                >
                  Evaluate Now
                </button>
              </div>
            ))}
            {pendingAssessments.length > 5 && (
              <button
                onClick={() => nav('/my-team/evaluations')}
                className="w-full mt-4 px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                View All ({pendingAssessments.length} total)
              </button>
            )}
          </div>
        </div>
      )}

      {/* Team Quick Access */}
      <div className="bg-white rounded-xl shadow-card border border-gray-100 p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-display font-bold text-brand-black">My Team</h3>
          <button onClick={() => nav('/my-team')} className="text-sm font-semibold text-brand-red hover:underline">View All →</button>
        </div>
        {teamMembers.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Users className="w-12 h-12 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No team members</p>
          </div>
        ) : (
          <div className="space-y-2">
            {teamMembers.slice(0, 5).map(member => (
              <div
                key={member.id}
                onClick={() => nav(`/users/${member.id}`)}
                className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-brand-red flex items-center justify-center text-white font-bold">
                  {member.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-brand-black">{member.name}</div>
                  <div className="text-xs text-gray-500">{member.position || 'Employee'}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
