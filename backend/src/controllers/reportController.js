import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import Report from '../models/Report.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';

// ─── HELPER: ObjectId from string (safe) ─────────────────────────────────────
const toObjectId = (str) => {
  if (mongoose.Types.ObjectId.isValid(str)) return new mongoose.Types.ObjectId(str);
  return null;
};

// ─── HELPER: Build common filter from query + role ───────────────────────────
const buildFilter = async (query, user) => {
  const { department, competencyId, level, dateFrom, dateTo, employeeId } = query;
  const filter = {};

  if (department)   filter['user.department'] = department;
  if (competencyId) filter.competencyId       = competencyId;
  if (level)        filter.level              = level;

  // Date range
  if (dateFrom || dateTo) {
    filter.generatedAt = {};
    if (dateFrom) filter.generatedAt.$gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      filter.generatedAt.$lte = end;
    }
  }

  // Specific employee filter (admin / supervisor picking an employee)
  if (employeeId) {
    const oid = toObjectId(employeeId);
    if (oid) filter['user.userId'] = oid;
  }

  // Role-based scope
  if (user.role === 'EMPLOYEE') {
    filter['user.userId'] = user.id;
  } else if (user.role === 'SUPERVISOR') {
    // If not already scoped to a specific employee, scope to subordinates
    if (!filter['user.userId']) {
      const subs = await User.find({ supervisorId: user.id }).select('_id').lean();
      filter['user.userId'] = { $in: subs.map((s) => s._id) };
    }
  }

  return filter;
};

// ─── HELPER: Format report data for table rows ──────────────────────────────
const formatReportRow = (r) => ({
  employee:       `${r.user?.firstName || ''} ${r.user?.lastName || ''}`.trim() || 'N/A',
  department:     r.user?.department || 'N/A',
  competency:     r.competencyName || 'N/A',
  score:          r.finalScore ?? 0,
  level:          r.level || 'N/A',
  recommendation: r.recommendation || '',
  date:           r.generatedAt ? new Date(r.generatedAt).toLocaleDateString() : 'N/A',
});

// ─── PDF generation helper ───────────────────────────────────────────────────
const generatePDF = (res, reports, { title, subtitle, filename }) => {
  const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  // ── Title block ──
  doc.fontSize(22).font('Helvetica-Bold').fillColor('#C8102E').text(title, { align: 'center' });
  doc.moveDown(0.3);
  if (subtitle) {
    doc.fontSize(10).font('Helvetica').fillColor('#666666').text(subtitle, { align: 'center' });
  }
  doc.fontSize(9).fillColor('#999999').text(
    `Generated on ${new Date().toLocaleString()}  •  ${reports.length} record${reports.length !== 1 ? 's' : ''}`,
    { align: 'center' },
  );
  doc.moveDown(1);

  // ── Divider ──
  doc.strokeColor('#E0E0E0').lineWidth(0.5)
    .moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.8);

  // ── Table header ──
  const COL = { x: 50, w: [130, 55, 75, 210, 65] }; // competency, score, level, recommendation, date
  const headers = ['Competency', 'Score', 'Level', 'Recommendation', 'Date'];

  const drawHeader = () => {
    const y = doc.y;
    doc.fillColor('#F5F5F5').rect(48, y - 4, 500, 20).fill();
    doc.fillColor('#333333').fontSize(8).font('Helvetica-Bold');
    let xOff = COL.x;
    headers.forEach((h, i) => {
      doc.text(h, xOff, y, { width: COL.w[i], align: 'left' });
      xOff += COL.w[i];
    });
    doc.moveDown(0.6);
  };

  drawHeader();

  // ── Rows ──
  reports.forEach((r, idx) => {
    if (doc.y > 720) {
      doc.addPage();
      drawHeader();
    }

    const row = formatReportRow(r);
    const y = doc.y;
    const bgColor = idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA';
    doc.fillColor(bgColor).rect(48, y - 2, 500, 18).fill();

    doc.fontSize(8).font('Helvetica').fillColor('#222222');
    let xOff = COL.x;
    const vals = [row.competency, `${row.score}%`, row.level, row.recommendation, row.date];
    vals.forEach((v, i) => {
      const text = i === 3 ? (v.length > 55 ? v.substring(0, 55) + '…' : v) : v;
      doc.text(String(text), xOff, y, { width: COL.w[i], align: 'left', lineBreak: false });
      xOff += COL.w[i];
    });
    doc.moveDown(0.5);
  });

  // ── Summary ──
  if (reports.length > 0) {
    const avg = reports.reduce((s, r) => s + (r.finalScore || 0), 0) / reports.length;
    doc.moveDown(1);
    doc.strokeColor('#E0E0E0').lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333')
      .text(`Average Score: ${avg.toFixed(1)}%`, { align: 'right' });
  }

  doc.end();
};

