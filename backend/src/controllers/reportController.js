import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';

const assignLevel = (score) => {
  if (score >= 85) return 'Expert';
  if (score >= 70) return 'Advanced';
  if (score >= 50) return 'Intermediate';
  return 'Basic';
};

// ─── Legacy-shape mapper ──────────────────────────────────────────────────────
const toLegacyReport = (row, competencyRows = []) => ({
  _id: row.id,
  id: row.id,
  userId: row.userId,
  user: {
    userId: row.userId,
    name: row.user_name || '',
    email: row.user_email || '',
    employeeId: row.user_employeeId || '',
    department: row.user_department || '',
    position: row.user_position || '',
    gender: row.user_gender || '',
  },
  assessment: {
    assessmentId: row.assessmentId,
    description: row.assessment_description || '',
    type: row.assessment_type || '',
    purpose: row.assessment_purpose || '',
    targetGroup: row.assessment_targetGroup || '',
    startDate: row.assessment_startDate || null,
    endDate: row.assessment_endDate || null,
  },
  competencyResults: competencyRows.map(cr => ({
    competencyId: cr.competencyId || null,
    competencyName: cr.competencyName || '',
    category: cr.category || '',
    finalScore: cr.finalScore,
    level: cr.level,
    recommendation: cr.recommendation || '',
    scoreDetails: cr.scoreDetails,
    resultId: cr.resultId || null,
  })),
  overallScore: row.overallScore,
  overallLevel: row.overallLevel,
  status: row.status,
  generatedAt: row.generatedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const withCompetencies = (rows) => {
  if (!rows.length) return [];
  const reportIds = rows.map(r => r.id);
  const allCRs = prisma.reportCompetency.findMany({ where: { reportId: { in: reportIds } } });
  return allCRs.then(crs => {
    const crMap = {};
    for (const cr of crs) {
      if (!crMap[cr.reportId]) crMap[cr.reportId] = [];
      crMap[cr.reportId].push(cr);
    }
    return rows.map(r => toLegacyReport(r, crMap[r.id] || []));
  });
};

// ─── Build human-readable filter summary for PDF/Excel headers ────────────────
const buildFilterSummary = (query) => {
  const labels = {
    department: 'Dept', position: 'Position', gender: 'Gender',
    assessmentId: 'Assessment', assessmentType: 'Type', purpose: 'Purpose',
    targetGroup: 'Target Group', competencyId: 'Competency',
    competencyCategory: 'Category', overallLevel: 'Level',
    scoreMin: 'Score ≥', scoreMax: 'Score ≤',
    dateFrom: 'From', dateTo: 'To',
    employeeId: 'Employee', status: 'Status',
    selfScoreMin: 'Self ≥', selfScoreMax: 'Self ≤',
    supervisorScoreMin: 'Sup ≥', supervisorScoreMax: 'Sup ≤',
    assessmentStartFrom: 'Assess Start ≥', assessmentEndTo: 'Assess End ≤',
  };
  const parts = [];
  Object.entries(labels).forEach(([k, label]) => {
    if (query[k] && query[k] !== 'undefined' && query[k] !== 'null') {
      parts.push(`${label}: ${query[k]}`);
    }
  });
  return parts.length ? parts.join('  |  ') : null;
};

// ─── MASTER FILTER BUILDER ────────────────────────────────────────────────────
const buildFilter = async (query, user) => {
  const {
    employeeId, department, departmentSearch, position, positionSearch,
    gender, employeeIdCode,
    assessmentId, assessmentType, purpose, targetGroup, assessmentStatus,
    assessmentStartFrom, assessmentStartTo, assessmentEndFrom, assessmentEndTo,
    competencyId, competencyName, competencyCategory,
    overallLevel, competencyLevel, scoreMin, scoreMax,
    selfScoreMin, selfScoreMax, supervisorScoreMin, supervisorScoreMax,
    status, dateFrom, dateTo,
  } = query;

  const filter = {};

  if (employeeId) filter.userId = employeeId;
  if (department) filter.user_department = department;
  if (departmentSearch) filter.user_department = { contains: departmentSearch, mode: 'insensitive' };
  if (position) filter.user_position = position;
  if (positionSearch) filter.user_position = { contains: positionSearch, mode: 'insensitive' };
  if (gender) filter.user_gender = gender;
  if (employeeIdCode) filter.user_employeeId = { contains: employeeIdCode, mode: 'insensitive' };

  if (assessmentId) filter.assessmentId = assessmentId;
  if (assessmentType) filter.assessment_type = assessmentType;
  if (purpose) filter.assessment_purpose = purpose;
  if (targetGroup) filter.assessment_targetGroup = targetGroup;

  if (assessmentStartFrom || assessmentStartTo) {
    filter.assessment_startDate = {};
    if (assessmentStartFrom) filter.assessment_startDate.gte = new Date(assessmentStartFrom);
    if (assessmentStartTo) filter.assessment_startDate.lte = new Date(assessmentStartTo);
  }
  if (assessmentEndFrom || assessmentEndTo) {
    filter.assessment_endDate = {};
    if (assessmentEndFrom) filter.assessment_endDate.gte = new Date(assessmentEndFrom);
    if (assessmentEndTo) filter.assessment_endDate.lte = new Date(assessmentEndTo);
  }

  // Competency-level filters → query ReportCompetency table first
  const hasCompetencyFilter = competencyId || competencyName || competencyCategory || competencyLevel
    || selfScoreMin !== undefined || selfScoreMax !== undefined
    || supervisorScoreMin !== undefined || supervisorScoreMax !== undefined;

  if (hasCompetencyFilter) {
    const rcWhere = {};
    if (competencyId) rcWhere.competencyId = competencyId;
    if (competencyName) rcWhere.competencyName = { contains: competencyName, mode: 'insensitive' };
    if (competencyCategory) rcWhere.category = competencyCategory;
    if (competencyLevel) rcWhere.level = competencyLevel;

    const rcAND = [];
    if (selfScoreMin !== undefined || selfScoreMax !== undefined) {
      const selfCond = {};
      if (selfScoreMin !== undefined) selfCond.gte = Number(selfScoreMin);
      if (selfScoreMax !== undefined) selfCond.lte = Number(selfScoreMax);
      rcAND.push({ scoreDetails: { path: ['selfScore'], ...selfCond } });
    }
    if (supervisorScoreMin !== undefined || supervisorScoreMax !== undefined) {
      const supCond = {};
      if (supervisorScoreMin !== undefined) supCond.gte = Number(supervisorScoreMin);
      if (supervisorScoreMax !== undefined) supCond.lte = Number(supervisorScoreMax);
      rcAND.push({ scoreDetails: { path: ['supervisorScore'], ...supCond } });
    }

    const rcQuery = { ...rcWhere };
    if (rcAND.length) rcQuery.AND = rcAND;

    const rcRows = await prisma.reportCompetency.findMany({
      where: rcQuery,
      select: { reportId: true },
    });
    const reportIds = [...new Set(rcRows.map(r => r.reportId))];
    if (reportIds.length === 0) {
      return { id: { in: [] } };
    }
    filter.id = { in: reportIds };
  }

  if (overallLevel) filter.overallLevel = overallLevel;
  if (status) filter.status = status;

  if (scoreMin !== undefined || scoreMax !== undefined) {
    filter.overallScore = {};
    if (scoreMin !== undefined) filter.overallScore.gte = Number(scoreMin);
    if (scoreMax !== undefined) filter.overallScore.lte = Number(scoreMax);
  }

  if (dateFrom || dateTo) {
    filter.generatedAt = {};
    if (dateFrom) filter.generatedAt.gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      filter.generatedAt.lte = end;
    }
  }

  // Role-based scoping
  if (user.role === 'EMPLOYEE') {
    filter.userId = user.id;
  } else if (user.role === 'SUPERVISOR' && !filter.userId) {
    const subs = await prisma.user.findMany({
      where: { supervisorId: user.id },
      select: { id: true },
    });
    const subIds = subs.map(s => s.id);
    if (subIds.length === 0) {
      return { id: { in: [] } };
    }
    filter.userId = { in: subIds };
  }

  return filter;
};

// ─────────────────────────────────────────────────────────────────────────────
// PDF EXPORT  — professional, clean layout
// ─────────────────────────────────────────────────────────────────────────────
const BRAND_RED  = '#C8102E';
const BRAND_DARK = '#1e293b';
const GRAY_BG    = '#F8FAFC';
const GRAY_LINE  = '#E2E8F0';

const levelColor = (level) => {
  if (level === 'Expert')       return '#16A34A';
  if (level === 'Advanced')     return '#2563EB';
  if (level === 'Intermediate') return '#D97706';
  return '#DC2626'; // Basic
};

const generateConsolidatedPDF = (res, reports, { title, subtitle, filename }) => {
  const PAGE_W = 595.28; // A4
  const MARGIN = 40;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  const doc = new PDFDocument({ margin: MARGIN, size: 'A4', bufferPages: true, autoFirstPage: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  // ── Cover / title block ──────────────────────────────────────────────────
  // Red header band
  doc.fillColor(BRAND_RED).rect(0, 0, PAGE_W, 70).fill();
  doc.fillColor('#FFFFFF').fontSize(18).font('Helvetica-Bold')
    .text(title, MARGIN, 22, { width: CONTENT_W, align: 'left' });
  doc.fontSize(9).font('Helvetica').fillColor('rgba(255,255,255,0.8)')
    .text(`Generated ${new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}  ·  ${reports.length} record${reports.length !== 1 ? 's' : ''}`, MARGIN, 48, { width: CONTENT_W });

  doc.y = 82;

  // Subtitle / filters
  if (subtitle) {
    doc.fillColor('#475569').fontSize(8).font('Helvetica')
      .text(`Filters applied: ${subtitle}`, MARGIN, doc.y, { width: CONTENT_W });
    doc.y += 14;
  }

  // Summary stats row
  const avg  = reports.length ? reports.reduce((s, r) => s + (r.overallScore || 0), 0) / reports.length : 0;
  const dist = { Basic: 0, Intermediate: 0, Advanced: 0, Expert: 0 };
  reports.forEach(r => { if (dist[r.overallLevel] !== undefined) dist[r.overallLevel]++; });

  const statsY = doc.y + 4;
  const statW  = CONTENT_W / 5;
  const statItems = [
    { label: 'Avg Score',    value: `${avg.toFixed(1)}%` },
    { label: 'Basic',        value: String(dist.Basic) },
    { label: 'Intermediate', value: String(dist.Intermediate) },
    { label: 'Advanced',     value: String(dist.Advanced) },
    { label: 'Expert',       value: String(dist.Expert) },
  ];
  doc.fillColor(GRAY_BG).rect(MARGIN - 4, statsY - 4, CONTENT_W + 8, 32).fill();
  statItems.forEach((s, i) => {
    const x = MARGIN + i * statW;
    doc.fillColor('#94A3B8').fontSize(7).font('Helvetica').text(s.label, x, statsY, { width: statW - 4, lineBreak: false });
    doc.fillColor(BRAND_DARK).fontSize(11).font('Helvetica-Bold').text(s.value, x, statsY + 9, { width: statW - 4, lineBreak: false });
  });
  doc.y = statsY + 42;

  // ── Column definitions ───────────────────────────────────────────────────
  // Adaptive: combined assessments show self+sup; others just score
  const HAS_COMBINED = reports.some(r => r.assessment?.type === 'Combined');

  const COLS_COMBINED = [
    { x: MARGIN,      w: 88,  key: 'employee',    header: 'Employee' },
    { x: MARGIN+90,   w: 65,  key: 'department',  header: 'Department' },
    { x: MARGIN+157,  w: 65,  key: 'competency',  header: 'Competency' },
    { x: MARGIN+224,  w: 52,  key: 'targetGroup', header: 'Target Group' },
    { x: MARGIN+278,  w: 35,  key: 'type',        header: 'Type' },
    { x: MARGIN+315,  w: 30,  key: 'self',        header: 'Self' },
    { x: MARGIN+347,  w: 30,  key: 'sup',         header: 'Sup' },
    { x: MARGIN+379,  w: 32,  key: 'score',       header: 'Score' },
    { x: MARGIN+413,  w: 45,  key: 'level',       header: 'Level' },
    { x: MARGIN+460,  w: 55,  key: 'date',        header: 'Date' },
  ];
  const COLS_SIMPLE = [
    { x: MARGIN,      w: 100, key: 'employee',    header: 'Employee' },
    { x: MARGIN+102,  w: 75,  key: 'department',  header: 'Department' },
    { x: MARGIN+179,  w: 80,  key: 'competency',  header: 'Competency' },
    { x: MARGIN+261,  w: 65,  key: 'targetGroup', header: 'Target Group' },
    { x: MARGIN+328,  w: 48,  key: 'type',        header: 'Type' },
    { x: MARGIN+378,  w: 35,  key: 'score',       header: 'Score' },
    { x: MARGIN+415,  w: 50,  key: 'level',       header: 'Level' },
    { x: MARGIN+467,  w: 48,  key: 'date',        header: 'Date' },
  ];
  const COLS = HAS_COMBINED ? COLS_COMBINED : COLS_SIMPLE;
  const ROW_H = 13;

  const drawTableHeader = () => {
    const y = doc.y;
    doc.fillColor(BRAND_DARK).rect(MARGIN - 2, y - 3, CONTENT_W + 4, ROW_H + 2).fill();
    doc.fillColor('#FFFFFF').fontSize(7).font('Helvetica-Bold');
    COLS.forEach(c => doc.text(c.header, c.x, y, { width: c.w, lineBreak: false }));
    doc.y = y + ROW_H + 2;
  };

  drawTableHeader();

  reports.forEach((report, ri) => {
    const isCombined = report.assessment?.type === 'Combined';
    const empName  = (report.user?.name || 'N/A').substring(0, 18);
    const dept     = (report.user?.department || '').substring(0, 14);
    const date     = report.generatedAt ? new Date(report.generatedAt).toLocaleDateString('en-GB') : '—';
    const rows     = report.competencyResults?.length
      ? report.competencyResults
      : [{ competencyName: '—', finalScore: report.overallScore || 0, level: report.overallLevel || '—', scoreDetails: {}, category: '' }];

    rows.forEach((cr, ci) => {
      if (doc.y > 760) { doc.addPage(); drawTableHeader(); }
      const y  = doc.y;
      const bg = ri % 2 === 0 ? '#FFFFFF' : GRAY_BG;
      doc.fillColor(bg).rect(MARGIN - 2, y - 2, CONTENT_W + 4, ROW_H).fill();
      doc.fontSize(7).font('Helvetica').fillColor(BRAND_DARK);

      const targetGroup = (report.assessment?.targetGroup || '—').substring(0, 12);
      const typeShort   = isCombined ? 'Combined' : (report.assessment?.type || '—').substring(0, 10);
      const compName    = (cr.competencyName || '—').substring(0, 20);

      if (HAS_COMBINED) {
        const vals = {
          employee:    ci === 0 ? empName : '',
          department:  ci === 0 ? dept : '',
          competency:  compName,
          targetGroup: ci === 0 ? targetGroup : '',
          type:        ci === 0 ? typeShort : '',
          self:        isCombined && cr.scoreDetails?.selfScore != null ? `${cr.scoreDetails.selfScore}%` : (isCombined ? '—' : ''),
          sup:         isCombined && cr.scoreDetails?.supervisorScore != null ? `${cr.scoreDetails.supervisorScore}%` : (isCombined ? '—' : ''),
          score:       `${cr.finalScore ?? 0}%`,
          level:       cr.level || '—',
          date:        ci === 0 ? date : '',
        };
        COLS.forEach(c => {
          if (c.key === 'level' && cr.level) {
            doc.fillColor(levelColor(cr.level)).text(String(vals[c.key] || ''), c.x, y, { width: c.w, lineBreak: false });
            doc.fillColor(BRAND_DARK);
          } else {
            doc.text(String(vals[c.key] || ''), c.x, y, { width: c.w, lineBreak: false });
          }
        });
      } else {
        const vals = {
          employee:    ci === 0 ? empName : '',
          department:  ci === 0 ? dept : '',
          competency:  compName,
          targetGroup: ci === 0 ? targetGroup : '',
          type:        ci === 0 ? typeShort : '',
          score:       `${cr.finalScore ?? 0}%`,
          level:       cr.level || '—',
          date:        ci === 0 ? date : '',
        };
        COLS.forEach(c => {
          if (c.key === 'level' && cr.level) {
            doc.fillColor(levelColor(cr.level)).text(String(vals[c.key] || ''), c.x, y, { width: c.w, lineBreak: false });
            doc.fillColor(BRAND_DARK);
          } else {
            doc.text(String(vals[c.key] || ''), c.x, y, { width: c.w, lineBreak: false });
          }
        });
      }
      doc.y = y + ROW_H;
    });

    // Overall row for multi-competency reports
    if (rows.length > 1) {
      if (doc.y > 760) { doc.addPage(); drawTableHeader(); }
      const y = doc.y;
      doc.fillColor('#EFF6FF').rect(MARGIN - 2, y - 1, CONTENT_W + 4, ROW_H - 1).fill();
      doc.fontSize(7).font('Helvetica-Bold');
      const overallX = HAS_COMBINED ? COLS.find(c => c.key === 'competency')?.x : COLS.find(c => c.key === 'competency')?.x;
      const scoreX   = COLS.find(c => c.key === 'score')?.x;
      const levelX   = COLS.find(c => c.key === 'level')?.x;
      if (overallX) doc.fillColor('#1D4ED8').text('OVERALL', overallX, y, { width: 60, lineBreak: false });
      if (scoreX)   doc.fillColor('#1D4ED8').text(`${report.overallScore ?? 0}%`, scoreX, y, { width: 35, lineBreak: false });
      if (levelX)   doc.fillColor(levelColor(report.overallLevel)).text(report.overallLevel || '', levelX, y, { width: 50, lineBreak: false });
      doc.y = y + ROW_H + 1;
    }

    // Divider between employees
    doc.strokeColor(GRAY_LINE).lineWidth(0.3).moveTo(MARGIN, doc.y).lineTo(PAGE_W - MARGIN, doc.y).stroke();
    doc.y += 1;
  });

  // ── Footer on every page ─────────────────────────────────────────────────
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.fillColor(BRAND_RED).rect(0, doc.page.height - 28, PAGE_W, 28).fill();
    doc.fillColor('#FFFFFF').fontSize(7).font('Helvetica')
      .text(`Competency Assessment System  ·  Confidential`, MARGIN, doc.page.height - 18, { width: CONTENT_W / 2, lineBreak: false });
    doc.text(`Page ${i + 1} of ${range.count}`, MARGIN, doc.page.height - 18, { width: CONTENT_W, align: 'right', lineBreak: false });
  }

  doc.end();
};

// ─────────────────────────────────────────────────────────────────────────────
// EXCEL EXPORT  — professional multi-sheet workbook
// ─────────────────────────────────────────────────────────────────────────────
const generateConsolidatedExcel = async (res, reports, { title, subtitle, filename }) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Competency Assessment System';
  wb.created = new Date();

  const RED    = 'FFC8102E';
  const DARK   = 'FF1e293b';
  const WHITE  = 'FFFFFFFF';
  const GRAY   = 'FFF8FAFC';
  const BLUE   = 'FFdbeafe';
  const EXPERT_G  = 'FFdcfce7';
  const ADV_B     = 'FFdbeafe';
  const INT_Y     = 'FFfef3c7';
  const BASIC_R   = 'FFfee2e2';

  const levelFill = (level) => {
    if (level === 'Expert')       return EXPERT_G;
    if (level === 'Advanced')     return ADV_B;
    if (level === 'Intermediate') return INT_Y;
    return BASIC_R;
  };

  const headerStyle = (fill = DARK) => ({
    font: { bold: true, color: { argb: WHITE }, size: 10 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } },
    alignment: { vertical: 'middle', horizontal: 'center', wrapText: false },
    border: { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } },
  });

  const applyHeader = (row, fillArgb = DARK) => {
    Object.assign(row, headerStyle(fillArgb));
    row.height = 24;
    row.eachCell(cell => Object.assign(cell, headerStyle(fillArgb)));
  };

  const addTitleBlock = (sheet, colCount) => {
    // Row 1: title
    sheet.addRow([title]);
    sheet.getRow(1).height = 32;
    sheet.getRow(1).getCell(1).font = { bold: true, size: 14, color: { argb: RED } };
    sheet.getRow(1).getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1F2' } };
    sheet.mergeCells(1, 1, 1, colCount);

    // Row 2: meta
    const meta = `Generated: ${new Date().toLocaleString()}   |   Records: ${reports.length}${subtitle ? `   |   Filters: ${subtitle}` : ''}`;
    sheet.addRow([meta]);
    sheet.getRow(2).getCell(1).font = { italic: true, size: 8, color: { argb: 'FF64748B' } };
    sheet.mergeCells(2, 1, 2, colCount);
    sheet.addRow([]); // spacer
  };

  // ── Sheet 1: Full Detail ─────────────────────────────────────────────────
  const sh1 = wb.addWorksheet('Full Detail');
  sh1.columns = [
    { width: 22 }, { width: 12 }, { width: 18 }, { width: 18 }, { width: 10 },
    { width: 26 }, { width: 16 }, { width: 22 }, { width: 15 },
    { width: 12 }, { width: 12 },
    { width: 26 }, { width: 16 }, { width: 12 }, { width: 16 }, { width: 10 }, { width: 14 },
    { width: 45 }, { width: 13 }, { width: 13 }, { width: 16 },
  ];
  addTitleBlock(sh1, 21);

  const h1 = sh1.addRow([
    'Employee', 'Emp ID', 'Department', 'Position', 'Gender',
    'Assessment', 'Type', 'Purpose', 'Target Group', 'Opens', 'Closes',
    'Competency', 'Category', 'Self Score', 'Sup Score', 'Final Score', 'Level',
    'Recommendation', 'Overall Score', 'Overall Level', 'Generated',
  ]);
  applyHeader(h1);

  reports.forEach((report, ri) => {
    const u = report.user || {};
    const a = report.assessment || {};
    const isCombined = a.type === 'Combined';
    const rowBg = ri % 2 === 0 ? 'FFFFFFFF' : GRAY;
    const genAt = report.generatedAt ? new Date(report.generatedAt).toLocaleDateString() : '';
    const crs = report.competencyResults?.length
      ? report.competencyResults
      : [{ competencyName: '', finalScore: report.overallScore, level: report.overallLevel, recommendation: '' }];

    crs.forEach((cr, ci) => {
      const row = sh1.addRow([
        ci === 0 ? u.name       || '' : '',
        ci === 0 ? u.employeeId || '' : '',
        ci === 0 ? u.department || '' : '',
        ci === 0 ? u.position   || '' : '',
        ci === 0 ? u.gender     || '' : '',
        ci === 0 ? a.description || '' : '',
        ci === 0 ? a.type        || '' : '',
        ci === 0 ? a.purpose     || '' : '',
        ci === 0 ? a.targetGroup || '' : '',
        ci === 0 && a.startDate ? new Date(a.startDate).toLocaleDateString() : '',
        ci === 0 && a.endDate   ? new Date(a.endDate).toLocaleDateString()   : '',
        cr.competencyName || '',
        cr.category || '',
        isCombined ? (cr.scoreDetails?.selfScore ?? '') : 'N/A',
        isCombined ? (cr.scoreDetails?.supervisorScore ?? '') : 'N/A',
        cr.finalScore ?? '',
        cr.level || '',
        cr.recommendation || '',
        ci === 0 ? report.overallScore ?? '' : '',
        ci === 0 ? report.overallLevel || '' : '',
        ci === 0 ? genAt : '',
      ]);
      row.height = 16;
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } };
      });
      // Colour level cell
      if (cr.level) {
        const lvlCell = row.getCell(17);
        lvlCell.font = { bold: true, size: 9 };
        lvlCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: levelFill(cr.level) } };
      }
    });

    // Overall summary row for multi-competency
    if (crs.length > 1) {
      const sr = sh1.addRow(Array(21).fill(''));
      sr.getCell(12).value = '▶ OVERALL';
      sr.getCell(19).value = report.overallScore;
      sr.getCell(20).value = report.overallLevel;
      sr.height = 15;
      sr.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } }; });
      sr.getCell(12).font = { bold: true, color: { argb: 'FF1D4ED8' }, size: 9 };
      sr.getCell(19).font = { bold: true, color: { argb: 'FF1D4ED8' } };
      if (report.overallLevel) {
        sr.getCell(20).font = { bold: true };
        sr.getCell(20).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: levelFill(report.overallLevel) } };
      }
    }
  });
  sh1.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 21 } };
  sh1.views = [{ state: 'frozen', ySplit: 4 }];

  // ── Sheet 2: By Employee ─────────────────────────────────────────────────
  const sh2 = wb.addWorksheet('By Employee');
  sh2.columns = [{ width: 22 },{ width: 13 },{ width: 18 },{ width: 18 },{ width: 10 },{ width: 10 },{ width: 12 },{ width: 10 },{ width: 14 },{ width: 12 },{ width: 10 }];
  addTitleBlock(sh2, 11);
  const h2 = sh2.addRow(['Employee', 'Emp ID', 'Department', 'Position', 'Gender', 'Reports', 'Avg Score', 'Basic', 'Intermediate', 'Advanced', 'Expert']);
  applyHeader(h2, RED);

  const empMap = {};
  reports.forEach(r => {
    const k = r.user?.userId?.toString() || 'x';
    if (!empMap[k]) empMap[k] = { name: r.user?.name||'', empId: r.user?.employeeId||'', dept: r.user?.department||'', pos: r.user?.position||'', gender: r.user?.gender||'', count: 0, total: 0, levels: { Basic:0,Intermediate:0,Advanced:0,Expert:0 } };
    empMap[k].count++; empMap[k].total += r.overallScore||0;
    if (empMap[k].levels[r.overallLevel] !== undefined) empMap[k].levels[r.overallLevel]++;
  });
  Object.values(empMap).forEach((e, i) => {
    const avg = e.count ? parseFloat((e.total/e.count).toFixed(1)) : 0;
    const r = sh2.addRow([e.name, e.empId, e.dept, e.pos, e.gender, e.count, avg, e.levels.Basic, e.levels.Intermediate, e.levels.Advanced, e.levels.Expert]);
    r.height = 16;
    if (i % 2 === 1) r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY } }; });
  });
  sh2.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 11 } };

  // ── Sheet 3: By Assessment ───────────────────────────────────────────────
  const sh3 = wb.addWorksheet('By Assessment');
  sh3.columns = [{ width: 35 },{ width: 16 },{ width: 22 },{ width: 15 },{ width: 14 },{ width: 12 },{ width: 10 },{ width: 14 },{ width: 12 },{ width: 10 }];
  addTitleBlock(sh3, 10);
  const h3 = sh3.addRow(['Assessment', 'Type', 'Purpose', 'Target Group', 'Participants', 'Avg Score', 'Basic', 'Intermediate', 'Advanced', 'Expert']);
  applyHeader(h3, RED);

  const aMap = {};
  reports.forEach(r => {
    const k = r.assessment?.assessmentId?.toString() || 'x';
    if (!aMap[k]) aMap[k] = { desc: r.assessment?.description||'', type: r.assessment?.type||'', purpose: r.assessment?.purpose||'', tg: r.assessment?.targetGroup||'', count:0, total:0, levels:{Basic:0,Intermediate:0,Advanced:0,Expert:0} };
    aMap[k].count++; aMap[k].total += r.overallScore||0;
    if (aMap[k].levels[r.overallLevel] !== undefined) aMap[k].levels[r.overallLevel]++;
  });
  Object.values(aMap).forEach((a, i) => {
    const avg = a.count ? parseFloat((a.total/a.count).toFixed(1)) : 0;
    const r = sh3.addRow([a.desc, a.type, a.purpose, a.tg, a.count, avg, a.levels.Basic, a.levels.Intermediate, a.levels.Advanced, a.levels.Expert]);
    r.height = 16;
    if (i % 2 === 1) r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY } }; });
  });
  sh3.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 10 } };

  // ── Sheet 4: By Competency ───────────────────────────────────────────────
  const sh4 = wb.addWorksheet('By Competency');
  sh4.columns = [{ width: 28 },{ width: 16 },{ width: 12 },{ width: 12 },{ width: 10 },{ width: 10 },{ width: 10 },{ width: 14 },{ width: 12 },{ width: 10 }];
  addTitleBlock(sh4, 10);
  const h4 = sh4.addRow(['Competency', 'Category', 'Assessments', 'Avg Score', 'Max', 'Min', 'Basic', 'Intermediate', 'Advanced', 'Expert']);
  applyHeader(h4, RED);

  const cMap = {};
  reports.forEach(r => {
    (r.competencyResults || []).forEach(cr => {
      const k = cr.competencyName || 'x';
      if (!cMap[k]) cMap[k] = { cat: cr.category||'', count:0, total:0, max:0, min:100, levels:{Basic:0,Intermediate:0,Advanced:0,Expert:0} };
      cMap[k].count++; cMap[k].total += cr.finalScore||0;
      cMap[k].max = Math.max(cMap[k].max, cr.finalScore||0);
      cMap[k].min = Math.min(cMap[k].min, cr.finalScore||100);
      if (cMap[k].levels[cr.level] !== undefined) cMap[k].levels[cr.level]++;
    });
  });
  Object.entries(cMap).forEach(([name, c], i) => {
    const avg = c.count ? parseFloat((c.total/c.count).toFixed(1)) : 0;
    const r = sh4.addRow([name, c.cat, c.count, avg, c.max, c.min, c.levels.Basic, c.levels.Intermediate, c.levels.Advanced, c.levels.Expert]);
    r.height = 16;
    if (i % 2 === 1) r.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY } }; });
  });
  sh4.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 10 } };

  // ── Sheet 5: By Department ───────────────────────────────────────────────
  const sh5 = wb.addWorksheet('By Department');
  sh5.columns = [{ width: 22 },{ width: 12 },{ width: 10 },{ width: 12 },{ width: 10 },{ width: 10 },{ width: 10 },{ width: 14 },{ width: 12 },{ width: 10 }];
  addTitleBlock(sh5, 10);
  const h5 = sh5.addRow(['Department', 'Employees', 'Reports', 'Avg Score', 'Max', 'Min', 'Basic', 'Intermediate', 'Advanced', 'Expert']);
  applyHeader(h5, RED);

  const dMap = {};
  reports.forEach(r => {
    const k = r.user?.department || 'Unspecified';
    if (!dMap[k]) dMap[k] = { emps: new Set(), count:0, total:0, max:0, min:100, levels:{Basic:0,Intermediate:0,Advanced:0,Expert:0} };
    dMap[k].count++; dMap[k].total += r.overallScore||0;
    dMap[k].max = Math.max(dMap[k].max, r.overallScore||0);
    dMap[k].min = Math.min(dMap[k].min, r.overallScore||100);
    if (r.user?.userId) dMap[k].emps.add(r.user.userId.toString());
    if (dMap[k].levels[r.overallLevel] !== undefined) dMap[k].levels[r.overallLevel]++;
  });
  Object.entries(dMap).forEach(([dept, d], i) => {
    const avg = d.count ? parseFloat((d.total/d.count).toFixed(1)) : 0;
    const r = sh5.addRow([dept, d.emps.size, d.count, avg, d.max, d.min, d.levels.Basic, d.levels.Intermediate, d.levels.Advanced, d.levels.Expert]);
    r.height = 16;
    if (i % 2 === 1) r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY } }; });
  });
  sh5.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 10 } };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
};

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── LIST ALL REPORTS (paginated + all filters) ───────────────────────────────
export const getReports = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, sortBy = 'generatedAt', sortDir = 'desc' } = req.query;
  const filter = await buildFilter(req.query, req.user);
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [rows, total] = await Promise.all([
    prisma.report.findMany({
      where: filter,
      orderBy: { [sortBy]: sortDir === 'asc' ? 'asc' : 'desc' },
      skip,
      take: parseInt(limit),
    }),
    prisma.report.count({ where: filter }),
  ]);

  const reports = await withCompetencies(rows);

  res.status(200).json({
    status: 'success',
    data: { reports, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } },
  });
});

