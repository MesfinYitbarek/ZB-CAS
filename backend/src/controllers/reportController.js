import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import Report from '../models/Report.js';
import Assessment from '../models/Assessment.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';

const toObjectId = (str) => {
  if (mongoose.Types.ObjectId.isValid(str)) return new mongoose.Types.ObjectId(str);
  return null;
};

const assignLevel = (score) => {
  if (score >= 85) return 'Expert';
  if (score >= 70) return 'Advanced';
  if (score >= 50) return 'Intermediate';
  return 'Basic';
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
// Supports every filterable attribute in the Report schema
const buildFilter = async (query, user) => {
  const {
    // ── User attributes ──────────────────────────────────────
    employeeId,           // specific user ObjectId
    department,           // user.department exact match
    departmentSearch,     // user.department regex search
    position,             // user.position exact match
    positionSearch,       // user.position regex search
    gender,               // user.gender: Male | Female
    employeeIdCode,       // user.employeeId string (the HR code, not mongo _id)

    // ── Assessment attributes ────────────────────────────────
    assessmentId,         // assessment.assessmentId ObjectId
    assessmentType,       // assessment.type: SelfAssessment | SupervisorOnly | Combined
    purpose,              // assessment.purpose
    targetGroup,          // assessment.targetGroup: managerial | non-managerial | common
    assessmentStatus,     // assessment.status (snapshot)
    assessmentStartFrom,  // assessment.startDate >= date
    assessmentStartTo,    // assessment.startDate <= date
    assessmentEndFrom,    // assessment.endDate >= date
    assessmentEndTo,      // assessment.endDate <= date

    // ── Competency attributes ────────────────────────────────
    competencyId,         // competencyResults[].competencyId ObjectId
    competencyName,       // competencyResults[].competencyName regex
    competencyCategory,   // competencyResults[].category

    // ── Result attributes ────────────────────────────────────
    overallLevel,         // overallLevel (report level)
    competencyLevel,      // competencyResults[].level filter
    scoreMin,             // overallScore >= value
    scoreMax,             // overallScore <= value
    selfScoreMin,         // competencyResults[].scoreDetails.selfScore >=
    selfScoreMax,         // competencyResults[].scoreDetails.selfScore <=
    supervisorScoreMin,   // competencyResults[].scoreDetails.supervisorScore >=
    supervisorScoreMax,   // competencyResults[].scoreDetails.supervisorScore <=

    // ── Report meta ──────────────────────────────────────────
    status,               // report status: PARTIAL | COMPLETE
    dateFrom,             // generatedAt >= date
    dateTo,               // generatedAt <= date

    // ── Sorting & pagination (passed through, not used here) ─
    // sortBy, sortDir, page, limit
  } = query;

  const filter = {};

  // ── User filters ─────────────────────────────────────────────────────────
  if (employeeId) {
    const oid = toObjectId(employeeId);
    if (oid) filter['user.userId'] = oid;
  }
  if (department)       filter['user.department'] = department;
  if (departmentSearch) filter['user.department'] = { $regex: departmentSearch, $options: 'i' };
  if (position)         filter['user.position']   = position;
  if (positionSearch)   filter['user.position']   = { $regex: positionSearch, $options: 'i' };
  if (gender)           filter['user.gender']     = gender;
  if (employeeIdCode)   filter['user.employeeId'] = { $regex: employeeIdCode, $options: 'i' };

  // ── Assessment filters ────────────────────────────────────────────────────
  if (assessmentId) {
    const oid = toObjectId(assessmentId);
    if (oid) filter['assessment.assessmentId'] = oid;
  }
  if (assessmentType)   filter['assessment.type']        = assessmentType;
  if (purpose)          filter['assessment.purpose']     = purpose;
  if (targetGroup)      filter['assessment.targetGroup'] = targetGroup;

  if (assessmentStartFrom || assessmentStartTo) {
    filter['assessment.startDate'] = {};
    if (assessmentStartFrom) filter['assessment.startDate'].$gte = new Date(assessmentStartFrom);
    if (assessmentStartTo)   filter['assessment.startDate'].$lte = new Date(assessmentStartTo);
  }
  if (assessmentEndFrom || assessmentEndTo) {
    filter['assessment.endDate'] = {};
    if (assessmentEndFrom) filter['assessment.endDate'].$gte = new Date(assessmentEndFrom);
    if (assessmentEndTo)   filter['assessment.endDate'].$lte = new Date(assessmentEndTo);
  }

  // ── Competency filters ────────────────────────────────────────────────────
  if (competencyId) {
    const oid = toObjectId(competencyId);
    if (oid) filter['competencyResults.competencyId'] = oid;
  }
  if (competencyName)     filter['competencyResults.competencyName'] = { $regex: competencyName, $options: 'i' };
  if (competencyCategory) filter['competencyResults.category']       = competencyCategory;
  if (competencyLevel)    filter['competencyResults.level']          = competencyLevel;

  // Per-competency score filters (these filter reports that have at least one
  // competency result matching the score range)
  if (selfScoreMin !== undefined || selfScoreMax !== undefined) {
    const cond = {};
    if (selfScoreMin !== undefined) cond.$gte = Number(selfScoreMin);
    if (selfScoreMax !== undefined) cond.$lte = Number(selfScoreMax);
    filter['competencyResults.scoreDetails.selfScore'] = cond;
  }
  if (supervisorScoreMin !== undefined || supervisorScoreMax !== undefined) {
    const cond = {};
    if (supervisorScoreMin !== undefined) cond.$gte = Number(supervisorScoreMin);
    if (supervisorScoreMax !== undefined) cond.$lte = Number(supervisorScoreMax);
    filter['competencyResults.scoreDetails.supervisorScore'] = cond;
  }

  // ── Overall result filters ────────────────────────────────────────────────
  if (overallLevel) filter.overallLevel = overallLevel;
  if (status)       filter.status       = status;

  if (scoreMin !== undefined || scoreMax !== undefined) {
    filter.overallScore = {};
    if (scoreMin !== undefined) filter.overallScore.$gte = Number(scoreMin);
    if (scoreMax !== undefined) filter.overallScore.$lte = Number(scoreMax);
  }

  // ── Generated-at date range ───────────────────────────────────────────────
  if (dateFrom || dateTo) {
    filter.generatedAt = {};
    if (dateFrom) filter.generatedAt.$gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      filter.generatedAt.$lte = end;
    }
  }

  // ── Role-based scoping (always enforced last) ─────────────────────────────
  if (user.role === 'EMPLOYEE') {
    filter['user.userId'] = toObjectId(user.id);
  } else if (user.role === 'SUPERVISOR' && !filter['user.userId']) {
    const subs = await User.find({ supervisorId: user.id }).select('_id').lean();
    filter['user.userId'] = { $in: subs.map(s => s._id) };
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
  const skip   = (parseInt(page) - 1) * parseInt(limit);
  const sort   = { [sortBy]: sortDir === 'asc' ? 1 : -1 };

  const [reports, total] = await Promise.all([
    Report.find(filter).sort(sort).skip(skip).limit(parseInt(limit)).lean(),
    Report.countDocuments(filter),
  ]);

  res.status(200).json({
    status: 'success',
    data: { reports, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } },
  });
});

