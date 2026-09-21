import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'url';
import { buildResultFilter, fetchLiveResults } from './analyticsService.js';
import { assignLevel } from '../utils/scoring.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPORTS_DIR = path.join(__dirname, '..', '..', 'storage', 'reports');

const MAX_ROWS = 20000;

// ─── Live dataset (Tier-1 semantics) ──────────────────────────────────────────
// Flat per-competency Result rows from FINAL results of COMPLETED assessments,
// gated by the same per (user × assessment) mean rule Tier 1 uses for
// scoreMin / scoreMax / overallLevel.
export const fetchScopedRows = async ({ filters = {}, user = null }) => {
  const { scoreMin, scoreMax, overallLevel } = filters;
  const where = await buildResultFilter(filters, user);
  const all = await fetchLiveResults(where);

  const groups = new Map();
  for (const r of all) {
    const key = `${r.userId}|||${r.assessmentId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const kept = new Set();
  for (const [key, rs] of groups) {
    const mean = Math.round(rs.reduce((s, r) => s + (r.finalScore || 0), 0) / rs.length);
    if (scoreMin !== undefined && scoreMin !== '' && mean < Number(scoreMin)) continue;
    if (scoreMax !== undefined && scoreMax !== '' && mean > Number(scoreMax)) continue;
    if (overallLevel && assignLevel(mean) !== overallLevel) continue;
    kept.add(key);
  }

  const monthOf = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
  };

  const rows = [];
  for (const r of all) {
    if (!kept.has(`${r.userId}|||${r.assessmentId}`)) continue;
    const u = r.user || {};
    const a = r.assessment || {};
    const c = r.competency || {};
    const sd = r.scoreDetails || {};
    const grp = groups.get(`${r.userId}|||${r.assessmentId}`) || [];
    const overall = grp.length
      ? Math.round(grp.reduce((s, g) => s + (g.finalScore || 0), 0) / grp.length)
      : Math.round(r.finalScore || 0);
    rows.push({
      employeeName: u.name || '—',
      employeeId: u.employeeId || '',
      department: u.department || '—',
      position: u.position || '—',
      gender: u.gender || '—',
      assessment: a.description || c.name || '—',
      assessmentType: a.type || '—',
      purpose: a.purpose || '—',
      targetGroup: a.targetGroup || '—',
      competency: c.name || '—',
      competencyCategory: c.category || '—',
      selfScore: sd.selfScore ?? null,
      supervisorScore: sd.supervisorScore ?? null,
      score: r.finalScore ?? null,
      level: r.level || '—',
      overallScore: overall,
      overallLevel: assignLevel(overall),
      date: monthOf(a.endDate),
    });
    if (rows.length >= MAX_ROWS) break;
  }
  return rows;
};

// ─── Pivot builder ────────────────────────────────────────────────────────────
export const PIVOT_FIELDS = [
  'employeeName', 'department', 'position', 'gender', 'competency',
  'competencyCategory', 'level', 'purpose', 'assessmentType',
  'targetGroup', 'date',
];

const FIELD_MAP = {
  employeeName:       r => r.employeeName    || '—',
  department:         r => r.department       || '—',
  position:           r => r.position         || '—',
  gender:             r => r.gender           || '—',
  competency:         r => r.competency       || '—',
  competencyCategory: r => r.competencyCategory || '—',
  level:              r => r.level            || '—',
  purpose:            r => r.purpose          || '—',
  assessmentType:     r => r.assessmentType   || '—',
  targetGroup:        r => r.targetGroup      || '—',
  date:               r => r.date             || '—',
};

export const buildPivot = (raw, { rowField, colField = null, valueField = 'score', aggregation = 'avg' }) => {
  const getRow = FIELD_MAP[rowField] || (r => '—');
  const getCol = colField ? (FIELD_MAP[colField] || (() => '—')) : null;

  const buckets = {};
  const rowVals = new Set();
  const colVals = new Set();

  raw.forEach(r => {
    const rv = getRow(r);
    const cv = getCol ? getCol(r) : '__total__';
    const key = `${rv}|||${cv}`;
    rowVals.add(rv);
    colVals.add(cv);
    if (!buckets[key]) buckets[key] = [];
    const v = valueField === 'score' ? r.score
      : valueField === 'selfScore' ? r.selfScore
      : valueField === 'supervisorScore' ? r.supervisorScore
      : 1;
    if (v !== null && v !== undefined) buckets[key].push(Number(v) || 0);
  });

  const compute = (vals) => {
    if (!vals || !vals.length) return null;
    if (aggregation === 'count') return vals.length;
    if (aggregation === 'sum') return parseFloat(vals.reduce((a, b) => a + b, 0).toFixed(2));
    return parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
  };

  const rowArr = [...rowVals].sort();
  const colArr = getCol ? [...colVals].filter(c => c !== '__total__').sort() : null;

  const matrix = rowArr.map(rv => {
    const cells = {};
    if (colArr) {
      colArr.forEach(cv => {
        cells[cv] = compute(buckets[`${rv}|||${cv}`]);
      });
      cells.__rowTotal = compute(colArr.flatMap(cv => buckets[`${rv}|||${cv}`] || []));
    } else {
      cells.__value = compute(buckets[`${rv}|||__total__`]);
    }
    return { rowLabel: rv, cells };
  });

  const colTotals = {};
  if (colArr) {
    colArr.forEach(cv => {
      colTotals[cv] = compute(rowArr.flatMap(rv => buckets[`${rv}|||${cv}`] || []));
    });
    colTotals.__rowTotal = compute(Object.values(buckets).flat());
  }

  return { rowArr, colArr, buckets, compute, matrix, colTotals, totalRows: raw.length };
};

// ─── Excel writers ────────────────────────────────────────────────────────────
const RED = 'FFC8102E';

const styleHeader = (fill = 'FF1e293b') => ({
  font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } },
  alignment: { vertical: 'middle', horizontal: 'center' },
  border: { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } },
});

const addTitleBlock = (ws, { title, meta, colCount }) => {
  ws.addRow([title]);
  ws.getRow(1).height = 28;
  ws.getRow(1).getCell(1).font = { bold: true, size: 14, color: { argb: RED } };
  ws.getRow(1).getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1F2' } };
  ws.mergeCells(1, 1, 1, colCount);
  ws.addRow([meta]);
  ws.getRow(2).getCell(1).font = { italic: true, size: 8, color: { argb: 'FF64748B' } };
  ws.mergeCells(2, 1, 2, colCount);
  ws.addRow([]);
};

export const buildFlatWorkbook = ({ title, meta, rows }) => {
  const headers = [
    'Employee', 'Emp ID', 'Department', 'Position', 'Gender',
    'Assessment', 'Type', 'Purpose', 'Target Group',
    'Competency', 'Category', 'Self', 'Supervisor', 'Score', 'Level',
    'Overall', 'Overall Level', 'Month',
  ];
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ZB CAS';
  wb.created = new Date();
  const ws = wb.addWorksheet('Report');
  ws.columns = headers.map((h, i) => ({ width: [22, 12, 18, 18, 10, 26, 14, 16, 14, 26, 14, 9, 11, 9, 13, 9, 13, 9][i] || 14 }));
  addTitleBlock(ws, { title, meta, colCount: headers.length });

  const headerRow = ws.addRow(headers);
  headerRow.eachCell(cell => Object.assign(cell, styleHeader()));
  headerRow.height = 22;

  rows.forEach((r, i) => {
    const row = ws.addRow([
      r.employeeName, r.employeeId, r.department, r.position, r.gender,
      r.assessment, r.assessmentType, r.purpose, r.targetGroup,
      r.competency, r.competencyCategory,
      r.selfScore ?? '', r.supervisorScore ?? '', r.score ?? '', r.level,
      r.overallScore, r.overallLevel, r.date,
    ]);
    row.height = 15;
    const bg = i % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC';
    row.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } };
      cell.font = { size: 9 };
    });
  });

  const scores = rows.map(r => r.score).filter(v => typeof v === 'number');
  const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '—';
  const totalRow = ws.addRow(['', '', '', '', '', '', '', '', '', '', '', '', `Avg: ${avg}`, '', '', `Rows: ${rows.length}`, '', '']);
  totalRow.eachCell(cell => Object.assign(cell, {
    font: { bold: true, size: 9 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE5E5' } },
  }));
  return wb;
};

export const buildPivotWorkbook = ({ title, meta, pivotCfg, pivot }) => {
  const { rowField, colField, valueField, aggregation } = pivotCfg;
  const { rowArr, colArr, buckets, compute } = pivot;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ZB CAS';
  wb.created = new Date();
  const ws = wb.addWorksheet('Custom Report');
  addTitleBlock(ws, { title, meta, colCount: colArr ? colArr.length + 2 : 2 });

  const headerRow = ws.addRow(colArr
    ? [rowField, ...colArr, 'Total']
    : [rowField, `${aggregation} of ${valueField}`]);
  headerRow.eachCell(cell => Object.assign(cell, styleHeader(RED)));
  headerRow.height = 20;

  rowArr.forEach(rv => {
    let values;
    if (colArr) {
      const vals = colArr.map(cv => compute(buckets[`${rv}|||${cv}`]));
      const allVals = colArr.flatMap(cv => buckets[`${rv}|||${cv}`] || []);
      values = [rv, ...vals, compute(allVals)];
    } else {
      values = [rv, compute(buckets[`${rv}|||__total__`])];
    }
    const row = ws.addRow(values);
    row.getCell(1).font = { bold: true, size: 9 };
  });

  if (colArr) {
    const tots = colArr.map(cv => compute(rowArr.flatMap(rv => buckets[`${rv}|||${cv}`] || [])));
    const totRow = ws.addRow(['Total', ...tots, compute(Object.values(buckets).flat())]);
    totRow.eachCell(cell => Object.assign(cell, {
      font: { bold: true, size: 9 },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE5E5' } },
    }));
  }

  ws.getColumn(1).width = 28;
  if (colArr) colArr.forEach((_, i) => { ws.getColumn(i + 2).width = 14; });
  else ws.getColumn(2).width = 16;
  return wb;
};

// ─── In-page preview ────────────────────────────────────────────────────────
const cellToText = (v) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toLocaleString();
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map(t => t?.text || '').join('');
    if (v.result !== undefined) return String(v.result);   // formula → computed value
    if (v.text !== undefined) return String(v.text);       // hyperlink → display text
    if (v.hyperlink !== undefined) return String(v.hyperlink);
    if (v.error !== undefined) return `#${v.error}`;       // cell error
  }
  return '';
};

