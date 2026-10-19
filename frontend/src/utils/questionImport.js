/**
 * Question upload utilities — Excel/CSV template generation, parsing and
 * validation. Parsed questions match the shape of `initQuestionForm()` in
 * pages/Questions.jsx so they can feed the batch-create modal directly.
 */

const TEMPLATE_FILENAME = 'question-upload-template.xlsx';
const DOCX_TEMPLATE_FILENAME = 'question-upload-template.docx';

// ── Canonical columns ────────────────────────────────────────────────────────
// Competency and target group are deliberately NOT columns — they are chosen
// after upload in the batch-create step.
const COLUMNS = [
  { header: 'Type',     key: 'type',       width: 24 },
  { header: 'Question', key: 'question',   width: 48 },
  { header: 'A',        key: 'a',          width: 24 },
  { header: 'B',        key: 'b',          width: 24 },
  { header: 'C',        key: 'c',          width: 24 },
  { header: 'D',        key: 'd',          width: 24 },
  { header: 'Correct',  key: 'correct',    width: 16 },
  { header: 'Score',    key: 'score',      width: 10 },
  { header: 'Scenario', key: 'scenario',   width: 36 },
  { header: 'Pairs',    key: 'pairs',      width: 36 },
  { header: 'Order',    key: 'order',      width: 36 },
  { header: 'Categories', key: 'categories', width: 36 },
];

const TYPE_ALIASES = {
  mcq: 'MCQ',
  multiplechoice: 'MCQ',
  singlchoice: 'MCQ',
  truefalse: 'TrueFalse',
  truef: 'TrueFalse',
  tf: 'TrueFalse',
  multiselect: 'MultiSelect',
  multi: 'MultiSelect',
  multipleanswers: 'MultiSelect',
  matching: 'Matching',
  match: 'Matching',
  ordering: 'Ordering',
  order: 'Ordering',
  rating: 'Rating',
  scale: 'Rating',
  likert: 'Rating',
  scenariomcq: 'ScenarioMCQ',
  scenario: 'ScenarioMCQ',
  dragdropclassification: 'DragDropClassification',
  dragdrop: 'DragDropClassification',
  classification: 'DragDropClassification',
  dragdropclassify: 'DragDropClassification',
};

const HEADER_ALIASES = {
  type: 'type',
  question: 'question',
  questiontext: 'question',
  text: 'question',
  a: 'a',
  optiona: 'a',
  option1: 'a',
  b: 'b',
  optionb: 'b',
  option2: 'b',
  c: 'c',
  optionc: 'c',
  option3: 'c',
  d: 'd',
  optiond: 'd',
  option4: 'd',
  correct: 'correct',
  correctanswer: 'correct',
  answer: 'correct',
  score: 'score',
  points: 'score',
  scenario: 'scenario',
  pairs: 'pairs',
  matchingpairs: 'pairs',
  matching: 'pairs',
  order: 'order',
  ordering: 'order',
  correctorder: 'order',
  categories: 'categories',
  classification: 'categories',
};

const normalizeHeader = (value) =>
  String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

const normalizeType = (value) => {
  const key = String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!key) return null;
  return TYPE_ALIASES[key] || null;
};

const splitList = (value) =>
  String(value ?? '')
    .split(/[;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);

const cellToText = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (value.richText) return value.richText.map((t) => t.text).join('');
    if (value.text !== undefined) return String(value.text);
    if (value.result !== undefined) return String(value.result);
    if (value instanceof Date) return value.toISOString();
    return '';
  }
  return String(value).trim();
};

// ── CSV parsing (RFC-4180-ish: quotes, escaped quotes, CRLF) ─────────────────
const parseCsvText = (text) => {
  const clean = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
};