// ─── SINGLE REPORT ────────────────────────────────────────────────────────────
export const getReportById = asyncHandler(async (req, res, next) => {
  const report = await Report.findById(req.params.reportId).lean();
  if (!report) return next(new AppError('Report not found.', 404));
  if (req.user.role === 'EMPLOYEE' && report.user?.userId?.toString() !== req.user.id)
    return next(new AppError('Access denied.', 403));
  if (req.user.role === 'SUPERVISOR') {
    const subs = await User.find({ supervisorId: req.user.id }).select('_id').lean();
    if (!subs.map(s => s._id.toString()).includes(report.user?.userId?.toString()))
      return next(new AppError('Access denied.', 403));
  }
  res.status(200).json({ status: 'success', data: { report } });
});

// ─── INDIVIDUAL REPORTS for a user ───────────────────────────────────────────
export const getIndividualReports = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const oid = toObjectId(userId);
  if (req.user.role === 'EMPLOYEE' && req.user.id !== userId)
    return next(new AppError('Access denied.', 403));
  if (req.user.role === 'SUPERVISOR') {
    const emp = await User.findById(userId).lean();
    if (!emp || emp.supervisorId?.toString() !== req.user.id)
      return next(new AppError('Access denied.', 403));
  }
  const reports = await Report.find({ 'user.userId': oid }).sort({ generatedAt: -1 }).lean();
  res.status(200).json({ status: 'success', data: { reports } });
});

