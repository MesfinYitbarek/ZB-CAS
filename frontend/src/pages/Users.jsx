import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Trash2, Edit2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import api from '../utils/api';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const { show } = useToast();
  
  // Pagination state
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0
  });

  const initForm = () => ({ employeeId: '', name: '', email: '', role: 'EMPLOYEE', position: '', department: '', supervisorId: '' });
  const [form, setForm] = useState(initForm());

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit
      };
      if (filterRole) params.role = filterRole;
      if (filterStatus) params.status = filterStatus;
      if (search) params.search = search;
      
      const { data } = await api.get('/users', { params });
      
      setUsers(data.data.users);
      
      // Update pagination from API response
      if (data.data.pagination) {
        setPagination(prev => ({
          ...prev,
          total: data.data.pagination.total,
          totalPages: Math.ceil(data.data.pagination.total / pagination.limit)
        }));
      }
    } catch (_) {
      show('Failed to load users.', 'error');
    }
    setLoading(false);
  }, [filterRole, filterStatus, search, pagination.page, pagination.limit]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const openCreate = () => {
    setForm(initForm());
    setModal('create');
  };
  
  const openEdit = (u) => {
    setForm({ employeeId: u.employeeId, name: u.name, email: u.email, role: u.role, position: u.position || '', department: u.department || '', supervisorId: u.supervisorId?._id || '' });
    setSelected(u);
    setModal('edit');
  };

  const handleSave = async () => {
    try {
      if (modal === 'create') {
        await api.post('/auth/register', form);
        show('User created successfully.', 'success');
      } else {
        await api.put(`/users/${selected._id}`, form);
        show('User updated.', 'success');
      }
      setModal(null);
      fetch();
    } catch (err) {
      show(err.response?.data?.message || 'Save failed.', 'error');
    }
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm('Deactivate this user?')) return;
    try {
      await api.delete(`/users/${id}`);
      show('User deactivated.', 'success');
      fetch();
    } catch (err) {
      show(err.response?.data?.message || 'Failed.', 'error');
    }
  };

  // Pagination handlers
  const goToPage = (page) => {
    if (page >= 1 && page <= pagination.totalPages) {
      setPagination(prev => ({ ...prev, page }));
    }
  };

  const handlePageSizeChange = (e) => {
    const newLimit = parseInt(e.target.value, 10);
    setPagination({
      page: 1,
      limit: newLimit,
      total: pagination.total,
      totalPages: Math.ceil(pagination.total / newLimit)
    });
  };

  // Handle search with debounce
  const handleSearch = (value) => {
    setSearch(value);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  return (
    <div className="p-7">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-black">User Management</h1>
          <p className="text-gray-500 mt-1">Manage employees, supervisors, and HR administrators.</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-5 py-2.5 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors">
          <Plus className="w-4 h-4" /> Add User
        </button>
      </div>

      {/* Filters */}
      <div className="flex justify-between items-center gap-3 mb-5 flex-wrap">
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
          <select value={filterRole} onChange={(e) => { setFilterRole(e.target.value); setPagination(prev => ({ ...prev, page: 1 })); }} className="h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm">
            <option value="">All Roles</option>
            <option value="HR_ADMIN">HR Admin</option>
            <option value="SUPERVISOR">Supervisor</option>
            <option value="EMPLOYEE">Employee</option>
          </select>
          <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPagination(prev => ({ ...prev, page: 1 })); }} className="h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm">
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
        
        {/* Page size selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Show:</span>
          <select 
            value={pagination.limit} 
            onChange={handlePageSizeChange}
            className="px-3 py-1.5 rounded-lg border border-gray-300 focus-brand text-sm"
          >
            <option value="5">5 per page</option>
            <option value="10">10 per page</option>
            <option value="20">20 per page</option>
            <option value="50">50 per page</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-card border border-gray-100 overflow-hidden mb-4">
        {loading ? (
          <div className="flex items-center justify-center p-16"><div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Employee ID</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Name</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Email</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Role</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Department</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-400">No users found.</td>
                  </tr>
                )}
                {users.map((u) => (
                  <tr key={u._id} className="hover:bg-brand-red-muted transition-colors">
                    <td className="px-6 py-3 font-mono text-sm text-gray-600">{u.employeeId}</td>
                    <td className="px-6 py-3 font-semibold text-sm text-brand-black-soft">{u.name}</td>
                    <td className="px-6 py-3 text-sm text-gray-600">{u.email}</td>
                    <td className="px-6 py-3">
                      <span className={`badge badge-${u.role.toLowerCase()}`}>{u.role.replace('_', ' ')}</span>
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600">{u.department || '—'}</td>
                    <td className="px-6 py-3">
                      <span className={`badge badge-${u.status.toLowerCase()}`}>{u.status}</span>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(u)} className="p-1.5 hover:bg-gray-100 rounded transition-colors">
                          <Edit2 className="w-4 h-4 text-gray-500" />
                        </button>
                        {u.status === 'ACTIVE' && (
                          <button onClick={() => handleDeactivate(u._id)} className="p-1.5 hover:bg-red-50 rounded transition-colors">
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {pagination.total > pagination.limit && (
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-gray-200">
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
                const maxVisible = 5;
                
                if (pagination.totalPages <= maxVisible) {
                  for (let i = 1; i <= pagination.totalPages; i++) {
                    pages.push(i);
                  }
                } else {
                  let start = Math.max(1, pagination.page - Math.floor(maxVisible / 2));
                  let end = Math.min(pagination.totalPages, start + maxVisible - 1);
                  
                  if (end - start + 1 < maxVisible) {
                    start = Math.max(1, end - maxVisible + 1);
                  }
                  
                  for (let i = start; i <= end; i++) {
                    pages.push(i);
                  }
                }
                
                return pages.map((pageNum) => (
                  <button
                    key={pageNum}
                    onClick={() => goToPage(pageNum)}
                    className={`w-9 h-9 rounded-lg text-sm font-medium ${
                      pagination.page === pageNum
                        ? 'bg-brand-red text-white'
                        : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {pageNum}
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

      {/* Create/Edit Modal */}
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? 'Add New User' : 'Edit User'}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Employee ID</label>
            <input value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} placeholder="EMP-001" disabled={modal === 'edit'} className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm disabled:bg-gray-100" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Full Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John Doe" className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@zemenbank.com" disabled={modal === 'edit'} className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm disabled:bg-gray-100" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Role</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm">
              <option value="EMPLOYEE">Employee</option>
              <option value="SUPERVISOR">Supervisor</option>
              <option value="HR_ADMIN">HR Admin</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Position</label>
            <input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="IT Officer 1" className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Department</label>
            <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="IT Department" className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm" />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setModal(null)} className="px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} className="px-4 py-2 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors">
            {modal === 'create' ? 'Create User' : 'Save Changes'}
          </button>
        </div>
      </Modal>
    </div>
  );
}