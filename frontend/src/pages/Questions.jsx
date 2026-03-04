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
  Eye,
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
  const [modal, setModal] = useState(null); // 'create' | 'edit' | 'upload' | 'view'
  const [selected, setSelected] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);
  const [viewQuestion, setViewQuestion] = useState(null);

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
    if (!batchForm.competencyId) {
      setTargetGroupsForComp([]);
      setSelectedBatchTargetGroup('');
      return;
    }

    const comp = competencies.find(
      (c) => String(c._id) === String(batchForm.competencyId)
    );

    if (comp?.targetGroups?.length > 0) {
      const tgs = comp.targetGroups.map((tg) => tg.targetGroup);
      setTargetGroupsForComp(tgs);
      if (tgs.length === 1) setSelectedBatchTargetGroup(tgs[0]);
    } else {
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

  const openView = (q) => {
    setViewQuestion(q);
    setModal('view');
  };

  // ─── Document Upload and Parsing ─────────────────────────────────────────
  // Best-practice extraction:
  //  • PDF  – pdf.js with per-page progress + TextItem x/y sorting to preserve
  //           reading order (columns, multi-paragraph layouts)
  //  • DOCX – mammoth extractRawText (full fidelity, no style noise)
  //  • TXT/MD – FileReader with UTF-8 BOM stripping

  const MAX_FILE_SIZE_MB = 10;

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // ── Size guard ──
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      show(`File is too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.`, 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const name  = file.name.toLowerCase();
    const mime  = file.type;

    const isPdf   = name.endsWith('.pdf') || mime === 'application/pdf';
    const isDocx  = name.endsWith('.docx') || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const isDoc   = name.endsWith('.doc')  || mime === 'application/msword';
    const isTxt   = name.endsWith('.txt')  || name.endsWith('.md') || mime.startsWith('text/');

    if (!isPdf && !isDocx && !isDoc && !isTxt) {
      show('Unsupported file type. Please upload a PDF, DOCX, or TXT file.', 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploadLoading(true);
    setUploadProgress(5);

    try {
      let text = '';

      if (isPdf) {
        text = await extractTextFromPDF(file);
      } else if (isDocx) {
        text = await extractTextFromDOCX(file);
      } else {
        text = await extractTextFromPlain(file);
      }

      setUploadProgress(75);

      const parsed = parseQuestionsFromText(text);
      setUploadProgress(100);

      if (parsed.length === 0) {
        show('No questions found. Make sure the document follows the required format.', 'error');
        setUploadLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      const grouped = groupQuestionsByType(parsed);
      setUploadedQuestions({ competencyId: '', questionGroups: grouped });
      show(`Successfully extracted ${parsed.length} question(s).`, 'success');
    } catch (err) {
      show('Failed to parse document: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setUploadLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // PDF: use pdf.js with sorted TextItems to handle multi-column layouts
  const extractTextFromPDF = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pageTexts = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      setUploadProgress(5 + Math.floor((i / pdf.numPages) * 60));
      const page = await pdf.getPage(i);
      const { items } = await page.getTextContent({ normalizeWhitespace: true });

      // Sort items top-to-bottom, then left-to-right within the same line
      const LINE_TOLERANCE = 5;
      const sorted = [...items].sort((a, b) => {
        const yDiff = Math.round(b.transform[5] / LINE_TOLERANCE) - Math.round(a.transform[5] / LINE_TOLERANCE);
        return yDiff !== 0 ? yDiff : a.transform[4] - b.transform[4];
      });

      let pageText = '';
      let lastY = null;
      for (const item of sorted) {
        const y = Math.round(item.transform[5] / LINE_TOLERANCE);
        if (lastY !== null && y !== lastY) pageText += '\n';
        pageText += (item.str || '') + ' ';
        lastY = y;
      }
      pageTexts.push(pageText.trim());
    }

    return pageTexts.join('\n\n');
  };

  // DOCX: mammoth extractRawText — preserves paragraph structure cleanly
  const extractTextFromDOCX = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const { value } = await mammoth.extractRawText({ arrayBuffer });
    return value
      .replace(/\r\n|\r/g, '\n')   // normalise line endings
      .replace(/[^\S\n]+/g, ' ')      // collapse horizontal whitespace
      .replace(/\n{3,}/g, '\n\n')    // max two consecutive blank lines
      .trim();
  };

  // TXT / MD: FileReader with UTF-8 BOM stripping
  const extractTextFromPlain = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        let text = e.target.result || '';
        // Strip UTF-8 BOM if present
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        resolve(text.replace(/\r\n|\r/g, '\n').trim());
      };
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsText(file, 'UTF-8');
    });
  };

  const parseQuestionsFromText = (text) => {
    const questions = [];
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
    newQuestion.targetGroup = selectedBatchTargetGroup;
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
                  rows={2}
                  value={form.scenario || ''}
                  onChange={(e) => setForm({ ...form, scenario: e.target.value })}
                  placeholder="Describe the scenario..."
                  className="w-full px-3 py-1.5 rounded-lg border border-gray-300 focus:border-red-500 text-sm resize-none"
                />
              </div>
            )}
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Options</label>
            {form.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2 mb-1.5">
                <input
                  type="radio"
                  name={isEdit ? 'edit-correct' : `correct-${groupIndex}-${questionIndex}`}
                  checked={form.correctAnswer === opt && opt !== ''}
                  onChange={() => setForm({ ...form, correctAnswer: opt })}
                  className="w-3.5 h-3.5 text-red-600 focus:ring-red-500"
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
                  className="flex-1 h-8 px-2 rounded-lg border border-gray-300 focus:border-red-500 text-sm"
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
                    className="p-0.5 text-gray-400 hover:text-red-500"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setForm({ ...form, options: [...form.options, ''] })}
              className="text-xs text-red-600 hover:underline mt-1"
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
              className="w-full h-8 px-2 rounded-lg border border-gray-300 focus:border-red-500 text-sm"
            >
              <option value="">— Select —</option>
              <option value="True">True</option>
              <option value="False">False</option>
            </select>
          </div>
        );

      case 'Rating':
        return <p className="text-xs text-gray-500">Rating questions are auto-scored (1-5 scale).</p>;

      case 'MultiSelect':
        return (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Options (check correct)</label>
            {form.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2 mb-1.5">
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
                  className="w-3.5 h-3.5 text-red-600 rounded focus:ring-red-500"
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
                  className="flex-1 h-8 px-2 rounded-lg border border-gray-300 focus:border-red-500 text-sm"
                />
                {form.options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      const o = form.options.filter((_, idx) => idx !== i);
                      const ca = form.correctAnswers.filter(a => a !== opt);
                      setForm({ ...form, options: o, correctAnswers: ca });
                    }}
                    className="p-0.5 text-gray-400 hover:text-red-500"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setForm({ ...form, options: [...form.options, ''] })}
              className="text-xs text-red-600 hover:underline mt-1"
            >
              + Add option
            </button>
          </div>
        );

      case 'Matching':
        return (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Matching Pairs</label>
            <div className="space-y-1.5">
              {form.matchingPairs.map((pair, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] gap-1.5 items-center">
                  <input
                    value={pair.left}
                    onChange={(e) => {
                      const p = [...form.matchingPairs];
                      p[i] = { ...p[i], left: e.target.value };
                      setForm({ ...form, matchingPairs: p });
                    }}
                    placeholder={`Term ${i + 1}`}
                    className="h-8 px-2 rounded-lg border border-gray-300 focus:border-red-500 text-sm"
                  />
                  <span className="text-gray-400 text-xs">↔</span>
                  <input
                    value={pair.right}
                    onChange={(e) => {
                      const p = [...form.matchingPairs];
                      p[i] = { ...p[i], right: e.target.value };
                      setForm({ ...form, matchingPairs: p });
                    }}
                    placeholder={`Match ${i + 1}`}
                    className="h-8 px-2 rounded-lg border border-gray-300 focus:border-red-500 text-sm"
                  />
                  {form.matchingPairs.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setForm({
                        ...form,
                        matchingPairs: form.matchingPairs.filter((_, idx) => idx !== i)
                      })}
                      className="p-0.5 text-gray-400 hover:text-red-500"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {form.matchingPairs.length <= 2 && <span className="w-5" />}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setForm({
                ...form,
                matchingPairs: [...form.matchingPairs, { left: '', right: '' }]
              })}
              className="text-xs text-red-600 hover:underline mt-1"
            >
              + Add pair
            </button>
          </div>
        );

      case 'Ordering':
        return (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Items in Correct Order</label>
            {form.correctOrder.map((item, i) => (
              <div key={i} className="flex items-center gap-1.5 mb-1.5">
                <span className="w-5 h-5 flex items-center justify-center bg-gray-100 rounded text-xs font-bold text-gray-500">
                  {i + 1}
                </span>
                <GripVertical className="w-3.5 h-3.5 text-gray-300" />
                <input
                  value={item}
                  onChange={(e) => {
                    const o = [...form.correctOrder];
                    o[i] = e.target.value;
                    setForm({ ...form, correctOrder: o });
                  }}
                  placeholder={`Step ${i + 1}`}
                  className="flex-1 h-8 px-2 rounded-lg border border-gray-300 focus:border-red-500 text-sm"
                />
                {form.correctOrder.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setForm({
                      ...form,
                      correctOrder: form.correctOrder.filter((_, idx) => idx !== i)
                    })}
                    className="p-0.5 text-gray-400 hover:text-red-500"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setForm({ ...form, correctOrder: [...form.correctOrder, ''] })}
              className="text-xs text-red-600 hover:underline mt-1"
            >
              + Add item
            </button>
          </div>
        );

      case 'DragDropClassification':
        return (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Categories & Items</label>
            {Object.entries(form.categories || { '': [''] }).map(([cat, catItems], ci) => (
              <div key={ci} className="mb-3 p-2 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <input
                    value={cat}
                    onChange={(e) => {
                      const newCats = { ...form.categories };
                      newCats[e.target.value] = catItems;
                      delete newCats[cat];
                      setForm({ ...form, categories: newCats });
                    }}
                    placeholder={`Category ${ci + 1}`}
                    className="flex-1 h-8 px-2 rounded-lg border border-gray-300 focus:border-red-500 text-sm font-semibold"
                  />
                  {Object.keys(form.categories || {}).length > 1 && cat !== '' && (
                    <button
                      type="button"
                      onClick={() => {
                        const newCats = { ...form.categories };
                        delete newCats[cat];
                        setForm({ ...form, categories: newCats });
                      }}
                      className="p-0.5 text-gray-400 hover:text-red-500"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {(catItems || []).map((item, ii) => (
                  <div key={ii} className="flex items-center gap-1.5 mb-1 ml-2">
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
                      className="flex-1 h-7 px-2 rounded-lg border border-gray-200 focus:border-red-500 text-sm"
                    />
                    {(catItems || []).length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const newCats = { ...form.categories };
                          newCats[cat] = newCats[cat].filter((_, idx) => idx !== ii);
                          setForm({ ...form, categories: newCats });
                        }}
                        className="p-0.5 text-gray-400 hover:text-red-500"
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
                  className="text-xs text-red-600 hover:underline mt-0.5 ml-2"
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
              className="text-xs text-red-600 hover:underline mt-1"
            >
              + Add category
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  // ─── Render question details for view modal ─────────────────────────────
  const renderQuestionDetails = (q) => {
    if (!q) return null;

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase">Type</p>
            <span className={`inline-block mt-1 px-2 py-0.5 text-xs rounded ${TYPE_BADGES[q.type]}`}>
              {TYPE_LABELS[q.type] || q.type}
            </span>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase">Score</p>
            <p className="mt-1 text-sm font-medium">{q.score ?? 1}</p>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase">Competency</p>
          <p className="mt-1 text-sm">{q.competencyId?.name || '—'}</p>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase">Target Group</p>
          <p className="mt-1 text-sm capitalize">{q.targetGroup || '—'}</p>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase">Question</p>
          <p className="mt-1 text-sm whitespace-pre-wrap">{q.text}</p>
        </div>

        {q.scenario && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase">Scenario</p>
            <p className="mt-1 text-sm whitespace-pre-wrap bg-gray-50 p-3 rounded-lg border">{q.scenario}</p>
          </div>
        )}

        {['MCQ', 'MultiSelect', 'ScenarioMCQ'].includes(q.type) && q.options?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
              {q.type === 'MultiSelect' ? 'Options (Multi-Select)' : 'Options'}
            </p>
            <div className="space-y-1.5">
              {q.options.map((opt, idx) => {
                const isCorrect = q.type === 'MultiSelect' 
                  ? q.correctAnswers?.includes(opt)
                  : q.correctAnswer === opt;
                
                return (
                  <div key={idx} className={`flex items-center gap-2 p-2 rounded-lg border ${isCorrect ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                    <span className="text-xs font-medium w-6">{String.fromCharCode(65 + idx)}</span>
                    <span className="text-sm flex-1">{opt}</span>
                    {isCorrect && <Check className="w-4 h-4 text-green-600" />}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {q.type === 'TrueFalse' && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Correct Answer</p>
            <div className="p-2 bg-green-50 border border-green-200 rounded-lg">
              <span className="text-sm font-medium">{q.correctAnswer}</span>
            </div>
          </div>
        )}

        {q.type === 'Matching' && q.matchingPairs?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Matching Pairs</p>
            <div className="space-y-1.5">
              {q.matchingPairs.map((pair, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center p-2 bg-gray-50 rounded-lg border">
                  <span className="text-sm">{pair.left}</span>
                  <span className="text-gray-400 text-xs">→</span>
                  <span className="text-sm font-medium">{pair.right}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {q.type === 'Ordering' && q.correctOrder?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Correct Order</p>
            <div className="space-y-1.5">
              {q.correctOrder.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border">
                  <span className="w-5 h-5 flex items-center justify-center bg-gray-200 rounded text-xs font-bold">
                    {idx + 1}
                  </span>
                  <span className="text-sm">{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {q.type === 'DragDropClassification' && q.categories && Object.keys(q.categories).length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Categories</p>
            <div className="space-y-2">
              {Object.entries(q.categories).map(([cat, items], idx) => (
                <div key={idx} className="p-2 bg-gray-50 rounded-lg border">
                  <p className="text-sm font-semibold mb-1">{cat}</p>
                  <div className="flex flex-wrap gap-1">
                    {items.map((item, itemIdx) => (
                      <span key={itemIdx} className="px-2 py-0.5 bg-white border rounded text-xs">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-7  h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center mb-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-display font-bold text-brand-black">Question Bank</h1>
          <p className="text-sm text-gray-600">Manage questions for competencies</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={openUpload}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-950 text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors"
          >
            <Upload className="w-3.5 h-3.5" /> Upload
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add Questions
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4 flex-shrink-0">
        <select
          value={filterComp}
          onChange={(e) => setFilterComp(e.target.value)}
          className="h-8 px-2 border rounded-lg text-sm min-w-[200px]"
        >
          <option value="">All Competencies</option>
          {competencies.map(c => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="h-8 px-2 border rounded-lg text-sm w-44"
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
          className="h-8 px-2 border rounded-lg text-sm"
        >
          <option value="10">10</option>
          <option value="20">20</option>
          <option value="30">30</option>
          <option value="50">50</option>
        </select>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="bg-red-50 border border-red-200 p-2 mb-4 rounded-lg flex justify-between items-center text-sm flex-shrink-0">
          <span className="font-medium">{selectedIds.size} selected</span>
          <button
            onClick={() => setBulkDeleteModal(true)}
            className="bg-red-600 text-white px-3 py-1 rounded-lg hover:bg-red-700 text-sm"
          >
            Delete Selected
          </button>
        </div>
      )}

      {/* Questions Table - Scrollable */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden flex flex-col flex-1 min-h-0">
        {loading ? (
          <div className="flex justify-center items-center p-12 flex-1">
            <div className="w-8 h-8 border-3 border-red-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-auto flex-1">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="w-10 p-2">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                      className="w-3.5 h-3.5"
                    />
                  </th>
                  <th className="text-left p-2 font-semibold text-gray-700">Question</th>
                  <th className="text-left p-2 font-semibold text-gray-700 w-28">Type</th>
                  <th className="text-left p-2 font-semibold text-gray-700">Competency</th>
                  <th className="text-left p-2 font-semibold text-gray-700 w-28">Target</th>
                  <th className="text-right p-2 font-semibold text-gray-700 w-16">Score</th>
                  <th className="text-left p-2 font-semibold text-gray-700 w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-500 text-sm">
                      No questions found
                    </td>
                  </tr>
                ) : (
                  items.map(q => (
                    <tr key={q._id} className="hover:bg-gray-50">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(q._id)}
                          onChange={() => toggleSelect(q._id)}
                          className="w-3.5 h-3.5"
                        />
                      </td>
                      <td className="p-2 max-w-md">
                        <div className="line-clamp-1 font-medium text-sm">{q.text}</div>
                      </td>
                      <td className="p-2">
                        <span className={`px-2 py-0.5 text-xs rounded ${TYPE_BADGES[q.type]}`}>
                          {TYPE_LABELS[q.type]?.split(' ')[0] || q.type}
                        </span>
                      </td>
                      <td className="p-2 text-sm">{q.competencyId?.name || '—'}</td>
                      <td className="p-2 text-sm capitalize">{q.targetGroup?.[0]?.toUpperCase() + q.targetGroup?.slice(1) || '—'}</td>
                      <td className="p-2 text-right text-sm font-medium">{q.score ?? 1}</td>
                      <td className="p-2">
                        <div className="flex gap-2">
                          <button onClick={() => openView(q)} title="View Details">
                            <Eye size={16} className="text-gray-600 hover:text-blue-600" />
                          </button>
                          <button onClick={() => openEdit(q)} title="Edit">
                            <Edit2 size={16} className="text-gray-600 hover:text-blue-600" />
                          </button>
                          <button onClick={() => setDeleteModal(q)} title="Delete">
                            <Trash2 size={16} className="text-red-600 hover:text-red-800" />
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

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex justify-between items-center mt-4 text-sm flex-shrink-0">
          <span className="text-gray-600">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => goToPage(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="p-1 border rounded hover:bg-gray-50 disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => goToPage(pagination.page + 1)}
              disabled={pagination.page === pagination.totalPages}
              className="p-1 border rounded hover:bg-gray-50 disabled:opacity-50"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── VIEW MODAL ──────────────────────────────────────────────────── */}
      <Modal open={modal === 'view'} onClose={() => setModal(null)} title="Question Details">
        {viewQuestion && (
          <div className="max-h-[70vh] overflow-y-auto pr-1">
            {renderQuestionDetails(viewQuestion)}
          </div>
        )}
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={() => setModal(null)}
            className="px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors text-sm"
          >
            Close
          </button>
        </div>
      </Modal>

      {/* ── CREATE MODAL ──────────────────────────────────────────────────── */}
      <Modal open={modal === 'create'} onClose={() => setModal(null)} title="Add Questions" large>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
          {/* Competency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Competency <span className="text-red-600">*</span>
            </label>
            <select
              value={batchForm.competencyId}
              onChange={(e) => setBatchForm({ ...batchForm, competencyId: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:border-red-500"
            >
              <option value="">— Select —</option>
              {competencies.map(c => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Target Group Buttons */}
          {batchForm.competencyId && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Target Group <span className="text-red-600">*</span>
              </label>

              {targetGroupsForComp.length === 0 ? (
                <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
                  No target groups defined
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
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
                          px-3 py-1 rounded-full text-xs font-medium transition-all
                          ${!isAvailable
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-60 line-through'
                            : isSelected
                            ? 'bg-red-600 text-white ring-2 ring-red-300'
                            : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                          }
                        `}
                      >
                        {tg}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Question Groups */}
          {batchForm.questionGroups.map((group, groupIndex) => (
            <div
              key={groupIndex}
              className="border border-gray-200 rounded-lg p-3 bg-white shadow-sm"
            >
              <div className="flex justify-between items-center mb-2 pb-2 border-b">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm">Group {groupIndex + 1}</h3>
                  <select
                    value={group.type}
                    onChange={(e) => {
                      const newType = e.target.value;
                      const updatedQs = group.questions.map(q => ({
                        ...q,
                        type: newType,
                        targetGroup: selectedBatchTargetGroup,
                      }));
                      updateQuestionGroup(groupIndex, { type: newType, questions: updatedQs });
                    }}
                    className="border border-gray-300 rounded px-2 py-0.5 text-xs"
                  >
                    {TYPES.map(t => (
                      <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${TYPE_BADGES[group.type]}`}>
                    {group.questions.length}
                  </span>
                </div>

                {batchForm.questionGroups.length > 1 && (
                  <button
                    onClick={() => removeQuestionGroup(groupIndex)}
                    className="text-red-600 hover:text-red-700 text-xs font-medium"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {group.questions.map((q, qIndex) => (
                  <div key={qIndex} className="p-3 border border-gray-200 rounded-lg bg-gray-50">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-medium text-xs">Q{qIndex + 1}</h4>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0.5"
                          step="0.5"
                          value={q.score}
                          onChange={e => updateQuestionInGroup(groupIndex, qIndex, {
                            score: parseFloat(e.target.value) || 1
                          })}
                          className="w-16 px-2 py-0.5 border rounded text-xs"
                        />
                        {group.questions.length > 1 && (
                          <button
                            onClick={() => removeQuestionFromGroup(groupIndex, qIndex)}
                            className="text-gray-500 hover:text-red-600"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mb-3">
                      <textarea
                        rows={1}
                        value={q.text}
                        onChange={e => updateQuestionInGroup(groupIndex, qIndex, { text: e.target.value })}
                        placeholder="Enter question..."
                        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:border-red-500 resize-none"
                      />
                    </div>

                    {renderQuestionOptions(q, groupIndex, qIndex)}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => addQuestionToGroup(groupIndex)}
                  className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-red-500 hover:text-red-600 transition text-xs font-medium"
                >
                  + Add question
                </button>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addQuestionGroup}
            className="w-full py-2 border-2 border-dashed border-red-500 rounded-lg text-red-600 hover:bg-red-50 font-medium text-sm transition"
          >
            + Add Group
          </button>
        </div>

        <div className="flex justify-end gap-3 mt-4 pt-3 border-t">
          <button
            onClick={() => setModal(null)}
            className="px-4 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!batchForm.competencyId || !selectedBatchTargetGroup}
            className={`px-4 py-1.5 rounded-lg text-white font-medium text-sm ${
              batchForm.competencyId && selectedBatchTargetGroup
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-gray-400 cursor-not-allowed'
            }`}
          >
            Create
          </button>
        </div>
      </Modal>

      {/* Upload Modal */}
      <Modal open={modal === 'upload'} onClose={() => setModal(null)} title="Upload Questions from File">
        <div className="space-y-4">

          {/* ── Supported formats ──────────────────────────────────────────── */}
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 space-y-3">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Supported File Formats</p>

            <div className="grid grid-cols-3 gap-2">
              {/* PDF */}
              <div className="bg-white rounded-md border border-blue-100 p-2.5 text-center">
                <div className="w-8 h-8 mx-auto mb-1.5 rounded bg-red-100 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-red-500" />
                </div>
                <p className="text-xs font-semibold text-gray-700">.PDF</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Text-based PDFs<br/>(not scanned images)</p>
              </div>
              {/* DOCX */}
              <div className="bg-white rounded-md border border-blue-100 p-2.5 text-center">
                <div className="w-8 h-8 mx-auto mb-1.5 rounded bg-blue-100 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-blue-500" />
                </div>
                <p className="text-xs font-semibold text-gray-700">.DOCX</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Word 2007+<br/>documents</p>
              </div>
              {/* TXT */}
              <div className="bg-white rounded-md border border-blue-100 p-2.5 text-center">
                <div className="w-8 h-8 mx-auto mb-1.5 rounded bg-gray-100 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-gray-500" />
                </div>
                <p className="text-xs font-semibold text-gray-700">.TXT / .MD</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Plain text or<br/>Markdown files</p>
              </div>
            </div>

            {/* Format guide */}
            <details className="group">
              <summary className="cursor-pointer text-xs font-medium text-blue-600 hover:text-blue-800 list-none flex items-center gap-1 select-none">
                <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                Required document format
              </summary>
              <div className="mt-2 rounded-md bg-white border border-blue-100 p-3 text-[11px] text-gray-600 font-mono leading-relaxed overflow-auto max-h-52">
                <p className="font-semibold text-gray-500 mb-1 not-italic font-sans text-[10px] uppercase">MCQ example:</p>
                <pre className="whitespace-pre-wrap">{`Type: MCQ
Question 1: What does RAM stand for?
a) Read Access Memory
b) Random Access Memory *
c) Rapid Access Module
d) Read Anywhere Memory
Score: 2`}</pre>
                <p className="font-semibold text-gray-500 mb-1 mt-3 not-italic font-sans text-[10px] uppercase">True/False example:</p>
                <pre className="whitespace-pre-wrap">{`Type: TrueFalse
Question 2: The CPU is the brain of the computer.
Answer: True`}</pre>
                <p className="font-semibold text-gray-500 mb-1 mt-3 not-italic font-sans text-[10px] uppercase">MultiSelect example:</p>
                <pre className="whitespace-pre-wrap">{`Type: MultiSelect
Question 3: Which are programming languages?
a) Python *
b) HTML *
c) Photoshop
d) JavaScript *`}</pre>
                <p className="font-semibold text-gray-500 mb-1 mt-3 not-italic font-sans text-[10px] uppercase">Matching example:</p>
                <pre className="whitespace-pre-wrap">{`Type: Matching
Question 4: Match the term to its definition.
CPU -> Processes instructions
RAM -> Temporary memory
HDD -> Permanent storage`}</pre>
                <p className="font-semibold text-gray-500 mb-1 mt-3 not-italic font-sans text-[10px] uppercase">Ordering example:</p>
                <pre className="whitespace-pre-wrap">{`Type: Ordering
Question 5: Order the OSI model layers (bottom up).
1. Physical
2. Data Link
3. Network
4. Transport`}</pre>
                <p className="mt-2 text-[10px] text-gray-400 not-italic font-sans">Mark the correct MCQ option with * or (correct) after the text. Multiple types can exist in the same file.</p>
              </div>
            </details>
          </div>

          {/* ── Drop zone ──────────────────────────────────────────────────── */}
          <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center hover:border-red-400 hover:bg-red-50/30 transition-colors cursor-pointer group">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt,.md"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="cursor-pointer block">
              <Upload className="w-9 h-9 mx-auto text-gray-300 group-hover:text-red-400 transition-colors mb-2" />
              <p className="text-sm font-medium text-gray-600">Click to choose a file</p>
              <p className="text-xs text-gray-400 mt-0.5">PDF, DOCX, TXT or MD · max 10 MB</p>
            </label>
          </div>

          {/* ── Progress ───────────────────────────────────────────────────── */}
          {uploadLoading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin inline-block" />
                  Extracting text…
                </span>
                <span className="tabular-nums">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className="bg-brand-red h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* ── Success / Review ───────────────────────────────────────────── */}
          {uploadedQuestions && (
            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span className="text-sm text-green-800 font-medium">
                  {uploadedQuestions.questionGroups.reduce((sum, g) => sum + g.questions.length, 0)} question(s) extracted
                </span>
              </div>
              <button
                onClick={useUploadedQuestions}
                className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-xs font-medium transition"
              >
                Review &amp; Save →
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-end mt-4">
          <button
            onClick={() => setModal(null)}
            className="px-4 py-1.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 text-sm"
          >
            Close
          </button>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={modal === 'edit'} onClose={() => setModal(null)} title="Edit Question" large>
        {editForm && (
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Competency</label>
                <select
                  value={editForm.competencyId}
                  onChange={(e) => setEditForm({ ...editForm, competencyId: e.target.value })}
                  className="w-full h-8 px-2 rounded-lg border border-gray-300 focus:border-red-500 text-xs"
                >
                  <option value="">— Select —</option>
                  {competencies.map((c) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Type</label>
                <select
                  value={editForm.type}
                  onChange={(e) => setEditForm({
                    ...initQuestionForm(),
                    competencyId: editForm.competencyId,
                    text: editForm.text,
                    score: editForm.score,
                    type: e.target.value,
                  })}
                  className="w-full h-8 px-2 rounded-lg border border-gray-300 focus:border-red-500 text-xs"
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Score</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={editForm.score}
                onChange={(e) => setEditForm({ ...editForm, score: parseFloat(e.target.value) || 1 })}
                className="w-20 h-8 px-2 rounded-lg border border-gray-300 focus:border-red-500 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Question Text</label>
              <textarea
                rows={2}
                value={editForm.text}
                onChange={(e) => setEditForm({ ...editForm, text: e.target.value })}
                placeholder="Enter the question..."
                className="w-full px-3 py-1.5 rounded-lg border border-gray-300 focus:border-red-500 text-xs resize-none"
              />
            </div>

            {renderQuestionOptions(editForm, 0, 0, true)}
          </div>
        )}

        <div className="flex justify-end gap-3 mt-4">
          <button
            onClick={() => setModal(null)}
            className="px-4 py-1.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 text-sm"
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
            className="bg-white p-4 rounded-lg shadow-lg max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-gray-900 mb-2">Delete Question</h3>
            <p className="text-sm text-gray-600 mb-3 line-clamp-2">{deleteModal.text}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteModal(null)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 text-sm bg-red-600 text-white hover:bg-red-700 rounded-lg font-medium"
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
            className="bg-white p-4 rounded-lg shadow-lg max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-4 h-4 text-red-600" />
              </div>
              <h3 className="text-base font-bold text-gray-900">
                Delete {selectedIds.size} Question{selectedIds.size !== 1 ? 's' : ''}
              </h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setBulkDeleteModal(false)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-3 py-1.5 text-sm bg-red-600 text-white hover:bg-red-700 rounded-lg font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}