// ─── DEPARTMENT SUMMARY ───────────────────────────────────────────────────────
export const getDepartmentReports = asyncHandler(async (req, res) => {
  const { department } = req.params;
  const summary = await Report.aggregate([
    { $match: { 'user.department': department } },
    { $unwind: '$competencyResults' },
    { $group: { _id: '$competencyResults.competencyName', avgScore: { $avg: '$competencyResults.finalScore' }, totalReports: { $sum: 1 }, levels: { $push: '$competencyResults.level' } } },
    { $sort: { _id: 1 } },
  ]);
  const withDistribution = summary.map(item => {
    const dist = { Basic: 0, Intermediate: 0, Advanced: 0, Expert: 0 };
    item.levels.forEach(l => { if (dist[l] !== undefined) dist[l]++; });
    return { competencyName: item._id, avgScore: parseFloat(item.avgScore.toFixed(2)), totalReports: item.totalReports, levelDistribution: dist };
  });
  res.status(200).json({ status: 'success', data: { department, summary: withDistribution } });
});

// ─── HEATMAP ──────────────────────────────────────────────────────────────────
export const getHeatmap = asyncHandler(async (req, res) => {
  const heatmap = await Report.aggregate([
    { $unwind: '$competencyResults' },
    { $group: { _id: { competency: '$competencyResults.competencyName', department: '$user.department' }, avgScore: { $avg: '$competencyResults.finalScore' }, count: { $sum: 1 } } },
    { $sort: { '_id.competency': 1, '_id.department': 1 } },
  ]);
  const map = {};
  heatmap.forEach(item => {
    const comp = item._id.competency;
    const dept = item._id.department || 'Unspecified';
    if (!map[comp]) map[comp] = [];
    map[comp].push({ department: dept, avgScore: parseFloat(item.avgScore.toFixed(2)), count: item.count });
  });
  res.status(200).json({ status: 'success', data: { heatmap: map } });
});

