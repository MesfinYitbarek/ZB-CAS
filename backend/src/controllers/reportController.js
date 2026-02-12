import mongoose from 'mongoose';
import Report from '../models/Report.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';

// ─── helper: ObjectId from string (safe) ─────────────────────────────────────
const toObjectId = (str) => {
  if (mongoose.Types.ObjectId.isValid(str)) return new mongoose.Types.ObjectId(str);
  return null;
};

// ─── LIST ALL REPORTS ─────────────────────────────────────────────────────────
export const getReports = asyncHandler(async (req, res) => {
  const { department, competencyId, level, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (department)   filter['user.department'] = department;
  if (competencyId) filter.competencyId       = competencyId;
  if (level)        filter.level              = level;

  // Role-based filter
  if (req.user.role === 'EMPLOYEE') {
    filter['user.userId'] = req.user.id;
  } else if (req.user.role === 'SUPERVISOR') {
    const subs = await User.find({ supervisorId: req.user.id }).select('_id').lean();
    filter['user.userId'] = { $in: subs.map((s) => s._id) };
  }

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

// ─── INDIVIDUAL REPORTS ──────────────────────────────────────────────────────
export const getIndividualReports = asyncHandler(async (req, res, next) => {
  const userId = req.params.userId;
  const oid     = toObjectId(userId);

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

  // Aggregate: average score per competency within the department
  const summary = await Report.aggregate([
    { $match: { 'user.department': department } },
    {
      $group: {
        _id:           '$competencyName',
        avgScore:      { $avg: '$finalScore' },
        totalReports:  { $sum: 1 },
        levels: {
          $push: '$level',
        },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Compute level distribution per competency
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

// ─── BANK-WIDE HEATMAP ───────────────────────────────────────────────────────
// Returns: for each competency, the avg score and level distribution across all departments.
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

  // Reshape into { competency → [ { department, avgScore, count } ] }
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

// ─── EXPORT INDIVIDUAL REPORTS ───────────────────────────────────────────────
export const exportReports = asyncHandler(async (req, res, next) => {
  const userId = req.params.userId;
  const oid     = toObjectId(userId);

  // Access control
  if (req.user.role === 'EMPLOYEE' && req.user.id !== userId) {
    return next(new AppError('Access denied.', 403));
  }

  const reports = await Report.find({ 'user.userId': oid })
    .sort({ generatedAt: -1 })
    .lean();

  // Return as downloadable JSON
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="reports_${userId}.json"`);
  res.status(200).json(reports);
});