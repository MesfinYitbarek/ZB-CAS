import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Edit2, Trash2, Lightbulb,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Search, Copy,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import api from '../utils/api';

const LEVELS = ['Basic', 'Intermediate', 'Advanced', 'Expert'];

const LEVEL_STYLES = {
  Basic:        'bg-sky-50 text-sky-600 ring-1 ring-sky-200',
  Intermediate: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200',
  Advanced:     'bg-violet-50 text-violet-600 ring-1 ring-violet-200',
  Expert:       'bg-amber-50 text-amber-600 ring-1 ring-amber-200',
};

const LEVEL_DOT = {
  Basic:        'bg-sky-400',
  Intermediate: 'bg-emerald-400',
  Advanced:     'bg-violet-400',
  Expert:       'bg-amber-400',
};

export default function Recommendations() {
  const [items,          setItems]          = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [competencies,   setCompetencies]   = useState([]);
  const [filterComp,     setFilterComp]     = useState('');
  const [modal,          setModal]          = useState(null);
  const [selected,       setSelected]       = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [deleteConfirm,  setDeleteConfirm]  = useState(null);
  const { show } = useToast();

  // Suggestions panel: existing recs with same targetGroup+level across competencies
  const [suggestions,        setSuggestions]        = useState({});   // { 'Basic': [...], ... }
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });

  const initForm = () => ({
    competencyId: '',
    targetGroup:  '',
    levels: {
      Basic:        { recommendation: '', description: '' },
      Intermediate: { recommendation: '', description: '' },
      Advanced:     { recommendation: '', description: '' },
      Expert:       { recommendation: '', description: '' },
    },
  });

  const [form, setForm] = useState(initForm());
  const [availableTargetGroups, setAvailableTargetGroups] = useState([]);

  useEffect(() => {
    api.get('/competencies')
      .then(({ data }) => setCompetencies(data.data.competencies || []))
      .catch(() => show('Failed to load competencies.', 'error'));
  }, [show]);

  // Resolve target groups whenever competency changes
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
      if (tgs.length === 1) setForm((prev) => ({ ...prev, targetGroup: tgs[0] }));
    } else {
      setAvailableTargetGroups([]);
      setForm((prev) => ({ ...prev, targetGroup: '' }));
    }
  }, [form.competencyId, competencies]);

  // Fetch suggestions when targetGroup is set (cross-competency lookup)
  useEffect(() => {
    if (!form.targetGroup || modal !== 'create') {
      setSuggestions({});
      return;
    }
    setSuggestionsLoading(true);
    const fetchSuggestions = async () => {
      const byLevel = {};
      await Promise.all(
        LEVELS.map(async (lvl) => {
          try {
            const { data } = await api.get('/recommendations/by-group-level', {
              params: { targetGroup: form.targetGroup, level: lvl },
            });
            const recs = data.data.recommendations || [];
            // Exclude recs that already belong to the current competency
            byLevel[lvl] = recs.filter(
              (r) => String(r.competencyId?._id) !== String(form.competencyId)
            );
          } catch {
            byLevel[lvl] = [];
          }
        })
      );
      setSuggestions(byLevel);
      setSuggestionsLoading(false);
    };
    fetchSuggestions();
  }, [form.targetGroup, form.competencyId, modal]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: pagination.page, limit: pagination.limit };
      if (filterComp) params.competencyId = filterComp;
      const { data } = await api.get('/recommendations', { params });
      setItems(data.data.recommendations || []);
      if (data.data.pagination) {
        setPagination((prev) => ({
          ...prev,
          total:      data.data.pagination.total,
          totalPages: Math.ceil(data.data.pagination.total / prev.limit),
        }));
      }
    } catch {
      show('Failed to load recommendations.', 'error');
    }
    setLoading(false);
  }, [filterComp, pagination.page, pagination.limit, show]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const toggleGroup = (key) => setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));

  const openCreate = () => { setForm(initForm()); setSuggestions({}); setModal('create'); };

  const openEdit = (r) => {
    setForm({
      competencyId: r.competencyId?._id || '',
      targetGroup:  r.targetGroup || '',
      levels: { [r.level]: { recommendation: r.recommendation || '', description: r.description || '' } },
    });
    setSelected(r);
    setModal('edit');
  };

  // Copy a suggestion text into a level field
  const applySuggestion = (lvl, text) => {
    setForm((prev) => ({
      ...prev,
      levels: {
        ...prev.levels,
        [lvl]: { ...prev.levels[lvl], recommendation: text },
      },
    }));
  };

  const handleSave = async () => {
    try {
      if (modal === 'create') {
        if (!form.competencyId) return show('Select a competency.', 'error');
        if (!form.targetGroup)  return show('Select a target group.', 'error');
        const bulkData = [];
        Object.entries(form.levels).forEach(([level, { recommendation, description }]) => {
          if (recommendation.trim()) {
            bulkData.push({
              competencyId: form.competencyId,
              targetGroup:  form.targetGroup,
              level,
              recommendation: recommendation.trim(),
              description:    description.trim() || undefined,
            });
          }
        });
        if (!bulkData.length) return show('Enter at least one recommendation.', 'error');
        await api.post('/recommendations', { bulk: bulkData });
        show('Recommendations saved.', 'success');
      } else {
        const level = Object.keys(form.levels)[0];
        const { recommendation, description } = form.levels[level];
        await api.put(`/recommendations/${selected._id}`, {
          recommendation: recommendation.trim(),
          description:    description.trim() || undefined,
          targetGroup:    form.targetGroup,
        });
        show('Recommendation updated.', 'success');
      }
      setModal(null);
      fetchItems();
    } catch (err) {
      show(err.response?.data?.message || 'Save failed.', 'error');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/recommendations/${id}`);
      show('Deleted.', 'success');
      setDeleteConfirm(null);
      fetchItems();
    } catch (err) {
      show(err.response?.data?.message || 'Failed.', 'error');
      setDeleteConfirm(null);
    }
  };

  // Group items by competency → targetGroup for the accordion display
  const grouped = {};
  items.forEach((r) => {
    const compName = r.competencyId?.name || 'Unknown';
    const tg = r.targetGroup || 'unknown';
    if (!grouped[compName]) grouped[compName] = { name: compName, id: r.competencyId?._id, targetGroups: {} };
    if (!grouped[compName].targetGroups[tg]) grouped[compName].targetGroups[tg] = [];
    grouped[compName].targetGroups[tg].push(r);
  });

  const goToPage = (page) => {
    if (page >= 1 && page <= pagination.totalPages) setPagination((prev) => ({ ...prev, page }));
  };

  const totalRecs = Object.values(grouped).reduce(
    (sum, g) => sum + Object.values(g.targetGroups).reduce((s, recs) => s + recs.length, 0), 0
  );

  return (
    <div className="p-7 h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-start mb-3 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-brand-black">Recommendations</h1>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add New
        </button>
      </div>

      <div className="flex justify-between items-center gap-3 mb-5 flex-wrap flex-shrink-0">
        <div className="relative min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <select
            value={filterComp}
            onChange={(e) => { setFilterComp(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
            className="w-full h-10 pl-10 pr-3 rounded-lg border border-gray-300 focus-brand text-sm"
          >
            <option value="">All Competencies</option>
            {competencies.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          {!loading && <span className="text-sm text-gray-500">{totalRecs} record{totalRecs !== 1 ? 's' : ''}</span>}
          <span className="text-sm text-gray-600">Show:</span>
          <select
            value={pagination.limit}
            onChange={(e) => setPagination((p) => ({ ...p, limit: parseInt(e.target.value), page: 1 }))}
            className="px-3 py-1.5 rounded-lg border border-gray-300 focus-brand text-sm"
          >
            {[10, 20, 50].map((n) => <option key={n} value={n}>{n} per page</option>)}
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
        {loading ? (
          <div className="flex items-center justify-center p-16">
            <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Lightbulb className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm font-semibold text-gray-500">No recommendations yet</p>
            <p className="text-xs mt-1">Click &ldquo;Add New&rdquo; to get started</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3">
              {Object.entries(grouped).map(([compName, group]) => {
                const isOpen = expandedGroups[compName];
                const recCount = Object.values(group.targetGroups).reduce((s, r) => s + r.length, 0);
                return (
                  <div key={compName} className="bg-white rounded-xl shadow-card border border-gray-100 overflow-hidden">
                    <button
                      onClick={() => toggleGroup(compName)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-md bg-brand-red flex items-center justify-center flex-shrink-0">
                          <Lightbulb className="w-3.5 h-3.5 text-white" />
                        </div>
                        <span className="text-base font-medium text-gray-900 truncate">{compName}</span>
                        <span className="text-xs text-brand-red bg-brand-red/10 px-1.5 py-0.5 rounded-full flex-shrink-0">{recCount}</span>
                      </div>
                      {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                    </button>

                    {isOpen && (
                      <div className="border-t border-gray-100 px-4 pb-4 pt-2">
                        {Object.entries(group.targetGroups).map(([tg, recs]) => (
                          <div key={tg} className="mt-3 first:mt-0">
                            <div className="flex items-center gap-1.5 mb-2">
                              <span className="text-xs font-semibold uppercase tracking-wide text-brand-red">{tg}</span>
                            </div>
                            <div className="rounded-lg border border-gray-100 overflow-hidden">
                              <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 border-b border-gray-100">
                                  <tr>
                                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap bg-gray-50 w-28">Level</th>
                                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap bg-gray-50">Recommendation</th>
                                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap bg-gray-50 hidden sm:table-cell">Description</th>
                                    <th className="px-4 py-2.5 text-right w-20 bg-gray-50" />
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {LEVELS.map((lvl) => {
                                    const rec = recs.find((r) => r.level === lvl);
                                    return (
                                      <tr key={lvl} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3">
                                          <span className="inline-flex items-center gap-1.5">
                                            <span className={`w-1.5 h-1.5 rounded-full ${LEVEL_DOT[lvl]}`} />
                                            <span className="text-sm font-medium text-gray-600">{lvl}</span>
                                          </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600">
                                          {rec?.recommendation
                                            ? <span className="line-clamp-2">{rec.recommendation}</span>
                                            : <span className="text-gray-300 italic">—</span>}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-400 hidden sm:table-cell">
                                          {rec?.description
                                            ? <span className="line-clamp-2">{rec.description}</span>
                                            : <span className="text-gray-200 italic">—</span>}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                          {rec ? (
                                            <div className="inline-flex items-center justify-end gap-2">
                                              <button onClick={() => openEdit(rec)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors" title="Edit">
                                                <Edit2 className="w-3.5 h-3.5 text-gray-500" />
                                              </button>
                                              <button onClick={() => setDeleteConfirm(rec._id)} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors" title="Delete">
                                                <Trash2 className="w-3.5 h-3.5 text-red-600" />
                                              </button>
                                            </div>
                                          ) : (
                                            <button
                                              onClick={() => {
                                                setForm({ competencyId: group.id, targetGroup: tg, levels: { ...initForm().levels, [lvl]: { recommendation: '', description: '' } } });
                                                setModal('create');
                                              }}
                                              className="text-xs font-semibold text-brand-red hover:text-brand-red-dark transition-colors"
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

            {pagination.total > pagination.limit && (
              <div className="flex flex-col sm:flex-row justify-between items-center gap-3 mt-4">
                <p className="text-sm text-gray-500">
                  Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                </p>
                <div className="flex items-center gap-1">
                  <button disabled={pagination.page === 1} onClick={() => goToPage(pagination.page - 1)} className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50">
                    <ChevronLeft className="w-4 h-4" /> Prev
                  </button>
                  {(() => {
                    const maxV = 5;
                    const pages = [];
                    if (pagination.totalPages <= maxV) {
                      for (let i = 1; i <= pagination.totalPages; i++) pages.push(i);
                    } else {
                      let start = Math.max(1, pagination.page - Math.floor(maxV / 2));
                      let end = Math.min(pagination.totalPages, start + maxV - 1);
                      if (end - start + 1 < maxV) start = Math.max(1, end - maxV + 1);
                      for (let i = start; i <= end; i++) pages.push(i);
                    }
                    return pages.map((p) => (
                      <button key={p} onClick={() => goToPage(p)}
                        className={`w-9 h-9 rounded-lg text-sm font-medium ${pagination.page === p ? 'bg-brand-red text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                        {p}
                      </button>
                    ));
                  })()}
                  <button disabled={pagination.page === pagination.totalPages} onClick={() => goToPage(pagination.page + 1)} className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50">
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-lg p-5 mx-4 max-w-xs w-full">
            <p className="text-base font-medium text-gray-900 mb-1">Delete recommendation?</p>
            <p className="text-sm text-gray-400 mb-4">This action cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-3 py-1.5 text-sm font-semibold text-brand-black border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="px-3 py-1.5 text-sm font-semibold text-white bg-brand-red hover:bg-brand-red-dark rounded-lg transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? 'Add Recommendations' : 'Edit Recommendation'}>
        <div className="space-y-4 max-h-[72vh] overflow-y-auto pr-1">

          {/* Competency & Target Group */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Competency <span className="text-brand-red">*</span></label>
              <select
                value={form.competencyId}
                onChange={(e) => setForm({ ...form, competencyId: e.target.value })}
                disabled={modal === 'edit'}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm disabled:bg-gray-50 disabled:text-gray-400 transition"
              >
                <option value="">Select competency…</option>
                {competencies.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Target Group <span className="text-brand-red">*</span></label>
              {availableTargetGroups.length === 0 ? (
                <div className="h-10 flex items-center px-3 rounded-lg bg-gray-50 border border-gray-100 text-sm text-gray-400 italic">Select a competency first</div>
              ) : (
                <select
                  value={form.targetGroup}
                  onChange={(e) => setForm({ ...form, targetGroup: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm transition"
                >
                  <option value="">Select target group…</option>
                  {availableTargetGroups.map((tg) => <option key={tg} value={tg}>{tg.charAt(0).toUpperCase() + tg.slice(1)}</option>)}
                </select>
              )}
            </div>
          </div>

          {/* Level cards */}
          <div className="space-y-3 pt-1">
            {(modal === 'create' ? LEVELS : [Object.keys(form.levels)[0]]).map((lvl) => {
              if (!form.levels[lvl]) return null;
              const lvlSuggestions = (suggestions[lvl] || []);
              return (
                <div key={lvl} className="rounded-xl border border-gray-100 bg-gray-50 p-3.5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`w-2 h-2 rounded-full ${LEVEL_DOT[lvl]}`} />
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${LEVEL_STYLES[lvl]}`}>{lvl}</span>
                  </div>

                  {/* Suggestion pills — shown when same text exists in other competencies */}
                  {modal === 'create' && form.targetGroup && lvlSuggestions.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-400 mb-1.5 flex items-center gap-1">
                        <Copy className="w-3 h-3" /> Reuse from another competency:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {lvlSuggestions.slice(0, 3).map((s) => (
                          <button
                            key={s._id}
                            type="button"
                            onClick={() => applySuggestion(lvl, s.recommendation)}
                            title={`From: ${s.competencyId?.name}\n\n${s.recommendation}`}
                            className="text-xs px-2.5 py-1 rounded-full border border-gray-300 bg-white text-gray-600 hover:border-brand-red/40 hover:text-brand-red transition truncate max-w-[200px]"
                          >
                            {s.recommendation.length > 40 ? s.recommendation.slice(0, 40) + '…' : s.recommendation}
                          </button>
                        ))}
                        {suggestionsLoading && <span className="text-xs text-gray-300 italic">loading…</span>}
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">Recommendation <span className="text-brand-red">*</span></label>
                      <textarea
                        rows={2}
                        value={form.levels[lvl].recommendation}
                        onChange={(e) => setForm({ ...form, levels: { ...form.levels, [lvl]: { ...form.levels[lvl], recommendation: e.target.value } } })}
                        placeholder={`Recommendation for ${lvl}…`}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 focus-brand text-sm placeholder:text-gray-300 resize-none transition"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">Description <span className="text-gray-300 font-normal">(optional)</span></label>
                      <textarea
                        rows={2}
                        value={form.levels[lvl].description}
                        onChange={(e) => setForm({ ...form, levels: { ...form.levels, [lvl]: { ...form.levels[lvl], description: e.target.value } } })}
                        placeholder="Additional context…"
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 focus-brand text-sm placeholder:text-gray-300 resize-none transition"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5 pt-3 border-t border-gray-100">
          <button onClick={() => setModal(null)} className="px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition">Cancel</button>
          <button
            onClick={handleSave}
            disabled={!form.competencyId || !form.targetGroup}
            className={`px-5 py-2 text-sm font-medium rounded-lg transition min-w-[110px] ${form.competencyId && form.targetGroup ? 'bg-brand-red text-white hover:bg-brand-red-dark' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
          >
            {modal === 'create' ? 'Save All' : 'Update'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
