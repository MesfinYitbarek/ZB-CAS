// pages/Questions.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Edit2, Trash2, ChevronLeft, ChevronRight, GripVertical, X, Upload, FileText, Check } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import api from '../utils/api';

// Import document parsing libraries
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

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

// ─── Question type group ────────────────────────────────────────────────────
const initQuestionTypeGroup = () => ({
  type: 'MCQ',
  questions: [initQuestionForm()],
});

// ─── Default batch form state ──────────────────────────────────────────────
const initBatchForm = () => ({
  competencyId: '',
  questionGroups: [initQuestionTypeGroup()],
});

export default function Questions() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [competencies, setCompetencies] = useState([]);
  const [filterComp, setFilterComp] = useState('');
  const [filterType, setFilterType] = useState('');
  const [modal, setModal] = useState(null);   // 'create' | 'edit' | 'upload' | null
  const [selected, setSelected] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);
  const { show } = useToast();
  const fileInputRef = useRef(null);

  // ─── Bulk selection state ───────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleteModal, setBulkDeleteModal] = useState(false);

  const [pagination, setPagination] = useState({
    page: 1, limit: 10, total: 0, totalPages: 0,
  });

  const [batchForm, setBatchForm] = useState(initBatchForm());
  const [editForm, setEditForm] = useState(null);
  const [uploadedQuestions, setUploadedQuestions] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

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
      setSelectedIds(new Set()); // Clear selection on re-fetch

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

  // ─── Bulk selection helpers ─────────────────────────────────────────────
  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === items.length && items.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((q) => q._id)));
    }
  };

  const isAllSelected = items.length > 0 && selectedIds.size === items.length;
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < items.length;

  // ─── Modal helpers ──────────────────────────────────────────────────────
  const openCreate = () => {
    setBatchForm(initBatchForm());
    setModal('create');
  };

  const openUpload = () => {
    setUploadedQuestions(null);
    setUploadProgress(0);
    setModal('upload');
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

  // ─── Document Upload and Parsing ────────────────────────────────────────
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    console.log('Uploading file:', {
      name: file.name,
      type: file.type,
      size: file.size
    });

    const isTextFile = file.name.endsWith('.txt') || file.name.endsWith('.md') || file.type.includes('text');
    const isDocx = file.name.endsWith('.docx') || file.type.includes('wordprocessingml');
    const isDoc = file.name.endsWith('.doc') || file.type === 'application/msword';
    const isPdf = file.name.endsWith('.pdf') || file.type === 'application/pdf';

    if (!isTextFile && !isDocx && !isDoc && !isPdf) {
      show('Please upload a PDF, DOCX, or TXT file.', 'error');
      return;
    }

    setUploadLoading(true);
    setUploadProgress(10);

    try {
      let text = '';

      if (isPdf) {
        text = await extractTextFromPDF(file);
      } else if (isDocx) {
        text = await extractTextFromDOCX(file);
      } else {
        text = await extractTextFromPlain(file);
      }

      console.log('Extracted text:', text.substring(0, 200) + '...');

      setUploadProgress(70);

      const parsed = parseQuestionsFromText(text);
      console.log('Parsed questions:', parsed);

      setUploadProgress(100);

      if (parsed.length === 0) {
        show('No questions found in the document. Please check the format.', 'error');
        setUploadLoading(false);
        return;
      }

      const grouped = groupQuestionsByType(parsed);
      setUploadedQuestions({
        competencyId: '',
        questionGroups: grouped,
      });
      show(`Successfully extracted ${parsed.length} question(s).`, 'success');
    } catch (err) {
      console.error('Parse error:', err);
      show('Failed to parse document. Please check the format. Error: ' + err.message, 'error');
    }
    setUploadLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ─── Extract text from PDF using pdf.js ─────────────────────────────────
  const extractTextFromPDF = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target.result;
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

          let fullText = '';

          for (let i = 1; i <= pdf.numPages; i++) {
            setUploadProgress(10 + Math.floor((i / pdf.numPages) * 50));

            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';
          }

          resolve(fullText);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  // ─── Extract text from DOCX ─────────────────────────────────────────────
  const extractTextFromDOCX = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target.result;

          const result1 = await mammoth.extractRawText({
            arrayBuffer,
            options: {
              preserveEmptyParagraphs: true,
            }
          });

          const result2 = await mammoth.extractRawText({
            arrayBuffer,
            options: {
              preserveEmptyParagraphs: true,
              includeDefaultStyleMap: true,
            }
          });

          let text = result2.value || result1.value;

          if (!text.includes('\n') && text.length > 0) {
            console.log('No line breaks detected, adding artificial breaks');

            text = text
              .replace(/Type:/g, '\nType:')
              .replace(/Question \d+:/g, '\n$&')
              .replace(/Score:/g, '\nScore:')
              .replace(/Answer:/g, '\nAnswer:')
              .replace(/[a-d]\)/g, '\n$&')
              .replace(/(Paris|London) ->/g, '\n$&');
          }

          text = text
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/\n\s+/g, '\n')
            .replace(/[ \t]+/g, ' ')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .join('\n');

          console.log('Processed DOCX text with line breaks:', text);
          resolve(text);
        } catch (error) {
          console.error('Mammoth error:', error);
          reject(error);
        }
      };

      reader.onerror = (error) => {
        console.error('FileReader error:', error);
        reject(error);
      };

      reader.readAsArrayBuffer(file);
    });
  };

  // ─── Extract text from plain text file ─────────────────────────────────
  const extractTextFromPlain = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        console.log('Plain text extracted, length:', e.target.result.length);
        resolve(e.target.result);
      };

      reader.onerror = (e) => {
        console.error('FileReader error:', e);
        reject(new Error('Failed to read text file'));
      };

      reader.readAsText(file);
    });
  };

  const parseQuestionsFromText = (text) => {
    const questions = [];

    console.log('Parsing text:', text);

    let lines;

    if (text.includes('\n')) {
      lines = text.split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);
    } else {
      console.log('No newlines found, attempting intelligent splitting');

      const withBreaks = text
        .replace(/(Type:)/g, '\n$1')
        .replace(/(Question \d+:)/g, '\n$1')
        .replace(/(Score:)/g, '\n$1')
        .replace(/(Answer:)/g, '\n$1')
        .replace(/([a-d]\))/g, '\n$1')
        .replace(/(\w+ -> \w+)/g, '\n$1');

      lines = withBreaks.split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);
    }

    console.log('Processed lines:', lines);

    let currentQuestion = null;
    let currentType = 'MCQ';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.length < 2) continue;

      if (line.match(/^type\s*:\s*(.+)$/i)) {
        const match = line.match(/^type\s*:\s*(.+)$/i);
        const typeStr = match[1].trim().toUpperCase();

        const typeMap = {
          'MCQ': 'MCQ',
          'MULTIPLE CHOICE': 'MCQ',
          'MULTIPLECHOICE': 'MCQ',
          'TRUE/FALSE': 'TrueFalse',
          'TRUE FALSE': 'TrueFalse',
          'TRUEFALSE': 'TrueFalse',
          'RATING': 'Rating',
          'MULTISELECT': 'MultiSelect',
          'MULTI-SELECT': 'MultiSelect',
          'MATCHING': 'Matching',
          'ORDERING': 'Ordering',
          'SCENARIO MCQ': 'ScenarioMCQ',
          'SCENARIOMCQ': 'ScenarioMCQ',
          'DRAGDROP': 'DragDropClassification',
          'CLASSIFICATION': 'DragDropClassification',
        };

        currentType = typeMap[typeStr] || 'MCQ';
        continue;
      }

      if (line.match(/^question\s*\d*\s*:\s*(.+)$/i) || line.match(/^q\d*\s*:\s*(.+)$/i)) {
        if (currentQuestion && currentQuestion.text) {
          questions.push(currentQuestion);
        }

        const match = line.match(/^question\s*\d*\s*:\s*(.+)$/i) || line.match(/^q\d*\s*:\s*(.+)$/i);
        const questionText = match ? match[1].trim() : line;

        currentQuestion = {
          ...initQuestionForm(),
          type: currentType,
          text: questionText,
        };
        continue;
      }

      if (currentQuestion) {
        if (line.match(/^score\s*:\s*(\d+(?:\.\d+)?)/i)) {
          const match = line.match(/^score\s*:\s*(\d+(?:\.\d+)?)/i);
          if (match) {
            currentQuestion.score = parseFloat(match[1]) || 1;
          }
          continue;
        }

        if (line.match(/^answer\s*:\s*(.+)$/i)) {
          const match = line.match(/^answer\s*:\s*(.+)$/i);
          const answer = match[1].trim();

          if (currentQuestion.type === 'TrueFalse') {
            currentQuestion.correctAnswer = answer.match(/true/i) ? 'True' : 'False';
          } else {
            currentQuestion.correctAnswer = answer;
          }
          continue;
        }

        if (line.match(/^[a-d]\)\s*(.+)$/i)) {
          const match = line.match(/^([a-d])\)\s*(.+)$/i);
          const optionLetter = match[1].toLowerCase();
          let optionText = match[2].trim();

          const isCorrect = optionText.includes('*');
          optionText = optionText.replace('*', '').trim();

          const index = optionLetter.charCodeAt(0) - 'a'.charCodeAt(0);

          if (!currentQuestion.options) {
            currentQuestion.options = ['', '', '', ''];
          }

          currentQuestion.options[index] = optionText;

          if (isCorrect) {
            currentQuestion.correctAnswer = optionText;
          }
          continue;
        }

        if (currentQuestion.type === 'Matching' && line.includes('->')) {
          const [left, right] = line.split('->').map(s => s.trim());

          if (!currentQuestion.matchingPairs) {
            currentQuestion.matchingPairs = [];
          }

          if (currentQuestion.matchingPairs.length === 1 &&
            currentQuestion.matchingPairs[0].left === '' &&
            currentQuestion.matchingPairs[0].right === '') {
            currentQuestion.matchingPairs[0] = { left, right };
          } else {
            currentQuestion.matchingPairs.push({ left, right });
          }
          continue;
        }
      }
    }

    if (currentQuestion && currentQuestion.text) {
      questions.push(currentQuestion);
    }

    console.log('Parsed questions:', questions);

    return questions.map(q => {
      if (q.type === 'MCQ' || q.type === 'MultiSelect' || q.type === 'ScenarioMCQ') {
        q.options = (q.options || []).filter(opt => opt && opt.length > 0);
        if (q.options.length === 0) {
          q.options = ['', '', '', ''];
        }
      }

      if (q.type === 'Matching') {
        q.matchingPairs = (q.matchingPairs || []).filter(p => p.left && p.right);
        if (q.matchingPairs.length === 0) {
          q.matchingPairs = [{ left: '', right: '' }, { left: '', right: '' }];
        }
      }

      return q;
    });
  };

  // ─── Group questions by type ────────────────────────────────────────────
  const groupQuestionsByType = (questions) => {
    const groups = [];
    let currentGroup = null;

    questions.forEach(q => {
      if (!currentGroup || currentGroup.type !== q.type) {
        currentGroup = {
          type: q.type,
          questions: [],
        };
        groups.push(currentGroup);
      }
      currentGroup.questions.push(q);
    });

    return groups;
  };

  // ─── Use uploaded questions ─────────────────────────────────────────────
  const useUploadedQuestions = () => {
    if (uploadedQuestions) {
      setBatchForm(uploadedQuestions);
      setModal('create');
      setUploadedQuestions(null);
    }
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
        Object.entries(q.categories || {}).forEach(([cat, items]) => {
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
        const allQuestions = [];
        batchForm.questionGroups.forEach(group => {
          group.questions
            .filter(q => q.text.trim())
            .forEach(q => {
              allQuestions.push(buildQuestionPayload(q, batchForm.competencyId));
            });
        });

        if (allQuestions.length === 0) {
          show('Please add at least one question.', 'error');
          return;
        }

        await api.post('/questions/batch', { questions: allQuestions });
        show(`${allQuestions.length} question(s) created successfully.`, 'success');
      } else {
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

  // ─── Single Delete ──────────────────────────────────────────────────────
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

  // ─── Bulk Delete ────────────────────────────────────────────────────────
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    try {
      await api.post('/questions/bulk-delete', { ids: Array.from(selectedIds) });
      show(`${selectedIds.size} question(s) deleted.`, 'success');
      setSelectedIds(new Set());
      setBulkDeleteModal(false);
      fetch();
    } catch (err) {
      show(err.response?.data?.message || 'Bulk delete failed.', 'error');
      setBulkDeleteModal(false);
    }
  };

  // ─── Batch form helpers ─────────────────────────────────────────────────
  const addQuestionGroup = () => {
    setBatchForm({
      ...batchForm,
      questionGroups: [...batchForm.questionGroups, initQuestionTypeGroup()],
    });
  };

  const removeQuestionGroup = (index) => {
    if (batchForm.questionGroups.length <= 1) return;
    setBatchForm({
      ...batchForm,
      questionGroups: batchForm.questionGroups.filter((_, i) => i !== index),
    });
  };

  const updateQuestionGroup = (groupIndex, updates) => {
    const groups = [...batchForm.questionGroups];
    groups[groupIndex] = { ...groups[groupIndex], ...updates };
    setBatchForm({ ...batchForm, questionGroups: groups });
  };

  const addQuestionToGroup = (groupIndex) => {
    const groups = [...batchForm.questionGroups];
    const newQuestion = initQuestionForm();
    newQuestion.type = groups[groupIndex].type;
    groups[groupIndex].questions.push(newQuestion);
    setBatchForm({ ...batchForm, questionGroups: groups });
  };

  const removeQuestionFromGroup = (groupIndex, questionIndex) => {
    const groups = [...batchForm.questionGroups];
    if (groups[groupIndex].questions.length <= 1) return;
    groups[groupIndex].questions = groups[groupIndex].questions.filter((_, i) => i !== questionIndex);
    setBatchForm({ ...batchForm, questionGroups: groups });
  };

  const updateQuestionInGroup = (groupIndex, questionIndex, updates) => {
    const groups = [...batchForm.questionGroups];
    groups[groupIndex].questions[questionIndex] = {
      ...groups[groupIndex].questions[questionIndex],
      ...updates,
    };
    setBatchForm({ ...batchForm, questionGroups: groups });
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
  const renderQuestionOptions = (q, groupIndex, questionIndex, isEdit = false) => {
    const form = isEdit ? editForm : q;
    const setForm = isEdit
      ? setEditForm
      : (updates) => updateQuestionInGroup(groupIndex, questionIndex, updates);

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
                  value={form.scenario || ''}
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
                  name={isEdit ? 'edit-correct' : `correct-${groupIndex}-${questionIndex}`}
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
            <select value={form.correctAnswer || ''} onChange={(e) => setForm({ ...form, correctAnswer: e.target.value })}
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
                  checked={form.correctAnswers?.includes(opt) && opt !== ''}
                  onChange={(e) => {
                    const ca = [...(form.correctAnswers || [])];
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
                    const ca = (form.correctAnswers || []).map((a) => (a === prev ? e.target.value : a));
                    setForm({ ...form, options: o, correctAnswers: ca });
                  }}
                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  className="flex-1 h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm"
                />
                {form.options.length > 2 && (
                  <button type="button" onClick={() => {
                    const o = form.options.filter((_, idx) => idx !== i);
                    const ca = (form.correctAnswers || []).filter((a) => a !== opt);
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
            <div className="space-y-2">
              {form.matchingPairs.map((pair, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-center">
                  <input
                    value={pair.left}
                    onChange={(e) => {
                      const p = [...form.matchingPairs];
                      p[i] = { ...p[i], left: e.target.value };
                      setForm({ ...form, matchingPairs: p });
                    }}
                    placeholder={`Term ${i + 1}`}
                    className="h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm"
                  />
                  <span className="text-gray-400">↔</span>
                  <input
                    value={pair.right}
                    onChange={(e) => {
                      const p = [...form.matchingPairs];
                      p[i] = { ...p[i], right: e.target.value };
                      setForm({ ...form, matchingPairs: p });
                    }}
                    placeholder={`Match ${i + 1}`}
                    className="h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm"
                  />
                  {form.matchingPairs.length > 2 && (
                    <button
                      type="button"
                      onClick={() => {
                        setForm({
                          ...form,
                          matchingPairs: form.matchingPairs.filter((_, idx) => idx !== i)
                        });
                      }}
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {form.matchingPairs.length <= 2 && <span className="w-8" />}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setForm({
                ...form,
                matchingPairs: [...form.matchingPairs, { left: '', right: '' }]
              })}
              className="text-sm text-brand-red hover:underline mt-2"
            >
              + Add pair
            </button>
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
                <input
                  value={item}
                  onChange={(e) => {
                    const o = [...form.correctOrder];
                    o[i] = e.target.value;
                    setForm({ ...form, correctOrder: o });
                  }}
                  placeholder={`Step ${i + 1}`}
                  className="flex-1 h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm"
                />
                {form.correctOrder.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setForm({
                      ...form,
                      correctOrder: form.correctOrder.filter((_, idx) => idx !== i)
                    })}
                    className="p-1 text-gray-400 hover:text-red-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setForm({ ...form, correctOrder: [...form.correctOrder, ''] })}
              className="text-sm text-brand-red hover:underline mt-1"
            >
              + Add item
            </button>
            <p className="text-xs text-gray-500 mt-1">Partial credit per correct position.</p>
          </div>
        );

      case 'DragDropClassification':
        return (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Categories & Items</label>
            {Object.entries(form.categories || { '': [''] }).map(([cat, catItems], ci) => (
              <div key={ci} className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    value={cat}
                    onChange={(e) => {
                      const newCats = {};
                      Object.entries(form.categories || {}).forEach(([k, v], idx) => {
                        newCats[idx === ci ? e.target.value : k] = v;
                      });
                      setForm({ ...form, categories: newCats });
                    }}
                    placeholder={`Category ${ci + 1}`}
                    className="flex-1 h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm font-semibold"
                  />
                  {Object.keys(form.categories || {}).length > 1 && cat !== '' && (
                    <button
                      type="button"
                      onClick={() => {
                        const newCats = { ...form.categories };
                        delete newCats[cat];
                        setForm({ ...form, categories: newCats });
                      }}
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {(catItems || []).map((item, ii) => (
                  <div key={ii} className="flex items-center gap-2 mb-1 ml-4">
                    <span className="text-gray-400 text-xs">•</span>
                    <input
                      value={item}
                      onChange={(e) => {
                        const newCats = { ...form.categories };
                        const arr = [...(newCats[cat] || [])];
                        arr[ii] = e.target.value;
                        newCats[cat] = arr;
                        setForm({ ...form, categories: newCats });
                      }}
                      placeholder={`Item ${ii + 1}`}
                      className="flex-1 h-9 px-3 rounded-lg border border-gray-200 focus-brand text-sm"
                    />
                    {(catItems || []).length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const newCats = { ...form.categories };
                          newCats[cat] = (newCats[cat] || []).filter((_, idx) => idx !== ii);
                          setForm({ ...form, categories: newCats });
                        }}
                        className="p-1 text-gray-400 hover:text-red-500"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const newCats = { ...form.categories };
                    newCats[cat] = [...(newCats[cat] || []), ''];
                    setForm({ ...form, categories: newCats });
                  }}
                  className="text-xs text-brand-red hover:underline mt-1 ml-4"
                >
                  + Add item
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                const newCats = { ...(form.categories || {}), '': [''] };
                setForm({ ...form, categories: newCats });
              }}
              className="text-sm text-brand-red hover:underline"
            >
              + Add category
            </button>
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
        <div className="flex gap-3">
          <button onClick={openUpload}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors">
            <Upload className="w-4 h-4" /> Upload Document
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors">
            <Plus className="w-4 h-4" /> Add Questions
          </button>
        </div>
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

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
              <span className="text-red-700 font-bold text-sm">{selectedIds.size}</span>
            </div>
            <span className="text-sm font-semibold text-red-800">
              {selectedIds.size} question{selectedIds.size !== 1 ? 's' : ''} selected
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-sm text-gray-600 hover:text-gray-800 font-medium transition-colors"
            >
              Clear Selection
            </button>
            <button
              onClick={() => setBulkDeleteModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors text-sm"
            >
              <Trash2 className="w-4 h-4" /> Delete Selected
            </button>
          </div>
        </div>
      )}

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
                  <th className="px-4 py-3 w-12">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = isSomeSelected;
                      }}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 text-brand-red focus:ring-brand-red rounded cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Question</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider w-44">Type</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider w-48">Competency</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider w-20">Score</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">No questions found.</td></tr>
                )}
                {items.map((q) => (
                  <tr key={q._id} className={`hover:bg-gray-50 transition-colors ${selectedIds.has(q._id) ? 'bg-red-50/50' : ''}`}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(q._id)}
                        onChange={() => toggleSelect(q._id)}
                        className="w-4 h-4 text-brand-red focus:ring-brand-red rounded cursor-pointer"
                      />
                    </td>
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

      {/* ── Upload Modal ──────────────────────────────────────────────────── */}
      <Modal open={modal === 'upload'} onClose={() => setModal(null)} title="Upload Questions Document">
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-blue-900 mb-2">Document Format Guidelines</h4>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>Start each question with &quot;Question:&quot; or &quot;Q:&quot; or a number (e.g., &quot;1.&quot;)</li>
              <li>Specify type with &quot;Type: MCQ&quot; (supports: MCQ, True/False, Rating, Multi-Select, Matching, Ordering, Scenario MCQ, Classification)</li>
              <li>For MCQ/Multi-Select, use &quot;a)&quot; or &quot;a.&quot; for options, mark correct with &quot;*&quot; or &quot;(correct)&quot;</li>
              <li>Specify &quot;Answer:&quot; or &quot;Correct:&quot; for the correct answer</li>
              <li>For Scenario MCQ, add &quot;Scenario: ...&quot; before options</li>
              <li>For Matching, use &quot;left item -&gt; right item&quot; format</li>
              <li>For Ordering, list items with &quot;1.&quot;, &quot;2.&quot;, etc.</li>
              <li>Optional: &quot;Score: 2&quot; to set point value</li>
            </ul>
          </div>

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-brand-red transition-colors">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <FileText className="w-12 h-12 mx-auto text-gray-400 mb-3" />
              <p className="text-sm font-medium text-gray-700 mb-1">
                Click to upload or drag and drop
              </p>
              <p className="text-xs text-gray-500">
                PDF, DOCX, or TXT (max 10MB)
              </p>
            </label>
          </div>

          {uploadLoading && (
            <div className="space-y-2">
              <div className="flex items-center justify-center p-4">
                <div className="w-8 h-8 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
                <span className="ml-3 text-gray-600">Parsing document...</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-brand-red h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-500 text-center">{uploadProgress}% complete</p>
            </div>
          )}

          {uploadedQuestions && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-green-900 mb-1">
                    Successfully extracted {uploadedQuestions.questionGroups.reduce((sum, g) => sum + g.questions.length, 0)} questions
                  </h4>
                  <p className="text-sm text-green-800 mb-3">
                    Review and edit the questions before creating them.
                  </p>
                  <button
                    onClick={useUploadedQuestions}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors text-sm"
                  >
                    Review &amp; Edit Questions
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setModal(null)}
            className="px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
            Close
          </button>
        </div>
      </Modal>

      {/* ── Create Modal (Batch with Groups) ─────────────────────────────── */}
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

          {/* Question Groups */}
          {batchForm.questionGroups.map((group, groupIndex) => (
            <div key={groupIndex} className="border-2 border-gray-200 rounded-lg p-4 bg-gray-50">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                  <h3 className="font-bold text-gray-900">Question Type Group {groupIndex + 1}</h3>
                  <select
                    value={group.type}
                    onChange={(e) => {
                      const newType = e.target.value;
                      const updatedQuestions = group.questions.map(q => ({
                        ...initQuestionForm(),
                        type: newType,
                        text: q.text,
                        score: q.score,
                      }));
                      updateQuestionGroup(groupIndex, { type: newType, questions: updatedQuestions });
                    }}
                    className="h-9 px-3 rounded-lg border border-gray-300 focus-brand text-sm font-semibold">
                    {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                  </select>
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${TYPE_BADGES[group.type]}`}>
                    {group.questions.length} question{group.questions.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {batchForm.questionGroups.length > 1 && (
                  <button
                    onClick={() => removeQuestionGroup(groupIndex)}
                    className="text-red-600 hover:text-red-700 text-sm font-medium"
                  >
                    Remove Group
                  </button>
                )}
              </div>

              {/* Questions in this group */}
              <div className="space-y-3">
                {group.questions.map((q, qIndex) => (
                  <div key={qIndex} className="p-3 border border-gray-300 rounded-lg bg-white">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="font-semibold text-gray-800 text-sm">Question {qIndex + 1}</h4>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={q.score}
                          onChange={(e) => updateQuestionInGroup(groupIndex, qIndex, { score: parseFloat(e.target.value) || 1 })}
                          className="w-20 h-8 px-2 rounded-lg border border-gray-300 focus-brand text-sm"
                          placeholder="Score"
                        />
                        {group.questions.length > 1 && (
                          <button
                            onClick={() => removeQuestionFromGroup(groupIndex, qIndex)}
                            className="text-red-600 hover:text-red-700 text-sm"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Question Text</label>
                        <textarea
                          rows={2}
                          value={q.text}
                          onChange={(e) => updateQuestionInGroup(groupIndex, qIndex, { text: e.target.value })}
                          placeholder="Enter the question..."
                          className="w-full px-2 py-1.5 rounded-lg border border-gray-300 focus-brand text-sm resize-none"
                        />
                      </div>

                      {renderQuestionOptions(q, groupIndex, qIndex)}
                    </div>
                  </div>
                ))}

                <button
                  onClick={() => addQuestionToGroup(groupIndex)}
                  className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-brand-red hover:text-brand-red transition-colors font-medium text-sm"
                >
                  + Add Another {TYPE_LABELS[group.type]} Question
                </button>
              </div>
            </div>
          ))}

          <button
            onClick={addQuestionGroup}
            className="w-full py-3 border-2 border-dashed border-brand-red rounded-lg text-brand-red hover:bg-brand-red hover:text-white transition-colors font-semibold"
          >
            + Add New Question Type Group
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
            Create {batchForm.questionGroups.reduce((sum, g) => sum + g.questions.filter(q => q.text.trim()).length, 0)} Question(s)
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
                onChange={(e) => setEditForm({ ...editForm, score: parseFloat(e.target.value) || 1 })}
                className="w-32 h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Question Text</label>
              <textarea rows={3} value={editForm.text} onChange={(e) => setEditForm({ ...editForm, text: e.target.value })}
                placeholder="Enter the question..."
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus-brand text-sm resize-none" />
            </div>

            {renderQuestionOptions(editForm, 0, 0, true)}
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

      {/* ── Single Delete Confirmation Modal ─────────────────────────────── */}
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

      {/* ── Bulk Delete Confirmation Modal ────────────────────────────────── */}
      {bulkDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setBulkDeleteModal(false)}>
          <div className="bg-white p-6 rounded-xl shadow-lg max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  Delete {selectedIds.size} Question{selectedIds.size !== 1 ? 's' : ''}
                </h3>
              </div>
            </div>
            <p className="text-gray-600 mb-2 text-sm">
              Are you sure you want to delete <span className="font-semibold text-red-600">{selectedIds.size}</span> selected question{selectedIds.size !== 1 ? 's' : ''}?
            </p>
            <p className="text-gray-500 text-xs mb-5">
              This action cannot be undone. All selected questions will be permanently removed.
            </p>

            {/* Preview of selected questions */}
            {selectedIds.size <= 5 && (
              <div className="mb-5 bg-gray-50 rounded-lg p-3 max-h-32 overflow-y-auto">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Selected questions:</p>
                {items.filter(q => selectedIds.has(q._id)).map(q => (
                  <p key={q._id} className="text-xs text-gray-600 line-clamp-1 mb-1">
                    &bull; {q.text}
                  </p>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button onClick={() => setBulkDeleteModal(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-semibold transition-colors">
                Cancel
              </button>
              <button onClick={handleBulkDelete}
                className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg font-semibold transition-colors">
                Delete {selectedIds.size} Question{selectedIds.size !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