// ─── SINGLE REPORT ────────────────────────────────────────────────────────────
export const getReportById = asyncHandler(async (req, res, next) => {
  const row = await prisma.report.findUnique({ where: { id: req.params.reportId } });
  if (!row) return next(new AppError('Report not found.', 404));
  if (req.user.role === 'EMPLOYEE' && row.userId !== req.user.id)
    return next(new AppError('Access denied.', 403));
  if (req.user.role === 'SUPERVISOR') {
    const subs = await prisma.user.findMany({ where: { supervisorId: req.user.id }, select: { id: true } });
    if (!subs.map(s => s.id).includes(row.userId))
      return next(new AppError('Access denied.', 403));
  }
  const crs = await prisma.reportCompetency.findMany({ where: { reportId: row.id } });
  res.status(200).json({ status: 'success', data: { report: toLegacyReport(row, crs) } });
});

// ─── INDIVIDUAL REPORTS for a user ───────────────────────────────────────────
export const getIndividualReports = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  if (req.user.role === 'EMPLOYEE' && req.user.id !== userId)
    return next(new AppError('Access denied.', 403));
  if (req.user.role === 'SUPERVISOR') {
    const emp = await prisma.user.findUnique({ where: { id: userId } });
    if (!emp || emp.supervisorId !== req.user.id)
      return next(new AppError('Access denied.', 403));
  }
  const rows = await prisma.report.findMany({ where: { userId }, orderBy: { generatedAt: 'desc' } });
  const reports = await withCompetencies(rows);
  res.status(200).json({ status: 'success', data: { reports } });
});

