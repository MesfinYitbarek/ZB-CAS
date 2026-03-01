/**
 * reportController.js  –  HR_ADMIN Comprehensive Reporting Engine
 *
 * Every public function is an asyncHandler.  All heavy reads go through
 * MongoDB aggregation pipelines so we never pull full documents into Node.
 *
 * Filter dimensions supported:
 *   User       : department, position, gender, status, supervisorId, employeeId(s)
 *   Competency : competencyId, competencyCategory, targetGroup (of competency)
 *   Assessment : assessmentId, assessmentType, assessmentStatus, purpose
 *   Result     : level, scoreMin, scoreMax, resultStatus (PENDING/FINAL)
 *   Date       : dateFrom, dateTo  (on generatedAt / Result.createdAt)
 *   Search     : free-text across employee name, competency name
 *   Sort       : any field, asc/desc
 *
 * Performance: all aggregation stages use indexed fields first ($match early),
 * $lookup uses pipeline form with $match to avoid loading full collections,
 * and cursor-based pagination is used for large exports.
 */

import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

import Report from '../models/Report.js';
import Result from '../models/Result.js';
import User from '../models/User.js';
import Assessment from '../models/Assessment.js';
import Competency from '../models/Competency.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';

// ─── tiny helpers ─────────────────────────────────────────────────────────────
const toOid = (str) =>
  str && mongoose.Types.ObjectId.isValid(str)
    ? new mongoose.Types.ObjectId(str)
    : null;

