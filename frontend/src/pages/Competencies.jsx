import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import api from '../utils/api';

const CATEGORIES = ['All', 'Core', 'Managerial', 'Leadership', 'Technical'];
const CAT_COLORS = {
  Core: 'text-brand-red bg-brand-red/10 border-brand-red',
  Managerial: 'text-blue-600 bg-blue-100 border-blue-600',
  Leadership: 'text-green-600 bg-green-100 border-green-600',
  Technical: 'text-orange-600 bg-orange-100 border-orange-600',
};

export default function Competencies() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [catFilter, setCatFilter] = useState('All');
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const { show } = useToast();
  
  // Pagination state
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 12,
    total: 0,
    totalPages: 0
  });

  const initForm = () => ({ name: '', category: 'Core', description: '' });
  const [form, setForm] = useState(initForm());

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit
      };
      if (catFilter !== 'All') params.category = catFilter;
      
      const { data } = await api.get('/competencies', { params });
      setItems(data.data.competencies);
      
      // Update pagination from API response
      if (data.data.pagination) {
        setPagination(prev => ({
          ...prev,
          total: data.data.pagination.total,
          totalPages: Math.ceil(data.data.pagination.total / pagination.limit)
        }));
      }
    } catch (_) {
      show('Failed to load competencies.', 'error');
    }
    setLoading(false);
  }, [catFilter, pagination.page, pagination.limit]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const openCreate = () => {
    setForm(initForm());
    setModal('create');
  };
  
  const openEdit = (c) => {
    setForm({ name: c.name, category: c.category, description: c.description || '' });
    setSelected(c);
    setModal('edit');
  };

  const handleSave = async () => {
    try {
      if (modal === 'create') {
        await api.post('/competencies', form);
        show('Competency created.', 'success');
      } else {
        await api.put(`/competencies/${selected._id}`, form);
        show('Competency updated.', 'success');
      }
      setModal(null);
      fetch();
    } catch (err) {
      show(err.response?.data?.message || 'Save failed.', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this competency? All linked questions and recommendations will also be removed.')) return;
    try {
      await api.delete(`/competencies/${id}`);
      show('Competency deleted.', 'success');
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

  // Handle filter change
  const handleCatFilter = (category) => {
    setCatFilter(category);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  return (
    <div className="p-7">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-black">Competencies</h1>
          <p className="text-gray-500 mt-1">Define and manage the competency framework.</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-5 py-2.5 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors">
          <Plus className="w-4 h-4" /> Add Competency
        </button>
      </div>

      {/* Filters and pagination controls */}
      <div className="flex justify-between items-center gap-4 mb-6">
        {/* Category tabs */}
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => handleCatFilter(c)}
              className={`px-4 py-2 rounded-lg border-2 font-semibold text-sm transition-all ${
                catFilter === c
                  ? CAT_COLORS[c] || 'border-brand-red bg-brand-red/10 text-brand-red'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        
        {/* Page size selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Show:</span>
          <select 
            value={pagination.limit} 
            onChange={handlePageSizeChange}
            className="px-3 py-1.5 rounded-lg border border-gray-300 focus-brand text-sm"
          >
            <option value="12">12 per page</option>
            <option value="24">24 per page</option>
            <option value="36">36 per page</option>
            <option value="48">48 per page</option>
          </select>
        </div>
      </div>

      {/* Cards grid */}
      {loading ? (
        <div className="flex items-center justify-center p-16">
          <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
            {items.length === 0 && (
              <div className="col-span-full text-center py-16">
                <BookOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <h3 className="text-lg font-semibold text-gray-600 mb-1">No competencies yet</h3>
                <p className="text-gray-400 text-sm">Create one to get started.</p>
              </div>
            )}
            {items.map((c) => (
              <div key={c._id} className="bg-white rounded-xl p-5 shadow-card hover:shadow-card-hover transition-all border border-gray-100">
                <div className="flex justify-between items-start mb-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${CAT_COLORS[c.category]}`}>
                    {c.category}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(c)} className="p-1.5 hover:bg-gray-100 rounded transition-colors">
                      <Edit2 className="w-4 h-4 text-gray-500" />
                    </button>
                    <button onClick={() => handleDelete(c._id)} className="p-1.5 hover:bg-red-50 rounded transition-colors">
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                </div>
                <h3 className="text-base font-bold text-brand-black mb-2">{c.name}</h3>
                <p className="text-sm text-gray-500 line-clamp-2 mb-3">{c.description || 'No description.'}</p>
                <div className="text-xs text-gray-400 border-t border-gray-100 pt-2.5">
                  {c.noOfQuestions || 0} question{(c.noOfQuestions || 0) !== 1 ? 's' : ''} in bank
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          {pagination.total > pagination.limit && (
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-6 border-t border-gray-200">
              <div className="text-sm text-gray-600">
                Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                {pagination.total} competencies
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
        </>
      )}

      {/* Modal */}
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? 'New Competency' : 'Edit Competency'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Communication" className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm">
              {['Core', 'Managerial', 'Leadership', 'Technical'].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description</label>
            <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe this competency..." className="w-full px-3 py-2 rounded-lg border border-gray-300 focus-brand text-sm resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setModal(null)} className="px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} className="px-4 py-2 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors">
            {modal === 'create' ? 'Create' : 'Save'}
          </button>
        </div>
      </Modal>
    </div>
  );
}