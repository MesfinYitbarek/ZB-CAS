/* pages/Users.jsx */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Search, Trash2, Edit2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, UserCheck, Upload, Download, FileSpreadsheet, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import api from '../utils/api';

const ALL_ROLES   = ['HR_ADMIN', 'SUPERVISOR', 'EMPLOYEE'];
const ALL_GENDERS = ['Male', 'Female'];

const ROLE_LABELS = {
  HR_ADMIN:   'HR Admin',
  SUPERVISOR: 'Supervisor',
  EMPLOYEE:   'Employee',
};

const GENDER_LABELS = {
  Male:              'Male',
  Female:            'Female',
};

export default function Users() {
  const [users,       setUsers]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [filterRole,  setFilterRole]  = useState('');
  const [filterStatus,setFilterStatus]= useState('');
  const [modal,       setModal]       = useState(null);    // 'create' | 'edit' | null
  const [selected,    setSelected]    = useState(null);
  const [supervisors, setSupervisors] = useState([]);
  const { show } = useToast();

  const [pagination, setPagination] = useState({
    page: 1, limit: 10, total: 0, totalPages: 0,
  });

  const [expandedUser, setExpandedUser] = useState(null);

  // ── Bulk import ────────────────────────────────────────────────────────────
  const [showImport,    setShowImport]    = useState(false);
  const [importing,     setImporting]     = useState(false);
  const [importResult,  setImportResult]  = useState(null);
  const [selectedFile,  setSelectedFile]  = useState(null);
  const [dragOver,      setDragOver]      = useState(false);
  const fileInputRef = useRef(null);

  const handleDownloadTemplate = async () => {
    try {
      const res = await api.get('/users/import/template', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'user-import-template.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      show('Could not download the template.', 'error');
    }
  };

  const resetImport = () => {
    setSelectedFile(null);
    setImportResult(null);
    setDragOver(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openImport = () => {
    resetImport();
    setShowImport(true);
  };

  const runImport = async () => {
    if (!selectedFile) { show('Please choose a file first.', 'error'); return; }
    setImporting(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      const { data } = await api.post('/users/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportResult(data.data);
      show(`Import complete: ${data.data.summary.imported} imported, ${data.data.summary.failed} failed.`, 
        data.data.summary.failed > 0 ? 'info' : 'success');
      if (data.data.summary.imported > 0) fetchUsers();
    } catch (err) {
      show(err.response?.data?.message || 'Import failed.', 'error');
    } finally {
      setImporting(false);
    }
  };

  const onDropFile = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) setSelectedFile(file);
  };

  const formatBytes = (b) => {
    if (!b) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return `${parseFloat((b / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const initForm = () => ({
    employeeId:  '',
    name:        '',
    username:    '',
    email:       '',
    roles:       ['EMPLOYEE'],   // array
    gender:      '',
    position:    '',
    department:  '',
    supervisorId:'',
  });

  const [form, setForm] = useState(initForm());

  // ─── Fetch ────────────────────────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: pagination.page, limit: pagination.limit };
      if (filterRole)   params.role   = filterRole;
      if (filterStatus) params.status = filterStatus;
      if (search)       params.search = search;

      const { data } = await api.get('/users', { params });
      setUsers(data.data.users);

      if (data.data.pagination) {
        setPagination((prev) => ({
          ...prev,
          total:      data.data.pagination.total,
          totalPages: Math.ceil(data.data.pagination.total / pagination.limit),
        }));
      }
    } catch {
      show('Failed to load users.', 'error');
    }
    setLoading(false);
  }, [filterRole, filterStatus, search, pagination.page, pagination.limit]);

  const fetchSupervisors = async () => {
    try {
      const { data } = await api.get('/users', {
        params: { role: 'SUPERVISOR', status: 'ACTIVE', limit: 1000 },
      });
      setSupervisors(data.data.users || []);
    } catch {
      show('Failed to load supervisors.', 'error');
    }
  };

  useEffect(() => { fetchUsers(); fetchSupervisors(); }, [fetchUsers]);

  // ─── Modal helpers ────────────────────────────────────────────────────────
  const openCreate = () => { setForm(initForm()); setModal('create'); };

  const openEdit = (u) => {
    setForm({
      employeeId:   u.employeeId,
      name:         u.name,
      username:     u.username || '',
      email:        u.email,
      roles:        u.roles || ['EMPLOYEE'],
      gender:       u.gender || '',
      position:     u.position    || '',
      department:   u.department  || '',
      supervisorId: u.supervisorId?._id || '',
    });
    setSelected(u);
    setModal('edit');
  };

  // Toggle a role in/out of the roles array
  const toggleRole = (role) => {
    setForm((prev) => {
      const has = prev.roles.includes(role);
      if (has && prev.roles.length === 1) return prev; // must keep at least 1
      return {
        ...prev,
        roles: has ? prev.roles.filter((r) => r !== role) : [...prev.roles, role],
        // clear supervisor if EMPLOYEE is no longer in roles
        supervisorId: !has || role !== 'EMPLOYEE' ? prev.supervisorId : '',
      };
    });
  };

  const handleSave = async () => {
    try {
      if (modal === 'create') {
        if (!form.username) { show('Username is required.', 'error'); return; }
        await api.post('/auth/register', { ...form, role: undefined });
        show('User created successfully.', 'success');
      } else {
        await api.put(`/users/${selected._id}`, form);
        show('User updated.', 'success');
      }
      setModal(null);
      fetchUsers();
    } catch (err) {
      show(err.response?.data?.message || 'Save failed.', 'error');
    }
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm('Deactivate this user?')) return;
    try {
      await api.delete(`/users/${id}`);
      show('User deactivated.', 'success');
      fetchUsers();
    } catch (err) {
      show(err.response?.data?.message || 'Failed.', 'error');
    }
  };

  const handleActivate = async (id) => {
    if (!window.confirm('Activate this user?')) return;
    try {
      await api.put(`/users/${id}`, { status: 'ACTIVE' });
      show('User activated.', 'success');
      fetchUsers();
    } catch (err) {
      show(err.response?.data?.message || 'Failed.', 'error');
    }
  };

  // ─── Pagination ───────────────────────────────────────────────────────────
  const goToPage = (page) => {
    if (page >= 1 && page <= pagination.totalPages)
      setPagination((prev) => ({ ...prev, page }));
  };

  const handlePageSizeChange = (e) => {
    const newLimit = parseInt(e.target.value, 10);
    setPagination({ page: 1, limit: newLimit, total: pagination.total,
      totalPages: Math.ceil(pagination.total / newLimit) });
  };

  const handleSearch = (value) => {
    setSearch(value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const toggleExpand = (userId) => {
    setExpandedUser(expandedUser === userId ? null : userId);
  };
  const hasEmployeeRole = form.roles.includes('EMPLOYEE');

  return (
    <div className="p-7 h-[calc(100vh-4rem)] flex flex-col">
      {/* Sticky Header */}
      <div className="flex justify-between items-start mb-3 flex-shrink-0">
        <div>
          <h1 className="text-xl  font-bold text-brand-black">User Management</h1>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={openImport}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 bg-white text-brand-black rounded-lg font-semibold hover:bg-gray-50 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" /> Import Users
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add User
          </button>
        </div>
      </div>

      {/* Sticky Filters */}
      <div className="flex justify-between items-center gap-3 mb-5 flex-wrap flex-shrink-0">
        <div className="flex gap-3 flex-wrap">
          <div className="relative min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search users..."
              className="w-full h-10 pl-10 pr-4 rounded-lg border border-gray-300 focus-brand text-sm"
            />
          </div>
          <select
            value={filterRole}
            onChange={(e) => { setFilterRole(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
            className="h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm"
          >
            <option value="">All Roles</option>
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
            className="h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm"
          >
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Show:</span>
          <select
            value={pagination.limit}
            onChange={handlePageSizeChange}
            className="px-3 py-1.5 rounded-lg border border-gray-300 focus-brand text-sm"
          >
            {[5, 10, 20, 50].map((n) => (
              <option key={n} value={n}>{n} per page</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table Container - Scrollable */}
      <div className="bg-white rounded-xl shadow-card border border-gray-100 overflow-hidden flex flex-col flex-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center p-16 flex-1">
            <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-auto flex-1">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
                <tr>
                  {['Employee ID','Name','Username','Position','Roles','Status','Actions'].map((h) => (
                    <th key={h} className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider bg-gray-50">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-400">No users found.</td>
                  </tr>
                )}
                {users.map((u) => (
                  <>
                    <tr key={u._id} className="hover:bg-brand-red-muted transition-colors">
                      <td className="px-6 py-3 font-mono text-sm text-gray-600">{u.employeeId}</td>
                      <td className="px-6 py-3 font-semibold text-sm text-brand-black-soft">{u.name}</td>
                      <td className="px-6 py-3 text-sm text-gray-600 font-mono">{u.username || '—'}</td>
                      <td className="px-6 py-3 text-sm text-gray-600">{u.position || '—'}</td>

                      {/* Roles – show with attractive separator */}
                      <td className="px-6 py-3">
                        <div className="flex flex-wrap items-center gap-1">
                          {(u.roles || []).map((r, idx) => (
                            <span key={r} className="flex items-center">
                              <span className={`badge badge-${r.toLowerCase()}`}>
                                {ROLE_LABELS[r] ?? r}
                              </span>
                              {idx < (u.roles || []).length - 1 && (
                                <span className="mx-1.5 text-brand-red font-bold">&</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="px-6 py-3">
                        <span className={`badge badge-${u.status.toLowerCase()}`}>{u.status}</span>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex gap-2">
                          <button 
                            onClick={() => toggleExpand(u._id)} 
                            className="p-1.5 hover:bg-blue-50 rounded transition-colors"
                            title="View Details"
                          >
                            {expandedUser === u._id ? (
                              <ChevronUp className="w-4 h-4 text-blue-600" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-blue-600" />
                            )}
                          </button>
                          <button onClick={() => openEdit(u)} className="p-1.5 hover:bg-gray-100 rounded transition-colors">
                            <Edit2 className="w-4 h-4 text-gray-500" />
                          </button>
                          {u.status === 'ACTIVE' && (
                            <button onClick={() => handleDeactivate(u._id)} className="p-1.5 hover:bg-red-50 rounded transition-colors">
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </button>
                          )}
                          {u.status === 'INACTIVE' && (
                            <button
                              onClick={() => handleActivate(u._id)}
                              className="p-1.5 hover:bg-emerald-50 rounded transition-colors"
                              title="Activate User"
                            >
                              <UserCheck className="w-4 h-4 text-emerald-600" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {/* Expanded Details Row */}
                    {expandedUser === u._id && (
                      <tr className="bg-gray-50/50">
                        <td colSpan={7} className="px-6 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500 text-xs uppercase font-semibold">Username</span>
                              <p className="text-gray-700 mt-0.5 font-mono">{u.username || '—'}</p>
                            </div>
                            <div>
                              <span className="text-gray-500 text-xs uppercase font-semibold">Email</span>
                              <p className="text-gray-700 mt-0.5">{u.email}</p>
                            </div>
                            <div>
                              <span className="text-gray-500 text-xs uppercase font-semibold">Gender</span>
                              <p className="text-gray-700 mt-0.5">
                                {u.gender ? (GENDER_LABELS[u.gender] ?? u.gender) : '—'}
                              </p>
                            </div>
                            <div>
                              <span className="text-gray-500 text-xs uppercase font-semibold">Department</span>
                              <p className="text-gray-700 mt-0.5">{u.department || '—'}</p>
                            </div>
                            <div>
                              <span className="text-gray-500 text-xs uppercase font-semibold">Supervisor</span>
                              <p className="text-gray-700 mt-0.5">{u.supervisorId?.name || '—'}</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.total > pagination.limit && (
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-gray-200 flex-shrink-0 bg-white">
          <div className="text-sm text-gray-600">
            Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} users
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>

            <div className="flex items-center gap-1">
              {(() => {
                const pages = [];
                const maxV  = 5;
                if (pagination.totalPages <= maxV) {
                  for (let i = 1; i <= pagination.totalPages; i++) pages.push(i);
                } else {
                  let start = Math.max(1, pagination.page - Math.floor(maxV / 2));
                  let end   = Math.min(pagination.totalPages, start + maxV - 1);
                  if (end - start + 1 < maxV) start = Math.max(1, end - maxV + 1);
                  for (let i = start; i <= end; i++) pages.push(i);
                }
                return pages.map((p) => (
                  <button
                    key={p}
                    onClick={() => goToPage(p)}
                    className={`w-9 h-9 rounded-lg text-sm font-medium ${
                      pagination.page === p
                        ? 'bg-brand-red text-white'
                        : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {p}
                  </button>
                ));
              })()}
            </div>

            <button
              onClick={() => goToPage(pagination.page + 1)}
              disabled={pagination.page === pagination.totalPages}
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal === 'create' ? 'Add New User' : 'Edit User'}
      >
        <div className="grid grid-cols-2 gap-4">

          {/* Employee ID */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Employee ID</label>
            <input
              value={form.employeeId}
              onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
              placeholder="EMP-001"
              disabled={modal === 'edit'}
              className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm disabled:bg-gray-100"
            />
          </div>

          {/* Full Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Full Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="John Doe"
              className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm"
            />
          </div>

          {/* Username */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Username <span className="text-gray-400 font-normal text-xs">(used to log in)</span>
            </label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') })}
              placeholder="john.doe"
              disabled={modal === 'edit'}
              className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm disabled:bg-gray-100 font-mono"
            />
            {modal === 'create' && (
              <p className="text-xs text-gray-400 mt-1">Letters, numbers, dots, hyphens, underscores only.</p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="john@zemenbank.com"
              disabled={modal === 'edit'}
              className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm disabled:bg-gray-100"
            />
          </div>

          {/* Gender */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Gender</label>
            <select
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
              className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm"
            >
              <option value="">Select gender</option>
              {ALL_GENDERS.map((g) => (
                <option key={g} value={g}>{GENDER_LABELS[g]}</option>
              ))}
            </select>
          </div>

          {/* Position */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Position</label>
            <input
              value={form.position}
              onChange={(e) => setForm({ ...form, position: e.target.value })}
              placeholder="IT Officer 1"
              className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm"
            />
          </div>

          {/* Department */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Department</label>
            <input
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
              placeholder="IT Department"
              className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm"
            />
          </div>

          {/* Roles – multi-checkbox, full width */}
          <div className="col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Roles <span className="text-gray-400 font-normal">(select 1–3)</span>
            </label>
            <div className="flex gap-3 flex-wrap">
              {ALL_ROLES.map((role) => {
                const checked = form.roles.includes(role);
                return (
                  <label
                    key={role}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 cursor-pointer transition-colors select-none ${
                      checked
                        ? 'border-brand-red bg-brand-red/5 text-brand-red font-semibold'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRole(role)}
                      className="sr-only"
                    />
                    <span
                      className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        checked ? 'bg-brand-red border-brand-red' : 'border-gray-300'
                      }`}
                    >
                      {checked && (
                        <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </span>
                    {ROLE_LABELS[role]}
                  </label>
                );
              })}
            </div>
            {form.roles.length === 0 && (
              <p className="text-xs text-red-500 mt-1">At least one role is required.</p>
            )}
          </div>

          {/* Supervisor – visible when EMPLOYEE is one of the roles */}
          {hasEmployeeRole && (
            <div className="col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Supervisor</label>
              <select
                value={form.supervisorId || ''}
                onChange={(e) => setForm({ ...form, supervisorId: e.target.value })}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm"
              >
                <option value="">Select Supervisor</option>
                {supervisors.map((sup) => (
                  <option key={sup._id} value={sup._id}>
                    {sup.name} ({sup.department})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={() => setModal(null)}
            className="px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={form.roles.length === 0}
            className="px-4 py-2 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {modal === 'create' ? 'Create User' : 'Save Changes'}
          </button>
        </div>
      </Modal>

      {/* ── Import Users Modal ─────────────────────────────────────────────── */}
      <Modal open={showImport} onClose={() => { if (!importing) setShowImport(false); }} title="Import Users" large>
        {!importResult ? (
          <div className="space-y-5">
            <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg p-4">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold">Bulk import users from Excel or CSV</p>
                <p className="mt-1 text-blue-600">
                  Required columns: <code className="font-mono font-semibold">employeeId, name, username, email</code>.
                  Optional: <code className="font-mono">role, gender, position, department, supervisor, status</code>.
                  Max 500 rows per file. Use the template for the correct format.
                </p>
              </div>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDropFile}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                dragOver ? 'border-brand-red bg-brand-red-muted' : 'border-gray-300 hover:border-brand-red hover:bg-gray-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.txt"
                className="hidden"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
              <FileSpreadsheet className="w-10 h-10 mx-auto text-gray-400 mb-3" />
              {selectedFile ? (
                <div>
                  <p className="font-semibold text-brand-black break-all">{selectedFile.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{formatBytes(selectedFile.size)} · click to change</p>
                </div>
              ) : (
                <div>
                  <p className="font-semibold text-brand-black">Drag & drop a file here, or click to browse</p>
                  <p className="text-xs text-gray-500 mt-1">Supported: .xlsx, .xls, .csv</p>
                </div>
              )}
            </div>

            <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-2 text-brand-red font-semibold text-sm hover:text-brand-red-dark transition-colors"
            >
              <Download className="w-4 h-4" /> Download Excel template
            </button>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowImport(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={runImport}
                disabled={importing || !selectedFile}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                {importing ? 'Importing...' : 'Import Users'}
              </button>
            </div>
          </div>
        ) : (
          <ImportResultView
            result={importResult}
            onDone={() => { resetImport(); setShowImport(false); }}
            onImportMore={() => resetImport()}
          />
        )}
      </Modal>
    </div>
  );
}

// ── Import Result View ───────────────────────────────────────────────────────
function ImportResultView({ result, onDone, onImportMore }) {
  const { summary, imported, failed } = result || { summary: { total: 0, imported: 0, failed: 0 }, imported: [], failed: [] };
  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-2xl  font-bold text-brand-black">{summary.total}</p>
          <p className="text-xs text-gray-500 mt-1">Total Rows</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
          <p className="text-2xl  font-bold text-green-600">{summary.imported}</p>
          <p className="text-xs text-green-600 mt-1">Imported</p>
        </div>
        <div className={`${failed.length ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'} border rounded-lg p-4 text-center`}>
          <p className={`text-2xl  font-bold ${failed.length ? 'text-brand-red' : 'text-gray-500'}`}>{summary.failed}</p>
          <p className={`text-xs mt-1 ${failed.length ? 'text-brand-red' : 'text-gray-500'}`}>Failed</p>
        </div>
      </div>

      {/* Imported users */}
      {imported.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <CheckCircle2 className="w-4 h-4 text-green-600" /> Imported Users (temporary passwords)
          </div>
          <div className="max-h-52 overflow-y-auto custom-scrollbar">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Username</th>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Role</th>
                  <th className="px-4 py-2">Temp Password</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {imported.map((u) => (
                  <tr key={u._id}>
                    <td className="px-4 py-2 font-medium">{u.name}</td>
                    <td className="px-4 py-2">{u.username}</td>
                    <td className="px-4 py-2">{u.email}</td>
                    <td className="px-4 py-2">{u.roles.join(', ')}</td>
                    <td className="px-4 py-2"><code className="font-mono text-brand-red bg-gray-50 px-1.5 py-0.5 rounded">{u.tempPassword}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Failed rows */}
      {failed.length > 0 && (
        <div className="border border-red-200 bg-red-50/30 rounded-lg overflow-hidden">
          <div className="bg-red-50 px-4 py-2 flex items-center gap-2 text-sm font-semibold text-brand-red">
            <AlertTriangle className="w-4 h-4" /> Failed Rows ({failed.length})
          </div>
          <div className="max-h-52 overflow-y-auto custom-scrollbar divide-y divide-red-100">
            {failed.map((f, i) => (
              <div key={i} className="px-4 py-2 flex items-start gap-3 text-sm">
                <span className="text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5">Row {f.row}</span>
                <span className="text-gray-700">{f.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button
          onClick={onImportMore}
          className="px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Import More
        </button>
        <button
          onClick={onDone}
          className="px-4 py-2 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}
