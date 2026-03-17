/* pages/FAQs.jsx — Modern FAQ Management */
import { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../utils/api';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { LoadingPage } from '../components/LoadingSpinner';
import { useToast } from '../context/ToastContext';
import {
  Plus, Search, Edit2, Trash2, ChevronDown,
  HelpCircle, ToggleLeft, ToggleRight, Tag,
  BookOpen, Filter,
} from 'lucide-react';

// ─── Category config ─────────────────────────────────────────────────────────

const CAT_COLORS = {
  GENERAL:    'bg-gray-100 text-gray-600',
  ASSESSMENT: 'bg-blue-50 text-blue-600',
  TECHNICAL:  'bg-purple-50 text-purple-600',
  HR:         'bg-rose-50 text-rose-600',
  POLICY:     'bg-amber-50 text-amber-700',
  OTHER:      'bg-teal-50 text-teal-600',
};

const INIT_FORM = { question: '', answer: '', category: 'GENERAL', order: 0, isActive: true };

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${accent}`}>
        <BookOpen className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-display font-bold text-brand-black leading-none">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── FAQ Row ──────────────────────────────────────────────────────────────────

function FAQRow({ faq, catLabel, catColor, onEdit, onDelete, onToggle }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`group border-b border-gray-100 last:border-0 transition-colors ${!faq.isActive ? 'bg-gray-50/60' : 'hover:bg-gray-50/50'}`}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-5 py-3.5">
        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
        >
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
        </button>

        {/* Category badge */}
        <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold ${catColor}`}>
          {catLabel}
        </span>

        {/* Question */}
        <p className={`flex-1 min-w-0 text-sm font-medium truncate ${!faq.isActive ? 'text-gray-400' : 'text-gray-900'}`}>
          {faq.question}
        </p>

        {/* Status */}
        <span className={`flex-shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${
          faq.isActive ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'
        }`}>
          {faq.isActive ? 'Active' : 'Hidden'}
        </span>

        {/* Actions — visible on hover */}
        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onToggle(faq)}
            title={faq.isActive ? 'Hide from employees' : 'Show to employees'}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            {faq.isActive
              ? <ToggleRight className="w-4 h-4 text-green-500" />
              : <ToggleLeft className="w-4 h-4" />
            }
          </button>
          <button
            onClick={() => onEdit(faq)}
            title="Edit"
            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(faq)}
            title="Delete"
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expanded answer */}
      <div className={`overflow-hidden transition-all duration-200 ${expanded ? 'max-h-96' : 'max-h-0'}`}>
        <div className="px-5 pb-4 ml-9">
          <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 rounded-lg px-4 py-3 border border-gray-100">
            {faq.answer}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── FAQ Form ─────────────────────────────────────────────────────────────────

