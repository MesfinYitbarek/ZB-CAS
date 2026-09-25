import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'url';
import { buildResultFilter, fetchLiveResults } from './analyticsService.js';
import { assignLevel } from '../utils/scoring.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPORTS_DIR = path.join(__dirname, '..', '..', 'storage', 'reports');

export const MAX_ROWS = 20000;

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
  let truncated = false;
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
      userId: r.userId,
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
      rawDate: a.endDate || null,
    });
    if (rows.length >= MAX_ROWS) { truncated = true; break; }
  }
  return { rows, truncated };
};

// ─── Pivot config ─────────────────────────────────────────────────────────────
export const PIVOT_FIELDS = [
  'employeeName', 'department', 'position', 'gender', 'competency',
  'competencyCategory', 'level', 'purpose', 'assessmentType',
  'targetGroup', 'date',
];

export const VALUE_FIELDS = ['score', 'selfScore', 'supervisorScore', 'gap', 'count'];
export const AGGREGATIONS = ['avg', 'sum', 'count', 'min', 'max', 'median', 'distinct', 'pctRow', 'pctCol'];
export const DATE_TRUNCS = ['month', 'quarter', 'year', 'week'];
export const ROW_ORDERS = ['label', 'value-desc', 'value-asc'];
export const DEFAULT_MAX_COLUMNS = 20;

const LEVEL_ORDER = { Basic: 0, Intermediate: 1, Advanced: 2, Expert: 3 };

export const VALUE_LABELS = {
  score: 'Score', selfScore: 'Self', supervisorScore: 'Supervisor',
  gap: 'Gap (Sup−Self)', count: 'Records',
};
export const AGG_LABELS = {
  avg: 'Avg', sum: 'Sum', count: 'Count', min: 'Min', max: 'Max',
  median: 'Median', distinct: 'Distinct staff', pctRow: '% of row', pctCol: '% of column',
};

export const metricLabel = ({ valueField, aggregation }) =>
  aggregation === 'count' ? 'Records' : `${AGG_LABELS[aggregation] || aggregation} ${VALUE_LABELS[valueField] || valueField}`;

// Accepts the legacy { rowField, colField, valueField, aggregation } shape and
// normalizes to { rowFields[], colField, values[], dateTrunc, orderRows, topRows, maxColumns }.
export const normalizePivotCfg = (p = {}) => {
  const rowFields = (Array.isArray(p.rowFields) && p.rowFields.length ? p.rowFields : (p.rowField ? [p.rowField] : []))
    .filter((f) => PIVOT_FIELDS.includes(f));
  const values = (Array.isArray(p.values) && p.values.length ? p.values : [{
    valueField: p.valueField || 'score',
    aggregation: p.aggregation || 'avg',
  }]).map((v) => ({
    valueField: VALUE_FIELDS.includes(v.valueField) ? v.valueField : 'score',
    aggregation: AGGREGATIONS.includes(v.aggregation) ? v.aggregation : 'avg',
  }));
  return {
    rowFields: (rowFields.length ? rowFields : ['department']).slice(0, 3),
    colField: p.colField && PIVOT_FIELDS.includes(p.colField) ? p.colField : null,
    values: values.slice(0, 3),
    dateTrunc: DATE_TRUNCS.includes(p.dateTrunc) ? p.dateTrunc : 'month',
    orderRows: ROW_ORDERS.includes(p.orderRows) ? p.orderRows : 'label',
    topRows: Number.isInteger(p.topRows) && p.topRows > 0 ? Math.min(p.topRows, 500) : null,
    maxColumns: Number.isInteger(p.maxColumns) && p.maxColumns > 0 ? Math.min(p.maxColumns, 100) : DEFAULT_MAX_COLUMNS,
  };
};

const round2 = (n) => parseFloat(Number(n).toFixed(2));

