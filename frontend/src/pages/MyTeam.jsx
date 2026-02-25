import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Users, Mail } from 'lucide-react';
import api from '../utils/api';

export default function MyTeam() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { show } = useToast();

  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?._id) {
      loadTeam();
    }
  }, [user]);

  const loadTeam = async () => {
    setLoading(true);
    try {
      const response = await api.get(
        `/users/supervisor/${user._id}/employees`
      );

      console.log('API Response:', response.data);

      // ✅ FIXED: Use employees instead of teamMembers
      const team = Array.isArray(response?.data?.data?.employees)
        ? response.data.data.employees
        : [];

      setTeamMembers(team);
    } catch (err) {
      console.error(err);
      show('Failed to load team members.', 'error');
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

  return (
    <div className="p-7">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-black">
            My Team
          </h1>
          <p className="text-gray-500 mt-1">
            Manage and monitor your team members
          </p>
        </div>

        <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-gray-200">
          <Users className="w-5 h-5 text-gray-400" />
          <span className="text-sm font-semibold text-brand-black">
            {teamMembers.length} Members
          </span>
        </div>
      </div>

      {/* Team Members Grid */}
      {teamMembers.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl shadow-card border border-gray-100">
          <Users className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-semibold text-gray-600 mb-2">
            No team members yet
          </h3>
          <p className="text-gray-400 text-sm">
            Team members will appear here when added to your department
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teamMembers.map((member) => (
            <div
              key={member._id}
              className="bg-white rounded-xl p-6 shadow-card hover:shadow-card-hover transition-all border border-gray-100 cursor-pointer"
            >
              {/* Header */}
              <div className="flex items-start gap-4 mb-2">
                <div className="w-14 h-14 rounded-full bg-brand-red flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                  {member.name
                    ?.split(' ')
                    .map((n) => n[0])
                    .join('')
                    .substring(0, 2)
                    .toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-brand-black truncate">
                    {member.name}
                  </h3>

                  <p className="text-sm text-gray-500 truncate">
                    {member.position || 'Employee'} |{' '}
                    {member.department || '—'}
                  </p>

                  <span
                    className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                      member.status === 'ACTIVE'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {member.status}
                  </span>
                </div>
              </div>

              {/* Contact */}
              <div className="space-y-2 mb-4 pb-4 border-b border-gray-100 text-xs text-gray-600">
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-gray-400" />
                  <span className="truncate">{member.email}</span>
                </div>

                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-gray-400" />
                  <span>ID: {member.employeeId}</span>
                </div>
              </div>

              {/* Optional Supervisor Info */}
              {member.supervisorId && (
                <div className="text-xs text-gray-500">
                  Supervisor: {member.supervisorId.name}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}