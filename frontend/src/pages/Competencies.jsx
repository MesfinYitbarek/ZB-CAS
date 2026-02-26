import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Eye,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import api from '../utils/api';

/* =====================================================
   CONSTANTS
===================================================== */

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
  'Core-Personal effectiveness':
    'text-brand-red bg-brand-red/10 border-brand-red',
  'Core-Behavioral':
    'text-brand-red bg-brand-red/10 border-brand-purple',
  Managerial: 'text-blue-600 bg-blue-100 border-blue-600',
  Leadership: 'text-green-600 bg-green-100 border-green-600',
  Technical: 'text-orange-600 bg-orange-100 border-orange-600',
};

const TG_COLORS = {
  managerial: 'bg-purple-100 text-purple-700',
  'non-managerial': 'bg-indigo-100 text-indigo-700',
  common: 'bg-gray-100 text-gray-700',
};

/* =====================================================
   COMPONENT
===================================================== */

export default function Competencies() {
  const { show } = useToast();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [catFilter, setCatFilter] = useState('All');

  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [viewItem, setViewItem] = useState(null);

  const initForm = () => ({
    name: '',
    category: 'Core-Personal effectiveness',
    description: '',
    targetGroup: 'common',
  });

  const [form, setForm] = useState(initForm());

  /* ================= PAGINATION ================= */

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 12,
    total: 0,
    totalPages: 0,
  });

  /* ================= FETCH ================= */

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
      };

      if (catFilter !== 'All') params.category = catFilter;

      const { data } = await api.get('/competencies', { params });

      setItems(data.data.competencies);

      if (data.data.pagination) {
        setPagination((prev) => ({
          ...prev,
          total: data.data.pagination.total,
          totalPages: Math.ceil(
            data.data.pagination.total / pagination.limit
          ),
        }));
      }
    } catch {
      show('Failed to load competencies.', 'error');
    }

    setLoading(false);
  }, [catFilter, pagination.page, pagination.limit, show]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  /* ================= CRUD ================= */

  const openCreate = () => {
    setForm(initForm());
    setModal('create');
  };

  const openEdit = (c) => {
    setForm({
      name: c.name,
      category: c.category,
      description: c.description || '',
      targetGroup: c.targetGroup || 'common',
    });
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
    if (!window.confirm('Delete this competency?')) return;

    try {
      await api.delete(`/competencies/${id}`);
      show('Competency deleted.', 'success');
      fetch();
    } catch (err) {
      show(err.response?.data?.message || 'Delete failed.', 'error');
    }
  };

  /* ================= PAGINATION ================= */

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

  /* =====================================================
     UI
  ===================================================== */

  return (
    <div className="p-7">
      {/* HEADER */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-bold text-brand-black">
            Competencies
          </h1>
          <p className="text-gray-500 mt-1">
            Define and manage competency framework.
          </p>
        </div>

        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark"
        >
          <Plus className="w-4 h-4" /> Add Competency
        </button>
      </div>

      {/* FILTERS */}
      <div className="flex justify-between items-center gap-4 mb-6">
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => handleCatFilter(c)}
              className={`px-4 py-2 rounded-lg border-2 text-sm font-semibold ${
                catFilter === c
                  ? CAT_COLORS[c] ||
                    'border-brand-red bg-brand-red/10 text-brand-red'
                  : 'border-gray-200 bg-white text-gray-600'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <select
          value={pagination.limit}
          onChange={handlePageSizeChange}
          className="px-3 py-1.5 border rounded-lg"
        >
          <option value="6">6</option>
          <option value="12">12</option>
          <option value="24">24</option>
          <option value="48">48</option>
        </select>
      </div>

      {/* CONTENT */}
      {loading ? (
        <div className="flex justify-center p-16">
          <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
            {items.map((c) => (
              <div
                key={c._id}
                className="
                  group relative bg-white/90 backdrop-blur-sm
                  rounded-xl border border-gray-200/70
                  p-4 transition-all duration-200
                  hover:shadow-lg hover:-translate-y-[2px]
                "
              >
                {/* ACTIONS */}
                <div className="absolute top-3 right-3 flex gap-1  opacity-100 transition">
                  <button
                    onClick={() => setViewItem(c)}
                    className="p-1.5 rounded-md hover:bg-blue-50"
                  >
                    <Eye className="w-4 h-4 text-blue-600" />
                  </button>

                  <button
                    onClick={() => openEdit(c)}
                    className="p-1.5 rounded-md hover:bg-gray-100"
                  >
                    <Edit2 className="w-4 h-4 text-gray-600" />
                  </button>

                  <button
                    onClick={() => handleDelete(c._id)}
                    className="p-1.5 rounded-md hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </button>
                </div>

                {/* NAME */}
                <h3 className="font-semibold text-brand-black pr-16 mb-2 line-clamp-2">
                  {c.name}
                </h3>

                {/* TAGS */}
                <div className="flex flex-wrap gap-2 mb-3">
                  <span
                    className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${CAT_COLORS[c.category]}`}
                  >
                    {c.category}
                  </span>

                  <span
                    className={`px-2 py-0.5 rounded-md text-[11px] ${TG_COLORS[c.targetGroup]}`}
                  >
                    {c.targetGroup}
                  </span>
                </div>

                {/* DESCRIPTION */}
                <p className="text-sm text-gray-500 line-clamp-2 mb-4">
                  {c.description || 'No description provided.'}
                </p>

                {/* FOOTER */}
                <div className="flex justify-between text-xs text-gray-400 border-t pt-3">
                  <div className="flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5" />
                    {c.noOfQuestions || 0} questions
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* CREATE / EDIT MODAL */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal === 'create' ? 'New Competency' : 'Edit Competency'}
      >
        <div className="space-y-4">
          <input
            value={form.name}
            onChange={(e) =>
              setForm({ ...form, name: e.target.value })
            }
            placeholder="Name"
            className="w-full h-10 px-3 border rounded-lg"
          />

          <select
            value={form.category}
            onChange={(e) =>
              setForm({ ...form, category: e.target.value })
            }
            className="w-full h-10 px-3 border rounded-lg"
          >
            {CATEGORIES.slice(1).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>

          <select
            value={form.targetGroup}
            onChange={(e) =>
              setForm({ ...form, targetGroup: e.target.value })
            }
            className="w-full h-10 px-3 border rounded-lg"
          >
            {TARGET_GROUPS.map((tg) => (
              <option key={tg}>{tg}</option>
            ))}
          </select>

          <textarea
            rows={3}
            value={form.description}
            onChange={(e) =>
              setForm({ ...form, description: e.target.value })
            }
            className="w-full px-3 py-2 border rounded-lg"
            placeholder="Description..."
          />
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setModal(null)}>Cancel</button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-brand-red text-white rounded-lg"
          >
            {modal === 'create' ? 'Create' : 'Save'}
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
          <div className="space-y-4 text-sm">
            <div>
              <p className="text-gray-500">Name</p>
              <p className="font-semibold">{viewItem.name}</p>
            </div>

            <div>
              <p className="text-gray-500">Category</p>
              {viewItem.category}
            </div>

            <div>
              <p className="text-gray-500">Target Group</p>
              {viewItem.targetGroup}
            </div>

            <div>
              <p className="text-gray-500">Description</p>
              {viewItem.description || 'No description'}
            </div>

            <div>
              <p className="text-gray-500">Questions</p>
              {viewItem.noOfQuestions || 0}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}