// ─── ANALYTICS / STATS ───────────────────────────────────────────────────────
export const getReportStats = asyncHandler(async (req, res) => {
  const match = await buildFilter(req.query, req.user);
  // Remove role filter for stats if HR_ADMIN
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const [overall, levelDist, deptStats, competencyStats, trendData, topPerformers, bottomPerformers, assessmentStats, genderStats, positionStats] = await Promise.all([
    Report.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: 1 }, avgScore: { $avg: '$overallScore' }, maxScore: { $max: '$overallScore' }, minScore: { $min: '$overallScore' }, uniqueEmployees: { $addToSet: '$user.userId' }, uniqueDepts: { $addToSet: '$user.department' }, uniqueAssessments: { $addToSet: '$assessment.assessmentId' } } }, { $project: { total: 1, avgScore: { $round: ['$avgScore', 1] }, maxScore: 1, minScore: 1, uniqueEmployees: { $size: '$uniqueEmployees' }, uniqueDepts: { $size: '$uniqueDepts' }, uniqueAssessments: { $size: '$uniqueAssessments' } } }]),
    Report.aggregate([{ $match: match }, { $group: { _id: '$overallLevel', count: { $sum: 1 }, avgScore: { $avg: '$overallScore' } } }, { $sort: { avgScore: -1 } }]),
    Report.aggregate([{ $match: match }, { $group: { _id: '$user.department', count: { $sum: 1 }, avgScore: { $avg: '$overallScore' }, maxScore: { $max: '$overallScore' }, minScore: { $min: '$overallScore' }, employeeCount: { $addToSet: '$user.userId' } } }, { $project: { count: 1, avgScore: { $round: ['$avgScore', 1] }, maxScore: 1, minScore: 1, employeeCount: { $size: '$employeeCount' } } }, { $sort: { avgScore: -1 } }, { $limit: 12 }]),
    Report.aggregate([{ $match: match }, { $unwind: '$competencyResults' }, { $group: { _id: '$competencyResults.competencyName', competencyId: { $first: '$competencyResults.competencyId' }, category: { $first: '$competencyResults.category' }, count: { $sum: 1 }, avgScore: { $avg: '$competencyResults.finalScore' }, maxScore: { $max: '$competencyResults.finalScore' }, minScore: { $min: '$competencyResults.finalScore' }, expertCount: { $sum: { $cond: [{ $eq: ['$competencyResults.level', 'Expert'] }, 1, 0] } }, basicCount: { $sum: { $cond: [{ $eq: ['$competencyResults.level', 'Basic'] }, 1, 0] } } } }, { $sort: { avgScore: -1 } }]),
    Report.aggregate([{ $match: { ...match, generatedAt: { $gte: new Date(Date.now() - 365*24*60*60*1000) } } }, { $group: { _id: { year: { $year: '$generatedAt' }, month: { $month: '$generatedAt' } }, count: { $sum: 1 }, avgScore: { $avg: '$overallScore' } } }, { $sort: { '_id.year': 1, '_id.month': 1 } }]),
    Report.aggregate([{ $match: match }, { $group: { _id: '$user.userId', name: { $first: '$user.name' }, department: { $first: '$user.department' }, position: { $first: '$user.position' }, avgScore: { $avg: '$overallScore' }, count: { $sum: 1 }, expertCount: { $sum: { $cond: [{ $eq: ['$overallLevel', 'Expert'] }, 1, 0] } } } }, { $sort: { avgScore: -1 } }, { $limit: 5 }]),
    Report.aggregate([{ $match: match }, { $group: { _id: '$user.userId', name: { $first: '$user.name' }, department: { $first: '$user.department' }, avgScore: { $avg: '$overallScore' }, count: { $sum: 1 }, basicCount: { $sum: { $cond: [{ $eq: ['$overallLevel', 'Basic'] }, 1, 0] } } } }, { $sort: { avgScore: 1 } }, { $limit: 5 }]),
    Report.aggregate([{ $match: match }, { $group: { _id: '$assessment.assessmentId', description: { $first: '$assessment.description' }, type: { $first: '$assessment.type' }, purpose: { $first: '$assessment.purpose' }, targetGroup: { $first: '$assessment.targetGroup' }, count: { $sum: 1 }, avgScore: { $avg: '$overallScore' }, maxScore: { $max: '$overallScore' }, minScore: { $min: '$overallScore' } } }, { $sort: { avgScore: -1 } }, { $limit: 20 }]),
    Report.aggregate([{ $match: match }, { $group: { _id: '$user.gender', count: { $sum: 1 }, avgScore: { $avg: '$overallScore' } } }]),
    Report.aggregate([{ $match: match }, { $group: { _id: '$user.position', count: { $sum: 1 }, avgScore: { $avg: '$overallScore' } } }, { $sort: { avgScore: -1 } }, { $limit: 10 }]),
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      overall: overall[0] || { total: 0, avgScore: 0, maxScore: 0, minScore: 0, uniqueEmployees: 0, uniqueDepts: 0, uniqueAssessments: 0 },
      levelDistribution: levelDist,
      departmentBreakdown: deptStats,
      competencyBreakdown: competencyStats,
      monthlyTrend: trendData.map(t => ({ month: `${MONTHS[t._id.month-1]} ${t._id.year}`, count: t.count, avgScore: parseFloat(t.avgScore.toFixed(1)) })),
      topPerformers, bottomPerformers,
      assessmentBreakdown: assessmentStats,
      genderBreakdown: genderStats,
      positionBreakdown: positionStats,
    },
  });
});

