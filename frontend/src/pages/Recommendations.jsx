import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  Lightbulb,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import api from '../utils/api';

const LEVELS = ['Basic', 'Intermediate', 'Advanced', 'Expert'];
const TARGET_GROUPS = ['managerial', 'non-managerial', 'common'];

// Badge styles for levels
const TYPE_BADGES = {
  Basic: 'bg-blue-100 text-blue-700',
  Intermediate: 'bg-green-100 text-green-700',
  Advanced: 'bg-purple-100 text-purple-700',
  Expert: 'bg-orange-100 text-orange-700',
};

export default function Recommendations() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [competencies, setCompetencies] = useState([]);
  const [filterComp, setFilterComp] = useState('');
  const [modal, setModal] = useState(null); // 'create' | 'edit'
  const [selected, setSelected] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const { show } = useToast();

  // Pagination
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  // Form state – recommendation + description per level
  const initForm = () => ({
    competencyId: '',
    targetGroup: '',
    levels: {
      Basic: { recommendation: '', description: '' },
      Intermediate: { recommendation: '', description: '' },
      Advanced: { recommendation: '', description: '' },
      Expert: { recommendation: '', description: '' },
    },
  });

  const [form, setForm] = useState(initForm());

  // Available target groups for selected competency
  const [availableTargetGroups, setAvailableTargetGroups] = useState([]);

  useEffect(() => {
    api
      .get('/competencies')
      .then(({ data }) => setCompetencies(data.data.competencies || []))
      .catch(() => show('Failed to load competencies.', 'error'));
  }, [show]);

  // Load target groups when competency changes
  useEffect(() => {
    if (!form.competencyId) {
      setAvailableTargetGroups([]);
      setForm((prev) => ({ ...prev, targetGroup: '' }));
      return;
    }

    const comp = competencies.find((c) => String(c._id) === String(form.competencyId));
    if (comp?.targetGroups?.length) {
      const tgs = comp.targetGroups.map((tg) => tg.targetGroup);
      setAvailableTargetGroups(tgs);
      if (tgs.length === 1) {
        setForm((prev) => ({ ...prev, targetGroup: tgs[0] }));
      }
    } else {
      setAvailableTargetGroups([]);
      setForm((prev) => ({ ...prev, targetGroup: '' }));
    }
  }, [form.competencyId, competencies]);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: pagination.page, limit: pagination.limit };
      if (filterComp) params.competencyId = filterComp;

      const { data } = await api.get('/recommendations', { params });
      setItems(data.data.recommendations || []);

      if (data.data.pagination) {
        setPagination((prev) => ({
          ...prev,
          total: data.data.pagination.total,
          totalPages: Math.ceil(data.data.pagination.total / prev.limit),
        }));
      }
    } catch {
      show('Failed to load recommendations.', 'error');
    }
    setLoading(false);
  }, [filterComp, pagination.page, pagination.limit, show]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const toggleGroup = (key) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const openCreate = () => {
    setForm(initForm());
    setModal('create');
  };

  const openEdit = (r) => {
    // For edit: only load the current level being edited
    setForm({
      competencyId: r.competencyId?._id || '',
      targetGroup: r.targetGroup || '',
      levels: {
        [r.level]: {
          recommendation: r.recommendation || '',
          description: r.description || '',
        },
      },
    });
    setSelected(r);
    setModal('edit');
  };

  const handleSave = async () => {
    try {
      if (modal === 'create') {
        if (!form.competencyId) return show('Select competency', 'error');
        if (!form.targetGroup) return show('Select target group', 'error');

        const bulkData = [];

        Object.entries(form.levels).forEach(([level, { recommendation, description }]) => {
          if (recommendation.trim()) {
            bulkData.push({
              competencyId: form.competencyId,
              targetGroup: form.targetGroup,
              level,
              recommendation: recommendation.trim(),
              description: description.trim() || undefined,
            });
          }
        });

        if (!bulkData.length) return show('Enter at least one recommendation', 'error');

        await api.post('/recommendations', { bulk: bulkData });
        show('Recommendations saved.', 'success');
      } else {
        // Edit: only one level exists in form.levels
        const level = Object.keys(form.levels)[0];
        const { recommendation, description } = form.levels[level];

        await api.put(`/recommendations/${selected._id}`, {
          recommendation: recommendation.trim(),
          description: description.trim() || undefined,
          targetGroup: form.targetGroup,
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

  // Grouping: competency → targetGroup → levels
  const grouped = {};
  items.forEach((r) => {
    const compName = r.competencyId?.name || 'Unknown';
    const tg = r.targetGroup || 'unknown';

    if (!grouped[compName]) {
      grouped[compName] = { name: compName, id: r.competencyId?._id, targetGroups: {} };
    }
    if (!grouped[compName].targetGroups[tg]) {
      grouped[compName].targetGroups[tg] = [];
    }
    grouped[compName].targetGroups[tg].push(r);
  });

  const goToPage = (page) => {
    if (page >= 1 && page <= pagination.totalPages) {
      setPagination((prev) => ({ ...prev, page }));
    }
  };

  return (
    <div className="p-7">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-black">Recommendations</h1>
          <p className="text-gray-500 mt-1">
            Define development recommendations and descriptions per competency, target group, and level.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Recommendations
        </button>
      </div>

      {/* Filters */}
      <div className="flex justify-between items-center gap-3 mb-6 flex-wrap">
        <select
          value={filterComp}
          onChange={(e) => {
            setFilterComp(e.target.value);
            setPagination((p) => ({ ...p, page: 1 }));
          }}
          className="h-10 px-3 rounded-lg border border-gray-300 focus:border-brand-red text-sm w-72"
        >
          <option value="">All Competencies</option>
          {competencies.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Show:</span>
          <select
            value={pagination.limit}
            onChange={(e) =>
              setPagination((p) => ({
                ...p,
                limit: parseInt(e.target.value),
                page: 1,
              }))
            }
            className="px-3 py-1.5 rounded-lg border border-gray-300 focus:border-brand-red text-sm"
          >
            <option value="10">10 per page</option>
            <option value="20">20 per page</option>
            <option value="50">50 per page</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-16">
          <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-16">
          <Lightbulb className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <h3 className="text-lg font-semibold text-gray-600">No recommendations yet</h3>
        </div>
      ) : (
        <div className="space-y-4 mb-6">
          {Object.entries(grouped).map(([compName, group]) => (
            <div
              key={compName}
              className="bg-white rounded-xl shadow-card border border-gray-100 overflow-hidden"
            >
              <div
                onClick={() => toggleGroup(compName)}
                className="bg-gray-50 px-5 py-4 border-b border-gray-100 flex items-center justify-between cursor-pointer hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {expandedGroups[compName] ? (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                  <Lightbulb className="w-5 h-5 text-brand-red" />
                  <span className="font-bold text-base text-brand-black">{compName}</span>
                </div>
              </div>

              {expandedGroups[compName] && (
                <div className="p-5">
                  {Object.entries(group.targetGroups).map(([tg, recs]) => (
                    <div key={tg} className="mb-6 last:mb-0">
                      <h4 className="text-lg font-semibold text-gray-800 mb-3 capitalize">
                        {tg} Target Group
                      </h4>
                      <div className="overflow-x-auto rounded-lg border">
                        <table className="w-full min-w-max">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="text-left px-5 py-3 text-sm font-semibold text-gray-600 uppercase w-32">
                                Level
                              </th>
                              <th className="text-left px-5 py-3 text-sm font-semibold text-gray-600 uppercase">
                                Recommendation
                              </th>
                              <th className="text-left px-5 py-3 text-sm font-semibold text-gray-600 uppercase">
                                Description
                              </th>
                              <th className="text-right px-5 py-3 text-sm font-semibold text-gray-600 uppercase w-32">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {LEVELS.map((lvl) => {
                              const rec = recs.find((r) => r.level === lvl);
                              return (
                                <tr key={lvl} className="hover:bg-gray-50">
                                  <td className="px-5 py-4">
                                    <span
                                      className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${TYPE_BADGES[lvl]}`}
                                    >
                                      {lvl}
                                    </span>
                                  </td>
                                  <td className="px-5 py-4 text-sm text-gray-700">
                                    {rec?.recommendation ? (
                                      <div className="line-clamp-2">{rec.recommendation}</div>
                                    ) : (
                                      <span className="italic text-gray-400">— Not set —</span>
                                    )}
                                  </td>
                                  <td className="px-5 py-4 text-sm text-gray-600">
                                    {rec?.description ? (
                                      <div className="line-clamp-3">{rec.description}</div>
                                    ) : (
                                      <span className="italic text-gray-400">— No description —</span>
                                    )}
                                  </td>
                                  <td className="px-5 py-4 text-right">
                                    {rec ? (
                                      <div className="flex gap-2 justify-end">
                                        <button
                                          onClick={() => openEdit(rec)}
                                          className="p-2 hover:bg-gray-100 rounded transition"
                                        >
                                          <Edit2 size={16} className="text-gray-600" />
                                        </button>
                                        <button
                                          onClick={() => handleDelete(rec._id)}
                                          className="p-2 hover:bg-red-50 rounded transition"
                                        >
                                          <Trash2 size={16} className="text-red-600" />
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          setForm({
                                            competencyId: group.id,
                                            targetGroup: tg,
                                            levels: {
                                              ...initForm().levels,
                                              [lvl]: { recommendation: '', description: '' },
                                            },
                                          });
                                          setModal('create');
                                        }}
                                        className="px-3 py-1.5 text-sm font-medium text-brand-red hover:bg-red-50 rounded transition"
                                      >
                                        Add
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
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.total > pagination.limit && (
        <div className="flex justify-between items-center mt-8 pt-4 border-t">
          <div className="text-sm text-gray-600">
            Showing {(pagination.page - 1) * pagination.limit + 1}–
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={pagination.page === 1}
              onClick={() => goToPage(pagination.page - 1)}
              className="px-4 py-2 border rounded disabled:opacity-50"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-4 py-2 font-medium">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              disabled={pagination.page === pagination.totalPages}
              onClick={() => goToPage(pagination.page + 1)}
              className="px-4 py-2 border rounded disabled:opacity-50"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Modal */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal === 'create' ? 'Add Recommendations' : 'Edit Recommendation'}
      >
        <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-2">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Competency <span className="text-red-600">*</span>
            </label>
            <select
              value={form.competencyId}
              onChange={(e) => setForm({ ...form, competencyId: e.target.value })}
              className="w-full h-10 px-4 rounded-lg border border-gray-300 focus:border-red-500 text-sm"
              disabled={modal === 'edit'}
            >
              <option value="">— Select Competency —</option>
              {competencies.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Target Group <span className="text-red-600">*</span>
            </label>
            {availableTargetGroups.length === 0 ? (
              <div className="p-3 bg-gray-100 rounded text-gray-600 text-sm italic">
                Select a competency first
              </div>
            ) : (
              <select
                value={form.targetGroup}
                onChange={(e) => setForm({ ...form, targetGroup: e.target.value })}
                className="w-full h-10 px-4 rounded-lg border border-gray-300 focus:border-red-500 text-sm"
              >
                <option value="">— Select Target Group —</option>
                {availableTargetGroups.map((tg) => (
                  <option key={tg} value={tg}>
                    {tg.charAt(0).toUpperCase() + tg.slice(1)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Render levels */}
          <div className="space-y-6">
            {(modal === 'create' ? LEVELS : [Object.keys(form.levels)[0]]).map((lvl) => {
              // Safety: skip if level not in form (shouldn't happen, but prevents crash)
              if (!form.levels[lvl]) return null;

              return (
                <div key={lvl} className="p-5 border rounded-xl bg-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <span
                      className={`inline-block px-4 py-1.5 text-sm font-medium rounded-full ${TYPE_BADGES[lvl]}`}
                    >
                      {lvl}
                    </span>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Recommendation <span className="text-red-600">*</span>
                      </label>
                      <textarea
                        rows={3}
                        value={form.levels[lvl].recommendation}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            levels: {
                              ...form.levels,
                              [lvl]: {
                                ...form.levels[lvl],
                                recommendation: e.target.value,
                              },
                            },
                          })
                        }
                        placeholder={`Main recommendation for ${lvl} level...`}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-red-500 text-sm resize-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Description <span className="text-gray-500 text-xs">(optional)</span>
                      </label>
                      <textarea
                        rows={3}
                        value={form.levels[lvl].description}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            levels: {
                              ...form.levels,
                              [lvl]: {
                                ...form.levels[lvl],
                                description: e.target.value,
                              },
                            },
                          })
                        }
                        placeholder={`Additional explanation or context for ${lvl} level...`}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-red-500 text-sm resize-none"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-4 mt-8 pt-4 border-t">
          <button
            onClick={() => setModal(null)}
            className="px-6 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!form.competencyId || !form.targetGroup}
            className={`px-6 py-2.5 rounded-lg text-white font-medium min-w-[160px] ${
              form.competencyId && form.targetGroup
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-gray-400 cursor-not-allowed'
            }`}
          >
            {modal === 'create' ? 'Save All' : 'Update'}
          </button>
        </div>
      </Modal>
    </div>
  );
}