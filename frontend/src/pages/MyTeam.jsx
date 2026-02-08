import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Users, Mail, Award, TrendingUp, Search } from 'lucide-react';
import api from '../utils/api';

export default function MyTeam() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { show } = useToast();

  const [teamMembers, setTeamMembers] = useState([]);
  const [filteredMembers, setFilteredMembers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [memberStats, setMemberStats] = useState({});

  useEffect(() => {
    loadTeam();
  }, []);

  useEffect(() => {
    if (searchQuery) {
      const filtered = teamMembers.filter(member =>
        member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        member.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (member.employeeId || '').toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredMembers(filtered);
    } else {
      setFilteredMembers(teamMembers);
    }
  }, [searchQuery, teamMembers]);

  const loadTeam = async () => {
    setLoading(true);
    try {
      // Fetch employees under current supervisor
      const { data } = await api.get(`/users/supervisor/${user._id}/employees`);
      const team = data.data.teamMembers || [];

      setTeamMembers(team);
      setFilteredMembers(team);

      // Load performance stats for each member
      const stats = {};
      for (const member of team) {
        const resultsRes = await api.get(`/results/user/${member._id}`);
        const results = resultsRes.data.data.results || [];

        const avgScore = results.length
          ? Math.round(results.reduce((sum, r) => sum + r.finalScore, 0) / results.length)
          : 0;

        stats[member._id] = {
          totalAssessments: results.length,
          avgScore,
          completedCount: results.filter(r => r.status === 'FINAL').length,
        };
      }
      setMemberStats(stats);

    } catch (err) {
      console.error(err);
      show('Failed to load team members.', 'error');
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
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-black">My Team</h1>
          <p className="text-gray-500 mt-1">Manage and monitor your team members</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-gray-200">
          <Users className="w-5 h-5 text-gray-400" />
          <span className="text-sm font-semibold text-brand-black">{teamMembers.length} Members</span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, or employee ID..."
            className="w-full h-11 pl-10 pr-4 rounded-lg border border-gray-300 focus-brand text-sm"
          />
        </div>
      </div>

      {/* Team Members Grid */}
      {filteredMembers.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl shadow-card border border-gray-100">
          <Users className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-semibold text-gray-600 mb-2">
            {searchQuery ? 'No members found' : 'No team members yet'}
          </h3>
          <p className="text-gray-400 text-sm">
            {searchQuery ? 'Try a different search term' : 'Team members will appear here when added to your department'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMembers.map((member) => {
            const stats = memberStats[member._id] || { totalAssessments: 0, avgScore: 0, completedCount: 0 };

            return (
              <div
                key={member._id}
                onClick={() => nav(`/users/${member._id}`)}
                className="bg-white rounded-xl p-6 shadow-card hover:shadow-card-hover transition-all border border-gray-100 cursor-pointer"
              >
                {/* Header */}
                <div className="flex items-start gap-4 mb-2">
                  <div className="w-14 h-14 rounded-full bg-brand-red flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                    {member.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold text-brand-black truncate">{member.name}</h3>
                    <p className="text-sm text-gray-500 truncate">
                      {member.position || 'Employee'} | {member.department || '—'}
                    </p>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                      member.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {member.status}
                    </span>
                  </div>
                </div>

                {/* Contact & Supervisor Info */}
                <div className="space-y-2 mb-4 pb-4 border-b border-gray-100 text-xs text-gray-600">
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-gray-400" />
                    <span className="truncate">{member.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-gray-400" />
                    <span>ID: {member.employeeId}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-gray-400" />
                    <span>Supervisor: {member.supervisorId?.name || '—'}</span>
                  </div>
                </div>

                {/* Performance Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <div className="text-xs text-gray-500 mb-1">Assessments</div>
                    <div className="text-lg font-bold text-brand-black">{stats.totalAssessments}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500 mb-1">Completed</div>
                    <div className="text-lg font-bold text-green-600">{stats.completedCount}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500 mb-1">Avg Score</div>
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-lg font-bold text-brand-red">{stats.avgScore}%</span>
                      {stats.avgScore >= 80 && <TrendingUp className="w-3.5 h-3.5 text-green-500" />}
                    </div>
                  </div>
                </div>

                {/* Action Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    nav(`/users/${member._id}`);
                  }}
                  className="w-full mt-4 px-4 py-2 bg-brand-red/5 text-brand-red rounded-lg font-semibold text-sm hover:bg-brand-red hover:text-white transition-colors"
                >
                  View Profile
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary Stats */}
      {teamMembers.length > 0 && (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase font-semibold">Total Team</div>
                <div className="text-2xl font-bold text-brand-black">{teamMembers.length}</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <Award className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase font-semibold">Active</div>
                <div className="text-2xl font-bold text-brand-black">
                  {teamMembers.filter(m => m.status === 'ACTIVE').length}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-brand-red/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-brand-red" />
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase font-semibold">Avg Score</div>
                <div className="text-2xl font-bold text-brand-black">
                  {teamMembers.length
                    ? Math.round(
                        Object.values(memberStats).reduce((sum, s) => sum + s.avgScore, 0) /
                        Object.values(memberStats).length
                      )
                    : 0}%
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                <Award className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase font-semibold">Department</div>
                <div className="text-sm font-bold text-brand-black truncate">{user.department}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