// ─── FILTER OPTIONS (every distinct value for every dropdown) ─────────────────
export const getReportFilterOptions = asyncHandler(async (req, res) => {
  const [
    departments, positions, genders,
    competencies, competencyCategories,
    assessments,
    assessmentTypes, purposes, targetGroups,
    levels, statuses,
  ] = await Promise.all([
    Report.distinct('user.department').then(a => a.filter(Boolean).sort()),
    Report.distinct('user.position').then(a => a.filter(Boolean).sort()),
    Report.distinct('user.gender').then(a => a.filter(Boolean).sort()),
    Report.aggregate([
      { $unwind: '$competencyResults' },
      { $group: { _id: '$competencyResults.competencyId', name: { $first: '$competencyResults.competencyName' }, category: { $first: '$competencyResults.category' } } },
      { $sort: { name: 1 } }
    ]),
    Report.distinct('competencyResults.category').then(a => a.filter(Boolean).sort()),
    Report.aggregate([
      { $group: { _id: '$assessment.assessmentId', description: { $first: '$assessment.description' }, type: { $first: '$assessment.type' }, purpose: { $first: '$assessment.purpose' }, targetGroup: { $first: '$assessment.targetGroup' } } },
      { $sort: { description: 1 } }
    ]),
    Report.distinct('assessment.type').then(a => a.filter(Boolean).sort()),
    Report.distinct('assessment.purpose').then(a => a.filter(Boolean).sort()),
    Report.distinct('assessment.targetGroup').then(a => a.filter(Boolean).sort()),
    Promise.resolve(['Basic', 'Intermediate', 'Advanced', 'Expert']),
    Promise.resolve(['PARTIAL', 'COMPLETE']),
  ]);

  // Score range meta
  const scoreRange = await Report.aggregate([
    { $group: { _id: null, min: { $min: '$overallScore' }, max: { $max: '$overallScore' } } }
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      // User
      departments, positions, genders,
      // Competency
      competencies: competencies.map(c => ({ _id: c._id, name: c.name, category: c.category })),
      competencyCategories,
      // Assessment
      assessments,
      assessmentTypes, purposes, targetGroups,
      // Result
      levels, statuses,
      // Score meta
      scoreRange: scoreRange[0] ? { min: Math.floor(scoreRange[0].min), max: Math.ceil(scoreRange[0].max) } : { min: 0, max: 100 },
    },
  });
});

// ─── EMPLOYEE LIST ────────────────────────────────────────────────────────────
export const getEmployees = asyncHandler(async (req, res) => {
  let filter = {};
  if (req.user.role === 'SUPERVISOR') filter.supervisorId = req.user.id;
  else if (req.user.role === 'EMPLOYEE') filter._id = req.user.id;
  const employees = await User.find(filter).select('_id name email employeeId department position gender').sort({ name: 1 }).lean();
  res.status(200).json({ status: 'success', data: { employees } });
});

// ─── EXPORT PDF ───────────────────────────────────────────────────────────────
export const exportFilteredPDF = asyncHandler(async (req, res, next) => {
  const filter = await buildFilter(req.query, req.user);
  const reports = await Report.find(filter).sort({ generatedAt: -1 }).limit(3000).lean();
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
  const reports = await Report.find(filter).sort({ generatedAt: -1 }).limit(10000).lean();
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
  const oid = toObjectId(userId);
  if (req.user.role === 'EMPLOYEE' && req.user.id !== userId) return next(new AppError('Access denied.', 403));
  if (req.user.role === 'SUPERVISOR') {
    const emp = await User.findById(userId).lean();
    if (!emp || emp.supervisorId?.toString() !== req.user.id) return next(new AppError('Access denied.', 403));
  }
  const reports = await Report.find({ 'user.userId': oid }).sort({ generatedAt: -1 }).lean();
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
  const oid = toObjectId(userId);
  if (req.user.role === 'EMPLOYEE' && req.user.id !== userId) return next(new AppError('Access denied.', 403));
  if (req.user.role === 'SUPERVISOR') {
    const emp = await User.findById(userId).lean();
    if (!emp || emp.supervisorId?.toString() !== req.user.id) return next(new AppError('Access denied.', 403));
  }
  const reports = await Report.find({ 'user.userId': oid }).sort({ generatedAt: -1 }).lean();
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
  const oid = toObjectId(userId);
  if (req.user.role === 'EMPLOYEE' && req.user.id !== userId) return next(new AppError('Access denied.', 403));
  const reports = await Report.find({ 'user.userId': oid }).sort({ generatedAt: -1 }).lean();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="reports_${userId}.json"`);
  res.status(200).json(reports);
});