// ── Question shape (mirrors the batch-create form in pages/Questions.jsx) ────
export const createEmptyQuestion = () => ({
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

// ── Row → question object ────────────────────────────────────────────────────
const buildQuestion = (cells, rowNumber, warnings) => {
  const get = (key) => {
    const idx = cells.__index?.[key];
    return idx === undefined ? '' : String(cells[idx] ?? '').trim();
  };

  const warn = (message) => warnings.push({ row: rowNumber, message });

  const rawType = get('type');
  let type = normalizeType(rawType);
  if (rawType && !type) {
    warn(`Unknown type "${rawType}" — imported as Multiple Choice (MCQ)`);
    type = 'MCQ';
  }
  if (!type) type = 'MCQ';

  const question = {
    ...createEmptyQuestion(),
    type,
    text: get('question'),
  };

  const rawScore = parseFloat(get('score'));
  question.score = Number.isFinite(rawScore) && rawScore > 0 ? rawScore : 1;

  const rawOptions = ['a', 'b', 'c', 'd'].map((key) => get(key));
  const optionAt = (letter) => rawOptions[letter.charCodeAt(0) - 97];

  switch (type) {
    case 'MCQ':
    case 'ScenarioMCQ':
    case 'MultiSelect': {
      const filled = rawOptions.filter(Boolean);
      if (filled.length < 2) warn('Needs at least 2 answer options (columns A–D)');

      const rawCorrect = get('correct');
      if (!rawCorrect) {
        warn('No correct answer filled in the "Correct" column');
      } else if (type === 'MultiSelect') {
        const answers = [];
        splitList(rawCorrect.replace(/[;,]/g, ';')).forEach((token) => {
          const letter = token.match(/^\(?([a-d])[).:]?$/i)?.[1];
          if (letter) {
            const text = optionAt(letter.toLowerCase());
            if (text) answers.push(text);
            else warn(`Correct answer "${token}" points to an empty option`);
            return;
          }
          const match = rawOptions.find((opt) => opt && opt.toLowerCase() === token.toLowerCase());
          if (match) answers.push(match);
          else warn(`Correct answer "${token}" does not match any option`);
        });
        question.correctAnswers = [...new Set(answers)];
      } else {
        const letter = rawCorrect.match(/^\(?([a-d])[).:]?$/i)?.[1];
        if (letter) {
          const text = optionAt(letter.toLowerCase());
          if (text) question.correctAnswer = text;
          else warn(`Correct answer "${rawCorrect}" points to an empty option`);
        } else {
          const match = rawOptions.find((opt) => opt && opt.toLowerCase() === rawCorrect.toLowerCase());
          if (match) question.correctAnswer = match;
          else warn(`Correct answer "${rawCorrect}" does not match any option (use A–D)`);
        }
      }

      question.options = filled.length > 0 ? filled : ['', '', '', ''];
      break;
    }

    case 'TrueFalse': {
      const rawCorrect = get('correct');
      if (/^t(rue)?$/i.test(rawCorrect)) question.correctAnswer = 'True';
      else if (/^f(alse)?$/i.test(rawCorrect)) question.correctAnswer = 'False';
      else warn('Correct must be "True" or "False"');
      question.options = ['True', 'False'];
      break;
    }

    case 'Matching': {
      const pairs = [];
      splitList(get('pairs')).forEach((entry) => {
        const parts = entry.split(/=|->/);
        if (parts.length >= 2) {
          const left = parts[0].trim();
          const right = parts.slice(1).join('=').trim();
          if (left && right) pairs.push({ left, right });
          else warn(`Pair "${entry}" is incomplete (use Left=Right)`);
        } else {
          warn(`Pair "${entry}" is missing "=" (use Left=Right)`);
        }
      });
      if (pairs.length < 2) warn('Needs at least 2 pairs in the "Pairs" column (Left=Right; ...)');
      if (pairs.length > 0) question.matchingPairs = pairs;
      break;
    }

    case 'Ordering': {
      const items = splitList(get('order')).map((item) =>
        item.replace(/^\d+[.)]\s*/, '').trim()
      ).filter(Boolean);
      if (items.length < 2) warn('Needs at least 2 items in the "Order" column (separated by ";")');
      if (items.length > 0) question.correctOrder = items;
      break;
    }

    case 'DragDropClassification': {
      const categories = {};
      splitList(get('categories')).forEach((entry) => {
        const colon = entry.indexOf(':');
        if (colon === -1) {
          warn(`Category "${entry}" is missing ":" (use Category: item1, item2)`);
          return;
        }
        const category = entry.slice(0, colon).trim();
        const items = entry.slice(colon + 1).split(',').map((i) => i.trim()).filter(Boolean);
        if (!category || items.length === 0) {
          warn(`Category "${entry}" has no name or no items`);
          return;
        }
        categories[category] = items;
      });
      if (Object.keys(categories).length === 0) {
        warn('Needs at least one "Category: item1, item2" group in the "Categories" column');
      } else {
        question.categories = categories;
      }
      break;
    }

    case 'Rating':
    default:
      break;
  }

  if (type === 'ScenarioMCQ') {
    question.scenario = get('scenario');
    if (!question.scenario) warn('Scenario text is empty');
  }

  return question;
};

// ── Workbook → questions ─────────────────────────────────────────────────────
export const parseQuestionFile = async (file) => {
  const name = (file?.name || '').toLowerCase();
  const isCsv = name.endsWith('.csv') || file?.type === 'text/csv';

  let sheetRows; // Array<{ row: number, cells: string[] }>

  if (isCsv) {
    const rows = parseCsvText(await file.text());
    sheetRows = rows.map((cells, i) => ({ row: i + 1, cells }));
  } else {
    const ExcelJSModule = await import('exceljs');
    const ExcelJS = ExcelJSModule.default || ExcelJSModule;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());

    const ws =
      wb.worksheets.find((s) => normalizeHeader(s.name) === 'questions') ||
      wb.worksheets[0];
    if (!ws) throw new Error('The workbook contains no worksheets.');

    sheetRows = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells = [];
      for (let c = 1; c <= COLUMNS.length; c++) {
        cells.push(cellToText(row.getCell(c).value));
      }
      if (cells.some(Boolean)) sheetRows.push({ row: row.number, cells });
    });

    if (sheetRows.length === 0) throw new Error('No rows found in the spreadsheet.');
  }

  // Find header row within the first 5 non-empty rows
  let headerIndex = -1;
  let index = {};
  for (let i = 0; i < Math.min(sheetRows.length, 5); i++) {
    const candidate = {};
    sheetRows[i].cells.forEach((cell, col) => {
      const key = HEADER_ALIASES[normalizeHeader(cell)];
      if (key && candidate[key] === undefined) candidate[key] = col;
    });
    if (candidate.question !== undefined) {
      headerIndex = i;
      index = candidate;
      break;
    }
  }

  if (headerIndex === -1) {
    throw new Error(
      'Could not find a header row. Use the downloaded template so the first row has the column names (Type, Question, A–D, ...).'
    );
  }

  const warnings = [];
  const questions = [];

  for (let i = headerIndex + 1; i < sheetRows.length; i++) {
    const { row, cells } = sheetRows[i];
    const cellsWithIndex = Object.assign([], cells, { __index: index });

    const questionText = cells[index.question] ?? '';
    const hasAnyContent = cells.some(Boolean);
    if (!hasAnyContent) continue;

    if (!questionText.trim()) {
      warnings.push({ row, message: 'Missing question text — row skipped' });
      continue;
    }

    questions.push(buildQuestion(cellsWithIndex, row, warnings));
  }

  return { questions, warnings };
};

