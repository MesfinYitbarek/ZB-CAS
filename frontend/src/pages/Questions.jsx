// pages/Questions.jsx
import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, ChevronLeft, ChevronRight, GripVertical, X } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import api from '../utils/api';

const TYPES = [
  'MCQ',
  'Rating',
  'TrueFalse',
  'MultiSelect',
  'Matching',
  'Ordering',
  'ScenarioMCQ',
  'DragDropClassification',
];

const TYPE_LABELS = {
  MCQ: 'Multiple Choice',
  Rating: 'Rating (1-5)',
  TrueFalse: 'True / False',
  MultiSelect: 'Multi-Select',
  Matching: 'Matching',
  Ordering: 'Ordering',
  ScenarioMCQ: 'Scenario MCQ',
  DragDropClassification: 'Drag & Drop Classification',
};

const TYPE_BADGES = {
  MCQ: 'bg-blue-100 text-blue-700',
  Rating: 'bg-amber-100 text-amber-700',
  TrueFalse: 'bg-emerald-100 text-emerald-700',
  MultiSelect: 'bg-cyan-100 text-cyan-700',
  Matching: 'bg-rose-100 text-rose-700',
  Ordering: 'bg-orange-100 text-orange-700',
  ScenarioMCQ: 'bg-indigo-100 text-indigo-700',
  DragDropClassification: 'bg-teal-100 text-teal-700',
};

// ─── Default form state for a single question ──────────────────────────────
const initQuestionForm = () => ({
  type: 'MCQ',
  text: '',
  score: 1,
  options: ['', '', '', ''],
  correctAnswer: '',
  correctAnswers: [],
  scenario: '',
  matchingPairs: [{ left: '', right: '' }, { left: '', right: '' }],
  correctOrder: ['', ''],
  categories: { '': [''] },
});

// ─── Default batch form state ──────────────────────────────────────────────
const initBatchForm = () => ({
  competencyId: '',
  questions: [initQuestionForm()],
});

