import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  Eye,
  X,
  Search,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import api from '../utils/api';

const CATEGORIES = [
  'All',
  'Core-Personal effectiveness',
  'Core-Behavioral',
  'Managerial',
  'Leadership',
  'Technical',
];

const TARGET_GROUPS = ['managerial', 'non-managerial', 'common'];

const CAT_COLORS = {
  'Core-Personal effectiveness': 'text-brand-red bg-brand-red/10 border-brand-red',
  'Core-Behavioral': 'text-brand-red bg-brand-red/10 border-purple-600',
  Managerial: 'text-blue-600 bg-blue-100 border-blue-600',
  Leadership: 'text-green-600 bg-green-100 border-green-600',
  Technical: 'text-orange-600 bg-orange-100 border-orange-600',
};

const TG_COLORS = {
  managerial: 'bg-purple-100 text-purple-700',
  'non-managerial': 'bg-indigo-100 text-indigo-700',
  common: 'bg-gray-100 text-gray-700',
};

export default function Competencies() {
  const { show } = useToast();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [catFilter, setCatFilter] = useState('All');
  const [search, setSearch] = useState('');

  const [modal, setModal] = useState(null); // 'create' | 'edit'
  const [selected, setSelected] = useState(null);
  const [viewItem, setViewItem] = useState(null);

  const initForm = () => ({
    name: '',
    category: 'Core-Personal effectiveness',
    targetGroups: [{ targetGroup: 'common', description: '' }],
  });

  const [form, setForm] = useState(initForm());

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 12,
    total: 0,
    totalPages: 0,
  });

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: pagination.page, limit: pagination.limit };
      if (catFilter !== 'All') params.category = catFilter;
      if (search.trim()) params.search = search.trim();

      const { data } = await api.get('/competencies', { params });

      setItems(data.data.competencies);

      if (data.data.pagination) {
        setPagination((prev) => ({
          ...prev,
          total: data.data.pagination.total,
          totalPages: Math.ceil(data.data.pagination.total / prev.limit),
        }));
      }
    } catch {
      show('Failed to load competencies.', 'error');
    }
    setLoading(false);
  }, [catFilter, search, pagination.page, pagination.limit, show]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const openCreate = () => {
    setForm(initForm());
    setModal('create');
  };

  const openEdit = (c) => {
    setForm({
      name: c.name,
      category: c.category,
      targetGroups: c.targetGroups.map((tg) => ({ ...tg })),
    });
    setSelected(c);
    setModal('edit');
  };

  const handleSave = async () => {
    const usedTG = new Set(form.targetGroups.map((tg) => tg.targetGroup));
    if (usedTG.size !== form.targetGroups.length) {
      show('Duplicate target groups not allowed.', 'error');
      return;
    }
    if (form.targetGroups.length === 0) {
      show('At least one target group is required.', 'error');
      return;
    }

    try {
      if (modal === 'create') {
        await api.post('/competencies', form);
        show('Competency created or target groups merged.', 'success');
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
    if (!window.confirm('Delete this competency and all its target groups?')) return;
    try {
      await api.delete(`/competencies/${id}`);
      show('Competency deleted.', 'success');
      fetch();
    } catch (err) {
      show(err.response?.data?.message || 'Delete failed.', 'error');
    }
  };

  const goToPage = (page) => {
    if (page >= 1 && page <= pagination.totalPages) {
      setPagination((p) => ({ ...p, page }));
    }
  };

  const handlePageSizeChange = (e) => {
    const limit = parseInt(e.target.value, 10);
    setPagination((prev) => ({
      ...prev,
      page: 1,
      limit,
      totalPages: Math.ceil(prev.total / limit),
    }));
  };

  const handleCatFilter = (c) => {
    setCatFilter(c);
    setPagination((p) => ({ ...p, page: 1 }));
  };

  const addTargetGroup = () => {
    const used = form.targetGroups.map((tg) => tg.targetGroup);
    const available = TARGET_GROUPS.filter((tg) => !used.includes(tg));
    if (available.length === 0) return;
    setForm({
      ...form,
      targetGroups: [
        ...form.targetGroups,
        { targetGroup: available[0], description: '' },
      ],
    });
  };

  const removeTargetGroup = (index) => {
    const newTGs = form.targetGroups.filter((_, i) => i !== index);
    setForm({ ...form, targetGroups: newTGs });
  };

  const updateTargetGroup = (index, field, value) => {
    const newTGs = [...form.targetGroups];
    newTGs[index][field] = value;
    setForm({ ...form, targetGroups: newTGs });
  };

  return (
    <div className="p-7 bg-gradient-to-br from-gray-50 to-white h-[calc(100vh-4rem)] flex flex-col">
      {/* HEADER */}
      <div className="flex justify-between items-start mb-3 flex-shrink-0">
        <div>
          <h1 className="text-xl  font-bold text-brand-black">Competencies</h1>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-transform hover:scale-105"
        >
          <Plus className="w-3.5 h-3.5" /> Add Competency
        </button>
      </div>

      {/* FILTERS */}
      <div className="flex flex-wrap items-center gap-3 mb-6 flex-shrink-0">
        {/* Search bar */}
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
            placeholder="Search competencies…"
            className="w-full h-9 pl-9 pr-8 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100 transition"
          />
          {search && (
            <button onClick={() => { setSearch(''); setPagination(p => ({ ...p, page: 1 })); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Category dropdown */}
        <select
          value={catFilter}
          onChange={(e) => handleCatFilter(e.target.value)}
          className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100 cursor-pointer"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Page size */}
        <select
          value={pagination.limit}
          onChange={handlePageSizeChange}
          className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 cursor-pointer"
        >
          <option value="6">6 / page</option>
          <option value="12">12 / page</option>
          <option value="24">24 / page</option>
          <option value="48">48 / page</option>
        </select>
      </div>

      {/* CONTENT - Scrollable */}
      <div className="flex-1 overflow-auto min-h-0">
        {loading ? (
          <div className="flex justify-center p-16">
            <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200/70 overflow-hidden mb-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-2.5 font-semibold">Competency</th>
                    <th className="px-4 py-2.5 font-semibold">Category</th>
                    <th className="px-4 py-2.5 font-semibold">Target Groups</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-16 text-gray-400">
                        No competencies found.
                      </td>
                    </tr>
                  )}
                  {items.map((c) => (
                    <tr key={c._id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-brand-black whitespace-nowrap">
                        {c.name}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${CAT_COLORS[c.category]}`}>
                          {c.category}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {c.targetGroups?.map((tg) => (
                            <span
                              key={tg.targetGroup}
                              className={`px-2 py-0.5 rounded-md text-[11px] ${TG_COLORS[tg.targetGroup]}`}
                            >
                              {tg.targetGroup}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setViewItem(c)} className="p-1.5 rounded-md hover:bg-blue-50 transition" title="View">
                            <Eye className="w-4 h-4 text-blue-600" />
                          </button>
                          <button onClick={() => openEdit(c)} className="p-1.5 rounded-md hover:bg-gray-100 transition" title="Edit">
                            <Edit2 className="w-4 h-4 text-gray-600" />
                          </button>
                          <button onClick={() => handleDelete(c._id)} className="p-1.5 rounded-md hover:bg-red-50 transition" title="Delete">
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* CREATE / EDIT MODAL */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal === 'create' ? 'New Competency' : 'Edit Competency'}
      >
        <div className="space-y-4">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Competency Name"
            className="w-full h-10 px-3 border rounded-lg"
          />

          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="w-full h-10 px-3 border rounded-lg"
          >
            {CATEGORIES.slice(1).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="font-medium">Target Groups</label>
              <button
                onClick={addTargetGroup}
                className="flex items-center gap-1 text-sm text-brand-red hover:underline"
                disabled={form.targetGroups.length >= TARGET_GROUPS.length}
              >
                <Plus className="w-4 h-4" /> Add Group
              </button>
            </div>
            {form.targetGroups.map((tg, index) => {
              const used = form.targetGroups.map((t) => t.targetGroup);
              const available = TARGET_GROUPS.filter((t) => used.includes(t) ? t === tg.targetGroup : true);
              return (
                <div key={index} className="flex gap-2 items-start">
                  <select
                    value={tg.targetGroup}
                    onChange={(e) => updateTargetGroup(index, 'targetGroup', e.target.value)}
                    className="w-1/3 h-10 px-3 border rounded-lg"
                  >
                    {available.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <textarea
                    rows={2}
                    value={tg.description}
                    onChange={(e) => updateTargetGroup(index, 'description', e.target.value)}
                    placeholder="Description..."
                    className="flex-1 px-3 py-2 border rounded-lg"
                  />
                  {form.targetGroups.length > 1 && (
                    <button
                      onClick={() => removeTargetGroup(index)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setModal(null)} className="px-4 py-2 text-gray-600">
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-brand-red text-white rounded-lg font-semibold"
          >
            {modal === 'create' ? 'Create' : 'Save Changes'}
          </button>
        </div>
      </Modal>

      {/* VIEW MODAL */}
      <Modal
        open={!!viewItem}
        onClose={() => setViewItem(null)}
        title="Competency Details"
      >
        {viewItem && (
          <div className="space-y-6 text-sm">
            <div>
              <p className="text-gray-500">Name</p>
              <p className="font-semibold text-lg">{viewItem.name}</p>
            </div>
            <div>
              <p className="text-gray-500">Category</p>
              <p>{viewItem.category}</p>
            </div>

            <div>
              <p className="text-gray-500 mb-2">Target Groups & Descriptions</p>
              {viewItem.targetGroups?.map((tg) => (
                <div key={tg.targetGroup} className="border-l-2 border-brand-red pl-3 mb-4">
                  <p className="font-medium capitalize">{tg.targetGroup}</p>
                  <p className="text-gray-600 mt-1">{tg.description || 'No description provided.'}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}