// ── Plain-text / PDF / DOCX parser ───────────────────────────────────────────
// The "Question 1:" prefix is optional — any plain line starts a new question.
// Correct answers can be marked with a "Correct: B" / "Answer: B" line or the
// legacy * / (correct) marker after an option.
const QUESTION_PREFIX_RE = /^(?:question\s*\d*\s*:|q\s*\d+\s*:)\s*(.+)$/i;
const OPTION_RE = /^\(?([a-d])[).]\s*(.+)$/i;
const SCORE_RE = /^score\s*:\s*(\d+(?:\.\d+)?)/i;
const ANSWER_RE = /^(?:answer|correct(?:\s+answer)?)\s*:\s*(.+)$/i;
const SCENARIO_RE = /^scenario\s*:\s*(.+)$/i;
const ORDER_ITEM_RE = /^\d+[.)]\s*(.+)$/;
const CATEGORY_RE = /^(.+?)\s*:\s*(.+)$/;
const PAIR_RE = /^(.+?)\s*(?:->|=>|=)\s*(.+)$/;

export const parseQuestionsFromText = (text) => {
  let lines;
  if (text.includes('\n')) {
    lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  } else {
    const withBreaks = String(text)
      .replace(/(Type:)/gi, '\n$1')
      .replace(/(Question \d+:)/gi, '\n$1')
      .replace(/(Score:)/gi, '\n$1')
      .replace(/(Answer:)/gi, '\n$1')
      .replace(/(Correct:)/gi, '\n$1')
      .replace(/(Scenario:)/gi, '\n$1')
      .replace(/([a-dA-D][).]\s)/g, '\n$1');
    lines = withBreaks.split('\n').map((l) => l.trim()).filter(Boolean);
  }

  const questions = [];
  let currentType = 'MCQ';
  let currentQuestion = null;
  let pendingScenario = '';

  // Everything before the first "Type:" line is treated as document preamble
  // (title, instructions) and ignored. Documents without any "Type:" line still
  // parse top-to-bottom with MCQ as the default type.
  const firstTypeIndex = lines.findIndex((l) => /^type\s*:/i.test(l));
  const startIndex = firstTypeIndex === -1 ? 0 : firstTypeIndex;

  const pushCurrent = () => {
    if (currentQuestion && currentQuestion.text) questions.push(currentQuestion);
  };

  const startQuestion = (rawText) => {
    pushCurrent();
    currentQuestion = {
      ...createEmptyQuestion(),
      type: currentType,
      text: String(rawText || '').replace(/^\d+[.)]\s*/, '').trim(),
    };
    if (pendingScenario && currentType === 'ScenarioMCQ') {
      currentQuestion.scenario = pendingScenario;
      pendingScenario = '';
    }
  };

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    if (line.length < 2) continue;

    // ── Type block header ──
    const typeMatch = line.match(/^type\s*:\s*(.+)$/i);
    if (typeMatch) {
      currentType = normalizeType(typeMatch[1]) || 'MCQ';
      pushCurrent();
      currentQuestion = null;
      continue;
    }

    // ── Scenario text — can appear before or after the question line ──
    if (currentType === 'ScenarioMCQ' && SCENARIO_RE.test(line)) {
      const scMatch = line.match(SCENARIO_RE);
      const scenario = scMatch[1].trim();
      if (currentQuestion && !currentQuestion.scenario) {
        currentQuestion.scenario = scenario;
      } else {
        pendingScenario = scenario;
      }
      continue;
    }

    // ── Matching pairs ("Left -> Right") — before a plain line could start a question ──
    if (currentQuestion && currentType === 'Matching') {
      const pairMatch = line.match(PAIR_RE);
      if (pairMatch) {
        const left = pairMatch[1].trim();
        const right = pairMatch[2].trim();
        if (left && right) {
          currentQuestion.matchingPairs = currentQuestion.matchingPairs
            .filter((p) => p.left || p.right)
            .concat({ left, right });
          continue;
        }
      }
    }

    // ── Ordering items ("1. Physical") — a numbered line is an item only when
    //    it continues the 1..n sequence; otherwise it starts a new question ──
    if (currentQuestion && currentType === 'Ordering') {
      const itemMatch = line.match(ORDER_ITEM_RE);
      if (itemMatch) {
        const expected = currentQuestion.correctOrder.filter(Boolean).length + 1;
        const itemNumber = parseInt(line.match(/^(\d+)/)[1], 10);
        if (itemNumber === expected) {
          currentQuestion.correctOrder = currentQuestion.correctOrder
            .filter(Boolean)
            .concat(itemMatch[1].trim());
          continue;
        }
      }
    }

    // ── Drag-drop categories ("Hardware: CPU, RAM") ──
    if (
      currentQuestion &&
      currentType === 'DragDropClassification' &&
      !ANSWER_RE.test(line) &&
      !SCORE_RE.test(line) &&
      !SCENARIO_RE.test(line)
    ) {
      const catMatch = line.match(CATEGORY_RE);
      if (catMatch) {
        const category = catMatch[1].trim();
        const items = catMatch[2].split(',').map((s) => s.trim()).filter(Boolean);
        if (category && items.length > 0) {
          const cats = { ...currentQuestion.categories };
          delete cats[''];
          cats[category] = items;
          currentQuestion.categories = cats;
          continue;
        }
      }
    }

    // ── Legacy "Question 1:" / "Q1:" prefix (now optional) ──
    const qMatch = line.match(QUESTION_PREFIX_RE);
    if (qMatch) {
      startQuestion(qMatch[1]);
      continue;
    }

    if (currentQuestion) {
      // Score
      const scoreMatch = line.match(SCORE_RE);
      if (scoreMatch) {
        currentQuestion.score = parseFloat(scoreMatch[1]) || 1;
        continue;
      }

      // Correct answer: "Correct: B", "Answer: True", "Correct: A, C"
      const ansMatch = line.match(ANSWER_RE);
      if (ansMatch) {
        const answer = ansMatch[1].trim();
        if (currentQuestion.type === 'TrueFalse') {
          if (/^t/i.test(answer)) currentQuestion.correctAnswer = 'True';
          else if (/^f/i.test(answer)) currentQuestion.correctAnswer = 'False';
          else currentQuestion.correctAnswer = answer;
        } else if (currentQuestion.type === 'MultiSelect') {
          currentQuestion.correctAnswers = answer
            .split(/[,;]/)
            .map((a) => a.trim())
            .filter(Boolean);
        } else {
          currentQuestion.correctAnswer = answer;
        }
        continue;
      }

      // Options: "A) text" / "a) text" / "A. text", with optional * / (correct)
      const optMatch = line.match(OPTION_RE);
      if (optMatch) {
        const optionLetter = optMatch[1].toLowerCase();
        let optionText = optMatch[2].trim();

        const isCorrect = optionText.includes('*') || optionText.includes('(correct)');
        optionText = optionText.replace(/\*|\(correct\)/gi, '').trim();

        const index = optionLetter.charCodeAt(0) - 97;
        const opts = [...currentQuestion.options];
        while (opts.length <= index) opts.push('');
        opts[index] = optionText;
        currentQuestion.options = opts;

        if (isCorrect) {
          if (currentQuestion.type === 'MultiSelect') {
            currentQuestion.correctAnswers = currentQuestion.correctAnswers.includes(optionText)
              ? currentQuestion.correctAnswers
              : [...currentQuestion.correctAnswers, optionText];
          } else {
            currentQuestion.correctAnswer = optionText;
          }
        }
        continue;
      }
    }

    // ── Plain line = new question (no "Question" prefix required) ──
    startQuestion(line);
  }

  pushCurrent();

  return questions.map((q) => {
    if (['MCQ', 'MultiSelect', 'ScenarioMCQ'].includes(q.type)) {
      // Resolve option letters ("B", "(c)") against the unfiltered A–D slots
      const letterToText = (token) => {
        const letter = String(token).match(/^\(?([a-d])[).]?$/i)?.[1];
        if (!letter) return token;
        const idx = letter.toLowerCase().charCodeAt(0) - 97;
        return q.options[idx] || token;
      };

      if (q.type === 'MultiSelect') {
        q.correctAnswers = [...new Set(q.correctAnswers.map(letterToText).filter(Boolean))];
      } else if (q.correctAnswer) {
        q.correctAnswer = letterToText(q.correctAnswer);
      }

      q.options = q.options.filter(Boolean);
      if (q.options.length === 0) q.options = ['', '', '', ''];
    }
    if (q.type === 'TrueFalse') {
      q.options = ['True', 'False'];
    }
    if (q.type === 'Matching') {
      q.matchingPairs = q.matchingPairs.filter((p) => p.left && p.right);
      if (q.matchingPairs.length === 0) {
        q.matchingPairs = [{ left: '', right: '' }, { left: '', right: '' }];
      }
    }
    if (q.type === 'Ordering') {
      q.correctOrder = q.correctOrder.filter(Boolean);
      if (q.correctOrder.length === 0) q.correctOrder = ['', ''];
    }
    if (q.type === 'DragDropClassification') {
      const cats = {};
      Object.entries(q.categories || {}).forEach(([cat, items]) => {
        const trimmed = cat.trim();
        if (trimmed && items && items.length > 0) {
          const cleaned = items.filter((it) => it && it.trim());
          if (cleaned.length > 0) cats[trimmed] = cleaned;
        }
      });
      q.categories = Object.keys(cats).length > 0 ? cats : { '': [''] };
    }
    return q;
  });
};