function FAQForm({ form, setForm, categories, onSubmit, onCancel, isEdit }) {
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Question</label>
        <input
          type="text"
          value={form.question}
          onChange={e => setForm(f => ({ ...f, question: e.target.value }))}
          required
          autoFocus
          placeholder="What would an employee ask?"
          className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red/40 transition-all"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Answer</label>
        <textarea
          value={form.answer}
          onChange={e => setForm(f => ({ ...f, answer: e.target.value }))}
          required
          rows={4}
          placeholder="Provide a clear, helpful answer..."
          className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red/40 resize-none transition-all"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Category</label>
          <select
            value={form.category}
            onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red/40 bg-white"
          >
            {categories.filter(c => c.value !== 'ALL').map(cat => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Display order</label>
          <input
            type="number"
            value={form.order}
            onChange={e => setForm(f => ({ ...f, order: parseInt(e.target.value) || 0 }))}
            min="0"
            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red/40"
          />
        </div>
      </div>

      <label className="flex items-center gap-3 cursor-pointer select-none">
        <div
          onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
          className={`relative w-10 h-5.5 rounded-full transition-colors duration-200 flex-shrink-0 ${form.isActive ? 'bg-brand-red' : 'bg-gray-200'}`}
          style={{ width: '40px', height: '22px' }}
        >
          <span className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-transform duration-200 ${form.isActive ? 'translate-x-5' : 'translate-x-0.5'}`}
            style={{ width: '18px', height: '18px', top: '2px', left: '2px', transform: form.isActive ? 'translateX(18px)' : 'translateX(0)' }}
          />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-700">{form.isActive ? 'Visible to employees' : 'Hidden from employees'}</p>
          <p className="text-xs text-gray-400">Toggle to show or hide in the support widget</p>
        </div>
      </label>

      <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
          Cancel
        </button>
        <button type="submit"
          className="px-5 py-2 rounded-xl bg-brand-red text-white text-sm font-semibold hover:bg-brand-red-dark transition-colors">
          {isEdit ? 'Save Changes' : 'Create FAQ'}
        </button>
      </div>
    </form>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ hasFilters, onClear, onCreate }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
        <HelpCircle className="w-8 h-8 text-gray-400" />
      </div>
      {hasFilters ? (
        <>
          <p className="text-base font-semibold text-gray-700">No FAQs match your filters</p>
          <p className="text-sm text-gray-400 mt-1">Try adjusting the search or category</p>
          <button onClick={onClear} className="mt-4 text-sm text-brand-red font-medium hover:underline">Clear filters</button>
        </>
      ) : (
        <>
          <p className="text-base font-semibold text-gray-700">No FAQs yet</p>
          <p className="text-sm text-gray-400 mt-1 mb-5">Create your first FAQ to help employees</p>
          <button onClick={onCreate}
            className="flex items-center gap-2 px-4 py-2 bg-brand-red text-white rounded-xl text-sm font-semibold hover:bg-brand-red-dark transition-colors">
            <Plus className="w-4 h-4" />Add FAQ
          </button>
        </>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FAQs() {
  const { show } = useToast();

  const [faqs, setFaqs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [modal, setModal] = useState(null); // 'create' | 'edit'
  const [editingFAQ, setEditingFAQ] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState(INIT_FORM);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [faqsRes, catsRes] = await Promise.all([
        api.get('/faq/all'),
        api.get('/faq/categories'),
      ]);
      setFaqs(faqsRes.data.data || []);
      setCategories([{ value: 'ALL', label: 'All Categories' }, ...(catsRes.data.data || [])]);
    } catch {
      show('Failed to load FAQs', 'error');
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => { loadData(); }, [loadData]);

  // Stats
  const stats = useMemo(() => ({
    total: faqs.length,
    active: faqs.filter(f => f.isActive).length,
    hidden: faqs.filter(f => !f.isActive).length,
  }), [faqs]);

  // Filtered list
  const filtered = useMemo(() => faqs.filter(faq => {
    const matchCat = selectedCategory === 'ALL' || faq.category === selectedCategory;
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || faq.question.toLowerCase().includes(q) || faq.answer.toLowerCase().includes(q);
    return matchCat && matchSearch;
  }), [faqs, selectedCategory, searchQuery]);

  const hasFilters = !!searchQuery || selectedCategory !== 'ALL';

  // Modal open helpers
  const openCreate = () => { setForm(INIT_FORM); setEditingFAQ(null); setModal('create'); };
  const openEdit = (faq) => {
    setEditingFAQ(faq);
    setForm({ question: faq.question, answer: faq.answer, category: faq.category, order: faq.order, isActive: faq.isActive });
    setModal('edit');
  };
  const closeModal = () => { setModal(null); setEditingFAQ(null); };

  // Save
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal === 'create') {
        await api.post('/faq', form);
        show('FAQ created', 'success');
      } else {
        await api.patch(`/faq/${editingFAQ._id}`, form);
        show('FAQ updated', 'success');
      }
      closeModal();
      loadData();
    } catch (err) {
      show(err.response?.data?.message || 'Failed to save FAQ', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Delete
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/faq/${deleteTarget._id}`);
      show('FAQ deleted', 'success');
      setDeleteTarget(null);
      loadData();
    } catch {
      show('Failed to delete FAQ', 'error');
    }
  };

  // Toggle active
  const handleToggle = async (faq) => {
    try {
      await api.patch(`/faq/${faq._id}`, { isActive: !faq.isActive });
      show(faq.isActive ? 'FAQ hidden from employees' : 'FAQ is now visible', 'success');
      loadData();
    } catch {
      show('Failed to update status', 'error');
    }
  };

  const getCatMeta = (value) => {
    const cat = categories.find(c => c.value === value);
    return {
      label: cat?.label || value,
      color: CAT_COLORS[value] || 'bg-gray-100 text-gray-600',
    };
  };

  if (loading) return <LoadingPage />;

  return (
    <div className="p-6 lg:p-7 space-y-6">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-brand-black">FAQ Management</h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage the support widget FAQs shown to employees</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-red text-white rounded-xl text-sm font-semibold hover:bg-brand-red-dark transition-colors shadow-sm self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Add FAQ
        </button>
      </div>

      {/* ── Stats row ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total FAQs" value={stats.total} accent="bg-brand-red/10 text-brand-red" />
        <StatCard label="Visible" value={stats.active} sub="shown to employees" accent="bg-green-50 text-green-600" />
        <StatCard label="Hidden" value={stats.hidden} sub="not shown" accent="bg-gray-100 text-gray-500" />
      </div>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search questions and answers…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red/40 transition-all"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="pl-9 pr-8 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red/40 bg-white appearance-none cursor-pointer"
          >
            {categories.map(cat => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── FAQ Table ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-card">
        {/* Table header */}
        {filtered.length > 0 && (
          <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50/70">
            <span className="w-6 flex-shrink-0" />
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide w-24">Category</span>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex-1">Question</span>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide w-14 text-center">Status</span>
            <span className="w-24 flex-shrink-0" />
          </div>
        )}

        {filtered.length === 0 ? (
          <EmptyState
            hasFilters={hasFilters}
            onClear={() => { setSearchQuery(''); setSelectedCategory('ALL'); }}
            onCreate={openCreate}
          />
        ) : (
          <div>
            {filtered.map(faq => {
              const { label, color } = getCatMeta(faq.category);
              return (
                <FAQRow
                  key={faq._id}
                  faq={faq}
                  catLabel={label}
                  catColor={color}
                  onEdit={openEdit}
                  onDelete={setDeleteTarget}
                  onToggle={handleToggle}
                />
              );
            })}
          </div>
        )}

        {/* Footer count */}
        {filtered.length > 0 && (
          <div className="px-5 py-2.5 border-t border-gray-100 bg-gray-50/50">
            <p className="text-xs text-gray-400">
              Showing {filtered.length} of {faqs.length} FAQ{faqs.length !== 1 ? 's' : ''}
              {hasFilters && <button onClick={() => { setSearchQuery(''); setSelectedCategory('ALL'); }} className="ml-2 text-brand-red hover:underline">Clear filters</button>}
            </p>
          </div>
        )}
      </div>

      {/* ── Create / Edit Modal ──────────────────────────────────────────── */}
      <Modal
        open={!!modal}
        onClose={closeModal}
        title={modal === 'create' ? 'New FAQ' : 'Edit FAQ'}
      >
        <FAQForm
          form={form}
          setForm={setForm}
          categories={categories}
          onSubmit={handleSave}
          onCancel={closeModal}
          isEdit={modal === 'edit'}
          saving={saving}
        />
      </Modal>

      {/* ── Delete Confirm ────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete FAQ"
        message={`Are you sure you want to delete "${deleteTarget?.question}"? This cannot be undone.`}
        confirmText="Delete"
        danger
      />
    </div>
  );
}
