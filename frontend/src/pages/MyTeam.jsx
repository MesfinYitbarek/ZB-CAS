import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { 
  Users, Mail, UserCircle, ChevronRight, 
  Phone, Briefcase, MapPin, Calendar, Award,
  Search, Filter, X, Star, Clock
} from 'lucide-react';
import api from '../utils/api';

export default function MyTeam() {
  const { user, isSupervisor, isAdmin } = useAuth();
  const nav = useNavigate();
  const { show } = useToast();

  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('all');


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

  // Filter team members based on search and department
  const filteredMembers = teamMembers.filter(member => {
    const matchesSearch = searchTerm === '' || 
      member.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.position?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.employeeId?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDepartment = selectedDepartment === 'all' || member.department === selectedDepartment;
    
    return matchesSearch && matchesDepartment;
  });

  const activeFilterCount = (searchTerm ? 1 : 0) + (selectedDepartment !== 'all' ? 1 : 0);

  // Redirect if not supervisor or admin
  if (!isSupervisor && !isAdmin) {
    return (
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center p-7">
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-6 rounded-xl max-w-lg">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <UserCircle className="h-6 w-6 text-yellow-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-yellow-800 mb-2">Access Restricted</h3>
              <p className="text-sm text-yellow-700">
                You don't have permission to view this page. This page is only accessible to supervisors and administrators.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">Loading your team…</p>
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
              <h1 className="text-2xl font-display font-bold text-brand-black">
                My Team
              </h1>
              <p className="text-gray-500 mt-1">
                {isAdmin ? 'View all team members (Admin View)' : 'Manage and monitor your team members'}
              </p>
            </div>

          </div>

          {/* Team Members Grid */}
          {filteredMembers.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl shadow-card border border-gray-100">
              <Users className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-semibold text-gray-600 mb-2">
                {teamMembers.length === 0 ? 'No team members yet' : 'No matching members found'}
              </h3>
              <p className="text-gray-400 text-sm">
                {teamMembers.length === 0 
                  ? 'Team members will appear here when added to your department'
                  : 'Try adjusting your filters to see more results'}
              </p>
              {activeFilterCount > 0 && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedDepartment('all');
                  }}
                  className="mt-4 text-sm text-brand-red font-semibold hover:underline"
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredMembers.map((member) => (
                <div
                  key={member._id}
                  onClick={() => nav(`/users/${member._id}`)}
                  className="bg-white rounded-xl p-5 shadow-card hover:shadow-lg transition-all border border-gray-100 cursor-pointer group"
                >
                  {/* Header with Avatar */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-brand-red to-brand-red-dark flex items-center justify-center text-white text-xl font-bold flex-shrink-0 shadow-sm">
                      {member.name
                        ?.split(' ')
                        .map((n) => n[0])
                        .join('')
                        .substring(0, 2)
                        .toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-brand-black truncate group-hover:text-brand-red transition-colors">
                        {member.name}
                      </h3>
                      
                      <div className="flex items-center gap-1 mt-0.5">
                        <Briefcase className="w-3 h-3 text-gray-400" />
                        <p className="text-xs text-gray-500 truncate">
                          {member.position || 'Employee'}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-gray-400" />
                        <p className="text-xs text-gray-500 truncate">
                          {member.department || 'No Department'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Status and ID */}
                  <div className="flex items-center justify-between mb-3">
                    <span
                      className={`inline-block px-2 py-1 rounded-lg text-xs font-semibold ${
                        member.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {member.status || 'INACTIVE'}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">
                      ID: {member.employeeId}
                    </span>
                  </div>

                  {/* Contact Info */}
                  <div className="space-y-2 mb-3 pb-3 border-b border-gray-100">
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="truncate">{member.email}</span>
                    </div>

                    {member.phone && (
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <span className="truncate">{member.phone}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="truncate">
                        Joined {member.createdAt ? new Date(member.createdAt).toLocaleDateString() : 'N/A'}
                      </span>
                    </div>
                  </div>

                  {/* Supervisor Info */}
                  <div className="flex items-center justify-between">
                    {member.supervisorId ? (
                      <div className="flex items-center gap-1">
                        <UserCircle className="w-3 h-3 text-gray-400" />
                        <span className="text-xs text-gray-500 truncate">
                          {member.supervisorId.name || 'Supervisor'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">No supervisor</span>
                    )}
                    
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-brand-red transition-colors" />
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