// ── Template generation ──────────────────────────────────────────────────────
const BRAND_RED = 'FFC8102E';
const WHITE = 'FFFFFFFF';
const LIGHT = 'FFF5F5F5';

const styleHeaderRow = (row) => {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_RED } };
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    };
  });
  row.height = 22;
};

const EXAMPLE_ROWS = [
  {
    type: 'MCQ',
    question: 'What does RAM stand for?',
    a: 'Read Access Memory',
    b: 'Random Access Memory',
    c: 'Rapid Access Module',
    d: 'Read Anywhere Memory',
    correct: 'B',
    score: 2,
  },
  {
    type: 'TrueFalse',
    question: 'The CPU is often called the brain of the computer.',
    correct: 'True',
    score: 1,
  },
  {
    type: 'MultiSelect',
    question: 'Which of the following are programming languages?',
    a: 'Python',
    b: 'HTML',
    c: 'Photoshop',
    d: 'JavaScript',
    correct: 'A, B, D',
    score: 2,
  },
  {
    type: 'Matching',
    question: 'Match each component to its main function.',
    pairs: 'CPU=Processes instructions; RAM=Temporary memory; HDD=Permanent storage',
    score: 3,
  },
  {
    type: 'Ordering',
    question: 'Order the OSI model layers from bottom to top.',
    order: 'Physical; Data Link; Network; Transport',
    score: 2,
  },
  {
    type: 'Rating',
    question: 'Rate your confidence in troubleshooting network issues.',
    score: 1,
  },
  {
    type: 'ScenarioMCQ',
    question: 'What should be checked first when a branch loses connectivity?',
    scenario:
      'A branch reports that the internet is down. The router shows a solid red status light.',
    a: 'Restart every computer in the branch',
    b: 'Check the router uplink cable and status light',
    c: 'Reinstall the operating systems',
    d: 'Wait for the provider to call back',
    correct: 'B',
    score: 2,
  },
  {
    type: 'DragDropClassification',
    question: 'Classify each item as hardware or software.',
    categories: 'Hardware: CPU, RAM; Software: Windows, Linux',
    score: 2,
  },
];

