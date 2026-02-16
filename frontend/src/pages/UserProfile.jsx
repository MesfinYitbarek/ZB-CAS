import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ArrowLeft, Mail, Briefcase, Building2, User, Edit2, Key, Calendar } from 'lucide-react';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import api from '../utils/api';

export default function UserProfile() {
  const { id } = useParams();
  const { user: currentUser, isAdmin } = useAuth();
  const nav = useNavigate();
  const { show } = useToast();
  const [user, setUser] = useState(null);
  const [results, setResults] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState(false);
  const [passwordModal, setPasswordModal] = useState(false);

  const [form, setForm] = useState({
    name: '',
    position: '',
    department: '',
    role: 'EMPLOYEE',
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  // Determine if this is the current user's profile
  const actualUserId = id || 'me';
  const isOwnProfile = !id || id === 'me' || id === currentUser?._id;

  useEffect(() => {
    const load = async () => {
      try {
        const endpoint = actualUserId === 'me' ? '/users/me' : `/users/${actualUserId}`;
        const { data } = await api.get(endpoint);
        setUser(data.data.user);
        setForm({
          name: data.data.user.name,
          position: data.data.user.position || '',
          department: data.data.user.department || '',
          role: data.data.user.role,
        });

        // Load results
        const resultsRes = await api.get(`/results/user/${data.data.user._id}`);
        setResults(resultsRes.data.data.results);

        // Load assessments
        const assessRes = await api.get('/assessments/active');
        setAssessments(assessRes.data.data.assessments);
      } catch (err) {
        show('Failed to load profile.', 'error');
        nav('/dashboard');
      }
      setLoading(false);
    };
    load();
  }, [actualUserId]);

  const handleUpdate = async () => {
    try {
      await api.put(`/users/${user._id}`, form);
      show('Profile updated.', 'success');
      setEditModal(false);
      window.location.reload();
    } catch (err) {
      show(err.response?.data?.message || 'Update failed.', 'error');
    }
  };

  const handlePasswordChange = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      return show('Passwords do not match.', 'error');
    }
    try {
      await api.post('/auth/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      show('Password changed successfully.', 'success');
      setPasswordModal(false);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      show(err.response?.data?.message || 'Password change failed.', 'error');
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-12 h-12 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  if (!user) return null;

  const completedAssessments = results.filter((r) => r.status === 'FINAL').length;
  const avgScore = results.length > 0 ? Math.round(results.reduce((acc, r) => acc + r.finalScore, 0) / results.length) : 0;

  return (
    <div className="p-7">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => nav(-1)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-3xl font-display font-bold text-brand-black">{user.name}</h1>
          <p className="text-gray-500 mt-1">{user.employeeId}</p>
        </div>
        {(isOwnProfile || isAdmin) && (
          <div className="flex gap-2">
            <button onClick={() => setEditModal(true)} className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
              <Edit2 className="w-4 h-4" /> Edit Profile
            </button>
            {isOwnProfile && (
              <button onClick={() => setPasswordModal(true)} className="flex items-center gap-2 px-4 py-2 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors">
                <Key className="w-4 h-4" /> Change Password
              </button>
            )}
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
          <div className="text-sm text-gray-500 mb-1">Status</div>
          <StatusBadge status={user.status} type="user" />
        </div>
        <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
          <div className="text-sm text-gray-500 mb-1">Role</div>
          <div className="text-xl font-bold text-brand-black">{user.role.replace('_', ' ')}</div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
          <div className="text-sm text-gray-500 mb-1">Completed Assessments</div>
          <div className="text-xl font-bold text-brand-black">{completedAssessments}</div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
          <div className="text-sm text-gray-500 mb-1">Average Score</div>
          <div className="text-xl font-bold text-brand-red">{avgScore}%</div>
        </div>
      </div>

      {/* Profile Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left - Profile Info */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-xl p-6 shadow-card border border-gray-100">
            <h3 className="text-lg font-display font-bold text-brand-black mb-4">Profile Information</h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <div className="text-xs text-gray-500 font-semibold uppercase">Email</div>
                  <div className="text-sm text-brand-black-soft">{user.email}</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Briefcase className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <div className="text-xs text-gray-500 font-semibold uppercase">Position</div>
                  <div className="text-sm text-brand-black-soft">{user.position || '—'}</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Building2 className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <div className="text-xs text-gray-500 font-semibold uppercase">Department</div>
                  <div className="text-sm text-brand-black-soft">{user.department || '—'}</div>
                </div>
              </div>
              {user.supervisorId && (
                <div className="flex items-start gap-3">
                  <User className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <div className="text-xs text-gray-500 font-semibold uppercase">Supervisor</div>
                    <div className="text-sm text-brand-black-soft">{user.supervisorId?.name || '—'}</div>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <div className="text-xs text-gray-500 font-semibold uppercase">Joined</div>
                  <div className="text-sm text-brand-black-soft">{new Date(user.createdAt).toLocaleDateString()}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title="Edit Profile">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Full Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Position</label>
            <input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Department</label>
            <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm" />
          </div>
          {isAdmin && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm">
                <option value="EMPLOYEE">Employee</option>
                <option value="SUPERVISOR">Supervisor</option>
                <option value="HR_ADMIN">HR Admin</option>
              </select>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setEditModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleUpdate} className="px-4 py-2 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors">
            Save Changes
          </button>
        </div>
      </Modal>

      {/* Password Change Modal */}
      <Modal open={passwordModal} onClose={() => setPasswordModal(false)} title="Change Password">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Current Password</label>
            <input type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">New Password</label>
            <input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Confirm New Password</label>
            <input type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm" />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setPasswordModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handlePasswordChange} className="px-4 py-2 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors">
            Change Password
          </button>
        </div>
      </Modal>
    </div>
  );
}
