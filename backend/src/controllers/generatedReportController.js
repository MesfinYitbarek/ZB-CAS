import path from 'path';
import fs from 'fs';
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logActivity } from '../services/activityService.js';
import { enqueueReportJob } from '../services/reportJobQueue.js';
import {
  REPORTS_DIR,
  PIVOT_FIELDS,
  fetchScopedRows,
  buildPivot,
  buildFlatWorkbook,
  buildPivotWorkbook,
  saveWorkbook,
  removeFile,
  previewWorkbook,
} from '../services/generatedReportService.js';
import logger from '../utils/logger.js';

const TYPES = ['INDIVIDUAL', 'ORGANIZATION', 'CUSTOM_PIVOT'];
const VALUE_FIELDS = ['score', 'selfScore', 'supervisorScore', 'count'];
const AGGREGATIONS = ['avg', 'count', 'sum'];

const toPublic = (row) => ({
  ...row,
  _id: row.id,
  generatorName: row.generator?.name ?? null,
});

const canAccess = (req, row) =>
  req.user.role === 'HR_ADMIN' || row.generatedBy === req.user.id;

// ─── GENERATE (named, Excel artifact, generated asynchronously) ───────────────
// Validation + row creation happen synchronously (cheap); the dataset fetch and
// Excel build run off the HTTP request via the in-process report job queue.
export const createGeneratedReport = asyncHandler(async (req, res, next) => {
  const { title, description = '', type, filters = {}, employeeId, pivot } = req.body || {};

  if (!title || !String(title).trim()) return next(new AppError('Title is required.', 400));
  const cleanTitle = String(title).trim();
  if (cleanTitle.length > 120) return next(new AppError('Title must be at most 120 characters.', 400));
  if (!TYPES.includes(type)) return next(new AppError('Type must be INDIVIDUAL, ORGANIZATION or CUSTOM_PIVOT.', 400));
  if (typeof filters !== 'object' || filters === null || Array.isArray(filters)) {
    return next(new AppError('Filters must be an object.', 400));
  }

  const role = req.user.role;
  const effFilters = { ...filters };
  let pivotCfg = null;

  if (type === 'INDIVIDUAL') {
    if (!employeeId) return next(new AppError('employeeId is required for INDIVIDUAL reports.', 400));
    if (role === 'EMPLOYEE' && employeeId !== req.user.id) return next(new AppError('Access denied.', 403));
    if (role === 'SUPERVISOR') {
      const emp = await prisma.user.findUnique({ where: { id: employeeId }, select: { supervisorId: true } });
      if (!emp || emp.supervisorId !== req.user.id) return next(new AppError('Access denied.', 403));
    }
    effFilters.employeeId = employeeId;
  } else if (type === 'ORGANIZATION') {
    // HR_ADMIN sees everything; SUPERVISOR is auto-scoped to direct reports.
    if (role === 'EMPLOYEE') return next(new AppError('Access denied.', 403));
  } else {
    if (role !== 'HR_ADMIN') return next(new AppError('Access denied.', 403));
    const p = pivot || {};
    if (!p.rowField || !PIVOT_FIELDS.includes(p.rowField)) return next(new AppError('pivot.rowField is required.', 400));
    if (p.colField && !PIVOT_FIELDS.includes(p.colField)) return next(new AppError('Invalid pivot.colField.', 400));
    if (p.valueField && !VALUE_FIELDS.includes(p.valueField)) return next(new AppError('Invalid pivot.valueField.', 400));
    if (p.aggregation && !AGGREGATIONS.includes(p.aggregation)) return next(new AppError('Invalid pivot.aggregation.', 400));
    pivotCfg = {
      rowField: p.rowField,
      colField: p.colField || null,
      valueField: p.valueField || 'score',
      aggregation: p.aggregation || 'avg',
    };
  }

  const gen = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true } });
  const cleanDesc = String(description || '').slice(0, 1000);

  const created = await prisma.generatedReport.create({
    data: {
      title: cleanTitle,
      description: cleanDesc,
      type,
      filters: effFilters,
      pivot: pivotCfg,
      fileName: '',
      rowCount: 0,
      status: 'PENDING',
      generatedBy: req.user.id,
    },
  });

  const userSnapshot = { id: req.user.id, role, name: gen?.name || '' };

  enqueueReportJob({
    reportId: created.id,
    run: () => buildReportJob(created, userSnapshot, cleanDesc),
    fail: (err) => markReportFailed(created.id, err),
  });

  await logActivity({
    req, action: 'GENERATE_REPORT', entity: 'GeneratedReport',
    entityId: created.id, description: `${type}: ${cleanTitle}`,
  });

  res.status(202).json({ status: 'success', data: { report: toPublic({ ...created, generator: gen }) } });
});