// Reads the first worksheet and returns header + up to `rowLimit` data rows as
// plain strings, so the frontend can render an in-page preview without shipping
// the whole workbook to the browser.
export const previewWorkbook = async (absPath, { rowLimit = 100, colLimit = 30 } = {}) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(absPath);
  const ws = wb.worksheets[0];
  if (!ws) return { sheetName: '', columns: [], rows: [], totalRows: 0, truncated: false };

  let headerSeen = false;
  let columns = [];
  const rows = [];
  let totalRows = 0;

  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      if (cell.col > colLimit) return false;
      cells[cell.col - 1] = cellToText(cell.value);
      return true;
    });
    const distinct = [...new Set(cells)].filter(c => c !== '');
    if (!headerSeen) {
      if (distinct.length >= 2) { headerSeen = true; columns = cells; }
      return;
    }
    totalRows++;
    if (rows.length < rowLimit) {
      if (cells[0] === '') return;   // skip summary/totals rows (flat workbook footer)
      rows.push(cells);
    }
  });

  return {
    sheetName: ws.name,
    columns,
    rows,
    totalRows,
    truncated: totalRows > rowLimit,
  };
};

// ─── File storage ─────────────────────────────────────────────────────────────
export const ensureStorageDir = () => {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  return REPORTS_DIR;
};

export const slugify = (s) =>
  String(s || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'report';

export const saveWorkbook = async (workbook, baseName) => {
  ensureStorageDir();
  const fileName = `${slugify(baseName)}_${Date.now()}.xlsx`;
  const absPath = path.join(REPORTS_DIR, fileName);
  await workbook.xlsx.writeFile(absPath);
  return { fileName, absPath };
};

export const removeFile = async (fileName) => {
  try {
    await fs.promises.unlink(path.join(REPORTS_DIR, path.basename(fileName)));
  } catch { /* already gone — ignore */ }
};