const clampNum = (val, min, max, fallback) => {
  const n = parseFloat(val);
  if (isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─────────────────────────────────────────────────────────────────────────────
// CORE FILTER BUILDER
// Builds a MongoDB $match object from query params.
// Works against the Result collection (has all data via populate/lookup).
// Returns { resultMatch, userMatch } so callers can choose join strategy.
// ─────────────────────────────────────────────────────────────────────────────
const buildResultMatch = async (query) => {
  const {
    // User filters
    department, position, gender, userStatus, supervisorId, employeeId,
    // Competency filters
    competencyId, competencyCategory, competencyTargetGroup,
    // Assessment filters
    assessmentId, assessmentType, assessmentStatus, purpose,
    // Result filters
    level, scoreMin, scoreMax, resultStatus,
    // Date
    dateFrom, dateTo,
    // Search
    search,
  } = query;

  const match = {};

  // ── Result-level fields (directly on Result) ──────────────────────────────
  if (assessmentId) { const oid = toOid(assessmentId); if (oid) match.assessmentId = oid; }
  if (competencyId) { const oid = toOid(competencyId); if (oid) match.competencyId = oid; }
  if (level)        match.level = Array.isArray(level) ? { $in: level } : level;
  if (resultStatus) match.status = resultStatus;

  if (scoreMin !== undefined || scoreMax !== undefined) {
    match.finalScore = {};
    if (scoreMin !== undefined) match.finalScore.$gte = clampNum(scoreMin, 0, 100, 0);
    if (scoreMax !== undefined) match.finalScore.$lte = clampNum(scoreMax, 0, 100, 100);
  }

  if (dateFrom || dateTo) {
    match.createdAt = {};
    if (dateFrom) match.createdAt.$gte = new Date(dateFrom);
    if (dateTo) {
      const e = new Date(dateTo);
      e.setHours(23, 59, 59, 999);
      match.createdAt.$lte = e;
    }
  }

  // ── User filters — resolve to userId list ─────────────────────────────────
  const userFilterActive = department || position || gender || userStatus || supervisorId || search || employeeId;
  if (userFilterActive) {
    const uFilter = {};
    if (department)   uFilter.department = { $regex: department, $options: 'i' };
    if (position)     uFilter.position   = { $regex: position,   $options: 'i' };
    if (gender)       uFilter.gender     = gender;
    if (userStatus)   uFilter.status     = userStatus;
    if (supervisorId) { const oid = toOid(supervisorId); if (oid) uFilter.supervisorId = oid; }
    if (employeeId)   { const oid = toOid(employeeId);   if (oid) uFilter._id = oid; }
    if (search) {
      uFilter.$or = [
        { name:       { $regex: search, $options: 'i' } },
        { email:      { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } },
      ];
    }
    const users = await User.find(uFilter).select('_id').lean();
    const ids = users.map(u => u._id);
    if (ids.length === 0) return null; // no matching users → zero results
    match.userId = { $in: ids };
  }

  // ── Assessment filters — resolve to assessmentId list ────────────────────
  const aFilterActive = assessmentType || assessmentStatus || purpose;
  if (aFilterActive && !assessmentId) {
    const aFilter = {};
    if (assessmentType)   aFilter.type    = assessmentType;
    if (assessmentStatus) aFilter.status  = assessmentStatus;
    if (purpose)          aFilter.purpose = purpose;
    const assessments = await Assessment.find(aFilter).select('_id').lean();
    const ids = assessments.map(a => a._id);
    if (ids.length === 0) return null;
    match.assessmentId = { $in: ids };
  }

  // ── Competency filters — resolve to competencyId list ────────────────────
  const cFilterActive = competencyCategory || competencyTargetGroup;
  if (cFilterActive && !competencyId) {
    const cFilter = {};
    if (competencyCategory)    cFilter.category = competencyCategory;
    if (competencyTargetGroup) cFilter['targetGroups.targetGroup'] = competencyTargetGroup;
    const comps = await Competency.find(cFilter).select('_id').lean();
    const ids = comps.map(c => c._id);
    if (ids.length === 0) return null;
    // merge with existing if present
    if (match.competencyId && match.competencyId.$in) {
      const existing = match.competencyId.$in.map(String);
      match.competencyId = { $in: ids.filter(id => existing.includes(id.toString())) };
    } else {
      match.competencyId = { $in: ids };
    }
    if (match.competencyId.$in.length === 0) return null;
  }

  return match;
};

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE BUILDER
// Returns an aggregation pipeline that joins Result → User → Assessment → Competency
// and projects a flat, rich document ready for reporting.
// ─────────────────────────────────────────────────────────────────────────────
const buildRichPipeline = (match, { sort = { createdAt: -1 }, skip = 0, limit = 50 } = {}) => {
  const stages = [
    { $match: match },

    // Join user
    { $lookup: {
      from: 'users',
      let: { uid: '$userId' },
      pipeline: [
        { $match: { $expr: { $eq: ['$_id', '$$uid'] } } },
        { $project: { name:1, email:1, employeeId:1, department:1, position:1, gender:1, status:1, supervisorId:1, roles:1 } },
      ],
      as: '_user',
    }},
    { $unwind: { path: '$_user', preserveNullAndEmptyArrays: true } },

    // Join assessment
    { $lookup: {
      from: 'assessments',
      let: { aid: '$assessmentId' },
      pipeline: [
        { $match: { $expr: { $eq: ['$_id', '$$aid'] } } },
        { $project: { description:1, type:1, status:1, purpose:1, targetGroup:1, startDate:1, endDate:1, weight:1 } },
      ],
      as: '_assessment',
    }},
    { $unwind: { path: '$_assessment', preserveNullAndEmptyArrays: true } },

    // Join competency
    { $lookup: {
      from: 'competencies',
      let: { cid: '$competencyId' },
      pipeline: [
        { $match: { $expr: { $eq: ['$_id', '$$cid'] } } },
        { $project: { name:1, category:1, targetGroups:1 } },
      ],
      as: '_competency',
    }},
    { $unwind: { path: '$_competency', preserveNullAndEmptyArrays: true } },

    // Flat projection
    { $project: {
      // Result
      _id: 1, finalScore: 1, level: 1, status: 1, recommendation: 1, createdAt: 1,
      selfScore:       '$scoreDetails.selfScore',
      supervisorScore: '$scoreDetails.supervisorScore',
      weightSelf:      '$scoreDetails.weightUsed.selfAssessment',
      weightSup:       '$scoreDetails.weightUsed.supervisor',
      totalQuestions:  { $size: { $ifNull: ['$scoreDetails.questionDetails', []] } },
      correctAnswers:  { $size: {
        $filter: { input: { $ifNull: ['$scoreDetails.questionDetails', []] }, cond: '$$this.isCorrect' }
      }},
      // User
      userName:        '$_user.name',
      userEmail:       '$_user.email',
      userEmployeeId:  '$_user.employeeId',
      userDepartment:  '$_user.department',
      userPosition:    '$_user.position',
      userGender:      '$_user.gender',
      userStatus:      '$_user.status',
      userRoles:       '$_user.roles',
      userId:          '$_user._id',
      // Assessment
      assessmentDescription: '$_assessment.description',
      assessmentType:        '$_assessment.type',
      assessmentStatus:      '$_assessment.status',
      assessmentPurpose:     '$_assessment.purpose',
      assessmentTargetGroup: '$_assessment.targetGroup',
      assessmentStartDate:   '$_assessment.startDate',
      assessmentEndDate:     '$_assessment.endDate',
      assessmentWeightSelf:  '$_assessment.weight.selfAssessment',
      assessmentWeightSup:   '$_assessment.weight.supervisor',
      // Competency
      competencyName:     '$_competency.name',
      competencyCategory: '$_competency.category',
    }},

    { $sort: sort },
    { $skip: skip },
    { $limit: limit },
  ];
  return stages;
};

// ─────────────────────────────────────────────────────────────────────────────
// GET FILTER OPTIONS  (dropdown values for the UI)
// ─────────────────────────────────────────────────────────────────────────────
export const getAdvancedFilterOptions = asyncHandler(async (_req, res) => {
  const [
    departments, positions, genders,
    competencies, competencyCategories,
    assessments, supervisors,
  ] = await Promise.all([
    User.distinct('department').then(r => r.filter(Boolean).sort()),
    User.distinct('position').then(r => r.filter(Boolean).sort()),
    User.distinct('gender').then(r => r.filter(Boolean).sort()),
    Competency.find({}).select('_id name category targetGroups').lean(),
    Competency.distinct('category').then(r => r.filter(Boolean).sort()),
    Assessment.find({ status: { $ne: 'DRAFT' } }).select('_id description type status purpose targetGroup startDate endDate').lean(),
    User.find({ roles: 'SUPERVISOR' }).select('_id name department').lean(),
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      departments,
      positions,
      genders,
      competencies: competencies.map(c => ({ _id: c._id, name: c.name, category: c.category })),
      competencyCategories,
      assessments,
      supervisors,
      levels: ['Basic', 'Intermediate', 'Advanced', 'Expert'],
      assessmentTypes: ['SelfAssessment', 'SupervisorOnly', 'Combined'],
      assessmentStatuses: ['DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'ARCHIVED'],
      purposes: ['Career Development', 'Succession Planning', 'Performance Improvement', 'Training Needs Analysis', 'Promotion Readiness', 'Other'],
      targetGroups: ['managerial', 'non-managerial', 'common'],
      userStatuses: ['ACTIVE', 'INACTIVE'],
      resultStatuses: ['PENDING', 'FINAL'],
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET RICH RESULTS — paginated, all dimensions
// ─────────────────────────────────────────────────────────────────────────────
export const getAdvancedResults = asyncHandler(async (req, res) => {
  const { page = 1, limit = 25, sortBy = 'createdAt', sortDir = 'desc' } = req.query;

  const match = await buildResultMatch(req.query);
  if (match === null) {
    return res.status(200).json({
      status: 'success',
      data: { results: [], pagination: { total: 0, page: 1, limit: parseInt(limit), totalPages: 0 } },
    });
  }

  const lim = Math.min(parseInt(limit) || 25, 200);
  const skip = (parseInt(page) - 1) * lim;
  const sort = { [sortBy]: sortDir === 'asc' ? 1 : -1 };

  const [results, totalArr] = await Promise.all([
    Result.aggregate(buildRichPipeline(match, { sort, skip, limit: lim })),
    Result.aggregate([{ $match: match }, { $count: 'total' }]),
  ]);

  const total = totalArr[0]?.total || 0;
  res.status(200).json({
    status: 'success',
    data: {
      results,
      pagination: { total, page: parseInt(page), limit: lim, totalPages: Math.ceil(total / lim) },
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET COMPREHENSIVE STATS — all analytics in one call (parallel aggregations)
// ─────────────────────────────────────────────────────────────────────────────
export const getAdvancedStats = asyncHandler(async (req, res) => {
  const match = await buildResultMatch(req.query);
  if (match === null) {
    return res.status(200).json({ status: 'success', data: buildEmptyStats() });
  }

  const [
    overall,
    levelDist,
    departmentStats,
    competencyStats,
    assessmentTypeStats,
    purposeStats,
    genderStats,
    monthlyTrend,
    topEmployees,
    bottomEmployees,
    assessmentStats,
    targetGroupStats,
    positionStats,
    scoreDistribution,
    supervisorStats,
  ] = await Promise.all([

    // 1. Overall KPIs
    Result.aggregate([
      { $match: match },
      { $lookup: { from:'users', localField:'userId', foreignField:'_id', as:'u' }},
      { $unwind: { path:'$u', preserveNullAndEmptyArrays: true } },
      { $group: {
        _id: null,
        total:             { $sum: 1 },
        avgScore:          { $avg: '$finalScore' },
        maxScore:          { $max: '$finalScore' },
        minScore:          { $min: '$finalScore' },
        stdDev:            { $stdDevPop: '$finalScore' },
        uniqueEmployees:   { $addToSet: '$userId' },
        uniqueDepts:       { $addToSet: '$u.department' },
        uniqueCompetencies:{ $addToSet: '$competencyId' },
        uniqueAssessments: { $addToSet: '$assessmentId' },
        pending:           { $sum: { $cond: [{ $eq: ['$status','PENDING'] }, 1, 0] } },
        final:             { $sum: { $cond: [{ $eq: ['$status','FINAL'] }, 1, 0] } },
      }},
      { $project: {
        total:1, avgScore:{ $round:['$avgScore',1] }, maxScore:1, minScore:1,
        stdDev:{ $round:['$stdDev',1] }, pending:1, final:1,
        uniqueEmployees:   { $size: '$uniqueEmployees' },
        uniqueDepts:       { $size: '$uniqueDepts' },
        uniqueCompetencies:{ $size: '$uniqueCompetencies' },
        uniqueAssessments: { $size: '$uniqueAssessments' },
      }},
    ]),

    // 2. Level distribution
    Result.aggregate([
      { $match: match },
      { $group: {
        _id: '$level',
        count:    { $sum: 1 },
        avgScore: { $avg: '$finalScore' },
      }},
      { $sort: { _id: 1 } },
    ]),

    // 3. Department breakdown (top 20)
    Result.aggregate([
      { $match: match },
      { $lookup: { from:'users', localField:'userId', foreignField:'_id', as:'u' }},
      { $unwind: { path:'$u', preserveNullAndEmptyArrays: true } },
      { $group: {
        _id:      '$u.department',
        count:    { $sum: 1 },
        avgScore: { $avg: '$finalScore' },
        maxScore: { $max: '$finalScore' },
        minScore: { $min: '$finalScore' },
        basicCount:        { $sum: { $cond: [{ $eq:['$level','Basic'] }, 1, 0] } },
        intermediateCount: { $sum: { $cond: [{ $eq:['$level','Intermediate'] }, 1, 0] } },
        advancedCount:     { $sum: { $cond: [{ $eq:['$level','Advanced'] }, 1, 0] } },
        expertCount:       { $sum: { $cond: [{ $eq:['$level','Expert'] }, 1, 0] } },
        uniqueEmployees:   { $addToSet: '$userId' },
      }},
      { $project: {
        count:1, avgScore:{ $round:['$avgScore',1] }, maxScore:1, minScore:1,
        basicCount:1, intermediateCount:1, advancedCount:1, expertCount:1,
        employeeCount: { $size: '$uniqueEmployees' },
      }},
      { $sort: { avgScore: -1 } },
      { $limit: 20 },
    ]),

    // 4. Competency breakdown
    Result.aggregate([
      { $match: match },
      { $lookup: { from:'competencies', localField:'competencyId', foreignField:'_id', as:'c' }},
      { $unwind: { path:'$c', preserveNullAndEmptyArrays: true } },
      { $group: {
        _id:      '$competencyId',
        name:     { $first: '$c.name' },
        category: { $first: '$c.category' },
        count:    { $sum: 1 },
        avgScore: { $avg: '$finalScore' },
        maxScore: { $max: '$finalScore' },
        minScore: { $min: '$finalScore' },
        expertCount: { $sum: { $cond: [{ $eq:['$level','Expert'] }, 1, 0] } },
        basicCount:  { $sum: { $cond: [{ $eq:['$level','Basic'] }, 1, 0] } },
      }},
      { $project: {
        name:1, category:1, count:1,
        avgScore:{ $round:['$avgScore',1] }, maxScore:1, minScore:1,
        expertCount:1, basicCount:1,
      }},
      { $sort: { avgScore: -1 } },
    ]),

    // 5. Assessment type breakdown
    Result.aggregate([
      { $match: match },
      { $lookup: { from:'assessments', localField:'assessmentId', foreignField:'_id', as:'a' }},
      { $unwind: { path:'$a', preserveNullAndEmptyArrays: true } },
      { $group: {
        _id:      '$a.type',
        count:    { $sum: 1 },
        avgScore: { $avg: '$finalScore' },
      }},
      { $sort: { count: -1 } },
    ]),

    // 6. Purpose breakdown
    Result.aggregate([
      { $match: match },
      { $lookup: { from:'assessments', localField:'assessmentId', foreignField:'_id', as:'a' }},
      { $unwind: { path:'$a', preserveNullAndEmptyArrays: true } },
      { $group: {
        _id:      '$a.purpose',
        count:    { $sum: 1 },
        avgScore: { $avg: '$finalScore' },
      }},
      { $sort: { count: -1 } },
    ]),

    // 7. Gender breakdown
    Result.aggregate([
      { $match: match },
      { $lookup: { from:'users', localField:'userId', foreignField:'_id', as:'u' }},
      { $unwind: { path:'$u', preserveNullAndEmptyArrays: true } },
      { $group: {
        _id:      '$u.gender',
        count:    { $sum: 1 },
        avgScore: { $avg: '$finalScore' },
        expertCount: { $sum: { $cond: [{ $eq:['$level','Expert'] }, 1, 0] } },
        basicCount:  { $sum: { $cond: [{ $eq:['$level','Basic'] }, 1, 0] } },
      }},
    ]),

    // 8. Monthly trend (12 months)
    Result.aggregate([
      { $match: { ...match, createdAt: { $gte: new Date(Date.now() - 365*24*60*60*1000) } } },
      { $group: {
        _id:      { year: { $year:'$createdAt' }, month: { $month:'$createdAt' } },
        count:    { $sum: 1 },
        avgScore: { $avg: '$finalScore' },
        expertCount:       { $sum: { $cond: [{ $eq:['$level','Expert'] }, 1, 0] } },
        basicCount:        { $sum: { $cond: [{ $eq:['$level','Basic'] }, 1, 0] } },
        uniqueEmployees:   { $addToSet: '$userId' },
      }},
      { $project: {
        count:1, avgScore:{ $round:['$avgScore',1] },
        expertCount:1, basicCount:1,
        uniqueEmployees: { $size: '$uniqueEmployees' },
      }},
      { $sort: { '_id.year':1, '_id.month':1 } },
    ]),

    // 9. Top 10 performers
    Result.aggregate([
      { $match: match },
      { $lookup: { from:'users', localField:'userId', foreignField:'_id', as:'u' }},
      { $unwind: { path:'$u', preserveNullAndEmptyArrays: true } },
      { $group: {
        _id:        '$userId',
        name:       { $first: '$u.name' },
        department: { $first: '$u.department' },
        position:   { $first: '$u.position' },
        employeeId: { $first: '$u.employeeId' },
        avgScore:   { $avg: '$finalScore' },
        maxScore:   { $max: '$finalScore' },
        count:      { $sum: 1 },
        expertCount:{ $sum: { $cond: [{ $eq:['$level','Expert'] }, 1, 0] } },
      }},
      { $project: { name:1, department:1, position:1, employeeId:1,
        avgScore:{ $round:['$avgScore',1] }, maxScore:1, count:1, expertCount:1 }},
      { $sort: { avgScore: -1 } },
      { $limit: 10 },
    ]),

    // 10. Bottom 10 (needs support)
    Result.aggregate([
      { $match: match },
      { $lookup: { from:'users', localField:'userId', foreignField:'_id', as:'u' }},
      { $unwind: { path:'$u', preserveNullAndEmptyArrays: true } },
      { $group: {
        _id:        '$userId',
        name:       { $first: '$u.name' },
        department: { $first: '$u.department' },
        position:   { $first: '$u.position' },
        employeeId: { $first: '$u.employeeId' },
        avgScore:   { $avg: '$finalScore' },
        minScore:   { $min: '$finalScore' },
        count:      { $sum: 1 },
        basicCount: { $sum: { $cond: [{ $eq:['$level','Basic'] }, 1, 0] } },
      }},
      { $project: { name:1, department:1, position:1, employeeId:1,
        avgScore:{ $round:['$avgScore',1] }, minScore:1, count:1, basicCount:1 }},
      { $sort: { avgScore: 1 } },
      { $limit: 10 },
    ]),

    // 11. Assessment-level stats
    Result.aggregate([
      { $match: match },
      { $lookup: { from:'assessments', localField:'assessmentId', foreignField:'_id', as:'a' }},
      { $unwind: { path:'$a', preserveNullAndEmptyArrays: true } },
      { $group: {
        _id:         '$assessmentId',
        description: { $first: '$a.description' },
        type:        { $first: '$a.type' },
        purpose:     { $first: '$a.purpose' },
        status:      { $first: '$a.status' },
        count:       { $sum: 1 },
        avgScore:    { $avg: '$finalScore' },
        maxScore:    { $max: '$finalScore' },
        minScore:    { $min: '$finalScore' },
        expertCount: { $sum: { $cond: [{ $eq:['$level','Expert'] }, 1, 0] } },
        basicCount:  { $sum: { $cond: [{ $eq:['$level','Basic'] }, 1, 0] } },
        passRate: { $avg: {
          $cond: [{ $gte:['$finalScore', 60] }, 1, 0]
        }},
      }},
      { $project: {
        description:1, type:1, purpose:1, status:1, count:1,
        avgScore:{ $round:['$avgScore',1] }, maxScore:1, minScore:1,
        expertCount:1, basicCount:1,
        passRate: { $round: [{ $multiply:['$passRate', 100] }, 1] },
      }},
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]),

    // 12. Target group stats
    Result.aggregate([
      { $match: match },
      { $lookup: { from:'assessments', localField:'assessmentId', foreignField:'_id', as:'a' }},
      { $unwind: { path:'$a', preserveNullAndEmptyArrays: true } },
      { $group: {
        _id:      '$a.targetGroup',
        count:    { $sum: 1 },
        avgScore: { $avg: '$finalScore' },
        expertCount: { $sum: { $cond: [{ $eq:['$level','Expert'] }, 1, 0] } },
        basicCount:  { $sum: { $cond: [{ $eq:['$level','Basic'] }, 1, 0] } },
      }},
      { $project: { count:1, avgScore:{ $round:['$avgScore',1] }, expertCount:1, basicCount:1 }},
    ]),

    // 13. Position stats (top 15)
    Result.aggregate([
      { $match: match },
      { $lookup: { from:'users', localField:'userId', foreignField:'_id', as:'u' }},
      { $unwind: { path:'$u', preserveNullAndEmptyArrays: true } },
      { $group: {
        _id:      '$u.position',
        count:    { $sum: 1 },
        avgScore: { $avg: '$finalScore' },
        uniqueEmployees: { $addToSet: '$userId' },
      }},
      { $project: {
        count:1, avgScore:{ $round:['$avgScore',1] },
        employeeCount: { $size: '$uniqueEmployees' },
      }},
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]),

    // 14. Score distribution buckets
    Result.aggregate([
      { $match: match },
      { $bucket: {
        groupBy: '$finalScore',
        boundaries: [0, 20, 40, 60, 80, 100],
        default: '100',
        output: { count: { $sum: 1 }, avgScore: { $avg: '$finalScore' } },
      }},
    ]),

    // 15. Supervisor-level stats (top 10 by team avg)
    Result.aggregate([
      { $match: match },
      { $lookup: { from:'users', localField:'userId', foreignField:'_id', as:'u' }},
      { $unwind: { path:'$u', preserveNullAndEmptyArrays: true } },
      { $match: { 'u.supervisorId': { $ne: null } } },
      { $group: {
        _id:         '$u.supervisorId',
        teamSize:    { $addToSet: '$userId' },
        count:       { $sum: 1 },
        avgScore:    { $avg: '$finalScore' },
        expertCount: { $sum: { $cond: [{ $eq:['$level','Expert'] }, 1, 0] } },
      }},
      { $lookup: { from:'users', localField:'_id', foreignField:'_id', as:'sup' }},
      { $unwind: { path:'$sup', preserveNullAndEmptyArrays: true } },
      { $project: {
        supervisorName: '$sup.name',
        supervisorDept: '$sup.department',
        teamSize: { $size: '$teamSize' },
        count:1, avgScore:{ $round:['$avgScore',1] }, expertCount:1,
      }},
      { $sort: { avgScore: -1 } },
      { $limit: 10 },
    ]),
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      overall: overall[0] || buildEmptyStats().overall,
      levelDistribution:   levelDist,
      departmentStats,
      competencyStats,
      assessmentTypeStats,
      purposeStats,
      genderStats,
      monthlyTrend: monthlyTrend.map(t => ({
        ...t,
        label: `${MONTH_NAMES[t._id.month - 1]} ${t._id.year}`,
      })),
      topEmployees,
      bottomEmployees,
      assessmentStats,
      targetGroupStats,
      positionStats,
      scoreDistribution: scoreDistribution.map(b => ({
        range: b._id === 100 ? '100' : `${b._id}–${b._id + 19}`,
        count: b.count,
        avgScore: parseFloat((b.avgScore || 0).toFixed(1)),
      })),
      supervisorStats,
    },
  });
});

const buildEmptyStats = () => ({
  overall: { total:0, avgScore:0, maxScore:0, minScore:0, stdDev:0, pending:0, final:0,
    uniqueEmployees:0, uniqueDepts:0, uniqueCompetencies:0, uniqueAssessments:0 },
  levelDistribution: [], departmentStats: [], competencyStats: [],
  assessmentTypeStats: [], purposeStats: [], genderStats: [],
  monthlyTrend: [], topEmployees: [], bottomEmployees: [],
  assessmentStats: [], targetGroupStats: [], positionStats: [],
  scoreDistribution: [], supervisorStats: [],
});

// ─────────────────────────────────────────────────────────────────────────────
// COMPETENCY × DEPARTMENT HEATMAP
// ─────────────────────────────────────────────────────────────────────────────
export const getHeatmap = asyncHandler(async (req, res) => {
  const match = await buildResultMatch(req.query);
  if (match === null) return res.status(200).json({ status:'success', data:{ heatmap:{} } });

  const rows = await Result.aggregate([
    { $match: match },
    { $lookup: { from:'users', localField:'userId', foreignField:'_id', as:'u' }},
    { $unwind: { path:'$u', preserveNullAndEmptyArrays: true } },
    { $lookup: { from:'competencies', localField:'competencyId', foreignField:'_id', as:'c' }},
    { $unwind: { path:'$c', preserveNullAndEmptyArrays: true } },
    { $group: {
      _id: { comp: '$c.name', dept: '$u.department' },
      avgScore: { $avg: '$finalScore' },
      count: { $sum: 1 },
    }},
    { $sort: { '_id.comp':1, '_id.dept':1 } },
  ]);

  const map = {};
  rows.forEach(r => {
    const comp = r._id.comp || 'Unknown';
    const dept = r._id.dept || 'Unknown';
    if (!map[comp]) map[comp] = [];
    map[comp].push({ department: dept, avgScore: parseFloat(r.avgScore.toFixed(1)), count: r.count });
  });

  res.status(200).json({ status:'success', data:{ heatmap: map } });
});

// ─────────────────────────────────────────────────────────────────────────────
// INDIVIDUAL EMPLOYEE DEEP DIVE
// ─────────────────────────────────────────────────────────────────────────────
export const getEmployeeDeepDive = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const oid = toOid(userId);
  if (!oid) return next(new AppError('Invalid user ID.', 400));

  const [employee, results, competencyProgress, assessmentHistory] = await Promise.all([
    User.findById(oid).select('-passwordHash -refreshToken -passwordResetToken -passwordResetExpires').lean(),
    Result.find({ userId: oid })
      .populate('assessmentId', 'description type purpose targetGroup startDate endDate status')
      .populate('competencyId', 'name category')
      .sort({ createdAt: -1 })
      .lean(),
    // Competency-level aggregation for this employee
    Result.aggregate([
      { $match: { userId: oid } },
      { $lookup: { from:'competencies', localField:'competencyId', foreignField:'_id', as:'c' }},
      { $unwind: { path:'$c', preserveNullAndEmptyArrays: true } },
      { $group: {
        _id:          '$competencyId',
        name:         { $first: '$c.name' },
        category:     { $first: '$c.category' },
        attempts:     { $sum: 1 },
        latestScore:  { $last: '$finalScore' },
        bestScore:    { $max: '$finalScore' },
        avgScore:     { $avg: '$finalScore' },
        latestLevel:  { $last: '$level' },
        latestDate:   { $max: '$createdAt' },
      }},
      { $project: {
        name:1, category:1, attempts:1,
        latestScore:{ $round:['$latestScore',1] },
        bestScore:{ $round:['$bestScore',1] },
        avgScore:{ $round:['$avgScore',1] },
        latestLevel:1, latestDate:1,
      }},
      { $sort: { latestDate: -1 } },
    ]),
    // Timeline
    Result.aggregate([
      { $match: { userId: oid } },
      { $group: {
        _id: { year: { $year:'$createdAt' }, month: { $month:'$createdAt' } },
        count: { $sum: 1 },
        avgScore: { $avg: '$finalScore' },
      }},
      { $sort: { '_id.year':1, '_id.month':1 } },
      { $project: {
        label: { $concat: [
          { $arrayElemAt: [MONTH_NAMES, { $subtract: ['$_id.month',1] }] },
          ' ',
          { $toString: '$_id.year' }
        ]},
        count:1, avgScore:{ $round:['$avgScore',1] },
      }},
    ]),
  ]);

  if (!employee) return next(new AppError('Employee not found.', 404));

  res.status(200).json({
    status: 'success',
    data: { employee, results, competencyProgress, assessmentHistory },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT — EXCEL (rich, multi-sheet)
// ─────────────────────────────────────────────────────────────────────────────
export const exportAdvancedExcel = asyncHandler(async (req, res, next) => {
  const match = await buildResultMatch(req.query);
  if (match === null) return next(new AppError('No data matching the selected filters.', 404));

  // Cursor-based fetch (up to 5000 rows for Excel)
  const results = await Result.aggregate(buildRichPipeline(match, { sort: { createdAt: -1 }, skip: 0, limit: 5000 }));
  if (!results.length) return next(new AppError('No data matching the selected filters.', 404));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'HR Competency System';
  wb.created = new Date();

  // ── Sheet 1: Raw Data ─────────────────────────────────────────────────────
  const raw = wb.addWorksheet('Results Data');
  const RED = 'FFC8102E';
  const headerStyle = { font: { bold:true, color:{ argb:'FFFFFFFF' }, size:10 }, fill: { type:'pattern', pattern:'solid', fgColor:{ argb:RED } }, alignment: { vertical:'middle', wrapText:true } };

  const cols = [
    { header:'Employee Name',    key:'userName',           width:22 },
    { header:'Employee ID',      key:'userEmployeeId',     width:14 },
    { header:'Email',            key:'userEmail',          width:26 },
    { header:'Department',       key:'userDepartment',     width:20 },
    { header:'Position',         key:'userPosition',       width:20 },
    { header:'Gender',           key:'userGender',         width:10 },
    { header:'User Status',      key:'userStatus',         width:12 },
    { header:'Competency',       key:'competencyName',     width:28 },
    { header:'Competency Cat.',  key:'competencyCategory', width:24 },
    { header:'Assessment',       key:'assessmentDescription', width:30 },
    { header:'Assess. Type',     key:'assessmentType',     width:16 },
    { header:'Purpose',          key:'assessmentPurpose',  width:22 },
    { header:'Target Group',     key:'assessmentTargetGroup', width:16 },
    { header:'Final Score (%)',  key:'finalScore',         width:14 },
    { header:'Self Score (%)',   key:'selfScore',          width:13 },
    { header:'Supervisor Score (%)', key:'supervisorScore',width:18 },
    { header:'Level',            key:'level',              width:14 },
    { header:'Result Status',    key:'status',             width:14 },
    { header:'Total Questions',  key:'totalQuestions',     width:15 },
    { header:'Correct Answers',  key:'correctAnswers',     width:15 },
    { header:'Recommendation',   key:'recommendation',     width:40 },
    { header:'Date',             key:'createdAt',          width:14 },
  ];
  raw.columns = cols;
  const hRow = raw.getRow(1);
  hRow.eachCell((cell, i) => {
    if (cols[i-1]) {
      cell.value = cols[i-1].header;
      Object.assign(cell, headerStyle);
    }
  });
  raw.autoFilter = { from:'A1', to:`${String.fromCharCode(64+cols.length)}1` };

  results.forEach((r, i) => {
    const row = raw.addRow({
      ...r,
      finalScore:      r.finalScore ?? '',
      selfScore:       r.selfScore ?? '',
      supervisorScore: r.supervisorScore ?? '',
      createdAt:       r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '',
    });
    if (i % 2 === 1) row.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFF9F9F9' } };
    // Color-code level
    const levelCell = row.getCell('level');
    const lColors = { Expert:'FF16A34A', Advanced:'FF2563EB', Intermediate:'FFEA580C', Basic:'FFF59E0B' };
    if (lColors[r.level]) levelCell.font = { bold:true, color:{ argb: lColors[r.level] } };
  });
  raw.getRow(1).height = 30;

  // ── Sheet 2: Summary by Department ───────────────────────────────────────
  const deptSheet = wb.addWorksheet('By Department');
  deptSheet.columns = [
    { header:'Department', key:'dept', width:24 },
    { header:'Total Results', key:'count', width:14 },
    { header:'Employees', key:'employeeCount', width:12 },
    { header:'Avg Score (%)', key:'avgScore', width:14 },
    { header:'Max Score', key:'maxScore', width:12 },
    { header:'Min Score', key:'minScore', width:12 },
    { header:'Basic', key:'basic', width:10 },
    { header:'Intermediate', key:'intermediate', width:14 },
    { header:'Advanced', key:'advanced', width:12 },
    { header:'Expert', key:'expert', width:10 },
  ];
  deptSheet.getRow(1).eachCell(cell => Object.assign(cell, headerStyle));

  // Aggregate department data from results
  const deptMap = {};
  results.forEach(r => {
    const d = r.userDepartment || 'Unknown';
    if (!deptMap[d]) deptMap[d] = { count:0, employees:new Set(), scores:[], basic:0, intermediate:0, advanced:0, expert:0, maxScore:-Infinity, minScore:Infinity };
    const dm = deptMap[d];
    dm.count++; dm.employees.add(r.userId?.toString()); dm.scores.push(r.finalScore || 0);
    if (r.userDepartment) dm.maxScore = Math.max(dm.maxScore, r.finalScore);
    if (r.userDepartment) dm.minScore = Math.min(dm.minScore, r.finalScore);
    if (r.level === 'Basic') dm.basic++;
    if (r.level === 'Intermediate') dm.intermediate++;
    if (r.level === 'Advanced') dm.advanced++;
    if (r.level === 'Expert') dm.expert++;
  });
  Object.entries(deptMap).sort((a,b) => {
    const aAvg = a[1].scores.reduce((s,v)=>s+v,0)/a[1].scores.length;
    const bAvg = b[1].scores.reduce((s,v)=>s+v,0)/b[1].scores.length;
    return bAvg - aAvg;
  }).forEach(([dept, d]) => {
    const avg = d.scores.reduce((s,v)=>s+v,0)/d.scores.length;
    deptSheet.addRow({ dept, count: d.count, employeeCount: d.employees.size, avgScore: parseFloat(avg.toFixed(1)), maxScore: d.maxScore === -Infinity ? '' : d.maxScore, minScore: d.minScore === Infinity ? '' : d.minScore, basic: d.basic, intermediate: d.intermediate, advanced: d.advanced, expert: d.expert });
  });

  // ── Sheet 3: Summary by Competency ───────────────────────────────────────
  const compSheet = wb.addWorksheet('By Competency');
  compSheet.columns = [
    { header:'Competency', key:'name', width:32 },
    { header:'Category', key:'category', width:24 },
    { header:'Total', key:'count', width:10 },
    { header:'Avg Score (%)', key:'avgScore', width:14 },
    { header:'Max', key:'maxScore', width:10 },
    { header:'Min', key:'minScore', width:10 },
    { header:'Expert #', key:'expertCount', width:10 },
    { header:'Basic #', key:'basicCount', width:10 },
  ];
  compSheet.getRow(1).eachCell(cell => Object.assign(cell, headerStyle));
  const compMap = {};
  results.forEach(r => {
    const k = r.competencyName || 'Unknown';
    if (!compMap[k]) compMap[k] = { category: r.competencyCategory||'', count:0, scores:[], expert:0, basic:0, max:-Infinity, min:Infinity };
    const cm = compMap[k];
    cm.count++; cm.scores.push(r.finalScore||0);
    cm.max = Math.max(cm.max, r.finalScore||0); cm.min = Math.min(cm.min, r.finalScore||Infinity);
    if (r.level==='Expert') cm.expert++; if (r.level==='Basic') cm.basic++;
  });
  Object.entries(compMap).sort((a,b) => {
    const aA = a[1].scores.reduce((s,v)=>s+v,0)/a[1].scores.length;
    const bA = b[1].scores.reduce((s,v)=>s+v,0)/b[1].scores.length;
    return bA - aA;
  }).forEach(([name, c]) => {
    const avg = c.scores.reduce((s,v)=>s+v,0)/c.scores.length;
    compSheet.addRow({ name, category:c.category, count:c.count, avgScore:parseFloat(avg.toFixed(1)), maxScore: c.max, minScore: c.min, expertCount:c.expert, basicCount:c.basic });
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="hr_report_${new Date().toISOString().split('T')[0]}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT — PDF (summary report)
// ─────────────────────────────────────────────────────────────────────────────
export const exportAdvancedPDF = asyncHandler(async (req, res, next) => {
  const match = await buildResultMatch(req.query);
  if (match === null) return next(new AppError('No data matching the selected filters.', 404));

  const results = await Result.aggregate(buildRichPipeline(match, { sort:{ createdAt:-1 }, skip:0, limit:2000 }));
  if (!results.length) return next(new AppError('No data matching the selected filters.', 404));

  const doc = new PDFDocument({ margin:45, size:'A4', bufferPages:true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="hr_report_${new Date().toISOString().split('T')[0]}.pdf"`);
  doc.pipe(res);

  const W = 505; // usable width
  const avg = results.reduce((s,r) => s + (r.finalScore||0), 0) / results.length;
  const levelCounts = { Basic:0, Intermediate:0, Advanced:0, Expert:0 };
  results.forEach(r => { if (levelCounts[r.level] !== undefined) levelCounts[r.level]++; });

  // Title
  doc.rect(0, 0, 595, 80).fill('#C8102E');
  doc.fontSize(20).font('Helvetica-Bold').fillColor('#FFFFFF').text('HR Competency Assessment Report', 45, 20, { width: W });
  doc.fontSize(10).font('Helvetica').fillColor('#FFCCCC').text(`Generated: ${new Date().toLocaleString()}  ·  ${results.length} records`, 45, 50, { width: W });

  doc.fillColor('#000').moveDown(4.5);

  // Summary KPIs box
  doc.rect(45, doc.y, W, 55).fillAndStroke('#F9FAFB', '#E5E7EB');
  const kpiY = doc.y + 12;
  const kpiCols = [
    ['Total Records', results.length],
    ['Avg Score', `${avg.toFixed(1)}%`],
    ['Expert', levelCounts.Expert],
    ['Advanced', levelCounts.Advanced],
    ['Need Support', levelCounts.Basic],
  ];
  kpiCols.forEach((kpi, i) => {
    const x = 55 + i * 98;
    doc.fontSize(8).font('Helvetica').fillColor('#6B7280').text(kpi[0], x, kpiY, { width:90 });
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#111827').text(String(kpi[1]), x, kpiY + 14, { width:90 });
  });
  doc.moveDown(4.5);

  // Table
  const cols = ['Employee', 'Dept.', 'Competency', 'Type', 'Score', 'Level', 'Date'];
  const colW = [110, 70, 110, 65, 45, 65, 55];
  const drawTableHeader = () => {
    const y = doc.y;
    doc.rect(45, y - 3, W, 18).fill('#1F2937');
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#FFFFFF');
    let x = 50;
    cols.forEach((h, i) => { doc.text(h, x, y + 2, { width: colW[i] }); x += colW[i]; });
    doc.moveDown(0.9);
  };
  drawTableHeader();

  results.forEach((r, idx) => {
    if (doc.y > 760) { doc.addPage(); drawTableHeader(); }
    const y = doc.y;
    const bg = idx % 2 === 0 ? '#FFFFFF' : '#F9FAFB';
    doc.rect(45, y - 2, W, 16).fill(bg);
    doc.fontSize(7).font('Helvetica').fillColor('#374151');
    let x = 50;
    const vals = [
      (r.userName||'—').substring(0,16),
      (r.userDepartment||'—').substring(0,10),
      (r.competencyName||'—').substring(0,16),
      (r.assessmentType||'—'),
      `${(r.finalScore||0).toFixed(1)}%`,
      r.level||'—',
      r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—',
    ];
    vals.forEach((v, i) => { doc.text(v, x, y + 2, { width: colW[i], lineBreak:false }); x += colW[i]; });
    doc.moveDown(0.7);
  });

  // Footer on all pages
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(7).font('Helvetica').fillColor('#9CA3AF')
      .text(`Page ${i - range.start + 1} of ${range.count}  ·  HR Competency Assessment System`, 45, 820, { width: W, align:'center' });
  }

  doc.end();
});

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE SELECTOR (for HR admin dropdowns)
// ─────────────────────────────────────────────────────────────────────────────
export const getEmployeeList = asyncHandler(async (req, res) => {
  const { search, department, limit = 100 } = req.query;
  const filter = {};
  if (department) filter.department = department;
  if (search) filter.$or = [
    { name: { $regex: search, $options:'i' } },
    { email: { $regex: search, $options:'i' } },
    { employeeId: { $regex: search, $options:'i' } },
  ];
  const employees = await User.find(filter)
    .select('_id name email employeeId department position gender status')
    .sort({ name: 1 })
    .limit(parseInt(limit))
    .lean();
  res.status(200).json({ status:'success', data:{ employees } });
});

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY — keep old endpoints working
// ─────────────────────────────────────────────────────────────────────────────
export { getHeatmap as getHeatmapLegacy };