const truncDate = (iso, trunc) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  if (trunc === 'year') return `${y}`;
  if (trunc === 'quarter') return `${y}-Q${Math.ceil(m / 3)}`;
  if (trunc === 'week') {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = (t.getUTCDay() + 6) % 7;
    t.setUTCDate(t.getUTCDate() - day + 3);
    const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(((t - firstThu) / 864e5 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
    return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }
  return `${y}-${String(m).padStart(2, '0')}`;
};

const fieldValue = (r, field, dateTrunc) => {
  if (field === 'date') {
    if (dateTrunc && dateTrunc !== 'month' && r.rawDate) return truncDate(r.rawDate, dateTrunc) || '—';
    return r.date || '—';
  }
  const v = r[field];
  return v === null || v === undefined || v === '' ? '—' : String(v);
};

const compareFieldValues = (field, a, b) => {
  if (field === 'level') {
    const d = (LEVEL_ORDER[a] ?? 99) - (LEVEL_ORDER[b] ?? 99);
    if (d) return d;
  }
  return a < b ? -1 : a > b ? 1 : 0;
};

const metricValue = (r, valueField) => {
  if (valueField === 'count') return 1;
  if (valueField === 'gap') {
    if (r.selfScore == null || r.supervisorScore == null) return null;
    return Number(r.supervisorScore) - Number(r.selfScore);
  }
  const v = valueField === 'selfScore' ? r.selfScore
    : valueField === 'supervisorScore' ? r.supervisorScore : r.score;
  return v == null ? null : Number(v) || 0;
};

// Buckets hold { v, emp } pairs so count/distinct work on records, not values.
const computePairs = (pairs, aggregation) => {
  if (!pairs.length) return aggregation === 'count' ? 0 : null;
  const vs = pairs.map((p) => p.v);
  switch (aggregation) {
    case 'count': return pairs.length;
    case 'sum': return round2(vs.reduce((a, b) => a + b, 0));
    case 'min': return Math.min(...vs);
    case 'max': return Math.max(...vs);
    case 'median': {
      const s = [...vs].sort((a, b) => a - b);
      const m = s.length >> 1;
      return s.length % 2 ? s[m] : round2((s[m - 1] + s[m]) / 2);
    }
    case 'distinct': return new Set(pairs.map((p) => p.emp)).size;
    case 'pctRow':
    case 'pctCol':
      return round2(vs.reduce((a, b) => a + b, 0)); // share applied at matrix stage
    case 'avg':
    default:
      return round2(vs.reduce((a, b) => a + b, 0) / vs.length);
  }
};

// ─── Pivot builder ────────────────────────────────────────────────────────────
// Multi row levels (with subtotals), optional column field (capped), multiple
// value metrics. Legacy single-row/single-metric configs normalize to the same
// output the old builder produced (plus: count→0 instead of blank, semantic
// level ordering).
export const buildPivot = (raw, cfgIn = {}) => {
  const cfg = normalizePivotCfg(cfgIn);
  const { rowFields, colField, values, dateTrunc, orderRows, topRows, maxColumns } = cfg;
  const records = Array.isArray(raw) ? raw : [];
  const notices = [];

  // 1. Group records by full row path (JSON keys are collision-safe)
  const pathMap = new Map();
  for (const r of records) {
    const path = rowFields.map((f) => fieldValue(r, f, dateTrunc));
    const key = JSON.stringify(path);
    let g = pathMap.get(key);
    if (!g) { g = { path, rows: [] }; pathMap.set(key, g); }
    g.rows.push(r);
  }

  // 2. Column values, capped at maxColumns (fold the tail into Other)
  let colValues = null;
  if (colField) {
    const counts = new Map();
    for (const r of records) {
      const cv = fieldValue(r, colField, dateTrunc);
      counts.set(cv, (counts.get(cv) || 0) + 1);
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    let kept = ranked.map(([v]) => v);
    if (ranked.length > maxColumns) {
      const hidden = ranked.length - maxColumns;
      kept = ranked.slice(0, maxColumns).map(([v]) => v);
      const otherLabel = `Other (${hidden} more)`;
      kept.push(otherLabel);
      notices.push({ code: 'capped_columns', message: `Column values capped at ${maxColumns} — ${hidden} folded into "${otherLabel}".` });
    }
    const keptSet = new Set(kept);
    colValues = kept.sort((a, b) => compareFieldValues(colField, a, b));
    var colOf = (r) => {
      const cv = fieldValue(r, colField, dateTrunc);
      if (keptSet.has(cv)) return cv;
      return kept[kept.length - 1]; // the Other bucket
    };
  }

  // 3. Per-cell metric computation from record rows
  const metricCells = (rows, mi) => {
    const { valueField, aggregation } = values[mi];
    if (aggregation === 'count') return rows.length;
    const pairs = [];
    for (const r of rows) {
      const v = metricValue(r, valueField);
      if (v == null) continue;
      pairs.push({ v, emp: r.userId || r.employeeName });
    }
    return computePairs(pairs, aggregation);
  };
  const entryCells = (rows) => {
    const cells = {};
    if (colValues) {
      for (const cv of colValues) {
        cells[cv] = values.map((_, mi) => metricCells(rows.filter((r) => colOf(r) === cv), mi));
      }
    }
    return cells;
  };
  const entryTotals = (rows) =>
    values.map((_, mi) => metricCells(rows, mi));

  // 4. Detail entries (one per distinct row path)
  let details = [...pathMap.values()].map((g) => ({
    kind: 'detail',
    path: g.path,
    rows: g.rows,
    cells: entryCells(g.rows),
    totals: entryTotals(g.rows),
  }));

  // 5. Ordering (+ optional top-N on the first metric's row total)
  const firstMetricTotal = (e) => e.totals[0];
  if (orderRows === 'value-desc' || orderRows === 'value-asc') {
    const dir = orderRows === 'value-desc' ? -1 : 1;
    details.sort((a, b) => {
      const av = firstMetricTotal(a);
      const bv = firstMetricTotal(b);
      const an = av == null ? -Infinity : av;
      const bn = bv == null ? -Infinity : bv;
      return (an - bn) * dir;
    });
  } else {
    details.sort((a, b) => {
      for (let i = 0; i < rowFields.length; i++) {
        const c = compareFieldValues(rowFields[i], a.path[i], b.path[i]);
        if (c) return c;
      }
      return 0;
    });
  }
  if (topRows) details = details.slice(0, topRows);

  // 6. Percent shares (pctRow: share of the entry's row sum; pctCol: share of the column sum)
  const pctIdx = values
    .map((v, mi) => ({ ...v, mi }))
    .filter((v) => v.aggregation === 'pctRow' || v.aggregation === 'pctCol');
  const colSums = {};
  if (pctIdx.length && colValues) {
    for (const cv of colValues) {
      colSums[cv] = values.map((_, mi) => {
        let s = 0;
        for (const d of details) for (const r of d.rows) {
          if (colOf(r) !== cv) continue;
          const v = metricValue(r, values[mi].valueField);
          if (v != null) s += v;
        }
        return round2(s);
      });
    }
  }
  const pctCell = (entrySum, denomSum) =>
    denomSum > 0 ? parseFloat(((entrySum / denomSum) * 100).toFixed(1)) : null;
  if (pctIdx.length) {
    const convEntry = (entry) => {
      for (const { aggregation, mi } of pctIdx) {
        if (aggregation === 'pctRow') {
          const denom = entryTotals(entry.rows)[mi];
          if (colValues) {
            for (const cv of colValues) {
              const s = entryCells(entry.rows)[cv][mi];
              entry.cells[cv][mi] = pctCell(s, denom);
            }
          }
          entry.totals[mi] = denom > 0 ? 100 : null;
        } else {
          if (colValues) {
            for (const cv of colValues) {
              const s = entryCells(entry.rows)[cv][mi];
              entry.cells[cv][mi] = pctCell(s, colSums[cv][mi]);
            }
          }
          entry.totals[mi] = null;
        }
      }
    };
    details.forEach(convEntry);
  }

  // 7. Body assembly with subtotals (levels above the deepest emit one per group)
  const body = [];
  const L = rowFields.length;
  const openGroups = new Map(); // depth -> { key, rows }
  const flushSubtotal = (depth) => {
    const g = openGroups.get(depth);
    if (!g || g.rows.length === 0) { openGroups.delete(depth); return; }
    const cells = entryCells(g.rows);
    const totals = entryTotals(g.rows);
    if (pctIdx.length) {
      // recompute percent cells against the subtotal's own rows
      for (const { aggregation, mi } of pctIdx) {
        if (aggregation === 'pctRow') {
          const denom = totals[mi];
          if (colValues) for (const cv of colValues) cells[cv][mi] = pctCell(cells[cv][mi], denom);
          totals[mi] = denom > 0 ? 100 : null;
        } else if (colValues) {
          for (const cv of colValues) cells[cv][mi] = pctCell(cells[cv][mi], colSums[cv][mi]);
          totals[mi] = null;
        }
      }
    }
    body.push({ kind: 'subtotal', path: g.prefix, depth, cells, totals });
    openGroups.delete(depth);
  };
  details.forEach((d, di) => {
    for (let depth = 0; depth < L - 1; depth++) {
      const key = JSON.stringify(d.path.slice(0, depth + 1));
      const open = openGroups.get(depth);
      if (!open || open.key !== key) {
        if (open) flushSubtotal(depth);
        // close deeper groups first (they belong to the previous outer group)
        for (let dd = L - 2; dd > depth; dd--) flushSubtotal(dd);
        openGroups.set(depth, { key, prefix: d.path.slice(0, depth + 1), rows: [] });
      }
      openGroups.get(depth).rows.push(...d.rows);
    }
    body.push({ kind: 'detail', path: d.path, depth: L - 1, cells: d.cells, totals: d.totals });
    if (di === details.length - 1) for (let depth = L - 2; depth >= 0; depth--) flushSubtotal(depth);
  });

  // 8. Column totals + grand total (over included detail rows)
  const includedRows = details.flatMap((d) => d.rows);
  const colTotals = {};
  if (colValues) {
    for (const cv of colValues) {
      colTotals[cv] = values.map((v, mi) => {
        if (v.aggregation === 'pctCol') return 100;
        if (v.aggregation === 'pctRow') {
          const denom = entryTotals(includedRows.filter((r) => colOf(r) === cv))[mi];
          return denom > 0 ? 100 : null;
        }
        return metricCells(includedRows.filter((r) => colOf(r) === cv), mi);
      });
    }
  }
  const grand = values.map((v, mi) => {
    if (v.aggregation === 'pctRow' || v.aggregation === 'pctCol') {
      const denom = entryTotals(includedRows)[mi];
      return denom > 0 ? 100 : null;
    }
    return metricCells(includedRows, mi);
  });

  // Legacy aliases (single row level + single metric behave exactly as before)
  const rowArr = [...new Set(details.map((d) => d.path[0]))].sort((a, b) =>
    compareFieldValues(rowFields[0], a, b));
  const colArr = colValues ? [...colValues] : null;
  const matrix = body.map((e) => {
    const label = e.kind === 'subtotal'
      ? `${e.path[e.depth]} Total`
      : e.path.join(' › ');
    const cells = {};
    if (colArr) {
      colArr.forEach((cv) => { cells[cv] = e.cells[cv][0]; });
      cells.__rowTotal = e.totals[0];
    } else {
      cells.__value = e.totals[0];
    }
    return { rowLabel: label, cells, kind: e.kind };
  });
  const legacyColTotals = {};
  if (colArr) {
    colArr.forEach((cv) => { legacyColTotals[cv] = colTotals[cv][0]; });
    legacyColTotals.__rowTotal = grand[0];
  }

  return {
    rowFields, colField, values, dateTrunc, orderRows, topRows,
    rowArr, colArr, matrix, colTotals: legacyColTotals,
    body, colValues, colTotalsByMetric: colTotals, grand,
    metrics: values.map(metricLabel),
    notices, totalRows: records.length, detailRowCount: details.length,
  };
};

// JSON-safe subset for the live-preview API (drops nothing user-facing; body
// entries carry only labels + computed cells, no raw records).
export const pivotToJSON = (pivot) => ({
  rowFields: pivot.rowFields,
  colField: pivot.colField,
  values: pivot.values,
  metrics: pivot.metrics,
  orderRows: pivot.orderRows,
  colValues: pivot.colValues,
  body: pivot.body.map((e) => ({
    kind: e.kind, path: e.path, depth: e.depth, cells: e.cells, totals: e.totals,
  })),
  colTotals: pivot.colTotalsByMetric,
  grand: pivot.grand,
  notices: pivot.notices,
  totalRows: pivot.totalRows,
  detailRowCount: pivot.detailRowCount,
});

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

export const buildPivotWorkbook = ({ title, meta, pivotCfg, pivot, notices = [] }) => {
  const cfg = normalizePivotCfg(pivotCfg);
  const L = cfg.rowFields.length;
  const M = cfg.values.length;
  const colValues = pivot.colValues || null;
  const C = colValues ? colValues.length : 0;
  const fullMeta = notices.length
    ? `${meta}   |   Note: ${notices.map((n) => n.message || n).join(' ')}`
    : meta;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ZB CAS';
  wb.created = new Date();
  const ws = wb.addWorksheet('Custom Report');

  const legacy = L === 1 && M === 1;
  const colCount = legacy
    ? (colValues ? C + 2 : 2)
    : L + C * M + M;
  addTitleBlock(ws, { title, meta: fullMeta, colCount });

  const cellVal = (v) => (v === null || v === undefined ? '' : v);
  const metricLabels = pivot.metrics || cfg.values.map(metricLabel);

  if (legacy) {
    const headerRow = ws.addRow(colValues
      ? [cfg.rowFields[0], ...colValues, 'Total']
      : [cfg.rowFields[0], metricLabels[0]]);
    headerRow.eachCell(cell => Object.assign(cell, styleHeader(RED)));
    headerRow.height = 20;

    pivot.body.forEach((e) => {
      const label = e.kind === 'subtotal' ? `${e.path[e.depth]} Total` : e.path.join(' › ');
      const vals = colValues
        ? [label, ...colValues.flatMap((cv) => e.cells[cv].map(cellVal)), ...e.totals.map(cellVal)]
        : [label, ...e.totals.map(cellVal)];
      const row = ws.addRow(vals);
      row.getCell(1).font = { bold: true, size: 9 };
      if (e.kind === 'subtotal') {
        row.eachCell(cell => Object.assign(cell, {
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } },
          font: { bold: true, size: 9 },
        }));
      }
    });

    if (colValues) {
      const totRow = ws.addRow(['Total',
        ...colValues.flatMap((cv) => pivot.colTotalsByMetric[cv].map(cellVal)),
        ...pivot.grand.map(cellVal)]);
      totRow.eachCell(cell => Object.assign(cell, {
        font: { bold: true, size: 9 },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE5E5' } },
      }));
    }
  } else {
    // Two-tier header: row levels | column values (spanning M metrics) | Total
    const top = [...cfg.rowFields];
    if (colValues) for (const cv of colValues) for (let i = 0; i < M; i++) top.push(i === 0 ? cv : '');
    for (let i = 0; i < M; i++) top.push(i === 0 ? 'Total' : '');
    const h1 = ws.addRow(top);
    h1.eachCell(cell => Object.assign(cell, styleHeader(RED)));
    h1.height = 20;
    // merge column-value spans + total span
    if (colValues) {
      colValues.forEach((_, ci) => {
        const start = L + ci * M + 1;
        if (M > 1) ws.mergeCells(h1.number, start, h1.number, start + M - 1);
      });
      const tStart = L + C * M + 1;
      if (M > 1) ws.mergeCells(h1.number, tStart, h1.number, tStart + M - 1);
    }
    const sub = new Array(L).fill('');
    if (colValues) for (const _ of colValues) for (const ml of metricLabels) sub.push(ml);
    for (const ml of metricLabels) sub.push(ml);
    const h2 = ws.addRow(sub);
    h2.eachCell(cell => Object.assign(cell, styleHeader()));
    h2.height = 18;

    pivot.body.forEach((e) => {
      const labels = new Array(L).fill('');
      if (e.kind === 'subtotal') labels[e.depth] = `${e.path[e.depth]} Total`;
      else e.path.forEach((v, i) => { labels[i] = v; });
      const vals = [...labels];
      if (colValues) for (const cv of colValues) for (const c of e.cells[cv]) vals.push(cellVal(c));
      for (const t of e.totals) vals.push(cellVal(t));
      const row = ws.addRow(vals);
      row.eachCell(cell => Object.assign(cell, { font: { size: 9 }, border: { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } } }));
      if (e.kind === 'subtotal') {
        row.eachCell(cell => Object.assign(cell, {
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } },
          font: { bold: true, size: 9 },
        }));
      } else {
        for (let i = 0; i < L; i++) row.getCell(i + 1).font = { bold: true, size: 9 };
      }
    });

    const totVals = ['Total', ...new Array(L - 1).fill('')];
    if (colValues) for (const cv of colValues) for (const c of pivot.colTotalsByMetric[cv]) totVals.push(cellVal(c));
    for (const g of pivot.grand) totVals.push(cellVal(g));
    const totRow = ws.addRow(totVals);
    totRow.eachCell(cell => Object.assign(cell, {
      font: { bold: true, size: 9 },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE5E5' } },
    }));
  }

  for (let i = 0; i < L; i++) ws.getColumn(i + 1).width = 24;
  const metricColStart = L + 1;
  const metricColCount = (colValues ? C * M : 0) + M;
  for (let i = 0; i < metricColCount; i++) ws.getColumn(metricColStart + i).width = 14;
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
