import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  X,
  Upload,
  FileText,
  Check,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import api from '../utils/api';
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

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

const TARGET_GROUPS = ['managerial', 'non-managerial', 'common'];

// ─── Default form state for a single question ──────────────────────────────
const initQuestionForm = () => ({
  type: 'MCQ',
  text: '',
  score: 1,
  targetGroup: '',
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
  const { show } = useToast();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [competencies, setCompetencies] = useState([]);
  const [filterComp, setFilterComp] = useState('');
  const [filterType, setFilterType] = useState('');
  const [modal, setModal] = useState(null); // 'create' | 'edit' | 'upload'
  const [selected, setSelected] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);

  const fileInputRef = useRef(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleteModal, setBulkDeleteModal] = useState(false);

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });

  const [batchForm, setBatchForm] = useState(initBatchForm());
  const [editForm, setEditForm] = useState(null);
  const [uploadedQuestions, setUploadedQuestions] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Target group state
  const [targetGroupsForComp, setTargetGroupsForComp] = useState([]);
  const [selectedBatchTargetGroup, setSelectedBatchTargetGroup] = useState('');

  // Fetch competencies
  useEffect(() => {
    api
      .get('/competencies')
      .then(({ data }) => setCompetencies(data.data.competencies || []))
      .catch(() => show('Failed to load competencies', 'error'));
  }, [show]);

  // Load target groups when competency changes
  useEffect(() => {
    console.log('Competency changed →', batchForm.competencyId);

    if (!batchForm.competencyId) {
      console.log('→ Clearing target groups');
      setTargetGroupsForComp([]);
      setSelectedBatchTargetGroup('');
      return;
    }

    // Safe string comparison (handles ObjectId vs string)
    const comp = competencies.find(
      (c) => String(c._id) === String(batchForm.competencyId)
    );

    console.log('Found competency →', comp ? comp.name : 'NOT FOUND');

    if (comp?.targetGroups?.length > 0) {
      const tgs = comp.targetGroups.map((tg) => tg.targetGroup);
      console.log('Target groups found →', tgs);
      setTargetGroupsForComp(tgs);

      if (tgs.length === 1) {
        setSelectedBatchTargetGroup(tgs[0]);
      }
    } else {
      console.log('→ No target groups in this competency');
      setTargetGroupsForComp([]);
      setSelectedBatchTargetGroup('');
    }
  }, [batchForm.competencyId, competencies]);

  // Fetch questions
  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: pagination.page, limit: pagination.limit };
      if (filterComp) params.competencyId = filterComp;
      if (filterType) params.type = filterType;

      const { data } = await api.get('/questions', { params });
      setItems(data.data.questions || []);
      setSelectedIds(new Set());

      if (data.data.pagination) {
        setPagination((prev) => ({
          ...prev,
          total: data.data.pagination.total,
          totalPages: Math.ceil(data.data.pagination.total / prev.limit),
        }));
      }
    } catch {
      show('Failed to load questions.', 'error');
    }
    setLoading(false);
  }, [filterComp, filterType, pagination.page, pagination.limit, show]);

  useEffect(() => {
    fetch();
  }, [fetch]);

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
    setSelectedBatchTargetGroup('');
    setModal('create');
  };

  const openUpload = () => {
    setUploadedQuestions(null);
    setUploadProgress(0);
    setModal('upload');
  };

  const openEdit = (q) => {
    setEditForm({
      competencyId: q.competencyId?._id || '',
      targetGroup: q.targetGroup || '',
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
    });
    setSelected(q);
    setModal('edit');
  };

  // ─── Document Upload and Parsing ────────────────────────────────────────
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

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

      setUploadProgress(70);
      const parsed = parseQuestionsFromText(text);
      setUploadProgress(100);

      if (parsed.length === 0) {
        show('No questions found in the document.', 'error');
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
      show('Failed to parse document. Error: ' + err.message, 'error');
    }

    setUploadLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

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

  const extractTextFromDOCX = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target.result;
          const result = await mammoth.extractRawText({ arrayBuffer });
          let text = result.value;
          text = text
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/\n\s+/g, '\n')
            .trim();
          resolve(text);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const extractTextFromPlain = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  };

  const parseQuestionsFromText = (text) => {
    const questions = [];
    // Your full parsing logic (kept as-is)
    let lines;
    if (text.includes('\n')) {
      lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    } else {
      const withBreaks = text
        .replace(/(Type:)/g, '\n$1')
        .replace(/(Question \d+:)/g, '\n$1')
        .replace(/(Score:)/g, '\n$1')
        .replace(/(Answer:)/g, '\n$1')
        .replace(/([a-d]\))/g, '\n$1')
        .replace(/(\w+ -> \w+)/g, '\n$1');
      lines = withBreaks.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    }

    let currentType = 'MCQ';
    let currentQuestion = null;

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
          'TRUE-FALSE': 'TrueFalse',
          'RATING': 'Rating',
          'MULTISELECT': 'MultiSelect',
          'MULTI-SELECT': 'MultiSelect',
          'MULTI SELECT': 'MultiSelect',
          'MATCHING': 'Matching',
          'ORDERING': 'Ordering',
          'SCENARIO MCQ': 'ScenarioMCQ',
          'SCENARIOMCQ': 'ScenarioMCQ',
          'SCENARIO': 'ScenarioMCQ',
          'DRAGDROP': 'DragDropClassification',
          'DRAG DROP': 'DragDropClassification',
          'CLASSIFICATION': 'DragDropClassification',
          'DRAG-DROP CLASSIFICATION': 'DragDropClassification',
        };
        currentType = typeMap[typeStr] || 'MCQ';
        if (currentQuestion && currentQuestion.text) questions.push(currentQuestion);
        currentQuestion = null;
        continue;
      }

      if (line.match(/^(?:question\s*\d*\s*:|q\d*\s*:|\d+\.)\s*(.+)$/i)) {
        if (currentQuestion && currentQuestion.text) questions.push(currentQuestion);
        const match = line.match(/^(?:question\s*\d*\s*:|q\d*\s*:|\d+\.)\s*(.+)$/i);
        const questionText = match ? match[1].trim() : line;
        currentQuestion = {
          ...initQuestionForm(),
          type: currentType,
          text: questionText,
        };
        continue;
      }

      if (currentQuestion) {
        // Score
        if (line.match(/^score\s*:\s*(\d+(?:\.\d+)?)/i)) {
          const match = line.match(/^score\s*:\s*(\d+(?:\.\d+)?)/i);
          if (match) {
            currentQuestion.score = parseFloat(match[1]) || 1;
          }
          continue;
        }

        // Answer/Correct Answer
        if (line.match(/^(?:answer|correct)\s*:\s*(.+)$/i)) {
          const match = line.match(/^(?:answer|correct)\s*:\s*(.+)$/i);
          const answer = match[1].trim();

          if (currentQuestion.type === 'TrueFalse') {
            currentQuestion.correctAnswer = answer.match(/true/i) ? 'True' : 'False';
          } else if (currentQuestion.type === 'MultiSelect') {
            // Handle multiple correct answers separated by commas or semicolons
            currentQuestion.correctAnswers = answer
              .split(/[,;]/)
              .map(a => a.trim())
              .filter(a => a.length > 0);
          } else {
            currentQuestion.correctAnswer = answer;
          }
          continue;
        }

        // Options (a), b), c), d) format)
        if (line.match(/^[a-d]\)\s*(.+)$/i)) {
          const match = line.match(/^([a-d])\)\s*(.+)$/i);
          const optionLetter = match[1].toLowerCase();
          let optionText = match[2].trim();

          const isCorrect = optionText.includes('*') || optionText.includes('(correct)');
          optionText = optionText.replace(/\*|\(correct\)/gi, '').trim();

          const index = optionLetter.charCodeAt(0) - 'a'.charCodeAt(0);

          if (!currentQuestion.options) {
            currentQuestion.options = ['', '', '', ''];
          }

          // Ensure array is large enough
          while (currentQuestion.options.length <= index) {
            currentQuestion.options.push('');
          }

          currentQuestion.options[index] = optionText;

          if (isCorrect) {
            if (currentQuestion.type === 'MultiSelect') {
              if (!currentQuestion.correctAnswers) {
                currentQuestion.correctAnswers = [];
              }
              currentQuestion.correctAnswers.push(optionText);
            } else {
              currentQuestion.correctAnswer = optionText;
            }
          }
          continue;
        }

        // Matching pairs (left -> right format)
        if (currentQuestion.type === 'Matching' && line.includes('->')) {
          const [left, right] = line.split('->').map(s => s.trim());

          if (!currentQuestion.matchingPairs) {
            currentQuestion.matchingPairs = [];
          }

          // Replace default empty pair
          if (currentQuestion.matchingPairs.length === 1 &&
            currentQuestion.matchingPairs[0].left === '' &&
            currentQuestion.matchingPairs[0].right === '') {
            currentQuestion.matchingPairs[0] = { left, right };
          } else {
            currentQuestion.matchingPairs.push({ left, right });
          }
          continue;
        }

        // Ordering items (1., 2., 3. format)
        if (currentQuestion.type === 'Ordering' && line.match(/^\d+\.\s*(.+)$/)) {
          const match = line.match(/^\d+\.\s*(.+)$/);
          const itemText = match[1].trim();

          if (!currentQuestion.correctOrder || currentQuestion.correctOrder.length === 0 ||
            (currentQuestion.correctOrder.length === 1 && currentQuestion.correctOrder[0] === '')) {
            currentQuestion.correctOrder = [itemText];
          } else {
            currentQuestion.correctOrder.push(itemText);
          }
          continue;
        }

        // Categories for classification (Category: item1, item2, item3)
        if (currentQuestion.type === 'DragDropClassification' && line.match(/^(.+?):\s*(.+)$/)) {
          const match = line.match(/^(.+?):\s*(.+)$/);
          const category = match[1].trim();
          const itemsText = match[2].trim();
          const items = itemsText.split(',').map(item => item.trim()).filter(item => item.length > 0);

          if (!currentQuestion.categories || Object.keys(currentQuestion.categories).length === 0) {
            currentQuestion.categories = {};
          }

          // Remove default empty category
          if (currentQuestion.categories[''] && currentQuestion.categories[''].length === 1 && currentQuestion.categories[''][0] === '') {
            delete currentQuestion.categories[''];
          }

          currentQuestion.categories[category] = items;
          continue;
        }

        // Scenario text (for ScenarioMCQ)
        if (currentQuestion.type === 'ScenarioMCQ' && line.match(/^scenario\s*:\s*(.+)$/i)) {
          const match = line.match(/^scenario\s*:\s*(.+)$/i);
          currentQuestion.scenario = match[1].trim();
          continue;
        }
      }
    }

    if (currentQuestion && currentQuestion.text) questions.push(currentQuestion);

    // Clean up (your existing cleanup)
    return questions.map(q => {
      if (['MCQ', 'MultiSelect', 'ScenarioMCQ'].includes(q.type)) {
        q.options = (q.options || []).filter(opt => opt && opt.length > 0);
        if (q.options.length === 0) q.options = ['', '', '', ''];
      }
      if (q.type === 'Matching') {
        q.matchingPairs = (q.matchingPairs || []).filter(p => p.left && p.right);
        if (q.matchingPairs.length === 0) q.matchingPairs = [{ left: '', right: '' }, { left: '', right: '' }];
      }
      if (q.type === 'Ordering') {
        q.correctOrder = (q.correctOrder || []).filter(item => item && item.length > 0);
        if (q.correctOrder.length === 0) q.correctOrder = ['', ''];
      }
      if (q.type === 'DragDropClassification') {
        const cats = {};
        Object.entries(q.categories || {}).forEach(([cat, items]) => {
          const trimmed = cat.trim();
          if (trimmed && items && items.length > 0) cats[trimmed] = items.filter(i => i && i.trim());
        });
        q.categories = Object.keys(cats).length > 0 ? cats : { '': [''] };
      }
      return q;
    });
  };

  const groupQuestionsByType = (questions) => {
    const groups = [];
    let currentGroup = null;
    questions.forEach(q => {
      if (!currentGroup || currentGroup.type !== q.type) {
        currentGroup = { type: q.type, questions: [] };
        groups.push(currentGroup);
      }
      currentGroup.questions.push(q);
    });
    return groups;
  };

  const useUploadedQuestions = () => {
    if (uploadedQuestions) {
      setBatchForm(uploadedQuestions);
      setModal('create');
      setUploadedQuestions(null);
    }
  };

  // ─── Build payload ──────────────────────────────────────────────────────
  const buildQuestionPayload = (q, competencyId) => {
    if (!q.targetGroup) throw new Error('Target group is required');

    const base = {
      competencyId,
      targetGroup: q.targetGroup,
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
        return { ...base, options: ['True', 'False'], correctAnswer: q.correctAnswer || null };
      case 'Rating':
        return base;
      case 'MultiSelect':
        return {
          ...base,
          options: q.options.filter(Boolean),
          correctAnswers: q.correctAnswers.filter(Boolean),
        };
      case 'Matching':
        return { ...base, matchingPairs: q.matchingPairs.filter(p => p.left && p.right) };
      case 'Ordering':
        return { ...base, correctOrder: q.correctOrder.filter(Boolean) };
      case 'DragDropClassification': {
        const cats = {};
        Object.entries(q.categories || {}).forEach(([cat, items]) => {
          const trimmed = cat.trim();
          if (trimmed) cats[trimmed] = (items || []).filter(i => i.trim());
        });
        return { ...base, categories: cats };
      }
      default:
        return base;
    }
  };

  // ─── Save handler ───────────────────────────────────────────────────────
  const handleSave = async () => {
    try {
      if (modal === 'create') {
        if (!batchForm.competencyId) return show('Select competency', 'error');
        if (!selectedBatchTargetGroup) return show('Select target group', 'error');

        const allQuestions = [];
        batchForm.questionGroups.forEach(group => {
          group.questions
            .filter(q => q.text.trim())
            .forEach(q => {
              allQuestions.push(
                buildQuestionPayload(
                  { ...q, targetGroup: selectedBatchTargetGroup },
                  batchForm.competencyId
                )
              );
            });
        });

        if (allQuestions.length === 0) return show('Add at least one question', 'error');

        await api.post('/questions/batch', { questions: allQuestions });
        show(`${allQuestions.length} questions created`, 'success');
      } else {
        const payload = buildQuestionPayload(editForm, editForm.competencyId);
        await api.put(`/questions/${selected._id}`, payload);
        show('Question updated', 'success');
      }

      setModal(null);
      fetch();
    } catch (err) {
      show(err?.response?.data?.message || 'Save failed', 'error');
    }
  };

  // ─── Delete handlers ────────────────────────────────────────────────────
  const confirmDelete = (q) => setDeleteModal(q);

  const handleDelete = async () => {
    if (!deleteModal) return;
    try {
      await api.delete(`/questions/${deleteModal._id}`);
      show('Question deleted.', 'success');
      setDeleteModal(null);
      fetch();
    } catch (err) {
      show(err.response?.data?.message || 'Delete failed.', 'error');
      setDeleteModal(null);
    }
  };

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
    newQuestion.targetGroup = selectedBatchTargetGroup; // ← FIXED HERE
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
      setPagination((p) => ({ ...p, page }));
    }
  };

  const handlePageSizeChange = (e) => {
    const limit = parseInt(e.target.value, 10);
    setPagination((p) => ({
      ...p,
      page: 1,
      limit,
      totalPages: Math.ceil(p.total / limit),
    }));
  };

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
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-red-500 text-sm resize-none"
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
                  className="w-4 h-4 text-red-600 focus:ring-red-500"
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
                  className="flex-1 h-10 px-3 rounded-lg border border-gray-300 focus:border-red-500 text-sm"
                />
                {form.options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      const o = form.options.filter((_, idx) => idx !== i);
                      setForm({
                        ...form,
                        options: o,
                        correctAnswer: form.correctAnswer === opt ? '' : form.correctAnswer,
                      });
                    }}
                    className="p-1 text-gray-400 hover:text-red-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setForm({ ...form, options: [...form.options, ''] })}
              className="text-sm text-red-600 hover:underline mt-1"
            >
              + Add option
            </button>
          </div>
        );

      case 'TrueFalse':
        return (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Correct Answer</label>
            <select
              value={form.correctAnswer || ''}
              onChange={(e) => setForm({ ...form, correctAnswer: e.target.value })}
              className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:border-red-500 text-sm"
            >
              <option value="">— Select —</option>
              <option value="True">True</option>
              <option value="False">False</option>
            </select>
          </div>
        );

      case 'Rating':
        return <p className="text-sm text-gray-500">Rating questions are auto-scored (1-5 scale).</p>;

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
                  className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
                />
                <input
                  value={opt}
                  onChange={(e) => {
                    const o = [...form.options];
                    const prev = o[i];
                    o[i] = e.target.value;
                    const ca = (form.correctAnswers || []).map(a => (a === prev ? e.target.value : a));
                    setForm({ ...form, options: o, correctAnswers: ca });
                  }}
                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  className="flex-1 h-10 px-3 rounded-lg border border-gray-300 focus:border-red-500 text-sm"
                />
                {form.options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      const o = form.options.filter((_, idx) => idx !== i);
                      const ca = form.correctAnswers.filter(a => a !== opt);
                      setForm({ ...form, options: o, correctAnswers: ca });
                    }}
                    className="p-1 text-gray-400 hover:text-red-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setForm({ ...form, options: [...form.options, ''] })}
              className="text-sm text-red-600 hover:underline mt-1"
            >
              + Add option
            </button>
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
                    className="h-10 px-3 rounded-lg border border-gray-300 focus:border-red-500 text-sm"
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
                    className="h-10 px-3 rounded-lg border border-gray-300 focus:border-red-500 text-sm"
                  />
                  {form.matchingPairs.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setForm({
                        ...form,
                        matchingPairs: form.matchingPairs.filter((_, idx) => idx !== i)
                      })}
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
              className="text-sm text-red-600 hover:underline mt-2"
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
                <span className="w-7 h-7 flex items-center justify-center bg-gray-100 rounded text-xs font-bold text-gray-500">
                  {i + 1}
                </span>
                <GripVertical className="w-4 h-4 text-gray-300" />
                <input
                  value={item}
                  onChange={(e) => {
                    const o = [...form.correctOrder];
                    o[i] = e.target.value;
                    setForm({ ...form, correctOrder: o });
                  }}
                  placeholder={`Step ${i + 1}`}
                  className="flex-1 h-10 px-3 rounded-lg border border-gray-300 focus:border-red-500 text-sm"
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
              className="text-sm text-red-600 hover:underline mt-1"
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
                      const newCats = { ...form.categories };
                      newCats[e.target.value] = catItems;
                      delete newCats[cat];
                      setForm({ ...form, categories: newCats });
                    }}
                    placeholder={`Category ${ci + 1}`}
                    className="flex-1 h-10 px-3 rounded-lg border border-gray-300 focus:border-red-500 text-sm font-semibold"
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
                      className="flex-1 h-9 px-3 rounded-lg border border-gray-200 focus:border-red-500 text-sm"
                    />
                    {(catItems || []).length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const newCats = { ...form.categories };
                          newCats[cat] = newCats[cat].filter((_, idx) => idx !== ii);
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
                  className="text-xs text-red-600 hover:underline mt-1 ml-4"
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
              className="text-sm text-red-600 hover:underline mt-2"
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

  return (
    <div className="p-7 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Question Bank</h1>
          <p className="text-gray-600 mt-1">Manage questions for competencies and target groups</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={openUpload}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <Upload className="w-4 h-4" /> Upload Document
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
          >
            <Plus className="w-4 h-4" /> Add Questions
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <select
          value={filterComp}
          onChange={(e) => setFilterComp(e.target.value)}
          className="h-10 px-4 border rounded-lg min-w-[240px]"
        >
          <option value="">All Competencies</option>
          {competencies.map(c => (
            <option key={c._id} value={c._id}>
              {c.name} ({c.category})
            </option>
          ))}
        </select>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="h-10 px-4 border rounded-lg w-56"
        >
          <option value="">All Types</option>
          {TYPES.map(t => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>

        <select
          value={pagination.limit}
          onChange={(e) => {
            const lim = Number(e.target.value);
            setPagination(p => ({ ...p, page: 1, limit: lim }));
          }}
          className="h-10 px-4 border rounded-lg"
        >
          <option value="10">10 per page</option>
          <option value="20">20 per page</option>
          <option value="30">30 per page</option>
          <option value="50">50 per page</option>
        </select>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="bg-red-50 border border-red-200 p-4 mb-6 rounded-lg flex justify-between items-center">
          <span className="font-medium">
            {selectedIds.size} question{selectedIds.size !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={() => setBulkDeleteModal(true)}
            className="bg-red-600 text-white px-5 py-2 rounded-lg hover:bg-red-700"
          >
            Delete Selected
          </button>
        </div>
      )}

      {/* Questions Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center p-20">
            <div className="w-10 h-10 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="w-12 p-4">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4"
                    />
                  </th>
                  <th className="text-left p-4 font-semibold text-gray-700">Question</th>
                  <th className="text-left p-4 font-semibold text-gray-700 w-40">Type</th>
                  <th className="text-left p-4 font-semibold text-gray-700">Competency</th>
                  <th className="text-left p-4 font-semibold text-gray-700 w-44">Target Group</th>
                  <th className="text-right p-4 font-semibold text-gray-700 w-20">Score</th>
                  <th className="text-left p-4 font-semibold text-gray-700 w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-gray-500">
                      No questions found
                    </td>
                  </tr>
                ) : (
                  items.map(q => (
                    <tr key={q._id} className="hover:bg-gray-50">
                      <td className="p-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(q._id)}
                          onChange={() => toggleSelect(q._id)}
                          className="w-4 h-4"
                        />
                      </td>
                      <td className="p-4 max-w-lg">
                        <div className="line-clamp-2 font-medium">{q.text}</div>
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 text-xs rounded ${TYPE_BADGES[q.type]}`}>
                          {TYPE_LABELS[q.type] || q.type}
                        </span>
                      </td>
                      <td className="p-4">{q.competencyId?.name || '—'}</td>
                      <td className="p-4 capitalize">{q.targetGroup || '—'}</td>
                      <td className="p-4 text-right font-medium">{q.score ?? 1}</td>
                      <td className="p-4">
                        <div className="flex gap-3">
                          <button onClick={() => openEdit(q)}>
                            <Edit2 size={18} className="text-gray-600 hover:text-blue-600" />
                          </button>
                          <button onClick={() => setDeleteModal(q)}>
                            <Trash2 size={18} className="text-red-600 hover:text-red-800" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── CREATE MODAL ──────────────────────────────────────────────────── */}
      <Modal open={modal === 'create'} onClose={() => setModal(null)} title="Add Questions" large>
        <div className="space-y-6 max-h-[78vh] overflow-y-auto pr-3 pb-4">
          {/* Competency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Competency <span className="text-red-600">*</span>
            </label>
            <select
              value={batchForm.competencyId}
              onChange={(e) => setBatchForm({ ...batchForm, competencyId: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:border-red-500 focus:ring-red-200"
            >
              <option value="">— Select Competency —</option>
              {competencies.map(c => (
                <option key={c._id} value={c._id}>
                  {c.name} • {c.category}
                </option>
              ))}
            </select>
          </div>

          {/* Target Group Buttons */}
          {batchForm.competencyId && (
            <div className="mt-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Target Group <span className="text-red-600">*</span>
              </label>

              {targetGroupsForComp.length === 0 ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                  This competency has no target groups defined yet.
                </div>
              ) : (
                <div className="flex flex-wrap gap-3 min-h-[48px] items-center">
                  {TARGET_GROUPS.map((tg) => {
                    const isAvailable = targetGroupsForComp.includes(tg);
                    const isSelected = selectedBatchTargetGroup === tg;

                    return (
                      <button
                        key={tg}
                        type="button"
                        disabled={!isAvailable}
                        onClick={() => setSelectedBatchTargetGroup(isSelected ? '' : tg)}
                        className={`
                          px-5 py-2.5 rounded-full text-sm font-medium transition-all shadow-sm
                          ${!isAvailable
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-60 line-through'
                            : isSelected
                            ? 'bg-red-600 text-white ring-2 ring-red-300 ring-offset-2'
                            : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 active:bg-gray-100'
                          }
                        `}
                      >
                        {tg.charAt(0).toUpperCase() + tg.slice(1)}
                        {!isAvailable && ' (not available)'}
                      </button>
                    );
                  })}
                </div>
              )}

              {!selectedBatchTargetGroup && targetGroupsForComp.length > 0 && (
                <p className="mt-2 text-sm text-amber-700 bg-amber-50/50 p-2 rounded border border-amber-200">
                  Please select one target group for all questions in this batch.
                </p>
              )}
            </div>
          )}

          {/* Question Groups */}
          {batchForm.questionGroups.map((group, groupIndex) => (
            <div
              key={groupIndex}
              className="border border-gray-200 rounded-xl p-5 bg-white shadow-sm"
            >
              <div className="flex justify-between items-center mb-4 pb-3 border-b">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-gray-800">
                    Group {groupIndex + 1}
                  </h3>
                  <select
                    value={group.type}
                    onChange={(e) => {
                      const newType = e.target.value;
                      const updatedQs = group.questions.map(q => ({
                        ...q,
                        type: newType,
                        targetGroup: selectedBatchTargetGroup, // keep sync
                      }));
                      updateQuestionGroup(groupIndex, { type: newType, questions: updatedQs });
                    }}
                    className="border border-gray-300 rounded px-3 py-1.5 text-sm"
                  >
                    {TYPES.map(t => (
                      <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                  <span className={`px-3 py-1 text-xs rounded-full ${TYPE_BADGES[group.type]}`}>
                    {group.questions.length} {group.questions.length === 1 ? 'question' : 'questions'}
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

              <div className="space-y-5">
                {group.questions.map((q, qIndex) => (
                  <div key={qIndex} className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                    <div className="flex justify-between items-start mb-4">
                      <h4 className="font-medium text-gray-800">
                        Question {qIndex + 1}
                      </h4>
                      <div className="flex items-center gap-4">
                        <input
                          type="number"
                          min="0.5"
                          step="0.5"
                          value={q.score}
                          onChange={e => updateQuestionInGroup(groupIndex, qIndex, {
                            score: parseFloat(e.target.value) || 1
                          })}
                          className="w-20 px-3 py-1.5 border rounded text-sm"
                        />
                        {group.questions.length > 1 && (
                          <button
                            onClick={() => removeQuestionFromGroup(groupIndex, qIndex)}
                            className="text-gray-500 hover:text-red-600"
                          >
                            <X size={20} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Question Text */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Question Text
                      </label>
                      <textarea
                        rows={2}
                        value={q.text}
                        onChange={e => updateQuestionInGroup(groupIndex, qIndex, { text: e.target.value })}
                        placeholder="Enter question text..."
                        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-200 resize-none"
                      />
                    </div>

                    {/* Type-specific fields */}
                    {renderQuestionOptions(q, groupIndex, qIndex)}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => addQuestionToGroup(groupIndex)}
                  className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-red-500 hover:text-red-600 transition font-medium"
                >
                  + Add another {TYPE_LABELS[group.type]} question
                </button>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addQuestionGroup}
            className="w-full py-4 border-2 border-dashed border-red-500 rounded-xl text-red-600 hover:bg-red-50 font-semibold transition"
          >
            + Add New Question Type Group
          </button>
        </div>

        <div className="flex justify-end gap-4 mt-6 pt-4 border-t">
          <button
            onClick={() => setModal(null)}
            className="px-6 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!batchForm.competencyId || !selectedBatchTargetGroup}
            className={`px-6 py-2.5 rounded-lg text-white font-medium ${
              batchForm.competencyId && selectedBatchTargetGroup
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-gray-400 cursor-not-allowed'
            }`}
          >
            Create Questions
          </button>
        </div>
      </Modal>

      {/* Upload Modal */}
      <Modal open={modal === 'upload'} onClose={() => setModal(null)} title="Upload Questions Document">
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-blue-900 mb-2">Document Format Guidelines</h4>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>Start each question with "Question:" or "Q:" or a number (e.g., "1.")</li>
              <li>Specify type with "Type: MCQ" (supports: MCQ, True/False, Rating, Multi-Select, Matching, Ordering, Scenario MCQ, Classification)</li>
              <li>For MCQ/Multi-Select, use "a)" or "a." for options, mark correct with "*" or "(correct)"</li>
              <li>Specify "Answer:" or "Correct:" for the correct answer</li>
              <li>For Scenario MCQ, add "Scenario: ..." before options</li>
              <li>For Matching, use "left item -> right item" format</li>
              <li>For Ordering, list items with "1.", "2.", etc.</li>
              <li>Optional: "Score: 2" to set point value</li>
            </ul>
          </div>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-red-500 transition-colors">
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
                <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
                <span className="ml-3 text-gray-600">Parsing document...</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-red-500 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
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
                    Review & Edit Questions
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={() => setModal(null)}
            className="px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={modal === 'edit'} onClose={() => setModal(null)} title="Edit Question" large>
        {editForm && (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Competency</label>
                <select
                  value={editForm.competencyId}
                  onChange={(e) => setEditForm({ ...editForm, competencyId: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:border-red-500 text-sm"
                >
                  <option value="">— Select —</option>
                  {competencies.map((c) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
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
                  className="w-full h-10 px-3 rounded-lg border border-gray-300 focus:border-red-500 text-sm"
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Score</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={editForm.score}
                onChange={(e) => setEditForm({ ...editForm, score: parseFloat(e.target.value) || 1 })}
                className="w-32 h-10 px-3 rounded-lg border border-gray-300 focus:border-red-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Question Text</label>
              <textarea
                rows={3}
                value={editForm.text}
                onChange={(e) => setEditForm({ ...editForm, text: e.target.value })}
                placeholder="Enter the question..."
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-red-500 text-sm resize-none"
              />
            </div>

            {renderQuestionOptions(editForm, 0, 0, true)}
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={() => setModal(null)}
            className="px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors"
          >
            Save
          </button>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      {deleteModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setDeleteModal(null)}
        >
          <div
            className="bg-white p-6 rounded-xl shadow-lg max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Question</h3>
            <p className="text-gray-600 mb-1 text-sm">Are you sure you want to delete this question?</p>
            <p className="text-gray-500 text-xs mb-5 line-clamp-2">{deleteModal.text}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteModal(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg font-semibold transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation */}
      {bulkDeleteModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setBulkDeleteModal(false)}
        >
          <div
            className="bg-white p-6 rounded-xl shadow-lg max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
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
              Are you sure you want to delete{' '}
              <span className="font-semibold text-red-600">{selectedIds.size}</span> selected question
              {selectedIds.size !== 1 ? 's' : ''}?
            </p>
            <p className="text-gray-500 text-xs mb-5">
              This action cannot be undone. All selected questions will be permanently removed.
            </p>
            {selectedIds.size <= 5 && (
              <div className="mb-5 bg-gray-50 rounded-lg p-3 max-h-32 overflow-y-auto">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Selected questions:</p>
                {items.filter(q => selectedIds.has(q._id)).map(q => (
                  <p key={q._id} className="text-xs text-gray-600 line-clamp-1 mb-1">
                    • {q.text}
                  </p>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setBulkDeleteModal(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg font-semibold transition-colors"
              >
                Delete {selectedIds.size} Question{selectedIds.size !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}