const buildReportJob = async (report, userSnapshot) => {
  await prisma.generatedReport.update({
    where: { id: report.id },
    data: { status: 'PROCESSING', error: null },
  });

  const rows = await fetchScopedRows({ filters: report.filters, user: userSnapshot });
  if (!rows.length) {
    return markReportFailed(report.id, new AppError('No data found for the selected filters.', 404));
  }

  const meta = `Generated: ${new Date().toLocaleString()}   |   By: ${userSnapshot.name || ''}   |   Records: ${rows.length}`;
  const fullMeta = report.description ? `${report.description}   |   ${meta}` : meta;

  let workbook;
  if (report.type === 'CUSTOM_PIVOT') {
    workbook = buildPivotWorkbook({
      title: report.title, meta: fullMeta, pivotCfg: report.pivot, pivot: buildPivot(rows, report.pivot),
    });
  } else {
    workbook = buildFlatWorkbook({ title: report.title, meta: fullMeta, rows });
  }

  const { fileName } = await saveWorkbook(workbook, report.title);
  await prisma.generatedReport.update({
    where: { id: report.id },
    data: { status: 'READY', fileName, rowCount: rows.length },
  });
};

const markReportFailed = async (reportId, err) => {
  const message = String(err?.message || err).slice(0, 500);
  await prisma.generatedReport.update({
    where: { id: reportId },
    data: { status: 'FAILED', error: message },
  });
  logger.error({ event: 'report_generation_failed', reportId, error: message });
};

// ─── LIST ─────────────────────────────────────────────────────────────────────
export const listGeneratedReports = asyncHandler(async (req, res) => {
  const where = req.user.role === 'HR_ADMIN' ? {} : { generatedBy: req.user.id };
  const rows = await prisma.generatedReport.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { generator: { select: { name: true } } },
  });
  res.status(200).json({ status: 'success', data: { reports: rows.map(toPublic) } });
});

// ─── DETAIL ───────────────────────────────────────────────────────────────────
export const getGeneratedReport = asyncHandler(async (req, res, next) => {
  const row = await prisma.generatedReport.findUnique({
    where: { id: req.params.id },
    include: { generator: { select: { name: true } } },
  });
  if (!row) return next(new AppError('Report not found.', 404));
  if (!canAccess(req, row)) return next(new AppError('Access denied.', 403));
  res.status(200).json({ status: 'success', data: { report: toPublic(row) } });
});

// ─── DOWNLOAD (stored Excel artifact) ─────────────────────────────────────────
export const downloadGeneratedReport = asyncHandler(async (req, res, next) => {
  const row = await prisma.generatedReport.findUnique({ where: { id: req.params.id } });
  if (!row) return next(new AppError('Report not found.', 404));
  if (!canAccess(req, row)) return next(new AppError('Access denied.', 403));
  if (row.status === 'FAILED') return next(new AppError(`Report failed to generate${row.error ? `: ${row.error}` : '.'}`, 409));
  if (row.status !== 'READY') return next(new AppError('Report is still being generated. Try again shortly.', 409));
  const absPath = path.join(REPORTS_DIR, path.basename(row.fileName));
  res.download(absPath, row.fileName, (err) => {
    if (err && !res.headersSent) next(new AppError('File not found.', 404));
  });
});

// ─── PREVIEW (first rows of the stored workbook, rendered in-page) ───────────
export const previewGeneratedReport = asyncHandler(async (req, res, next) => {
  const row = await prisma.generatedReport.findUnique({ where: { id: req.params.id } });
  if (!row) return next(new AppError('Report not found.', 404));
  if (!canAccess(req, row)) return next(new AppError('Access denied.', 403));
  if (row.status === 'FAILED') return next(new AppError(`Report failed to generate${row.error ? `: ${row.error}` : '.'}`, 409));
  if (row.status !== 'READY') return next(new AppError('Report is still being generated. Try again shortly.', 409));

  const absPath = path.join(REPORTS_DIR, path.basename(row.fileName));
  if (!fs.existsSync(absPath)) return next(new AppError('Report file not found.', 404));

  const rowLimit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const preview = await previewWorkbook(absPath, { rowLimit });
  res.status(200).json({ status: 'success', data: preview });
});

// ─── DELETE ───────────────────────────────────────────────────────────────────
export const deleteGeneratedReport = asyncHandler(async (req, res, next) => {
  const row = await prisma.generatedReport.findUnique({ where: { id: req.params.id } });
  if (!row) return next(new AppError('Report not found.', 404));
  if (!canAccess(req, row)) return next(new AppError('Access denied.', 403));
  await removeFile(row.fileName);
  await prisma.generatedReport.delete({ where: { id: row.id } });
  await logActivity({
    req, action: 'DELETE_REPORT', entity: 'GeneratedReport',
    entityId: row.id, description: row.title,
  });
  res.status(200).json({ status: 'success', message: 'Report deleted.' });
});
