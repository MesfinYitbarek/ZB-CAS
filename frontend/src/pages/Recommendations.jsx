import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  Lightbulb,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Search,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import api from '../utils/api';

const LEVELS = ['Basic', 'Intermediate', 'Advanced', 'Expert'];

const LEVEL_STYLES = {
  Basic: 'bg-sky-50 text-sky-600 ring-1 ring-sky-200',
  Intermediate: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200',
  Advanced: 'bg-violet-50 text-violet-600 ring-1 ring-violet-200',
  Expert: 'bg-amber-50 text-amber-600 ring-1 ring-amber-200',
};

const LEVEL_DOT = {
  Basic: 'bg-sky-400',
  Intermediate: 'bg-emerald-400',
  Advanced: 'bg-violet-400',
  Expert: 'bg-amber-400',
};

export default function Recommendations() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [competencies, setCompetencies] = useState([]);
  const [filterComp, setFilterComp] = useState('');
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const { show } = useToast();

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

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
  const [availableTargetGroups, setAvailableTargetGroups] = useState([]);

  useEffect(() => {
    api
      .get('/competencies')
      .then(({ data }) => setCompetencies(data.data.competencies || []))
      .catch(() => show('Failed to load competencies.', 'error'));
  }, [show]);

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
    try {
      await api.delete(`/recommendations/${id}`);
      show('Deleted.', 'success');
      setDeleteConfirm(null);
      fetch();
    } catch (err) {
      show(err.response?.data?.message || 'Failed.', 'error');
      setDeleteConfirm(null);
    }
  };

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

  const totalRecs = Object.values(grouped).reduce(
    (sum, g) => sum + Object.values(g.targetGroups).reduce((s, recs) => s + recs.length, 0),
    0
  );

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-gray-50/60">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl font-display font-bold text-brand-black tracking-tight">Recommendations</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Development paths per competency, group &amp; level
            </p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors"
          >
            <Plus className="w-4 h-4" /> Add New
          </button>
        </div>

        {/* Filters row */}
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={filterComp}
              onChange={(e) => {
                setFilterComp(e.target.value);
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              className="w-full h-9 pl-8 pr-3 rounded-md border border-gray-200 bg-white text-sm text-gray-600 focus:border-red-400 focus:ring-1 focus:ring-red-100 outline-none transition"
            >
              <option value="">All Competencies</option>
              {competencies.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            {!loading && (
              <span>
                {totalRecs} record{totalRecs !== 1 ? 's' : ''}
              </span>
            )}
            <span className="text-gray-200">|</span>
            <select
              value={pagination.limit}
              onChange={(e) =>
                setPagination((p) => ({ ...p, limit: parseInt(e.target.value), page: 1 }))
              }
              className="h-8 px-2 rounded border border-gray-200 bg-white text-sm text-gray-500 outline-none focus:border-red-400"
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-5">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-red-200 border-t-red-600 rounded-full animate-spin" />
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-300">
            <Lightbulb className="w-8 h-8 mb-2" />
            <p className="text-base font-medium text-gray-400">No recommendations yet</p>
            <p className="text-sm text-gray-300 mt-0.5">Click &ldquo;Add New&rdquo; to get started</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-1 gap-3">
              {Object.entries(grouped).map(([compName, group]) => {
                const isOpen = expandedGroups[compName];
                const recCount = Object.values(group.targetGroups).reduce(
                  (s, r) => s + r.length,
                  0
                );

                return (
                  <div
                    key={compName}
                    className="bg-white rounded-lg border border-gray-100 overflow-hidden"
                  >
                    {/* Accordion header */}
                    <button
                      onClick={() => toggleGroup(compName)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50/80 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-md bg-brand-red flex items-center justify-center flex-shrink-0">
                          <Lightbulb className="w-3.5 h-3.5 text-white" />
                        </div>
                        <span className="text-base font-medium text-gray-900 truncate">
                          {compName}
                        </span>
                        <span className="text-xs text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full flex-shrink-0">
                          {recCount}
                        </span>
                      </div>
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4 text-gray-300 flex-shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-300 flex-shrink-0" />
                      )}
                    </button>

                    {/* Accordion body */}
                    {isOpen && (
                      <div className="border-t border-gray-50 px-4 pb-4 pt-2">
                        {Object.entries(group.targetGroups).map(([tg, recs]) => (
                          <div key={tg} className="mt-3 first:mt-0">
                            <div className="flex items-center gap-1.5 mb-2">
                              <span className="text-xs font-semibold uppercase tracking-wider text-red-400">
                                {tg}
                              </span>
                            </div>

                            <div className="rounded-md border border-gray-100 overflow-hidden">
                              <table className="w-full text-left">
                                <thead>
                                  <tr className="bg-gray-50/70">
                                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400 w-28">
                                      Level
                                    </th>
                                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                                      Recommendation
                                    </th>
                                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400 hidden sm:table-cell">
                                      Description
                                    </th>
                                    <th className="px-3 py-2 text-right w-20" />
                                  </tr>
                                </thead>
                                <tbody>
                                  {LEVELS.map((lvl) => {
                                    const rec = recs.find((r) => r.level === lvl);
                                    return (
                                      <tr
                                        key={lvl}
                                        className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors"
                                      >
                                        <td className="px-3 py-2.5">
                                          <span className="inline-flex items-center gap-1.5">
                                            <span
                                              className={`w-1.5 h-1.5 rounded-full ${LEVEL_DOT[lvl]}`}
                                            />
                                            <span className="text-sm font-medium text-gray-600">
                                              {lvl}
                                            </span>
                                          </span>
                                        </td>
                                        <td className="px-3 py-2.5 text-sm text-gray-600">
                                          {rec?.recommendation ? (
                                            <span className="line-clamp-2">
                                              {rec.recommendation}
                                            </span>
                                          ) : (
                                            <span className="text-gray-300 italic">—</span>
                                          )}
                                        </td>
                                        <td className="px-3 py-2.5 text-sm text-gray-400 hidden sm:table-cell">
                                          {rec?.description ? (
                                            <span className="line-clamp-2">{rec.description}</span>
                                          ) : (
                                            <span className="text-gray-200 italic">—</span>
                                          )}
                                        </td>
                                        <td className="px-3 py-2.5 text-right">
                                          {rec ? (
                                            <div className="inline-flex items-center gap-0.5">
                                              <button
                                                onClick={() => openEdit(rec)}
                                                className="p-1.5 rounded hover:bg-gray-100 transition"
                                                title="Edit"
                                              >
                                                <Edit2 className="w-3 h-3 text-gray-400" />
                                              </button>
                                              <button
                                                onClick={() => setDeleteConfirm(rec._id)}
                                                className="p-1.5 rounded hover:bg-red-50 transition"
                                                title="Delete"
                                              >
                                                <Trash2 className="w-3 h-3 text-red-400" />
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
                                                    [lvl]: {
                                                      recommendation: '',
                                                      description: '',
                                                    },
                                                  },
                                                });
                                                setModal('create');
                                              }}
                                              className="text-xs font-medium text-red-400 hover:text-red-600 transition"
                                            >
                                              + Add
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
                );
              })}
            </div>

            {/* Pagination */}
            {pagination.total > pagination.limit && (
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                <span className="text-sm text-gray-400">
                  {(pagination.page - 1) * pagination.limit + 1}–
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                  {pagination.total}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={pagination.page === 1}
                    onClick={() => goToPage(pagination.page - 1)}
                    className="p-1.5 rounded hover:bg-red-50 disabled:opacity-30 transition"
                  >
                    <ChevronLeft className="w-4 h-4 text-gray-500" />
                  </button>
                  <span className="text-sm text-gray-500 px-2 tabular-nums">
                    {pagination.page}/{pagination.totalPages}
                  </span>
                  <button
                    disabled={pagination.page === pagination.totalPages}
                    onClick={() => goToPage(pagination.page + 1)}
                    className="p-1.5 rounded hover:bg-red-50 disabled:opacity-30 transition"
                  >
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete confirmation overlay */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-lg p-5 mx-4 max-w-xs w-full">
            <p className="text-base font-medium text-gray-900 mb-1">Delete recommendation?</p>
            <p className="text-sm text-gray-400 mb-4">This action cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-md transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-500 hover:bg-brand-red rounded-md transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal === 'create' ? 'Add Recommendations' : 'Edit Recommendation'}
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Competency & Target Group side by side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Competency */}
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">
                Competency <span className="text-red-400">*</span>
              </label>
              <select
                value={form.competencyId}
                onChange={(e) => setForm({ ...form, competencyId: e.target.value })}
                disabled={modal === 'edit'}
                className="w-full h-10 px-3 rounded-lg border border-gray-200 text-base text-gray-700 outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100 disabled:bg-gray-50 disabled:text-gray-400 transition"
              >
                <option value="">Select competency…</option>
                {competencies.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Target group */}
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">
                Target Group <span className="text-red-400">*</span>
              </label>
              {availableTargetGroups.length === 0 ? (
                <div className="h-10 flex items-center px-3 rounded-lg bg-gray-50 border border-gray-100 text-sm text-gray-400 italic">
                  Select a competency first
                </div>
              ) : (
                <select
                  value={form.targetGroup}
                  onChange={(e) => setForm({ ...form, targetGroup: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-gray-200 text-base text-gray-700 outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100 transition"
                >
                  <option value="">Select target group…</option>
                  {availableTargetGroups.map((tg) => (
                    <option key={tg} value={tg}>
                      {tg.charAt(0).toUpperCase() + tg.slice(1)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Level cards */}
          <div className="space-y-3 pt-1">
            {(modal === 'create' ? LEVELS : [Object.keys(form.levels)[0]]).map((lvl) => {
              if (!form.levels[lvl]) return null;
              return (
                <div
                  key={lvl}
                  className="rounded-lg border border-gray-100 bg-gray-50/60 p-3.5"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className={`w-2 h-2 rounded-full ${LEVEL_DOT[lvl]}`}
                    />
                    <span
                      className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${LEVEL_STYLES[lvl]}`}
                    >
                      {lvl}
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        Recommendation <span className="text-red-400">*</span>
                      </label>
                      <textarea
                        rows={2}
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
                        placeholder={`Recommendation for ${lvl}…`}
                        className="w-full px-3 py-2 rounded-md border border-gray-200 text-base text-gray-700 placeholder:text-gray-300 outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100 resize-none transition"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        Description{' '}
                        <span className="text-gray-300 font-normal">(optional)</span>
                      </label>
                      <textarea
                        rows={2}
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
                        placeholder={`Additional context…`}
                        className="w-full px-3 py-2 rounded-md border border-gray-200 text-base text-gray-700 placeholder:text-gray-300 outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100 resize-none transition"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 mt-5 pt-3 border-t border-gray-100">
          <button
            onClick={() => setModal(null)}
            className="px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!form.competencyId || !form.targetGroup}
            className={`px-5 py-2 text-sm font-medium rounded-lg transition min-w-[110px] ${
              form.competencyId && form.targetGroup
                ? 'bg-brand-red text-white hover:bg-red-700 shadow-sm'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {modal === 'create' ? 'Save All' : 'Update'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