// ─── DEPARTMENT SUMMARY ───────────────────────────────────────────────────────
export const getDepartmentReports = asyncHandler(async (req, res) => {
  const { department } = req.params;
  const reports = await prisma.report.findMany({
    where: { user_department: department },
  });
  const reportIds = reports.map(r => r.id);
  const allCRs = reportIds.length
    ? await prisma.reportCompetency.findMany({ where: { reportId: { in: reportIds } } })
    : [];

  const grouped = {};
  for (const cr of allCRs) {
    const name = cr.competencyName;
    if (!grouped[name]) grouped[name] = { scores: [], levels: [] };
    grouped[name].scores.push(cr.finalScore);
    grouped[name].levels.push(cr.level);
  }

  const summary = Object.entries(grouped).map(([name, data]) => {
    const dist = { Basic: 0, Intermediate: 0, Advanced: 0, Expert: 0 };
    data.levels.forEach(l => { if (dist[l] !== undefined) dist[l]++; });
    const avg = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
    return { competencyName: name, avgScore: parseFloat(avg.toFixed(2)), totalReports: data.scores.length, levelDistribution: dist };
  }).sort((a, b) => a.competencyName.localeCompare(b.competencyName));

  res.status(200).json({ status: 'success', data: { department, summary } });
});

// ─── HEATMAP ──────────────────────────────────────────────────────────────────
export const getHeatmap = asyncHandler(async (req, res) => {
  const reports = await prisma.report.findMany({});
  const reportIds = reports.map(r => r.id);
  const allCRs = reportIds.length
    ? await prisma.reportCompetency.findMany({ where: { reportId: { in: reportIds } } })
    : [];

  const reportMap = {};
  reports.forEach(r => { reportMap[r.id] = r; });

  const grouped = {};
  for (const cr of allCRs) {
    const comp = cr.competencyName;
    const dept = reportMap[cr.reportId]?.user_department || 'Unspecified';
    const key = `${comp}|||${dept}`;
    if (!grouped[key]) grouped[key] = { scores: [], count: 0 };
    grouped[key].scores.push(cr.finalScore);
    grouped[key].count++;
  }

  const map = {};
  for (const [key, data] of Object.entries(grouped)) {
    const [comp, dept] = key.split('|||');
    const avg = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
    if (!map[comp]) map[comp] = [];
    map[comp].push({ department: dept, avgScore: parseFloat(avg.toFixed(2)), count: data.count });
  }

  // Sort within each competency
  for (const arr of Object.values(map)) {
    arr.sort((a, b) => a.department.localeCompare(b.department));
  }

  res.status(200).json({ status: 'success', data: { heatmap: map } });
});