export default function Questions() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [competencies, setCompetencies] = useState([]);
  const [filterComp, setFilterComp] = useState('');
  const [filterType, setFilterType] = useState('');
  const [modal, setModal] = useState(null);   // 'create' | 'edit' | null
  const [selected, setSelected] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);
  const { show } = useToast();

  const [pagination, setPagination] = useState({
    page: 1, limit: 10, total: 0, totalPages: 0,
  });

  const [batchForm, setBatchForm] = useState(initBatchForm());
  const [editForm, setEditForm] = useState(null);

  // ─── Fetch competencies once ────────────────────────────────────────────
  useEffect(() => {
    api.get('/competencies')
      .then(({ data }) => setCompetencies(data.data.competencies))
      .catch(() => { });
  }, []);

  // ─── Fetch questions (with filters & pagination) ────────────────────────
  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: pagination.page, limit: pagination.limit };
      if (filterComp) params.competencyId = filterComp;
      if (filterType) params.type = filterType;

      const { data } = await api.get('/questions', { params });
      setItems(data.data.questions);

      if (data.data.pagination) {
        setPagination((prev) => ({
          ...prev,
          total: data.data.pagination.total,
          totalPages: Math.ceil(data.data.pagination.total / pagination.limit),
        }));
      }
    } catch (_) {
      show('Failed to load questions.', 'error');
    }
    setLoading(false);
  }, [filterComp, filterType, pagination.page, pagination.limit]);

  useEffect(() => { fetch(); }, [fetch]);

  // ─── Modal helpers ──────────────────────────────────────────────────────
  const openCreate = () => {
    setBatchForm(initBatchForm());
    setModal('create');
  };

  const openEdit = (q) => {
    const form = {
      competencyId: q.competencyId?._id || '',
      type: q.type,
      text: q.text,
      score: q.score ?? 1,
      options: q.options?.length ? [...q.options] : ['', '', '', ''],
      correctAnswer: q.correctAnswer || '',
      correctAnswers: q.correctAnswers || [],
      scenario: q.scenario || '',
      matchingPairs: q.matchingPairs?.length
        ? q.matchingPairs.map((p) => ({ left: p.left, right: p.right }))
        : [{ left: '', right: '' }, { left: '', right: '' }],
      correctOrder: q.correctOrder?.length ? [...q.correctOrder] : ['', ''],
      categories: q.categories || { '': [''] },
    };
    setEditForm(form);
    setSelected(q);
    setModal('edit');
  };

  // ─── Build payload for a single question ───────────────────────────────
  const buildQuestionPayload = (q, competencyId) => {
    const base = {
      competencyId,
      type: q.type,
      text: q.text,
      score: Number(q.score) || 1,
    };

    switch (q.type) {
      case 'MCQ':
      case 'ScenarioMCQ':
        return {
          ...base,
          scenario: q.type === 'ScenarioMCQ' ? q.scenario : undefined,
          options: q.options.filter(Boolean),
          correctAnswer: q.correctAnswer || null,
        };
      case 'TrueFalse':
        return {
          ...base,
          options: ['True', 'False'],
          correctAnswer: q.correctAnswer || null,
        };
      case 'Rating':
        return base;
      case 'MultiSelect':
        return {
          ...base,
          options: q.options.filter(Boolean),
          correctAnswers: q.correctAnswers.filter(Boolean),
        };
      case 'Matching':
        return {
          ...base,
          matchingPairs: q.matchingPairs.filter((p) => p.left && p.right),
        };
      case 'Ordering':
        return {
          ...base,
          correctOrder: q.correctOrder.filter(Boolean),
        };
      case 'DragDropClassification': {
        const cats = {};
        Object.entries(q.categories).forEach(([cat, items]) => {
          const trimmed = cat.trim();
          if (trimmed) cats[trimmed] = (items || []).filter((i) => i.trim());
        });
        return { ...base, categories: cats };
      }
      default:
        return base;
    }
  };

  // ─── Save (batch create or single edit) ────────────────────────────────
  const handleSave = async () => {
    try {
      if (modal === 'create') {
        // Batch create
        const questions = batchForm.questions
          .filter(q => q.text.trim())
          .map(q => buildQuestionPayload(q, batchForm.competencyId));

        if (questions.length === 0) {
          show('Please add at least one question.', 'error');
          return;
        }

        await api.post('/questions/batch', { questions });
        show(`${questions.length} question(s) created successfully.`, 'success');
      } else {
        // Single edit
        const payload = buildQuestionPayload(editForm, editForm.competencyId);
        await api.put(`/questions/${selected._id}`, payload);
        show('Question updated.', 'success');
      }
      setModal(null);
      fetch();
    } catch (err) {
      show(err.response?.data?.message || 'Save failed.', 'error');
    }
  };

  // ─── Delete ─────────────────────────────────────────────────────────────
  const confirmDelete = (q) => setDeleteModal(q);

  const handleDelete = async () => {
    if (!deleteModal) return;
    try {
      await api.delete(`/questions/${deleteModal._id}`);
      show('Question deleted.', 'success');
      setDeleteModal(null);
      fetch();
    } catch (err) {
      show(err.response?.data?.message || 'Failed.', 'error');
      setDeleteModal(null);
    }
  };

  // ─── Batch form helpers ─────────────────────────────────────────────────
  const addQuestion = () => {
    setBatchForm({
      ...batchForm,
      questions: [...batchForm.questions, initQuestionForm()],
    });
  };

  const removeQuestion = (index) => {
    if (batchForm.questions.length <= 1) return;
    setBatchForm({
      ...batchForm,
      questions: batchForm.questions.filter((_, i) => i !== index),
    });
  };

  const updateQuestion = (index, updates) => {
    const questions = [...batchForm.questions];
    questions[index] = { ...questions[index], ...updates };
    setBatchForm({ ...batchForm, questions });
  };

  // ─── Pagination ─────────────────────────────────────────────────────────
  const goToPage = (page) => {
    if (page >= 1 && page <= pagination.totalPages) {
      setPagination((prev) => ({ ...prev, page }));
    }
  };
  const handlePageSizeChange = (e) => {
    const newLimit = parseInt(e.target.value, 10);
    setPagination({ page: 1, limit: newLimit, total: pagination.total, totalPages: Math.ceil(pagination.total / newLimit) });
  };
  const handleFilterComp = (v) => { setFilterComp(v); setPagination((p) => ({ ...p, page: 1 })); };
  const handleFilterType = (v) => { setFilterType(v); setPagination((p) => ({ ...p, page: 1 })); };

  // ─── Type-specific form sections ────────────────────────────────────────
  const renderQuestionOptions = (q, index, isEdit = false) => {
    const form = isEdit ? editForm : q;
    const setForm = isEdit 
      ? setEditForm 
      : (updates) => updateQuestion(index, updates);

    switch (form.type) {
      case 'MCQ':
      case 'ScenarioMCQ':
        return (
          <div>
            {form.type === 'ScenarioMCQ' && (
              <div className="mb-3">
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Scenario</label>
                <textarea
                  rows={3}
                  value={form.scenario}
                  onChange={(e) => setForm({ ...form, scenario: e.target.value })}
                  placeholder="Describe the scenario..."
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 focus-brand text-sm resize-none"
                />
              </div>
            )}
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Options</label>
            {form.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <input
                  type="radio"
                  checked={form.correctAnswer === opt && opt !== ''}
                  onChange={() => setForm({ ...form, correctAnswer: opt })}
                  className="w-4 h-4 text-brand-red focus:ring-brand-red"
                />
                <input
                  value={opt}
                  onChange={(e) => {
                    const o = [...form.options];
                    const prev = o[i];
                    o[i] = e.target.value;
                    setForm({
                      ...form,
                      options: o,
                      correctAnswer: form.correctAnswer === prev ? e.target.value : form.correctAnswer,
                    });
                  }}
                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  className="flex-1 h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm"
                />
                {form.options.length > 2 && (
                  <button type="button" onClick={() => {
                    const o = form.options.filter((_, idx) => idx !== i);
                    setForm({ ...form, options: o, correctAnswer: form.correctAnswer === opt ? '' : form.correctAnswer });
                  }} className="p-1 text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setForm({ ...form, options: [...form.options, ''] })}
              className="text-sm text-brand-red hover:underline mt-1">+ Add option</button>
          </div>
        );

      case 'TrueFalse':
        return (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Correct Answer</label>
            <select value={form.correctAnswer} onChange={(e) => setForm({ ...form, correctAnswer: e.target.value })}
              className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm">
              <option value="">— Select —</option>
              <option value="True">True</option>
              <option value="False">False</option>
            </select>
          </div>
        );

      case 'Rating':
        return <p className="text-sm text-gray-500">Rating questions are auto-scored proportionally (1-5 scale).</p>;

      case 'MultiSelect':
        return (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Options (check correct answers)</label>
            {form.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={form.correctAnswers.includes(opt) && opt !== ''}
                  onChange={(e) => {
                    const ca = [...form.correctAnswers];
                    if (e.target.checked && opt) ca.push(opt);
                    else {
                      const idx = ca.indexOf(opt);
                      if (idx > -1) ca.splice(idx, 1);
                    }
                    setForm({ ...form, correctAnswers: ca });
                  }}
                  className="w-4 h-4 text-brand-red focus:ring-brand-red rounded"
                />
                <input
                  value={opt}
                  onChange={(e) => {
                    const o = [...form.options];
                    const prev = o[i];
                    o[i] = e.target.value;
                    const ca = form.correctAnswers.map((a) => (a === prev ? e.target.value : a));
                    setForm({ ...form, options: o, correctAnswers: ca });
                  }}
                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  className="flex-1 h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm"
                />
                {form.options.length > 2 && (
                  <button type="button" onClick={() => {
                    const o = form.options.filter((_, idx) => idx !== i);
                    const ca = form.correctAnswers.filter((a) => a !== opt);
                    setForm({ ...form, options: o, correctAnswers: ca });
                  }} className="p-1 text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setForm({ ...form, options: [...form.options, ''] })}
              className="text-sm text-brand-red hover:underline mt-1">+ Add option</button>
            <p className="text-xs text-gray-500 mt-1">Partial credit: hits minus misses.</p>
          </div>
        );

      case 'Matching':
        return (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Matching Pairs</label>
            <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-center">
              <span className="text-xs font-semibold text-gray-500 uppercase">Left</span>
              <span />
              <span className="text-xs font-semibold text-gray-500 uppercase">Right</span>
              <span />
              {form.matchingPairs.map((pair, i) => (
                <>
                  <input key={`l-${i}`} value={pair.left}
                    onChange={(e) => { const p = [...form.matchingPairs]; p[i] = { ...p[i], left: e.target.value }; setForm({ ...form, matchingPairs: p }); }}
                    placeholder={`Term ${i + 1}`}
                    className="h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm" />
                  <span key={`a-${i}`} className="text-gray-400 text-center">↔</span>
                  <input key={`r-${i}`} value={pair.right}
                    onChange={(e) => { const p = [...form.matchingPairs]; p[i] = { ...p[i], right: e.target.value }; setForm({ ...form, matchingPairs: p }); }}
                    placeholder={`Match ${i + 1}`}
                    className="h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm" />
                  {form.matchingPairs.length > 2 && (
                    <button key={`d-${i}`} type="button" onClick={() => {
                      setForm({ ...form, matchingPairs: form.matchingPairs.filter((_, idx) => idx !== i) });
                    }} className="p-1 text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                  )}
                  {form.matchingPairs.length <= 2 && <span key={`s-${i}`} />}
                </>
              ))}
            </div>
            <button type="button" onClick={() => setForm({ ...form, matchingPairs: [...form.matchingPairs, { left: '', right: '' }] })}
              className="text-sm text-brand-red hover:underline mt-2">+ Add pair</button>
            <p className="text-xs text-gray-500 mt-1">Partial credit per correct pair.</p>
          </div>
        );

      case 'Ordering':
        return (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Items in Correct Order</label>
            {form.correctOrder.map((item, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <span className="w-7 h-7 flex items-center justify-center bg-gray-100 rounded text-xs font-bold text-gray-500">{i + 1}</span>
                <GripVertical className="w-4 h-4 text-gray-300" />
                <input value={item}
                  onChange={(e) => { const o = [...form.correctOrder]; o[i] = e.target.value; setForm({ ...form, correctOrder: o }); }}
                  placeholder={`Step ${i + 1}`}
                  className="flex-1 h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm" />
                {form.correctOrder.length > 2 && (
                  <button type="button" onClick={() => setForm({ ...form, correctOrder: form.correctOrder.filter((_, idx) => idx !== i) })}
                    className="p-1 text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setForm({ ...form, correctOrder: [...form.correctOrder, ''] })}
              className="text-sm text-brand-red hover:underline mt-1">+ Add item</button>
            <p className="text-xs text-gray-500 mt-1">Partial credit per correct position.</p>
          </div>
        );

      case 'DragDropClassification':
        return (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Categories & Items</label>
            {Object.entries(form.categories).map(([cat, catItems], ci) => (
              <div key={ci} className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <input value={cat}
                    onChange={(e) => {
                      const newCats = {};
                      Object.entries(form.categories).forEach(([k, v], idx) => {
                        newCats[idx === ci ? e.target.value : k] = v;
                      });
                      setForm({ ...form, categories: newCats });
                    }}
                    placeholder={`Category ${ci + 1}`}
                    className="flex-1 h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm font-semibold" />
                  {Object.keys(form.categories).length > 2 && (
                    <button type="button" onClick={() => {
                      const newCats = { ...form.categories };
                      delete newCats[cat];
                      setForm({ ...form, categories: newCats });
                    }} className="p-1 text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                  )}
                </div>
                {(catItems || []).map((item, ii) => (
                  <div key={ii} className="flex items-center gap-2 mb-1 ml-4">
                    <span className="text-gray-400 text-xs">•</span>
                    <input value={item}
                      onChange={(e) => {
                        const newCats = { ...form.categories };
                        const arr = [...(newCats[cat] || [])];
                        arr[ii] = e.target.value;
                        newCats[cat] = arr;
                        setForm({ ...form, categories: newCats });
                      }}
                      placeholder={`Item ${ii + 1}`}
                      className="flex-1 h-9 px-3 rounded-lg border border-gray-200 focus-brand text-sm" />
                    {(catItems || []).length > 1 && (
                      <button type="button" onClick={() => {
                        const newCats = { ...form.categories };
                        newCats[cat] = (newCats[cat] || []).filter((_, idx) => idx !== ii);
                        setForm({ ...form, categories: newCats });
                      }} className="p-1 text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={() => {
                  const newCats = { ...form.categories };
                  newCats[cat] = [...(newCats[cat] || []), ''];
                  setForm({ ...form, categories: newCats });
                }} className="text-xs text-brand-red hover:underline mt-1 ml-4">+ Add item</button>
              </div>
            ))}
            <button type="button" onClick={() => {
              const newCats = { ...form.categories, '': [''] };
              setForm({ ...form, categories: newCats });
            }} className="text-sm text-brand-red hover:underline">+ Add category</button>
            <p className="text-xs text-gray-500 mt-1">Partial credit per correctly classified item.</p>
          </div>
        );

      default:
        return null;
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-7">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-black">Question Bank</h1>
          <p className="text-gray-500 mt-1">Manage competency-based questions across all types.</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors">
          <Plus className="w-4 h-4" /> Add Questions
        </button>
      </div>

      {/* Filters + page size */}
      <div className="flex justify-between items-center gap-3 mb-6 flex-wrap">
        <div className="flex gap-3 flex-wrap">
          <select value={filterComp} onChange={(e) => handleFilterComp(e.target.value)}
            className="h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm flex-1 min-w-[200px]">
            <option value="">All Competencies</option>
            {competencies.map((c) => (
              <option key={c._id} value={c._id}>{c.name} ({c.category})</option>
            ))}
          </select>
          <select value={filterType} onChange={(e) => handleFilterType(e.target.value)}
            className="h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm w-56">
            <option value="">All Types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Show:</span>
          <select value={pagination.limit} onChange={handlePageSizeChange}
            className="px-3 py-1.5 rounded-lg border border-gray-300 focus-brand text-sm">
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
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider w-44">Type</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider w-48">Competency</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider w-20">Score</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">No questions found.</td></tr>
                )}
                {items.map((q) => (
                  <tr key={q._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3 font-semibold text-sm text-brand-black-soft max-w-xs">
                      <span className="line-clamp-2">{q.text}</span>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${TYPE_BADGES[q.type] || 'bg-gray-100 text-gray-600'}`}>
                        {TYPE_LABELS[q.type] || q.type}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600">{q.competencyId?.name || '—'}</td>
                    <td className="px-6 py-3 text-right text-sm font-semibold text-gray-700">{q.score ?? 1}</td>
                    <td className="px-6 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(q)} className="p-1.5 hover:bg-gray-100 rounded transition-colors">
                          <Edit2 className="w-4 h-4 text-gray-500" />
                        </button>
                        <button onClick={() => confirmDelete(q)} className="p-1.5 hover:bg-red-50 rounded transition-colors">
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

      {/* Pagination */}
      {pagination.total > pagination.limit && (
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-gray-200">
          <div className="text-sm text-gray-600">
            Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} questions
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => goToPage(pagination.page - 1)} disabled={pagination.page === 1}
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50">
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>
            <div className="flex items-center gap-1">
              {(() => {
                const pages = [];
                const maxVisible = 5;
                if (pagination.totalPages <= maxVisible) {
                  for (let i = 1; i <= pagination.totalPages; i++) pages.push(i);
                } else {
                  let start = Math.max(1, pagination.page - Math.floor(maxVisible / 2));
                  let end = Math.min(pagination.totalPages, start + maxVisible - 1);
                  if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
                  for (let i = start; i <= end; i++) pages.push(i);
                }
                return pages.map((n) => (
                  <button key={n} onClick={() => goToPage(n)}
                    className={`w-9 h-9 rounded-lg text-sm font-medium ${pagination.page === n ? 'bg-brand-red text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}>{n}</button>
                ));
              })()}
            </div>
            <button onClick={() => goToPage(pagination.page + 1)} disabled={pagination.page === pagination.totalPages}
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Create Modal (Batch) ─────────────────────────────────────────── */}
      <Modal open={modal === 'create'} onClose={() => setModal(null)} title="Add Questions" large>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Competency selector */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Competency (applies to all questions)</label>
            <select value={batchForm.competencyId} onChange={(e) => setBatchForm({ ...batchForm, competencyId: e.target.value })}
              className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm">
              <option value="">— Select —</option>
              {competencies.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </div>

          {/* Questions */}
          {batchForm.questions.map((q, idx) => (
            <div key={idx} className="p-4 border border-gray-200 rounded-lg bg-gray-50">
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-semibold text-gray-800">Question {idx + 1}</h4>
                {batchForm.questions.length > 1 && (
                  <button onClick={() => removeQuestion(idx)} className="text-red-600 hover:text-red-700 text-sm font-medium">
                    Remove
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {/* Type & Score */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Type</label>
                    <select
                      value={q.type}
                      onChange={(e) => updateQuestion(idx, {
                        ...initQuestionForm(),
                        type: e.target.value,
                        text: q.text,
                        score: q.score,
                      })}
                      className="w-full h-9 px-2 rounded-lg border border-gray-300 focus-brand text-sm">
                      {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Score</label>
                    <input type="number" min="0" step="0.5" value={q.score}
                      onChange={(e) => updateQuestion(idx, { score: e.target.value })}
                      className="w-full h-9 px-2 rounded-lg border border-gray-300 focus-brand text-sm" />
                  </div>
                </div>

                {/* Question text */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Question Text</label>
                  <textarea rows={2} value={q.text} onChange={(e) => updateQuestion(idx, { text: e.target.value })}
                    placeholder="Enter the question..."
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-300 focus-brand text-sm resize-none" />
                </div>

                {/* Type-specific options */}
                {renderQuestionOptions(q, idx)}
              </div>
            </div>
          ))}

          <button onClick={addQuestion}
            className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-brand-red hover:text-brand-red transition-colors font-medium">
            + Add Another Question
          </button>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setModal(null)}
            className="px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave}
            className="px-4 py-2 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors">
            Create {batchForm.questions.length} Question{batchForm.questions.length !== 1 ? 's' : ''}
          </button>
        </div>
      </Modal>

      {/* ── Edit Modal (Single) ───────────────────────────────────────────── */}
      <Modal open={modal === 'edit'} onClose={() => setModal(null)} title="Edit Question" large>
        {editForm && (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Competency</label>
                <select value={editForm.competencyId} onChange={(e) => setEditForm({ ...editForm, competencyId: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm">
                  <option value="">— Select —</option>
                  {competencies.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Question Type</label>
                <select
                  value={editForm.type}
                  onChange={(e) => setEditForm({
                    ...initQuestionForm(),
                    competencyId: editForm.competencyId,
                    text: editForm.text,
                    score: editForm.score,
                    type: e.target.value,
                  })}
                  className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm">
                  {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Score</label>
              <input type="number" min="0" step="0.5" value={editForm.score}
                onChange={(e) => setEditForm({ ...editForm, score: e.target.value })}
                className="w-32 h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Question Text</label>
              <textarea rows={3} value={editForm.text} onChange={(e) => setEditForm({ ...editForm, text: e.target.value })}
                placeholder="Enter the question..."
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus-brand text-sm resize-none" />
            </div>

            {renderQuestionOptions(editForm, 0, true)}
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setModal(null)}
            className="px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave}
            className="px-4 py-2 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors">
            Save
          </button>
        </div>
      </Modal>

      {/* ── Delete Confirmation Modal ────────────────────────────────────── */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setDeleteModal(null)}>
          <div className="bg-white p-6 rounded-xl shadow-lg max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Question</h3>
            <p className="text-gray-600 mb-1 text-sm">Are you sure you want to delete this question?</p>
            <p className="text-gray-500 text-xs mb-5 line-clamp-2">{deleteModal.text}</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteModal(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-semibold transition-colors">
                Cancel
              </button>
              <button onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg font-semibold transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}