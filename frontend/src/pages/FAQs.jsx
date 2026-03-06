/* pages/FAQs.jsx */
import { useState, useEffect } from 'react';
import api from '../utils/api';
import Modal from '../components/Modal';
import { LoadingPage } from '../components/LoadingSpinner';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
  HelpCircle,
} from 'lucide-react';

export default function FAQs() {
  const [faqs, setFaqs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [modal, setModal] = useState(null); // 'create' | 'edit'
  const [editingFAQ, setEditingFAQ] = useState(null);
  const [formData, setFormData] = useState({
    question: '',
    answer: '',
    category: 'GENERAL',
    order: 0,
    isActive: true,
  });

  // Load FAQs and categories
  const loadData = async () => {
    try {
      setLoading(true);
      const [faqsRes, catsRes] = await Promise.all([
        api.get('/faq/all'),
        api.get('/faq/categories'),
      ]);
      setFaqs(faqsRes.data.data || []);
      setCategories([{ value: 'ALL', label: 'All Categories' }, ...(catsRes.data.data || [])]);
    } catch (err) {
      console.error('Failed to load FAQs:', err);
      alert('Failed to load FAQs. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter FAQs
  const filteredFAQs = faqs.filter((faq) => {
    const matchesCategory = selectedCategory === 'ALL' || faq.category === selectedCategory;
    const matchesSearch =
      !searchQuery ||
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Open create modal
  const handleCreate = () => {
    setFormData({
      question: '',
      answer: '',
      category: 'GENERAL',
      order: 0,
      isActive: true,
    });
    setModal('create');
  };

  // Open edit modal
  const handleEdit = (faq) => {
    setEditingFAQ(faq);
    setFormData({
      question: faq.question,
      answer: faq.answer,
      category: faq.category,
      order: faq.order,
      isActive: faq.isActive,
    });
    setModal('edit');
  };

  // Delete FAQ
  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this FAQ?')) return;
    try {
      await api.delete(`/faq/${id}`);
      loadData();
    } catch (err) {
      console.error('Failed to delete FAQ:', err);
      alert('Failed to delete FAQ. Please try again.');
    }
  };

  // Save FAQ (create or update)
  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (modal === 'create') {
        await api.post('/faq', formData);
      } else {
        await api.patch(`/faq/${editingFAQ._id}`, formData);
      }
      setModal(null);
      setEditingFAQ(null);
      loadData();
    } catch (err) {
      console.error('Failed to save FAQ:', err);
      alert(err.response?.data?.message || 'Failed to save FAQ. Please try again.');
    }
  };

  // Toggle FAQ active status
  const handleToggleActive = async (faq) => {
    try {
      await api.patch(`/faq/${faq._id}`, { isActive: !faq.isActive });
      loadData();
    } catch (err) {
      console.error('Failed to toggle FAQ status:', err);
      alert('Failed to update FAQ status. Please try again.');
    }
  };

  if (loading) return <LoadingPage />;

  return (
    <div className="p-7 h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-brand-black">FAQ Management</h1>
          <p className="text-gray-500 mt-1">Manage frequently asked questions for employees</p>
        </div>
        <button
          onClick={handleCreate}
          className="btn-brand flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm"
        >
          <Plus className="w-4 h-4" />
          Add FAQ
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search FAQs..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-red/20 text-sm"
          />
        </div>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-red/20 text-sm"
        >
          {categories.map((cat) => (
            <option key={cat.value} value={cat.value}>
              {cat.label}
            </option>
          ))}
        </select>
      </div>

      {/* FAQ List */}
      <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-y-auto h-full">
          {filteredFAQs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <HelpCircle className="w-12 h-12 mb-4" />
              <p className="text-lg font-medium">No FAQs found</p>
              <p className="text-sm">Create your first FAQ to help employees</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredFAQs.map((faq) => (
                <div
                  key={faq._id}
                  className={`p-4 hover:bg-gray-50 transition-colors ${!faq.isActive ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                          {categories.find((c) => c.value === faq.category)?.label || faq.category}
                        </span>
                        {!faq.isActive && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs rounded-full">
                            Inactive
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-gray-900 mb-2">{faq.question}</h3>
                      <p className="text-sm text-gray-600 line-clamp-2">{faq.answer}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleToggleActive(faq)}
                        className={`p-2 rounded-lg transition-colors ${
                          faq.isActive
                            ? 'text-green-600 hover:bg-green-50'
                            : 'text-gray-400 hover:bg-gray-100'
                        }`}
                        title={faq.isActive ? 'Deactivate' : 'Activate'}
                      >
                        {faq.isActive ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleEdit(faq)}
                        className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(faq._id)}
                        className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      <Modal
        open={!!modal}
        onClose={() => {
          setModal(null);
          setEditingFAQ(null);
        }}
        title={modal === 'create' ? 'Create FAQ' : 'Edit FAQ'}
        large
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Question</label>
            <input
              type="text"
              value={formData.question}
              onChange={(e) => setFormData({ ...formData, question: e.target.value })}
              required
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-red/20"
              placeholder="Enter the question..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Answer</label>
            <textarea
              value={formData.answer}
              onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
              required
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-red/20 resize-none"
              placeholder="Enter the answer..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-red/20"
              >
                {categories
                  .filter((c) => c.value !== 'ALL')
                  .map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Order</label>
              <input
                type="number"
                value={formData.order}
                onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 0 })}
                min="0"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-red/20"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="w-4 h-4 text-brand-red rounded border-gray-300 focus:ring-brand-red"
            />
            <label htmlFor="isActive" className="text-sm text-gray-700">
              Active (visible to employees)
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => {
                setModal(null);
                setEditingFAQ(null);
              }}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-brand px-4 py-2 rounded-lg font-semibold"
            >
              {modal === 'create' ? 'Create' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