// ─── ANALYTICS / STATS ───────────────────────────────────────────────────────
export const getReportStats = asyncHandler(async (req, res) => {
  const filter = await buildFilter(req.query, req.user);
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const reports = await prisma.report.findMany({ where: filter });
  const reportIds = reports.map(r => r.id);
  const allCRs = reportIds.length
    ? await prisma.reportCompetency.findMany({ where: { reportId: { in: reportIds } } })
    : [];

  const crMap = {};
  for (const cr of allCRs) {
    if (!crMap[cr.reportId]) crMap[cr.reportId] = [];
    crMap[cr.reportId].push(cr);
  }

  if (!reports.length) {
    return res.status(200).json({
      status: 'success',
      data: {
        overall: { total: 0, avgScore: 0, maxScore: 0, minScore: 0, uniqueEmployees: 0, uniqueDepts: 0, uniqueAssessments: 0 },
        levelDistribution: [],
        departmentBreakdown: [],
        competencyBreakdown: [],
        monthlyTrend: [],
        topPerformers: [],
        bottomPerformers: [],
        assessmentBreakdown: [],
        genderBreakdown: [],
        positionBreakdown: [],
      },
    });
  }

  // ── Overall ──────────────────────────────────────────────────────────────
  const uniqueEmps = new Set(reports.map(r => r.userId));
  const uniqueDepts = new Set(reports.map(r => r.user_department).filter(Boolean));
  const uniqueAssess = new Set(reports.map(r => r.assessmentId));
  const scores = reports.map(r => r.overallScore);
  const overall = {
    total: reports.length,
    avgScore: parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)),
    maxScore: Math.max(...scores),
    minScore: Math.min(...scores),
    uniqueEmployees: uniqueEmps.size,
    uniqueDepts: uniqueDepts.size,
    uniqueAssessments: uniqueAssess.size,
  };

  // ── Level Distribution ────────────────────────────────────────────────────
  const levelMap = {};
  for (const r of reports) {
    if (!levelMap[r.overallLevel]) levelMap[r.overallLevel] = { _id: r.overallLevel, count: 0, totalScore: 0 };
    levelMap[r.overallLevel].count++;
    levelMap[r.overallLevel].totalScore += r.overallScore;
  }
  const levelDistribution = Object.values(levelMap)
    .map(l => ({ _id: l._id, count: l.count, avgScore: parseFloat((l.totalScore / l.count).toFixed(1)) }))
    .sort((a, b) => b.avgScore - a.avgScore);

  // ── Department Breakdown ──────────────────────────────────────────────────
  const deptMap = {};
  for (const r of reports) {
    const d = r.user_department || 'Unspecified';
    if (!deptMap[d]) deptMap[d] = { count: 0, totalScore: 0, maxScore: -Infinity, minScore: Infinity, emps: new Set() };
    deptMap[d].count++;
    deptMap[d].totalScore += r.overallScore;
    deptMap[d].maxScore = Math.max(deptMap[d].maxScore, r.overallScore);
    deptMap[d].minScore = Math.min(deptMap[d].minScore, r.overallScore);
    deptMap[d].emps.add(r.userId);
  }
  const departmentBreakdown = Object.entries(deptMap)
    .map(([dept, d]) => ({
      _id: dept,
      count: d.count,
      avgScore: parseFloat((d.totalScore / d.count).toFixed(1)),
      maxScore: d.maxScore,
      minScore: d.minScore,
      employeeCount: d.emps.size,
    }))
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 12);

  // ── Competency Breakdown ──────────────────────────────────────────────────
  const compMap = {};
  for (const cr of allCRs) {
    const name = cr.competencyName;
    if (!compMap[name]) compMap[name] = { competencyId: cr.competencyId, category: cr.category, scores: [], expertCount: 0, basicCount: 0 };
    compMap[name].scores.push(cr.finalScore);
    if (cr.level === 'Expert') compMap[name].expertCount++;
    if (cr.level === 'Basic') compMap[name].basicCount++;
  }
  const competencyBreakdown = Object.entries(compMap)
    .map(([name, c]) => ({
      _id: name,
      competencyId: c.competencyId,
      category: c.category,
      count: c.scores.length,
      avgScore: parseFloat((c.scores.reduce((a, b) => a + b, 0) / c.scores.length).toFixed(1)),
      maxScore: Math.max(...c.scores),
      minScore: Math.min(...c.scores),
      expertCount: c.expertCount,
      basicCount: c.basicCount,
    }))
    .sort((a, b) => b.avgScore - a.avgScore);

  // ── Monthly Trend (last 12 months) ───────────────────────────────────────
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const recentReports = reports.filter(r => r.generatedAt >= oneYearAgo);
  const trendMap = {};
  for (const r of recentReports) {
    const d = new Date(r.generatedAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!trendMap[key]) trendMap[key] = { year: d.getFullYear(), month: d.getMonth() + 1, count: 0, totalScore: 0 };
    trendMap[key].count++;
    trendMap[key].totalScore += r.overallScore;
  }
  const monthlyTrend = Object.values(trendMap)
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .map(t => ({
      month: `${MONTHS[t.month - 1]} ${t.year}`,
      count: t.count,
      avgScore: parseFloat((t.totalScore / t.count).toFixed(1)),
    }));

  // ── Top / Bottom Performers ───────────────────────────────────────────────
  const empPerfMap = {};
  for (const r of reports) {
    const uid = r.userId;
    if (!empPerfMap[uid]) empPerfMap[uid] = { name: r.user_name, department: r.user_department, position: r.user_position, scores: [], expertCount: 0, basicCount: 0 };
    empPerfMap[uid].scores.push(r.overallScore);
    if (r.overallLevel === 'Expert') empPerfMap[uid].expertCount++;
    if (r.overallLevel === 'Basic') empPerfMap[uid].basicCount++;
  }
  const empPerfArr = Object.entries(empPerfMap).map(([uid, e]) => ({
    _id: uid,
    name: e.name,
    department: e.department,
    position: e.position,
    avgScore: parseFloat((e.scores.reduce((a, b) => a + b, 0) / e.scores.length).toFixed(1)),
    count: e.scores.length,
    expertCount: e.expertCount,
    basicCount: e.basicCount,
  }));
  const topPerformers = [...empPerfArr].sort((a, b) => b.avgScore - a.avgScore).slice(0, 5);
  const bottomPerformers = [...empPerfArr].sort((a, b) => a.avgScore - b.avgScore).slice(0, 5);

  // ── Assessment Breakdown ──────────────────────────────────────────────────
  const assessMap = {};
  for (const r of reports) {
    const aid = r.assessmentId;
    if (!assessMap[aid]) assessMap[aid] = { description: r.assessment_description, type: r.assessment_type, purpose: r.assessment_purpose, targetGroup: r.assessment_targetGroup, scores: [] };
    assessMap[aid].scores.push(r.overallScore);
  }
  const assessmentBreakdown = Object.entries(assessMap)
    .map(([aid, a]) => ({
      _id: aid,
      description: a.description,
      type: a.type,
      purpose: a.purpose,
      targetGroup: a.targetGroup,
      count: a.scores.length,
      avgScore: parseFloat((a.scores.reduce((s, v) => s + v, 0) / a.scores.length).toFixed(1)),
      maxScore: Math.max(...a.scores),
      minScore: Math.min(...a.scores),
    }))
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 20);

  // ── Gender Breakdown ──────────────────────────────────────────────────────
  const genderMap = {};
  for (const r of reports) {
    const g = r.user_gender || 'Unspecified';
    if (!genderMap[g]) genderMap[g] = { count: 0, totalScore: 0 };
    genderMap[g].count++;
    genderMap[g].totalScore += r.overallScore;
  }
  const genderBreakdown = Object.entries(genderMap).map(([g, d]) => ({
    _id: g,
    count: d.count,
    avgScore: parseFloat((d.totalScore / d.count).toFixed(1)),
  }));

  // ── Position Breakdown ────────────────────────────────────────────────────
  const posMap = {};
  for (const r of reports) {
    const p = r.user_position || 'Unspecified';
    if (!posMap[p]) posMap[p] = { count: 0, totalScore: 0 };
    posMap[p].count++;
    posMap[p].totalScore += r.overallScore;
  }
  const positionBreakdown = Object.entries(posMap)
    .map(([p, d]) => ({
      _id: p,
      count: d.count,
      avgScore: parseFloat((d.totalScore / d.count).toFixed(1)),
    }))
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 10);

  res.status(200).json({
    status: 'success',
    data: {
      overall,
      levelDistribution,
      departmentBreakdown,
      competencyBreakdown,
      monthlyTrend,
      topPerformers,
      bottomPerformers,
      assessmentBreakdown,
      genderBreakdown,
      positionBreakdown,
    },
  });
});

