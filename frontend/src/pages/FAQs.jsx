/* pages/FAQs.jsx — FAQ Management (matches Users / Competencies / ActivityLog) */
import { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import Pagination from '../components/Pagination';
import { useToast } from '../context/ToastContext';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useFaqList, useFaqCategories, queryKeys } from '../hooks/queries';
import {
  Plus, Search, Edit2, Trash2, ChevronDown,
  HelpCircle, ToggleLeft, ToggleRight,
} from 'lucide-react';

// ─── Category config ─────────────────────────────────────────────────────────

const CAT_COLORS = {
  GENERAL: 'bg-gray-100 text-gray-600',
  ASSESSMENT: 'bg-gray-100 text-gray-700',
  TECHNICAL: 'bg-gray-100 text-gray-700',
  HR: 'bg-red-50 text-red-600',
  POLICY: 'bg-gray-100 text-gray-700',
  OTHER: 'bg-gray-100 text-gray-700',
};

const INIT_FORM = { question: '', answer: '', category: 'GENERAL', order: 0, isActive: true };

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-base font-bold text-brand-black leading-none">{value}</span>
      <span className="text-xs text-gray-500">{label}</span>
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
        <span className={`flex-shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${faq.isActive ? 'bg-gray-100 text-gray-700' : 'bg-gray-100 text-gray-400'
          }`}>
          {faq.isActive ? 'Active' : 'Hidden'}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onToggle(faq)}
            title={faq.isActive ? 'Hide from employees' : 'Show to employees'}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            {faq.isActive
              ? <ToggleRight className="w-4 h-4 text-gray-700" />
              : <ToggleLeft className="w-4 h-4" />
            }
          </button>
          <button
            onClick={() => onEdit(faq)}
            title="Edit"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
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
  const inputCls = 'w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm';
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
          className={inputCls}
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
          className="w-full px-3 py-2 rounded-lg border border-gray-300 focus-brand text-sm resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Category</label>
          <select
            value={form.category}
            onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            className={`${inputCls} bg-white`}
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
            className={inputCls}
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

      <div className="flex justify-end gap-3 mt-6">
        <button type="button" onClick={onCancel}
          className="px-2 py-1 text-sm font-semibold text-brand-black border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
          Cancel
        </button>
        <button type="submit"
          className="px-2 py-1 bg-brand-red text-white rounded-lg text-sm font-semibold hover:bg-brand-red-dark transition-colors">
          {isEdit ? 'Save Changes' : 'Create FAQ'}
        </button>
      </div>
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FAQs() {
  const { show } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [modal, setModal] = useState(null); // 'create' | 'edit'
  const [editingFAQ, setEditingFAQ] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState(INIT_FORM);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const { data: faqsData, isLoading: faqsLoading, isError: faqsError } = useFaqList();
  const { data: categoriesData, isLoading: catsLoading, isError: catsError } = useFaqCategories();

  const faqs = faqsData || [];
  const categories = useMemo(
    () => [{ value: 'ALL', label: 'All Categories' }, ...(categoriesData || [])],
    [categoriesData]
  );
  const loading = faqsLoading || catsLoading;

  useEffect(() => {
    if (faqsError || catsError) show('Failed to load FAQs', 'error');
  }, [faqsError, catsError, show]);

  const queryClient = useQueryClient();

  const createFaq = useMutation({
    mutationFn: (payload) => api.post('/faq', payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.faqs.all }),
  });

  const updateFaq = useMutation({
    mutationFn: ({ id, payload }) => api.patch(`/faq/${id}`, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.faqs.all }),
  });

  const deleteFaq = useMutation({
    mutationFn: (id) => api.delete(`/faq/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.faqs.all }),
  });

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

  // ── Pagination (client-side; FAQs load as one batch) ───────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedFaqs = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleSearch = (v) => { setSearchQuery(v); setPage(1); };
  const handleCategory = (v) => { setSelectedCategory(v); setPage(1); };

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
        await createFaq.mutateAsync(form);
        show('FAQ created', 'success');
      } else {
        await updateFaq.mutateAsync({ id: editingFAQ._id, payload: form });
        show('FAQ updated', 'success');
      }
      closeModal();
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
      await deleteFaq.mutateAsync(deleteTarget._id);
      show('FAQ deleted', 'success');
      setDeleteTarget(null);
    } catch {
      show('Failed to delete FAQ', 'error');
    }
  };

  // Toggle active
  const handleToggle = async (faq) => {
    try {
      await updateFaq.mutateAsync({ id: faq._id, payload: { isActive: !faq.isActive } });
      show(faq.isActive ? 'FAQ hidden from employees' : 'FAQ is now visible', 'success');
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

  if (loading) {
    return (
      <div className="p-7 h-[calc(100vh-3rem)] flex flex-col">
        <div className="flex justify-between items-start mb-3 flex-shrink-0">
          <div>
            <h1 className="text-xl  font-bold text-brand-black">FAQ Management</h1>
          </div>
        </div>
        <div className="flex items-center justify-center p-16 flex-1">
          <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const clearFilters = () => { setSearchQuery(''); setSelectedCategory('ALL'); setPage(1); };

  return (
    <div className="p-7 h-[calc(100vh-4rem)] flex flex-col">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex justify-between items-start mb-3 flex-shrink-0">
        <div>
          <h1 className="text-xl  font-bold text-brand-black">FAQ Management</h1>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-2 py-1 bg-brand-red text-white rounded-lg text-sm font-semibold hover:bg-brand-red-dark transition-colors flex-shrink-0"
        >
          <Plus className="w-3 h-3" />
          Add FAQ
        </button>
      </div>

      {/* ── Stats row ────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-card px-5 py-3 mb-5 flex items-center gap-x-6 flex-wrap flex-shrink-0">
        <StatCard label="Total FAQs" value={stats.total} />
        <StatCard label="Visible" value={stats.active} />
        <StatCard label="Hidden" value={stats.hidden} />
      </div>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-5 flex-wrap flex-shrink-0">
        <div className="relative min-w-[220px] flex-1 sm:flex-none">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />

          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search questions and answers…"
            className="w-full h-10 pl-10 pr-4 rounded-lg border border-gray-300 focus-brand text-sm"
          />
        </div>
        <select
          value={selectedCategory}
          onChange={e => handleCategory(e.target.value)}
          className="h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm bg-white cursor-pointer"
        >
          {categories.map(cat => (
            <option key={cat.value} value={cat.value}>{cat.label}</option>
          ))}
        </select>
      </div>

      {/* ── FAQ Table ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-card border border-gray-100 overflow-hidden flex flex-col flex-1 min-h-0">
        {/* Table header */}
        {filtered.length > 0 && (
          <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50">
            <span className="w-6 flex-shrink-0" />
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider w-24">Category</span>
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider flex-1">Question</span>
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider w-14 text-center">Status</span>
            <span className="w-24 flex-shrink-0" />
          </div>
        )}

        {filtered.length === 0 ? (
          hasFilters ? (
            <EmptyState
              icon={HelpCircle}
              title="No FAQs match your filters"
              description="Try adjusting the search or category."
              action={<button onClick={clearFilters} className="text-sm text-brand-red font-semibold hover:underline">Clear filters</button>}
            />
          ) : (
            <EmptyState
              icon={HelpCircle}
              title="No FAQs yet"
              description="Create your first FAQ to help employees."
              action={
                <button onClick={openCreate}
                  className="flex items-center gap-1.5 px-2 py-1 bg-brand-red text-white rounded-lg text-sm font-semibold hover:bg-brand-red-dark transition-colors mx-auto">
                  <Plus className="w-3 h-3" />Add FAQ
                </button>
              }
            />
          )
        ) : (
          <div className="overflow-auto flex-1 scrollbar-none">
            {pagedFaqs.map(faq => {
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
          <div className="px-5 py-2.5 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-400">
              Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length} FAQ{filtered.length !== 1 ? 's' : ''}
              {hasFilters && <button onClick={clearFilters} className="ml-2 text-brand-red hover:underline">Clear filters</button>}
            </p>
          </div>
        )}
      </div>

      {/* Pagination sticky footer */}
      <div className="flex-shrink-0 border-t border-gray-100">
        {filtered.length > 0 && (
          <div className="pt-3 px-4 pb-0 text-xs text-gray-400">
            {filtered.length} FAQ(s) · page {safePage} of {totalPages}
          </div>
        )}
        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          onPageChange={setPage}
        />
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
