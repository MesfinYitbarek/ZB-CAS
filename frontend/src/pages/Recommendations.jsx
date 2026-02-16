import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  Lightbulb,
  ChevronLeft,
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import api from '../utils/api';

const LEVELS = ['Basic', 'Intermediate', 'Advanced', 'Expert'];

export default function Recommendations() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [competencies, setCompetencies] = useState([]);
  const [filterComp, setFilterComp] = useState('');
  const [modal, setModal] = useState(null); // 'create' or 'edit'
  const [selected, setSelected] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const { show } = useToast();

  // Pagination state
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });

  // Form state restructured for bulk levels
  const initForm = () => ({
    competencyId: '',
    levels: {
      'Basic': '',
      'Intermediate': '',
      'Advanced': '',
      'Expert': ''
    }
  });
  const [form, setForm] = useState(initForm());

  useEffect(() => {
    api.get('/competencies')
      .then(({ data }) => setCompetencies(data.data.competencies))
      .catch(() => { });
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
  }, [filterComp, pagination.page, pagination.limit, show]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  // Toggle Accordion
  const toggleGroup = (compName) => {
    setExpandedGroups(prev => ({
      ...prev,
      [compName]: !prev[compName]
    }));
  };

  const openCreate = () => {
    setForm(initForm());
    setModal('create');
  };

  const openEdit = (r) => {
    setForm({
      competencyId: r.competencyId?._id || '',
      levels: { [r.level]: r.recommendation }
    });
    setSelected(r);
    setModal('edit');
  };

  const handleSave = async () => {
    try {
      if (modal === 'create') {
        // 1. Prepare the data for the backend
        const bulkData = Object.entries(form.levels)
          .filter(([_, text]) => text.trim() !== '') // Only send levels that have text
          .map(([level, text]) => ({
            competencyId: form.competencyId,
            level: level,
            recommendation: text
          }));

        if (bulkData.length === 0) {
          show('Please enter at least one recommendation.', 'error');
          return;
        }

        if (!form.competencyId) {
          show('Please select a competency.', 'error');
          return;
        }

        // 2. Send one single request with the "bulk" flag
        await api.post('/recommendations', { bulk: bulkData });
        show('Recommendations saved successfully.', 'success');

      } else {
        // Edit mode (single update)
        const currentLevel = Object.keys(form.levels)[0];
        await api.put(`/recommendations/${selected._id}`, {
          recommendation: form.levels[currentLevel]
        });
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

  // Grouping logic
  const grouped = {};
  items.forEach((r) => {
    const key = r.competencyId?.name || 'Unknown';
    if (!grouped[key]) grouped[key] = { name: key, id: r.competencyId?._id, items: [] };
    grouped[key].items.push(r);
  });

  const goToPage = (page) => {
    if (page >= 1 && page <= pagination.totalPages) {
      setPagination(prev => ({ ...prev, page }));
    }
  };

  return (
    <div className="p-7">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-black">Recommendations</h1>
          <p className="text-gray-500 mt-1">Define development recommendations for each competency level.</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-5 py-2.5 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors">
          <Plus className="w-4 h-4" /> Bulk Add Recommendations
        </button>
      </div>

      {/* Filter and pagination controls */}
      <div className="flex justify-between items-center gap-3 mb-6 flex-wrap">
        <select value={filterComp} onChange={(e) => { setFilterComp(e.target.value); setPagination(p => ({ ...p, page: 1 })) }} className="h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm w-72">
          <option value="">All Competencies</option>
          {competencies.map((c) => (
            <option key={c._id} value={c._id}>{c.name}</option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Show:</span>
          <select
            value={pagination.limit}
            onChange={(e) => setPagination(p => ({ ...p, limit: parseInt(e.target.value), page: 1 }))}
            className="px-3 py-1.5 rounded-lg border border-gray-300 focus-brand text-sm"
          >
            <option value="10">10 per page</option>
            <option value="20">20 per page</option>
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
        </div>
      ) : (
        <>
          <div className="space-y-4 mb-6">
            {Object.entries(grouped).map(([compName, group]) => {
              const isExpanded = !!expandedGroups[compName];
              return (
                <div key={compName} className="bg-white rounded-xl shadow-card border border-gray-100 overflow-hidden">
                  {/* Header (Accordion Toggle) */}
                  <div
                    onClick={() => toggleGroup(compName)}
                    className="bg-gray-50 px-5 py-4 border-b border-gray-100 flex items-center justify-between cursor-pointer hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                      <Lightbulb className="w-5 h-5 text-brand-red" />
                      <span className="font-bold text-base text-brand-black">{compName}</span>
                      <span className="text-xs text-gray-400">({group.items.length} / 4 levels set)</span>
                    </div>
                  </div>

                  {/* Body (Table) */}
                  {isExpanded && (
                    <div className="overflow-x-auto animate-in fade-in slide-in-from-top-1 duration-200">
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
                                      <button onClick={(e) => { e.stopPropagation(); openEdit(rec); }} className="p-1.5 hover:bg-gray-100 rounded transition-colors">
                                        <Edit2 className="w-4 h-4 text-gray-500" />
                                      </button>
                                      <button onClick={(e) => { e.stopPropagation(); handleDelete(rec._id); }} className="p-1.5 hover:bg-red-50 rounded transition-colors">
                                        <Trash2 className="w-4 h-4 text-red-600" />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setForm({ competencyId: group.id, levels: { ...initForm().levels, [lvl]: '' } });
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
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {pagination.total > pagination.limit && (
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-6 border-t border-gray-200">
              <div className="text-sm text-gray-600">
                Showing {pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1} to{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                {pagination.total} recommendations
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => goToPage(pagination.page - 1)} disabled={pagination.page === 1} className="px-3 py-2 rounded-lg border border-gray-300 text-sm disabled:opacity-50">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-medium">Page {pagination.page} of {pagination.totalPages}</span>
                <button onClick={() => goToPage(pagination.page + 1)} disabled={pagination.page === pagination.totalPages} className="px-3 py-2 rounded-lg border border-gray-300 text-sm disabled:opacity-50">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal for Bulk Creation & Edit */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal === 'create' ? 'Add Recommendations' : 'Edit Recommendation'}
      >
        <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-2">
          {modal === 'create' && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Competency</label>
              <select
                value={form.competencyId}
                onChange={(e) => setForm({ ...form, competencyId: e.target.value })}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm"
              >
                <option value="">— Select Competency —</option>
                {competencies.map((c) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-4">
            {Object.keys(form.levels).map((lvl) => (
              <div key={lvl} className={modal === 'create' ? "p-4 border border-gray-100 rounded-xl bg-gray-50/50" : ""}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`badge badge-${lvl.toLowerCase()}`}>{lvl}</span>
                  {modal === 'create' && <span className="text-xs text-gray-400 font-medium">Recommendation</span>}
                </div>
                <textarea
                  rows={modal === 'create' ? 2 : 5}
                  value={form.levels[lvl]}
                  onChange={(e) => setForm({
                    ...form,
                    levels: { ...form.levels, [lvl]: e.target.value }
                  })}
                  placeholder={`What do you recommend for ${lvl} level?`}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 focus-brand text-sm resize-none"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setModal(null)} className="px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} className="px-4 py-2 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors">
            {modal === 'create' ? 'Save Recommendations' : 'Update'}
          </button>
        </div>
      </Modal>
    </div>
  );
}