// ─── FILTER OPTIONS (every distinct value for every dropdown) ─────────────────
export const getReportFilterOptions = asyncHandler(async (req, res) => {
  const [deptRows, posRows, genderRows, assessments] = await Promise.all([
    prisma.report.findMany({ distinct: ['user_department'], select: { user_department: true } }),
    prisma.report.findMany({ distinct: ['user_position'], select: { user_position: true } }),
    prisma.report.findMany({ distinct: ['user_gender'], select: { user_gender: true } }),
    prisma.report.findMany({
      distinct: ['assessmentId'],
      select: {
        assessmentId: true,
        assessment_description: true,
        assessment_type: true,
        assessment_purpose: true,
        assessment_targetGroup: true,
      },
    }),
  ]);

  const departments = deptRows.map(r => r.user_department).filter(Boolean).sort();
  const positions = posRows.map(r => r.user_position).filter(Boolean).sort();
  const genders = genderRows.map(r => r.user_gender).filter(Boolean).sort();

  // Competencies from ReportCompetency
  const rcRows = await prisma.reportCompetency.findMany({
    select: { competencyId: true, competencyName: true, category: true },
  });
  const compSet = {};
  for (const rc of rcRows) {
    const key = rc.competencyId || rc.competencyName;
    if (!compSet[key]) compSet[key] = { _id: rc.competencyId, name: rc.competencyName, category: rc.category };
  }
  const competencies = Object.values(compSet).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const competencyCategories = [...new Set(rcRows.map(r => r.category).filter(Boolean))].sort();

  const assessmentMap = {};
  for (const a of assessments) {
    if (!assessmentMap[a.assessmentId]) {
      assessmentMap[a.assessmentId] = {
        _id: a.assessmentId,
        description: a.assessment_description,
        type: a.assessment_type,
        purpose: a.assessment_purpose,
        targetGroup: a.assessment_targetGroup,
      };
    }
  }
  const assessmentList = Object.values(assessmentMap).sort((a, b) => (a.description || '').localeCompare(b.description || ''));

  const assessmentTypes = [...new Set(assessments.map(a => a.assessment_type).filter(Boolean))].sort();
  const purposes = [...new Set(assessments.map(a => a.assessment_purpose).filter(Boolean))].sort();
  const targetGroups = [...new Set(assessments.map(a => a.assessment_targetGroup).filter(Boolean))].sort();

  const scoreRange = await prisma.report.aggregate({ _min: { overallScore: true }, _max: { overallScore: true } });

  res.status(200).json({
    status: 'success',
    data: {
      departments, positions, genders,
      competencies,
      competencyCategories,
      assessments: assessmentList,
      assessmentTypes, purposes, targetGroups,
      levels: ['Basic', 'Intermediate', 'Advanced', 'Expert'],
      statuses: ['PARTIAL', 'COMPLETE'],
      scoreRange: scoreRange._min.overallScore != null
        ? { min: Math.floor(scoreRange._min.overallScore), max: Math.ceil(scoreRange._max.overallScore) }
        : { min: 0, max: 100 },
    },
  });
});