const INSTRUCTIONS_ROWS = [
  ['Question Upload — Instructions', ''],
  ['', ''],
  ['How to use', ''],
  ['1', 'Fill in the "Questions" sheet, one row per question. Do not change the column names in the first row.'],
  ['2', 'The gray sample rows show one filled row per question type — replace or delete them before uploading.'],
  ['3', 'Type just the question text — there is no need to write "Question" or a number in front of it.'],
  ['4', 'Leave any column that does not apply to the question type empty.'],
  ['5', 'Save the file and upload it. You will choose the competency and target group after upload, and you can review and fix every question before saving.'],
  ['', ''],
  ['Column reference', ''],
  ['Type', 'MCQ, TrueFalse, MultiSelect, Matching, Ordering, Rating, ScenarioMCQ or DragDropClassification. Leave empty to get MCQ.'],
  ['Question', 'The question text. Just type it directly — no "Question 1:" prefix needed.'],
  ['A – D', 'Answer options for MCQ, MultiSelect and ScenarioMCQ.'],
  ['Correct', 'MCQ / ScenarioMCQ: the option letter (e.g. B), or the exact option text.\nMultiSelect: letters or option texts separated by commas (e.g. A, C).\nTrueFalse: True or False.'],
  ['Score', 'Points for the question. Optional — defaults to 1.'],
  ['Scenario', 'ScenarioMCQ only: the background text shown above the question.'],
  ['Pairs', 'Matching only: "Left=Right" pairs separated by ";" (e.g. CPU=Processes instructions; RAM=Temporary memory).'],
  ['Order', 'Ordering only: items in the correct order separated by ";" — numbers are optional.'],
  ['Categories', 'DragDropClassification only: "Category: item1, item2" groups separated by ";" (e.g. Hardware: CPU, RAM; Software: Windows).'],
  ['', ''],
  ['Notes', ''],
  ['', 'All cells accept ";" and line breaks (Alt+Enter) as separators.'],
  ['', 'The same template can be filled in any spreadsheet app and saved as .csv.'],
];

