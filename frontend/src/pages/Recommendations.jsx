import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Lightbulb, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import api from '../utils/api';

const LEVELS = ['Basic', 'Intermediate', 'Advanced', 'Expert'];

export default function Recommendations() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [competencies, setCompetencies] = useState([]);
  const [filterComp, setFilterComp] = useState('');
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const { show } = useToast();
  
  // Pagination state
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });

  const initForm = () => ({ competencyId: '', level: 'Basic', recommendation: '' });
  const [form, setForm] = useState(initForm());

  useEffect(() => {
    api.get('/competencies').then(({ data }) => setCompetencies(data.data.competencies)).catch(() => {});
  }, []);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit
      };
      if (filterComp) params.competencyId = filterComp;
      
      const { data } = await api.get('/recommendations', { params });
      setItems(data.data.recommendations);
      
      // Update pagination from API response
      if (data.data.pagination) {
        setPagination(prev => ({
          ...prev,
          total: data.data.pagination.total,
          totalPages: Math.ceil(data.data.pagination.total / pagination.limit)
        }));
      }
    } catch (_) {
      show('Failed to load recommendations.', 'error');
    }
    setLoading(false);
  }, [filterComp, pagination.page, pagination.limit]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const openCreate = () => {
    setForm(initForm());
    setModal('create');
  };
  
  const openEdit = (r) => {
    setForm({ competencyId: r.competencyId?._id || '', level: r.level, recommendation: r.recommendation });
    setSelected(r);
    setModal('edit');
  };

  const handleSave = async () => {
    try {
      if (modal === 'create') {
        await api.post('/recommendations', form);
        show('Recommendation created.', 'success');
      } else {
        await api.put(`/recommendations/${selected._id}`, { recommendation: form.recommendation });
        show('Recommendation updated.', 'success');
      }
      setModal(null);
      fetch();
    } catch (err) {
      show(err.response?.data?.message || 'Save failed.', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this recommendation?')) return;
    try {
      await api.delete(`/recommendations/${id}`);
      show('Deleted.', 'success');
      fetch();
    } catch (err) {
      show(err.response?.data?.message || 'Failed.', 'error');
    }
  };

  // Group by competency
  const grouped = {};
  items.forEach((r) => {
    const key = r.competencyId?.name || 'Unknown';
    if (!grouped[key]) grouped[key] = { name: key, id: r.competencyId?._id, items: [] };
    grouped[key].items.push(r);
  });

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
  const handleFilterComp = (value) => {
    setFilterComp(value);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  return (
    <div className="p-7">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-black">Recommendations</h1>
          <p className="text-gray-500 mt-1">Define development recommendations for each competency level.</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-5 py-2.5 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors">
          <Plus className="w-4 h-4" /> Add Recommendation
        </button>
      </div>

      {/* Filter and pagination controls */}
      <div className="flex justify-between items-center gap-3 mb-6 flex-wrap">
        <select value={filterComp} onChange={(e) => handleFilterComp(e.target.value)} className="h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm w-72">
          <option value="">All Competencies</option>
          {competencies.map((c) => (
            <option key={c._id} value={c._id}>{c.name}</option>
          ))}
        </select>
        
        {/* Page size selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Show:</span>
          <select 
            value={pagination.limit} 
            onChange={handlePageSizeChange}
            className="px-3 py-1.5 rounded-lg border border-gray-300 focus-brand text-sm"
          >
            <option value="10">10 per page</option>
            <option value="20">20 per page</option>
            <option value="30">30 per page</option>
            <option value="50">50 per page</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-16">
          <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-16">
          <Lightbulb className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <h3 className="text-lg font-semibold text-gray-600 mb-1">No recommendations yet</h3>
          <p className="text-gray-400 text-sm">Add your first recommendation above.</p>
        </div>
      ) : (
        <>
          <div className="space-y-5 mb-6">
            {Object.entries(grouped).slice(0, pagination.limit).map(([compName, group]) => (
              <div key={compName} className="bg-white rounded-xl shadow-card border border-gray-100 overflow-hidden">
                <div className="bg-gray-50 px-5 py-3 border-b border-gray-100 flex items-center gap-3">
                  <Lightbulb className="w-5 h-5 text-brand-red" />
                  <span className="font-bold text-base text-brand-black">{compName}</span>
                  <span className="text-xs text-gray-400">({group.items.length} / 4 levels)</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider w-32">Level</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Recommendation</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider w-28">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {LEVELS.map((lvl) => {
                        const rec = group.items.find((r) => r.level === lvl);
                        return (
                          <tr key={lvl} className="hover:bg-gray-50 transition-colors">
                            <td className="px-5 py-3">
                              <span className={`badge badge-${lvl.toLowerCase()}`}>{lvl}</span>
                            </td>
                            <td className="px-5 py-3 text-sm text-gray-700">
                              {rec ? rec.recommendation : <span className="italic text-gray-400">— Not set —</span>}
                            </td>
                            <td className="px-5 py-3">
                              {rec ? (
                                <div className="flex gap-2">
                                  <button onClick={() => openEdit(rec)} className="p-1.5 hover:bg-gray-100 rounded transition-colors">
                                    <Edit2 className="w-4 h-4 text-gray-500" />
                                  </button>
                                  <button onClick={() => handleDelete(rec._id)} className="p-1.5 hover:bg-red-50 rounded transition-colors">
                                    <Trash2 className="w-4 h-4 text-red-600" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setForm({ competencyId: group.id, level: lvl, recommendation: '' });
                                    setModal('create');
                                  }}
                                  className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-brand-red hover:bg-brand-red-muted rounded transition-colors"
                                >
                                  <Plus className="w-3 h-3" /> Add
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
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
                {pagination.total} recommendations
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
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? 'New Recommendation' : 'Edit Recommendation'}>
        <div className="space-y-4">
          {modal === 'create' && (
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Competency</label>
                <select value={form.competencyId} onChange={(e) => setForm({ ...form, competencyId: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm">
                  <option value="">— Select —</option>
                  {competencies.map((c) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Level</label>
                <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm">
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
            </>
          )}
          {modal === 'edit' && (
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm text-gray-500">Editing for:</span>
              <span className={`badge badge-${form.level.toLowerCase()}`}>{form.level}</span>
            </div>
          )}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Recommendation Text</label>
            <textarea rows={4} value={form.recommendation} onChange={(e) => setForm({ ...form, recommendation: e.target.value })} placeholder="Describe the recommended development action..." className="w-full px-3 py-2 rounded-lg border border-gray-300 focus-brand text-sm resize-none" />
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