// ─── EMPLOYEE LIST ────────────────────────────────────────────────────────────
export const getEmployees = asyncHandler(async (req, res) => {
  let where = {};
  if (req.user.role === 'SUPERVISOR') where.supervisorId = req.user.id;
  else if (req.user.role === 'EMPLOYEE') where.id = req.user.id;

  const rows = await prisma.user.findMany({
    where,
    select: { id: true, name: true, email: true, employeeId: true, department: true, position: true, gender: true },
    orderBy: { name: 'asc' },
  });

  const employees = rows.map(r => ({ _id: r.id, ...r }));

  res.status(200).json({ status: 'success', data: { employees } });
});

// ─── EXPORT PDF ───────────────────────────────────────────────────────────────
export const exportFilteredPDF = asyncHandler(async (req, res, next) => {
  const filter = await buildFilter(req.query, req.user);
  const rows = await prisma.report.findMany({ where: filter, orderBy: { generatedAt: 'desc' }, take: 3000 });
  const reports = await withCompetencies(rows);
  if (!reports.length) return next(new AppError('No reports found.', 404));
  generateConsolidatedPDF(res, reports, {
    title: 'Competency Assessment Reports',
    subtitle: buildFilterSummary(req.query),
    filename: `reports_${Date.now()}.pdf`,
  });
});