export const downloadQuestionTemplate = async () => {
  const ExcelJSModule = await import('exceljs');
  const ExcelJS = ExcelJSModule.default || ExcelJSModule;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Zemen Bank CAS';
  wb.created = new Date();

  const sampleBorders = {
    top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  };
  const sampleFont = { italic: true, color: { argb: 'FF6B7280' } };
  const sampleFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };

  // ── Questions sheet (header + gray sample rows) ──
  const questionsWs = wb.addWorksheet('Questions');
  questionsWs.columns = COLUMNS.map(({ header, key, width }) => ({ header, key, width }));
  styleHeaderRow(questionsWs.getRow(1));
  questionsWs.views = [{ state: 'frozen', ySplit: 1 }];

  EXAMPLE_ROWS.forEach((example) => {
    const row = questionsWs.addRow(example);
    row.eachCell((cell) => {
      cell.border = sampleBorders;
      cell.font = sampleFont;
      cell.fill = sampleFill;
      cell.alignment = { vertical: 'top', wrapText: true };
    });
  });

  for (let r = 2; r <= 200; r++) {
    questionsWs.getCell(`A${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"MCQ,TrueFalse,MultiSelect,Matching,Ordering,Rating,ScenarioMCQ,DragDropClassification"'],
    };
  }

  // ── Instructions sheet ──
  const instructionsWs = wb.addWorksheet('Instructions');
  instructionsWs.columns = [
    { width: 4 },
    { width: 18 },
    { width: 100 },
  ];
  INSTRUCTIONS_ROWS.forEach((cells) => {
    const row = instructionsWs.addRow(['', ...cells]);
    const titleCell = row.getCell(2);
    if (titleCell.value === 'Question Upload — Instructions') {
      row.getCell(2).font = { bold: true, size: 14, color: { argb: BRAND_RED } };
    } else if (['How to use', 'Column reference', 'Notes'].includes(titleCell.value)) {
      titleCell.font = { bold: true, size: 12 };
    }
    const valueCell = row.getCell(3);
    if (valueCell.value) valueCell.alignment = { vertical: 'top', wrapText: true };
  });

  // Write and download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = TEMPLATE_FILENAME;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  return TEMPLATE_FILENAME;
};

// ── Word template generation ─────────────────────────────────────────────────
const DOCX_SAMPLES = [
  {
    lines: [
      'Type: MCQ',
      '1. What does RAM stand for?',
      'A) Read Access Memory',
      'B) Random Access Memory',
      'C) Rapid Access Module',
      'D) Read Anywhere Memory',
      'Correct: B',
      'Score: 2',
    ],
  },
  {
    lines: [
      'Type: TrueFalse',
      '2. The CPU is often called the brain of the computer.',
      'Correct: True',
    ],
  },
  {
    lines: [
      'Type: MultiSelect',
      '3. Which of the following are programming languages?',
      'A) Python',
      'B) HTML',
      'C) Photoshop',
      'D) JavaScript',
      'Correct: A, B, D',
      'Score: 2',
    ],
  },
  {
    lines: [
      'Type: Matching',
      '4. Match each component to its main function.',
      'CPU -> Processes instructions',
      'RAM -> Temporary memory',
      'HDD -> Permanent storage',
      'Score: 3',
    ],
  },
  {
    lines: [
      'Type: Ordering',
      '5. Order the OSI model layers from bottom to top.',
      '1. Physical',
      '2. Data Link',
      '3. Network',
      '4. Transport',
      'Score: 2',
    ],
  },
  {
    lines: [
      'Type: Rating',
      '6. Rate your confidence in troubleshooting network issues.',
      'Score: 1',
    ],
  },
  {
    lines: [
      'Type: ScenarioMCQ',
      'Scenario: A branch reports that the internet is down. The router shows a solid red status light.',
      '7. What should be checked first when a branch loses connectivity?',
      'A) Restart every computer in the branch',
      'B) Check the router uplink cable and status light',
      'C) Reinstall the operating systems',
      'D) Wait for the provider to call back',
      'Correct: B',
      'Score: 2',
    ],
  },
  {
    lines: [
      'Type: DragDropClassification',
      '8. Classify each item as hardware or software.',
      'Hardware: CPU, RAM',
      'Software: Windows, Linux',
      'Score: 2',
    ],
  },
];

const DOCX_HOW_TO = [
  'Replace the sample questions below with your own — or keep the ones you need and delete the rest.',
  'Type each question directly. You can number your questions ("1.", "2.", ...) — there is no need to write the word "Question".',
  'Keep each question on a single line, and leave one blank line between questions.',
  'Mark the correct answer with a "Correct:" line — for example "Correct: B". For multi-select questions, separate the letters with commas: "Correct: A, C".',
  'Available types: MCQ, TrueFalse, MultiSelect, Matching, Ordering, Rating, ScenarioMCQ, DragDropClassification.',
  'The competency and target group are selected after upload, so they are not part of this document.',
];

export const downloadDocxTemplate = async () => {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');

  const children = [
    new Paragraph({
      text: 'Question Upload — Word Template',
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      children: [new TextRun({ text: 'How to use', bold: true, size: 24 })],
      spacing: { before: 240, after: 120 },
    }),
    ...DOCX_HOW_TO.map(
      (t) =>
        new Paragraph({
          text: t,
          bullet: { level: 0 },
          spacing: { after: 80 },
        })
    ),
    new Paragraph({
      text: 'Sample questions',
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240 },
    }),
  ];

  DOCX_SAMPLES.forEach((sample) => {
    children.push(
      ...sample.lines.map(
        (line, index) =>
          new Paragraph({
            children: [new TextRun({ text: line, font: 'Courier New', size: 20 })],
            spacing: { before: index === 0 ? 240 : 0, after: 0 },
          })
      )
    );
  });

  const doc = new Document({
    creator: 'Zemen Bank CAS',
    title: 'Question Upload Template',
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = DOCX_TEMPLATE_FILENAME;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  return DOCX_TEMPLATE_FILENAME;
};