// ─── Excel generation helper ─────────────────────────────────────────────────
const generateExcel = async (res, reports, { title, subtitle, filename }) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Competency Assessment System';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Reports');

  // ── Title rows ──
  sheet.addRow([title]);
  sheet.getRow(1).font = { bold: true, size: 16, color: { argb: 'FFC8102E' } };
  sheet.mergeCells('A1:G1');

  if (subtitle) {
    sheet.addRow([subtitle]);
    sheet.getRow(2).font = { italic: true, size: 10, color: { argb: 'FF666666' } };
    sheet.mergeCells('A2:G2');
  }

  sheet.addRow([`Generated: ${new Date().toLocaleString()}  |  Records: ${reports.length}`]);
  sheet.getRow(sheet.lastRow.number).font = { size: 9, color: { argb: 'FF999999' } };
  sheet.mergeCells(`A${sheet.lastRow.number}:G${sheet.lastRow.number}`);
  sheet.addRow([]); // spacer

  // ── Header row ──
  const headerRow = sheet.addRow([
    'Employee', 'Department', 'Competency', 'Score (%)', 'Level', 'Recommendation', 'Date',
  ]);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC8102E' } };
  headerRow.alignment = { vertical: 'middle' };
  headerRow.eachCell((cell) => {
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF8B0000' } },
    };
  });

  sheet.columns = [
    { width: 25 }, { width: 20 }, { width: 28 },
    { width: 12 }, { width: 15 }, { width: 45 }, { width: 15 },
  ];

  // ── Data rows ──
  reports.forEach((r, idx) => {
    const row = formatReportRow(r);
    const dataRow = sheet.addRow([
      row.employee, row.department, row.competency,
      row.score, row.level, row.recommendation, row.date,
    ]);
    if (idx % 2 === 1) {
      dataRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F9F9' } };
    }
  });

  // ── Auto-filter on header ──
  const headerRowNum = headerRow.number;
  sheet.autoFilter = {
    from: { row: headerRowNum, column: 1 },
    to: { row: headerRowNum, column: 7 },
  };

  // ── Summary row ──
  if (reports.length > 0) {
    sheet.addRow([]);
    const avg = reports.reduce((s, r) => s + (r.finalScore || 0), 0) / reports.length;
    const sumRow = sheet.addRow(['', '', 'Average Score', parseFloat(avg.toFixed(1))]);
    sumRow.font = { bold: true };
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
};

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── LIST ALL REPORTS (paginated) ────────────────────────────────────────────
export const getReports = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const filter = await buildFilter(req.query, req.user);

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [reports, total] = await Promise.all([
    Report.find(filter)
      .sort({ generatedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .lean(),
    Report.countDocuments(filter),
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      reports,
      pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10) },
    },
  });
});

// ─── INDIVIDUAL REPORTS (for a specific user) ────────────────────────────────
export const getIndividualReports = asyncHandler(async (req, res, next) => {
  const userId = req.params.userId;
  const oid    = toObjectId(userId);

  // Access control
  if (req.user.role === 'EMPLOYEE' && req.user.id !== userId) {
    return next(new AppError('Access denied.', 403));
  }
  if (req.user.role === 'SUPERVISOR') {
    const emp = await User.findById(userId).lean();
    if (!emp || emp.supervisorId?.toString() !== req.user.id) {
      return next(new AppError('Access denied.', 403));
    }
  }

  const reports = await Report.find({ 'user.userId': oid })
    .sort({ generatedAt: -1 })
    .lean();

  res.status(200).json({ status: 'success', data: { reports } });
});

