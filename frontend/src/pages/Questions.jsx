import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import api from '../utils/api';

const TYPES = ['MCQ', 'Rating', 'TrueFalse', 'ShortAnswer'];
const TYPE_LABELS = {
  MCQ: 'Multiple Choice',
  Rating: 'Rating (1-5)',
  TrueFalse: 'True / False',
  ShortAnswer: 'Short Answer',
};

export default function Questions() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [competencies, setCompetencies] = useState([]);
  const [filterComp, setFilterComp] = useState('');
  const [filterType, setFilterType] = useState('');
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const { show } = useToast();
  
  // Pagination state
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0
  });

  const initForm = () => ({ competencyId: '', type: 'MCQ', text: '', options: ['', '', '', ''], correctAnswer: '' });
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
      if (filterType) params.type = filterType;
      
      const { data } = await api.get('/questions', { params });
      setItems(data.data.questions);
      
      // Update pagination from API response
      if (data.data.pagination) {
        setPagination(prev => ({
          ...prev,
          total: data.data.pagination.total,
          totalPages: Math.ceil(data.data.pagination.total / pagination.limit)
        }));
      }
    } catch (_) {
      show('Failed to load questions.', 'error');
    }
    setLoading(false);
  }, [filterComp, filterType, pagination.page, pagination.limit]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const openCreate = () => {
    setForm(initForm());
    setModal('create');
  };
  
  const openEdit = (q) => {
    setForm({
      competencyId: q.competencyId?._id || '',
      type: q.type,
      text: q.text,
      options: q.options?.length ? [...q.options] : ['', '', '', ''],
      correctAnswer: q.correctAnswer || '',
    });
    setSelected(q);
    setModal('edit');
  };

  const handleSave = async () => {
    try {
      const payload = {
        competencyId: form.competencyId,
        type: form.type,
        text: form.text,
        options: form.type === 'MCQ' ? form.options.filter(Boolean) : form.type === 'TrueFalse' ? ['True', 'False'] : [],
        correctAnswer: form.type === 'MCQ' || form.type === 'TrueFalse' ? form.correctAnswer : null,
      };
      if (modal === 'create') {
        await api.post('/questions', payload);
        show('Question created.', 'success');
      } else {
        await api.put(`/questions/${selected._id}`, payload);
        show('Question updated.', 'success');
      }
      setModal(null);
      fetch();
    } catch (err) {
      show(err.response?.data?.message || 'Save failed.', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this question?')) return;
    try {
      await api.delete(`/questions/${id}`);
      show('Question deleted.', 'success');
      fetch();
    } catch (err) {
      show(err.response?.data?.message || 'Failed.', 'error');
    }
  };

  const renderOptions = () => {
    if (form.type === 'MCQ') {
      return (
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Options & Correct Answer</label>
          {form.options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2 mb-2">
              <input
                type="radio"
                name="correctAnswer"
                checked={form.correctAnswer === opt && opt !== ''}
                onChange={() => setForm({ ...form, correctAnswer: opt })}
                className="w-4 h-4 text-brand-red focus:ring-brand-red"
              />
              <input
                value={opt}
                onChange={(e) => {
                  const o = [...form.options];
                  o[i] = e.target.value;
                  setForm({ ...form, options: o, correctAnswer: form.correctAnswer === form.options[i] ? e.target.value : form.correctAnswer });
                }}
                placeholder={`Option ${String.fromCharCode(65 + i)}`}
                className="flex-1 h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm"
              />
            </div>
          ))}
          <p className="text-xs text-gray-500 mt-1">Select the radio button to mark the correct answer.</p>
        </div>
      );
    }
    if (form.type === 'TrueFalse') {
      return (
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Correct Answer</label>
          <select value={form.correctAnswer} onChange={(e) => setForm({ ...form, correctAnswer: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm">
            <option value="">— Select —</option>
            <option value="True">True</option>
            <option value="False">False</option>
          </select>
        </div>
      );
    }
    if (form.type === 'Rating') {
      return <p className="text-sm text-gray-500">Rating questions are scored on a 1–5 scale. No correct answer needed.</p>;
    }
    if (form.type === 'ShortAnswer') {
      return <p className="text-sm text-gray-500">Short Answer questions require manual review by HR after submission.</p>;
    }
    return null;
  };

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

  // Handle filter changes
  const handleFilterComp = (value) => {
    setFilterComp(value);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleFilterType = (value) => {
    setFilterType(value);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  return (
    <div className="p-7">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-black">Question Bank</h1>
          <p className="text-gray-500 mt-1">Manage competency-based questions across all types.</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-5 py-2.5 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors">
          <Plus className="w-4 h-4" /> Add Question
        </button>
      </div>

      {/* Filters and pagination controls */}
      <div className="flex justify-between items-center gap-3 mb-6 flex-wrap">
        <div className="flex gap-3 flex-wrap">
          <select value={filterComp} onChange={(e) => handleFilterComp(e.target.value)} className="h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm flex-1 min-w-[200px]">
            <option value="">All Competencies</option>
            {competencies.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name} ({c.category})
              </option>
            ))}
          </select>
          <select value={filterType} onChange={(e) => handleFilterType(e.target.value)} className="h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm w-48">
            <option value="">All Types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        
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

      {/* Table */}
      <div className="bg-white rounded-xl shadow-card border border-gray-100 overflow-hidden mb-4">
        {loading ? (
          <div className="flex items-center justify-center p-16">
            <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Question</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider w-40">Type</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider w-48">Competency</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-gray-400">No questions found.</td>
                  </tr>
                )}
                {items.map((q) => (
                  <tr key={q._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3 font-semibold text-sm text-brand-black-soft max-w-xs">
                      <span className="line-clamp-2">{q.text}</span>
                    </td>
                    <td className="px-6 py-3">
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-semibold">{TYPE_LABELS[q.type]}</span>
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600">{q.competencyId?.name || '—'}</td>
                    <td className="px-6 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(q)} className="p-1.5 hover:bg-gray-100 rounded transition-colors">
                          <Edit2 className="w-4 h-4 text-gray-500" />
                        </button>
                        <button onClick={() => handleDelete(q._id)} className="p-1.5 hover:bg-red-50 rounded transition-colors">
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {pagination.total > pagination.limit && (
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-gray-200">
          <div className="text-sm text-gray-600">
            Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} questions
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

      {/* Modal */}
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? 'New Question' : 'Edit Question'} large>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Competency</label>
              <select value={form.competencyId} onChange={(e) => setForm({ ...form, competencyId: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm">
                <option value="">— Select —</option>
                {competencies.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Question Type</label>
              <select
                value={form.type}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value, correctAnswer: '', options: ['', '', '', ''] })
                }
                className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm"
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Question Text</label>
            <textarea rows={3} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder="Enter the question..." className="w-full px-3 py-2 rounded-lg border border-gray-300 focus-brand text-sm resize-none" />
          </div>
          {renderOptions()}
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