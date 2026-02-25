/* pages/UserProfile.jsx */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  ArrowLeft, Mail, Briefcase, Building2, User,
  Calendar, UserCircle, ShieldCheck,
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

  const [user,    setUser]    = useState(null);
  const [results, setResults] = useState([]);
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

        if (!isAdmin || isOwnProfile) {
          const resultsRes = await api.get(`/results/user/${data.data.user._id}`);
          setResults(resultsRes.data.data.results);
        }
      } catch {
        show('Failed to load profile.', 'error');
        nav('/dashboard');
      }
      setLoading(false);
    };

    load();
  }, [actualUserId, isAdmin, isOwnProfile]);

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-12 h-12 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
      </div>
    );

  if (!user) return null;

  // `roles` is the new array field; fall back gracefully if viewing old data
  const roles = user.roles ?? (user.role ? [user.role] : ['EMPLOYEE']);

  const completedAssessments =
    !isAdmin && results.length > 0
      ? results.filter((r) => r.status === 'FINAL').length
      : 0;

  return (
    <div className="p-7">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => nav(-1)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex-1">
          <h1 className="text-3xl font-display font-bold text-brand-black">
            {user.name}
          </h1>
          <p className="text-gray-500 mt-1">{user.employeeId}</p>
        </div>
      </div>

      {/* Stats Cards */}
      {(!isAdmin || isOwnProfile) ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {/* Status */}
          <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
            <div className="text-sm text-gray-500 mb-1">Status</div>
            <StatusBadge status={user.status} type="user" />
          </div>

          {/* Roles */}
          <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
            <div className="text-sm text-gray-500 mb-2">
              {roles.length > 1 ? 'Roles' : 'Role'}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {roles.map((r) => (
                <span
                  key={r}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${ROLE_COLORS[r] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}
                >
                  {ROLE_LABELS[r] ?? r}
                </span>
              ))}
            </div>
          </div>

          {/* Completed assessments */}
          <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
            <div className="text-sm text-gray-500 mb-1">Completed Assessments</div>
            <div className="text-xl font-bold text-brand-black">{completedAssessments}</div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {/* Status */}
          <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
            <div className="text-sm text-gray-500 mb-1">Status</div>
            <StatusBadge status={user.status} type="user" />
          </div>

          {/* Roles */}
          <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
            <div className="text-sm text-gray-500 mb-2">
              {roles.length > 1 ? 'Roles' : 'Role'}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {roles.map((r) => (
                <span
                  key={r}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${ROLE_COLORS[r] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}
                >
                  {ROLE_LABELS[r] ?? r}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Profile Information */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-xl p-6 shadow-card border border-gray-100">
            <h3 className="text-lg font-display font-bold text-brand-black mb-4">
              Profile Information
            </h3>

            <div className="space-y-4">
              {/* Email */}
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-xs text-gray-500 font-semibold uppercase">Email</div>
                  <div className="text-sm text-brand-black-soft">{user.email}</div>
                </div>
              </div>

              {/* Gender */}
              {user.gender && (
                <div className="flex items-start gap-3">
                  <UserCircle className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-xs text-gray-500 font-semibold uppercase">Gender</div>
                    <div className="text-sm text-brand-black-soft">
                      {GENDER_LABELS[user.gender] ?? user.gender}
                    </div>
                  </div>
                </div>
              )}

              {/* Roles */}
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-xs text-gray-500 font-semibold uppercase">
                    {roles.length > 1 ? 'Roles' : 'Role'}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {roles.map((r) => (
                      <span
                        key={r}
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${ROLE_COLORS[r] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}
                      >
                        {ROLE_LABELS[r] ?? r}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Position */}
              <div className="flex items-start gap-3">
                <Briefcase className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-xs text-gray-500 font-semibold uppercase">Position</div>
                  <div className="text-sm text-brand-black-soft">{user.position || '—'}</div>
                </div>
              </div>

              {/* Department */}
              <div className="flex items-start gap-3">
                <Building2 className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-xs text-gray-500 font-semibold uppercase">Department</div>
                  <div className="text-sm text-brand-black-soft">{user.department || '—'}</div>
                </div>
              </div>

              {/* Supervisor */}
              {user.supervisorId && (
                <div className="flex items-start gap-3">
                  <User className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-xs text-gray-500 font-semibold uppercase">Supervisor</div>
                    <div className="text-sm text-brand-black-soft">
                      {user.supervisorId?.name || '—'}
                    </div>
                  </div>
                </div>
              )}

              {/* Joined */}
              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-xs text-gray-500 font-semibold uppercase">Joined</div>
                  <div className="text-sm text-brand-black-soft">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
