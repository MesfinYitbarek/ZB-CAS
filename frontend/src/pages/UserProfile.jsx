/* pages/UserProfile.jsx */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  ArrowLeft, Mail, Briefcase, Building2, User,
  Calendar, UserCircle, ShieldCheck, Phone, MapPin
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import api from '../utils/api';

const ROLE_LABELS = {
  HR_ADMIN:   'HR Admin',
  SUPERVISOR: 'Supervisor',
  EMPLOYEE:   'Employee',
};

const ROLE_COLORS = {
  HR_ADMIN:   'bg-red-100 text-red-700 border-red-200',
  SUPERVISOR: 'bg-blue-100 text-blue-700 border-blue-200',
  EMPLOYEE:   'bg-green-100 text-green-700 border-green-200',
};

const GENDER_LABELS = {
  MALE:              'Male',
  FEMALE:            'Female',
  OTHER:             'Other',
  PREFER_NOT_TO_SAY: 'Prefer not to say',
};

export default function UserProfile() {
  const { id } = useParams();
  const { user: currentUser, isAdmin } = useAuth();
  const nav  = useNavigate();
  const { show } = useToast();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const actualUserId = id || 'me';
  const isOwnProfile = !id || id === 'me' || id === currentUser?._id;

  useEffect(() => {
    const load = async () => {
      try {
        const endpoint =
          actualUserId === 'me' ? '/users/me' : `/users/${actualUserId}`;

        const { data } = await api.get(endpoint);
        setUser(data.data.user);
      } catch {
        show('Failed to load profile.', 'error');
        nav('/dashboard');
      }
      setLoading(false);
    };

    load();
  }, [actualUserId, isAdmin, isOwnProfile, nav, show]);

  if (loading)
    return (
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xltext-gray-400">Loading profile…</p>
        </div>
      </div>
    );

  if (!user) return null;

  // `roles` is the new array field; fall back gracefully if viewing old data
  const roles = user.roles ?? (user.role ? [user.role] : ['EMPLOYEE']);

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-[#f8f9fb] overflow-hidden">
      {/* Sticky Header */}
      <div className="flex-shrink-0 bg-white border-b  border-gray-200 shadow-xlz-10">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => nav(-1)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <h1 className="text-lg font-bold text-brand-black">{user.name}</h1>
                <p className="text-xm text-gray-500">{user.employeeId}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <StatusBadge status={user.status} type="user" />
              {!isOwnProfile && isAdmin && (
                <button
                  onClick={() => nav(`/users/edit/${user._id}`)}
                  className="px-3 py-1.5 bg-brand-red text-white rounded-lg text-xm font-semibold hover:bg-brand-red-dark transition-colors"
                >
                  Edit Profile
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-2xl mx-auto p-4 space-y-4">
          
          {/* Profile Information */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-bold text-brand-black mb-3 flex items-center gap-2">
              <UserCircle className="w-4 h-4 text-gray-400" />
              Profile Information
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Username */}
              {user.username && (
                <div className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50">
                  <User className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] text-gray-400 font-medium uppercase">Username</div>
                    <div className="text-sm text-gray-700 font-mono">{user.username}</div>
                  </div>
                </div>
              )}

              {/* Email */}
              <div className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50">
                <Mail className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] text-gray-400 font-medium uppercase">Email</div>
                  <div className="text-xm text-gray-700 truncate">{user.email}</div>
                </div>
              </div>

              {/* Gender */}
              {user.gender && (
                <div className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50">
                  <UserCircle className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] text-gray-400 font-medium uppercase">Gender</div>
                    <div className="text-xm text-gray-700">
                      {GENDER_LABELS[user.gender] ?? user.gender}
                    </div>
                  </div>
                </div>
              )}

              {/* Position */}
              <div className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50">
                <Briefcase className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] text-gray-400 font-medium uppercase">Position</div>
                  <div className="text-xm text-gray-700">{user.position || '—'}</div>
                </div>
              </div>

              {/* Department */}
              <div className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50">
                <Building2 className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] text-gray-400 font-medium uppercase">Department</div>
                  <div className="text-xm text-gray-700">{user.department || '—'}</div>
                </div>
              </div>

              {/* Phone (if available) */}
              {user.phone && (
                <div className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50">
                  <Phone className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] text-gray-400 font-medium uppercase">Phone</div>
                    <div className="text-xm text-gray-700">{user.phone}</div>
                  </div>
                </div>
              )}

              {/* Location (if available) */}
              {user.location && (
                <div className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] text-gray-400 font-medium uppercase">Location</div>
                    <div className="text-xm text-gray-700">{user.location}</div>
                  </div>
                </div>
              )}

              {/* Supervisor */}
              {user.supervisorId && (
                <div className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50">
                  <User className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] text-gray-400 font-medium uppercase">Supervisor</div>
                    <div className="text-xm text-gray-700">{user.supervisorId?.name || '—'}</div>
                  </div>
                </div>
              )}

              {/* Joined */}
              <div className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50">
                <Calendar className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] text-gray-400 font-medium uppercase">Joined</div>
                  <div className="text-xm text-gray-700">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Roles Section */}
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck className="w-4 h-4 text-gray-400" />
                <span className="text-xm font-semibold text-gray-700">Roles</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {roles.map((r) => (
                  <span
                    key={r}
                    className={`text-xm font-semibold px-2.5 py-1 rounded-full border ${ROLE_COLORS[r] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}
                  >
                    {ROLE_LABELS[r] ?? r}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}