// ─── EXPORT EXCEL ─────────────────────────────────────────────────────────────
export const exportFilteredExcel = asyncHandler(async (req, res, next) => {
  const filter = await buildFilter(req.query, req.user);
  const rows = await prisma.report.findMany({ where: filter, orderBy: { generatedAt: 'desc' }, take: 10000 });
  const reports = await withCompetencies(rows);
  if (!reports.length) return next(new AppError('No reports found.', 404));
  await generateConsolidatedExcel(res, reports, {
    title: 'Competency Assessment Reports',
    subtitle: buildFilterSummary(req.query),
    filename: `reports_${Date.now()}.xlsx`,
  });
});

// ─── EXPORT INDIVIDUAL PDF ────────────────────────────────────────────────────
export const exportIndividualPDF = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  if (req.user.role === 'EMPLOYEE' && req.user.id !== userId) return next(new AppError('Access denied.', 403));
  if (req.user.role === 'SUPERVISOR') {
    const emp = await prisma.user.findUnique({ where: { id: userId } });
    if (!emp || emp.supervisorId !== req.user.id) return next(new AppError('Access denied.', 403));
  }
  const rows = await prisma.report.findMany({ where: { userId }, orderBy: { generatedAt: 'desc' } });
  const reports = await withCompetencies(rows);
  if (!reports.length) return next(new AppError('No reports found.', 404));
  const name = reports[0]?.user?.name || 'Employee';
  generateConsolidatedPDF(res, reports, {
    title: `Individual Report — ${name}`,
    subtitle: `Dept: ${reports[0]?.user?.department || 'N/A'}  |  Position: ${reports[0]?.user?.position || 'N/A'}`,
    filename: `report_${name.replace(/\s+/g, '_')}_${Date.now()}.pdf`,
  });
});

// ─── EXPORT INDIVIDUAL EXCEL ──────────────────────────────────────────────────
export const exportIndividualExcel = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  if (req.user.role === 'EMPLOYEE' && req.user.id !== userId) return next(new AppError('Access denied.', 403));
  if (req.user.role === 'SUPERVISOR') {
    const emp = await prisma.user.findUnique({ where: { id: userId } });
    if (!emp || emp.supervisorId !== req.user.id) return next(new AppError('Access denied.', 403));
  }
  const rows = await prisma.report.findMany({ where: { userId }, orderBy: { generatedAt: 'desc' } });
  const reports = await withCompetencies(rows);
  if (!reports.length) return next(new AppError('No reports found.', 404));
  const name = reports[0]?.user?.name || 'Employee';
  await generateConsolidatedExcel(res, reports, {
    title: `Individual Report — ${name}`,
    subtitle: `Dept: ${reports[0]?.user?.department || 'N/A'}`,
    filename: `report_${name.replace(/\s+/g, '_')}_${Date.now()}.xlsx`,
  });
});