// ─── DEPARTMENT SUMMARY ──────────────────────────────────────────────────────
export const getDepartmentReports = asyncHandler(async (req, res) => {
  const { department } = req.params;

  const summary = await Report.aggregate([
    { $match: { 'user.department': department } },
    {
      $group: {
        _id:          '$competencyName',
        avgScore:     { $avg: '$finalScore' },
        totalReports: { $sum: 1 },
        levels:       { $push: '$level' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const withDistribution = summary.map((item) => {
    const dist = { Basic: 0, Intermediate: 0, Advanced: 0, Expert: 0 };
    item.levels.forEach((l) => { if (dist[l] !== undefined) dist[l]++; });
    return {
      competencyName: item._id,
      avgScore:       parseFloat(item.avgScore.toFixed(2)),
      totalReports:   item.totalReports,
      levelDistribution: dist,
    };
  });

  res.status(200).json({ status: 'success', data: { department, summary: withDistribution } });
});

// ─── BANK-WIDE HEATMAP ──────────────────────────────────────────────────────
export const getHeatmap = asyncHandler(async (req, res) => {
  const heatmap = await Report.aggregate([
    {
      $group: {
        _id: {
          competency: '$competencyName',
          department: '$user.department',
        },
        avgScore: { $avg: '$finalScore' },
        count:    { $sum: 1 },
      },
    },
    { $sort: { '_id.competency': 1, '_id.department': 1 } },
  ]);

  const map = {};
  heatmap.forEach((item) => {
    const comp = item._id.competency;
    const dept = item._id.department || 'Unspecified';
    if (!map[comp]) map[comp] = [];
    map[comp].push({
      department: dept,
      avgScore:   parseFloat(item.avgScore.toFixed(2)),
      count:      item.count,
    });
  });

  res.status(200).json({ status: 'success', data: { heatmap: map } });
});

// ─── GET EMPLOYEES (for admin / supervisor employee selector) ────────────────
export const getEmployees = asyncHandler(async (req, res) => {
  let filter = {};

  if (req.user.role === 'SUPERVISOR') {
    filter.supervisorId = req.user.id;
  } else if (req.user.role === 'EMPLOYEE') {
    filter._id = req.user.id;
  }
  // HR_ADMIN sees all

  const employees = await User.find(filter)
    .select('_id firstName lastName department email')
    .sort({ firstName: 1, lastName: 1 })
    .lean();

  res.status(200).json({ status: 'success', data: { employees } });
});

// ─── EXPORT FILTERED REPORTS — PDF ───────────────────────────────────────────
export const exportFilteredPDF = asyncHandler(async (req, res, next) => {
  const filter  = await buildFilter(req.query, req.user);
  const reports = await Report.find(filter).sort({ generatedAt: -1 }).lean();

  if (reports.length === 0) {
    return next(new AppError('No reports found matching the filters.', 404));
  }

  const filterParts = [];
  if (req.query.department)  filterParts.push(`Department: ${req.query.department}`);
  if (req.query.level)       filterParts.push(`Level: ${req.query.level}`);
  if (req.query.dateFrom)    filterParts.push(`From: ${req.query.dateFrom}`);
  if (req.query.dateTo)      filterParts.push(`To: ${req.query.dateTo}`);
  if (req.query.employeeId)  filterParts.push(`Employee ID: ${req.query.employeeId}`);

  generatePDF(res, reports, {
    title:    'Competency Assessment Reports',
    subtitle: filterParts.length ? `Filters: ${filterParts.join('  |  ')}` : null,
    filename: `reports_filtered_${Date.now()}.pdf`,
  });
});

// ─── EXPORT FILTERED REPORTS — EXCEL ─────────────────────────────────────────
export const exportFilteredExcel = asyncHandler(async (req, res, next) => {
  const filter  = await buildFilter(req.query, req.user);
  const reports = await Report.find(filter).sort({ generatedAt: -1 }).lean();

  if (reports.length === 0) {
    return next(new AppError('No reports found matching the filters.', 404));
  }

  const filterParts = [];
  if (req.query.department)  filterParts.push(`Department: ${req.query.department}`);
  if (req.query.level)       filterParts.push(`Level: ${req.query.level}`);
  if (req.query.dateFrom)    filterParts.push(`From: ${req.query.dateFrom}`);
  if (req.query.dateTo)      filterParts.push(`To: ${req.query.dateTo}`);
  if (req.query.employeeId)  filterParts.push(`Employee ID: ${req.query.employeeId}`);

  await generateExcel(res, reports, {
    title:    'Competency Assessment Reports',
    subtitle: filterParts.length ? `Filters: ${filterParts.join('  |  ')}` : null,
    filename: `reports_filtered_${Date.now()}.xlsx`,
  });
});

// ─── EXPORT INDIVIDUAL EMPLOYEE REPORT — PDF ─────────────────────────────────
export const exportIndividualPDF = asyncHandler(async (req, res, next) => {
  const userId = req.params.userId;
  const oid    = toObjectId(userId);

  // Access control
  if (req.user.role === 'EMPLOYEE' && req.user.id !== userId) {
    return next(new AppError('Access denied.', 403));
  }
  if (req.user.role === 'SUPERVISOR') {
    const emp = await User.findById(userId).lean();
    if (!emp || emp.supervisorId?.toString() !== req.user.id) {
      return next(new AppError('Access denied.', 403));
    }
  }

  const reports  = await Report.find({ 'user.userId': oid }).sort({ generatedAt: -1 }).lean();
  const employee = await User.findById(userId).select('firstName lastName department email').lean();

  if (reports.length === 0) {
    return next(new AppError('No reports found for this employee.', 404));
  }

  const name = `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim() || 'Employee';

  generatePDF(res, reports, {
    title:    `Individual Report — ${name}`,
    subtitle: `Department: ${employee?.department || 'N/A'}  |  Email: ${employee?.email || 'N/A'}`,
    filename: `report_${name.replace(/\s+/g, '_')}_${Date.now()}.pdf`,
  });
});

// ─── EXPORT INDIVIDUAL EMPLOYEE REPORT — EXCEL ──────────────────────────────
export const exportIndividualExcel = asyncHandler(async (req, res, next) => {
  const userId = req.params.userId;
  const oid    = toObjectId(userId);

  // Access control
  if (req.user.role === 'EMPLOYEE' && req.user.id !== userId) {
    return next(new AppError('Access denied.', 403));
  }
  if (req.user.role === 'SUPERVISOR') {
    const emp = await User.findById(userId).lean();
    if (!emp || emp.supervisorId?.toString() !== req.user.id) {
      return next(new AppError('Access denied.', 403));
    }
  }

  const reports  = await Report.find({ 'user.userId': oid }).sort({ generatedAt: -1 }).lean();
  const employee = await User.findById(userId).select('firstName lastName department email').lean();

  if (reports.length === 0) {
    return next(new AppError('No reports found for this employee.', 404));
  }

  const name = `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim() || 'Employee';

  await generateExcel(res, reports, {
    title:    `Individual Report — ${name}`,
    subtitle: `Department: ${employee?.department || 'N/A'}  |  Email: ${employee?.email || 'N/A'}`,
    filename: `report_${name.replace(/\s+/g, '_')}_${Date.now()}.xlsx`,
  });
});

// ─── LEGACY JSON EXPORT (kept for backwards compat) ──────────────────────────
export const exportReports = asyncHandler(async (req, res, next) => {
  const userId = req.params.userId;
  const oid    = toObjectId(userId);

  if (req.user.role === 'EMPLOYEE' && req.user.id !== userId) {
    return next(new AppError('Access denied.', 403));
  }

  const reports = await Report.find({ 'user.userId': oid })
    .sort({ generatedAt: -1 })
    .lean();

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="reports_${userId}.json"`);
  res.status(200).json(reports);
});

// ─── COMPREHENSIVE REPORT STATS ──────────────────────────────────────────────
export const getReportStats = asyncHandler(async (req, res) => {
  const {
    department, competencyId, assessmentId, level, assessmentType,
    targetGroup, purpose, gender, dateFrom, dateTo,
  } = req.query;

  // Build base match for aggregation
  const match = {};
  if (department)  match['user.department'] = department;
  if (competencyId) match.competencyId = toObjectId(competencyId);
  if (assessmentId) match.assessmentId = toObjectId(assessmentId);
  if (level) match.level = level;
  if (dateFrom || dateTo) {
    match.generatedAt = {};
    if (dateFrom) match.generatedAt.$gte = new Date(dateFrom);
    if (dateTo) { const e = new Date(dateTo); e.setHours(23,59,59,999); match.generatedAt.$lte = e; }
  }

  const [
    overallStats,
    levelDist,
    deptStats,
    competencyStats,
    trendData,
    topPerformers,
    bottomPerformers,
  ] = await Promise.all([
    // Overall summary
    Report.aggregate([
      { $match: match },
      { $group: {
        _id: null,
        total: { $sum: 1 },
        avgScore: { $avg: '$finalScore' },
        maxScore: { $max: '$finalScore' },
        minScore: { $min: '$finalScore' },
        uniqueEmployees: { $addToSet: '$user.userId' },
        uniqueDepts: { $addToSet: '$user.department' },
        uniqueCompetencies: { $addToSet: '$competencyName' },
      }},
      { $project: {
        total: 1, avgScore: { $round: ['$avgScore', 1] },
        maxScore: 1, minScore: 1,
        uniqueEmployees: { $size: '$uniqueEmployees' },
        uniqueDepts: { $size: '$uniqueDepts' },
        uniqueCompetencies: { $size: '$uniqueCompetencies' },
      }},
    ]),
    // Level distribution
    Report.aggregate([
      { $match: match },
      { $group: { _id: '$level', count: { $sum: 1 }, avgScore: { $avg: '$finalScore' } } },
      { $sort: { _id: 1 } },
    ]),
    // Department breakdown
    Report.aggregate([
      { $match: match },
      { $group: {
        _id: '$user.department',
        count: { $sum: 1 },
        avgScore: { $avg: '$finalScore' },
        maxScore: { $max: '$finalScore' },
        minScore: { $min: '$finalScore' },
      }},
      { $sort: { avgScore: -1 } },
      { $limit: 10 },
    ]),
    // Competency breakdown
    Report.aggregate([
      { $match: match },
      { $group: {
        _id: '$competencyName',
        count: { $sum: 1 },
        avgScore: { $avg: '$finalScore' },
        competencyId: { $first: '$competencyId' },
      }},
      { $sort: { avgScore: -1 } },
    ]),
    // Monthly trend (last 12 months)
    Report.aggregate([
      { $match: { ...match, generatedAt: { $gte: new Date(Date.now() - 365*24*60*60*1000) } } },
      { $group: {
        _id: { year: { $year: '$generatedAt' }, month: { $month: '$generatedAt' } },
        count: { $sum: 1 },
        avgScore: { $avg: '$finalScore' },
      }},
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
    // Top 5 performers
    Report.aggregate([
      { $match: match },
      { $group: { _id: '$user.userId', name: { $first: '$user.name' }, dept: { $first: '$user.department' }, avgScore: { $avg: '$finalScore' }, count: { $sum: 1 } } },
      { $sort: { avgScore: -1 } },
      { $limit: 5 },
    ]),
    // Bottom 5 (needing support)
    Report.aggregate([
      { $match: match },
      { $group: { _id: '$user.userId', name: { $first: '$user.name' }, dept: { $first: '$user.department' }, avgScore: { $avg: '$finalScore' }, count: { $sum: 1 } } },
      { $sort: { avgScore: 1 } },
      { $limit: 5 },
    ]),
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      overall: overallStats[0] || { total: 0, avgScore: 0, maxScore: 0, minScore: 0, uniqueEmployees: 0, uniqueDepts: 0, uniqueCompetencies: 0 },
      levelDistribution: levelDist,
      departmentBreakdown: deptStats,
      competencyBreakdown: competencyStats,
      monthlyTrend: trendData,
      topPerformers,
      bottomPerformers,
    },
  });
});

// ─── GET FILTER OPTIONS FOR REPORTS ─────────────────────────────────────────
export const getReportFilterOptions = asyncHandler(async (req, res) => {
  const [departments, competencies, assessments] = await Promise.all([
    Report.distinct('user.department'),
    Report.distinct('competencyName'),
    Report.distinct('assessmentId').then(ids =>
      Assessment.find({ _id: { $in: ids } }).select('description type targetGroup purpose status').lean()
    ),
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      departments: departments.filter(Boolean).sort(),
      competencies: competencies.filter(Boolean).sort(),
      assessments,
      levels: ['Basic', 'Intermediate', 'Advanced', 'Expert'],
    },
  });
});