// ─── LEGACY JSON ──────────────────────────────────────────────────────────────
export const exportReports = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  if (req.user.role === 'EMPLOYEE' && req.user.id !== userId) return next(new AppError('Access denied.', 403));
  const rows = await prisma.report.findMany({ where: { userId }, orderBy: { generatedAt: 'desc' } });
  const reports = await withCompetencies(rows);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="reports_${userId}.json"`);
  res.status(200).json(reports);
});
// ─── CUSTOM REPORT BUILDER — PIVOT DATA ──────────────────────────────────────
// Returns flat rows used by the frontend pivot engine and Excel export.
// Query params:
//   rowField    – field to group rows by
//   colField    – field to group columns by (optional; omit for flat table)
//   valueField  – 'score' | 'count' | 'level'
//   aggregation – 'avg' | 'count' | 'sum'  (default: avg)
//   plus all standard filter params (department, competencyId, dateFrom, …)
export const getCustomPivotData = asyncHandler(async (req, res) => {
  const { rowField, colField, valueField = 'score', aggregation = 'avg' } = req.query;

  if (!rowField) return res.status(400).json({ status: 'error', message: 'rowField is required.' });

  const filter = await buildFilter(req.query, req.user);

  const reports = await prisma.report.findMany({ where: filter });
  const reportIds = reports.map(r => r.id);
  const allCRs = reportIds.length
    ? await prisma.reportCompetency.findMany({ where: { reportId: { in: reportIds } } })
    : [];

  const reportMap = {};
  reports.forEach(r => { reportMap[r.id] = r; });

  const raw = [];
  for (const cr of allCRs) {
    const r = reportMap[cr.reportId];
    if (!r) continue;
    const genDate = r.generatedAt ? new Date(r.generatedAt) : null;
    raw.push({
      employeeName: r.user_name,
      department: r.user_department,
      position: r.user_position,
      gender: r.user_gender,
      employeeId: r.user_employeeId,
      competency: cr.competencyName,
      competencyCategory: cr.category,
      score: cr.finalScore,
      level: cr.level,
      selfScore: cr.scoreDetails?.selfScore,
      supervisorScore: cr.scoreDetails?.supervisorScore,
      purpose: r.assessment_purpose,
      assessmentType: r.assessment_type,
      targetGroup: r.assessment_targetGroup,
      date: genDate ? `${genDate.getFullYear()}-${String(genDate.getMonth() + 1).padStart(2, '0')}` : null,
      generatedAt: r.generatedAt,
    });
  }

  // Field accessor
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

  const getRow = FIELD_MAP[rowField] || (r => '—');
  const getCol = colField ? (FIELD_MAP[colField] || (() => '—')) : null;

  // Aggregate into pivot structure
  // key: `${rowVal}|||${colVal}` → [values]
  const buckets = {};
  const rowVals = new Set();
  const colVals = new Set();

  raw.forEach(r => {
    const rv = getRow(r);
    const cv = getCol ? getCol(r) : '__total__';
    const key = `${rv}|||${cv}`;

    rowVals.add(rv);
    colVals.add(cv);

    if (!buckets[key]) buckets[key] = { values: [], count: 0 };
    const v = valueField === 'score' ? r.score
            : valueField === 'selfScore' ? r.selfScore
            : valueField === 'supervisorScore' ? r.supervisorScore
            : 1;
    if (v !== null && v !== undefined) buckets[key].values.push(Number(v) || 0);
    buckets[key].count++;
  });

  // Compute aggregation
  const compute = (vals) => {
    if (!vals.length) return null;
    if (aggregation === 'count') return vals.length;
    if (aggregation === 'sum')   return parseFloat(vals.reduce((a, b) => a + b, 0).toFixed(2));
    // avg (default)
    return parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
  };

  const rowArr = [...rowVals].sort();
  const colArr = getCol ? [...colVals].filter(c => c !== '__total__').sort() : null;

  // Build matrix rows
  const matrix = rowArr.map(rv => {
    const cells = {};
    if (colArr) {
      colArr.forEach(cv => {
        const b = buckets[`${rv}|||${cv}`];
        cells[cv] = b ? compute(b.values) : null;
      });
      // Row total
      const allVals = colArr.flatMap(cv => buckets[`${rv}|||${cv}`]?.values || []);
      cells.__rowTotal = compute(allVals);
    } else {
      const b = buckets[`${rv}|||__total__`];
      cells.__value = b ? compute(b.values) : null;
    }
    return { rowLabel: rv, cells };
  });

  // Column totals
  const colTotals = {};
  if (colArr) {
    colArr.forEach(cv => {
      const allVals = rowArr.flatMap(rv => buckets[`${rv}|||${cv}`]?.values || []);
      colTotals[cv] = compute(allVals);
    });
    const allVals = Object.values(buckets).flatMap(b => b.values);
    colTotals.__rowTotal = compute(allVals);
  }

  res.status(200).json({
    status: 'success',
    data: {
      rowField, colField: colField || null, valueField, aggregation,
      columns: colArr,
      rows: matrix,
      colTotals,
      totalRows: raw.length,
    },
  });
});

// ─── CUSTOM REPORT BUILDER — EXCEL EXPORT ────────────────────────────────────
export const exportCustomPivotExcel = asyncHandler(async (req, res) => {
  const { rowField, colField, valueField = 'score', aggregation = 'avg' } = req.query;
  if (!rowField) return res.status(400).json({ status: 'error', message: 'rowField is required.' });

  const filter = await buildFilter(req.query, req.user);

  const reports = await prisma.report.findMany({ where: filter });
  const reportIds = reports.map(r => r.id);
  const allCRs = reportIds.length
    ? await prisma.reportCompetency.findMany({ where: { reportId: { in: reportIds } } })
    : [];

  const reportMap = {};
  reports.forEach(r => { reportMap[r.id] = r; });

  const raw = [];
  for (const cr of allCRs) {
    const r = reportMap[cr.reportId];
    if (!r) continue;
    const genDate = r.generatedAt ? new Date(r.generatedAt) : null;
    raw.push({
      employeeName: r.user_name, department: r.user_department,
      position: r.user_position, gender: r.user_gender,
      competency: cr.competencyName,
      competencyCategory: cr.category,
      score: cr.finalScore, level: cr.level,
      selfScore: cr.scoreDetails?.selfScore,
      supervisorScore: cr.scoreDetails?.supervisorScore,
      purpose: r.assessment_purpose, assessmentType: r.assessment_type,
      targetGroup: r.assessment_targetGroup,
      date: genDate ? `${genDate.getFullYear()}-${String(genDate.getMonth() + 1).padStart(2, '0')}` : null,
    });
  }

  const FIELD_MAP = {
    employeeName: r => r.employeeName || '—', department: r => r.department || '—',
    position: r => r.position || '—', gender: r => r.gender || '—',
    competency: r => r.competency || '—', competencyCategory: r => r.competencyCategory || '—',
    level: r => r.level || '—', purpose: r => r.purpose || '—',
    assessmentType: r => r.assessmentType || '—', targetGroup: r => r.targetGroup || '—',
    date: r => r.date || '—',
  };

  const getRow = FIELD_MAP[rowField] || (r => '—');
  const getCol = colField ? (FIELD_MAP[colField] || (() => '—')) : null;
  const buckets = {};
  const rowVals = new Set(), colVals = new Set();

  raw.forEach(r => {
    const rv = getRow(r), cv = getCol ? getCol(r) : '__total__';
    rowVals.add(rv); colVals.add(cv);
    const key = `${rv}|||${cv}`;
    if (!buckets[key]) buckets[key] = [];
    const v = valueField === 'score' ? r.score : valueField === 'selfScore' ? r.selfScore : valueField === 'supervisorScore' ? r.supervisorScore : 1;
    if (v !== null && v !== undefined) buckets[key].push(Number(v) || 0);
  });

  const compute = vals => {
    if (!vals.length) return null;
    if (aggregation === 'count') return vals.length;
    if (aggregation === 'sum') return parseFloat(vals.reduce((a, b) => a + b, 0).toFixed(2));
    return parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
  };

  const rowArr = [...rowVals].sort();
  const colArr = getCol ? [...colVals].filter(c => c !== '__total__').sort() : null;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'ZB CAS'; wb.created = new Date();
  const ws = wb.addWorksheet('Custom Report');

  // Styling helpers
  const hdStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC8102E' } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: { bottom: { style: 'thin', color: { argb: 'FF999999' } } } };
  const totStyle = { font: { bold: true, size: 10 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE5E5' } }, alignment: { horizontal: 'right' } };
  const cellStyle = { alignment: { horizontal: 'right' }, font: { size: 10 } };
  const rowHdStyle = { font: { bold: true, size: 10 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F8F8' } } };

  // Title
  ws.mergeCells(1, 1, 1, (colArr ? colArr.length + 2 : 2));
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `Custom Report — ${rowField} ${colArr ? `× ${colField}` : ''} (${aggregation} of ${valueField})`;
  titleCell.style = { font: { bold: true, size: 14 }, alignment: { horizontal: 'center' } };
  ws.getRow(1).height = 28;

  ws.getRow(2).values = ['Generated:', new Date().toLocaleString()];
  ws.getRow(2).font = { italic: true, size: 10 };

  // Header row
  const headerRow = ws.getRow(4);
  headerRow.values = colArr
    ? [rowField, ...colArr, 'Total']
    : [rowField, aggregation + ' of ' + valueField];
  headerRow.eachCell(cell => Object.assign(cell, hdStyle));
  headerRow.height = 20;

  // Data rows
  rowArr.forEach((rv, i) => {
    const row = ws.getRow(5 + i);
    if (colArr) {
      const vals = colArr.map(cv => { const b = buckets[`${rv}|||${cv}`]; return b ? compute(b) : null; });
      const allVals = colArr.flatMap(cv => buckets[`${rv}|||${cv}`] || []);
      row.values = [rv, ...vals, compute(allVals)];
      row.getCell(1).style = rowHdStyle;
      for (let c = 2; c <= colArr.length + 1; c++) row.getCell(c).style = cellStyle;
      row.getCell(colArr.length + 2).style = totStyle;
    } else {
      const b = buckets[`${rv}|||__total__`];
      row.values = [rv, b ? compute(b) : null];
      row.getCell(1).style = rowHdStyle;
      row.getCell(2).style = cellStyle;
    }
  });

  // Column totals row
  if (colArr) {
    const totRow = ws.getRow(5 + rowArr.length);
    const tots = colArr.map(cv => { const vals = rowArr.flatMap(rv => buckets[`${rv}|||${cv}`] || []); return compute(vals); });
    const grandTotal = compute(Object.values(buckets).flat());
    totRow.values = ['Total', ...tots, grandTotal];
    totRow.eachCell(cell => Object.assign(cell, totStyle));
  }

  // Column widths
  ws.getColumn(1).width = 28;
  if (colArr) colArr.forEach((_, i) => { ws.getColumn(i + 2).width = 14; });
  else ws.getColumn(2).width = 16;

  const filename = `custom_report_${rowField}_${Date.now()}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
});
