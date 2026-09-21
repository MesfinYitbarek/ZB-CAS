import prisma from '../config/prisma.js';
import { assignLevel } from '../utils/scoring.js';

/**
 * Live reporting analytics (Tier 1).
 * All metrics are computed on-request from the live Result table, scoped to
 * assessments whose lifecycle status is COMPLETED. No snapshot/report tables
 * are involved — the frontend "high level" views always reflect current data.
 */

const ZERO_STATS = {
  overall: {
    total: 0, avgScore: 0, maxScore: 0, minScore: 0,
    uniqueEmployees: 0, uniqueDepts: 0, uniqueAssessments: 0,
  },
  levelDistribution: [],
  departmentBreakdown: [],
  competencyBreakdown: [],
  monthlyTrend: [],
  topPerformers: [],
  bottomPerformers: [],
  assessmentBreakdown: [],
  genderBreakdown: [],
  positionBreakdown: [],
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const RESULT_INCLUDE = {
  user: { select: { id: true, name: true, email: true, employeeId: true, department: true, position: true, gender: true } },
  competency: { select: { id: true, name: true, category: true } },
  assessment: { select: { id: true, description: true, type: true, purpose: true, targetGroup: true, endDate: true } },
};

const getScopedUserIds = async (user) => {
  if (!user) return null;
  if (user.role === 'EMPLOYEE') return [user.id];
  if (user.role === 'SUPERVISOR') {
    const subs = await prisma.user.findMany({ where: { supervisorId: user.id }, select: { id: true } });
    return subs.map(s => s.id);
  }
  return null; // HR_ADMIN — no scope
};

const emptyOr = (cond) => ({ in: cond.length ? cond : [] });

/**
 * Build a Prisma ResultWhereInput from the report-filter query params.
 * Always live-scoped: only FINAL results of COMPLETED assessments.
 */
export const buildResultFilter = async (query = {}, user = null, userOverride = {}) => {
  const {
    employeeId, department, departmentSearch, position, positionSearch,
    gender, employeeIdCode,
    assessmentId, assessmentType, purpose, targetGroup,
    assessmentStartFrom, assessmentStartTo, assessmentEndFrom, assessmentEndTo,
    competencyId, competencyName, competencyCategory, competencyLevel,
    selfScoreMin, selfScoreMax, supervisorScoreMin, supervisorScoreMax,
    dateFrom, dateTo,
  } = query;

  const where = { status: 'FINAL', assessment: { status: 'COMPLETED' } };
  const assessmentWhere = where.assessment;

  if (assessmentId) where.assessmentId = assessmentId;
  if (assessmentType) assessmentWhere.type = assessmentType;
  if (purpose) assessmentWhere.purpose = purpose;
  if (targetGroup) assessmentWhere.targetGroup = targetGroup;

  const startRange = {};
  if (assessmentStartFrom) startRange.gte = new Date(assessmentStartFrom);
  if (assessmentStartTo) startRange.lte = new Date(assessmentStartTo);
  if (Object.keys(startRange).length) assessmentWhere.startDate = startRange;

  const endRange = {};
  if (assessmentEndFrom) endRange.gte = new Date(assessmentEndFrom);
  if (assessmentEndTo) endRange.lte = new Date(assessmentEndTo);
  if (Object.keys(endRange).length) assessmentWhere.endDate = endRange;

  const genRange = {};
  if (dateFrom) genRange.gte = new Date(dateFrom);
  if (dateTo) {
    const gen = new Date(dateTo);
    gen.setHours(23, 59, 59, 999);
    genRange.lte = gen;
  }
  if (Object.keys(genRange).length) where.createdAt = genRange;

  const userWhere = { ...userOverride };
  if (department) userWhere.department = department;
  else if (departmentSearch) userWhere.department = { contains: departmentSearch, mode: 'insensitive' };
  if (position) userWhere.position = position;
  else if (positionSearch) userWhere.position = { contains: positionSearch, mode: 'insensitive' };
  if (gender) userWhere.gender = gender;
  if (employeeIdCode) userWhere.employeeId = { contains: employeeIdCode, mode: 'insensitive' };

  if (employeeId) {
    // Enforce role-based access: EMPLOYEE → self only, SUPERVISOR → direct reports only, HR_ADMIN → all
    if (user.role === 'EMPLOYEE') {
      where.userId = user.id; // ignore employeeId param — employees can only see their own
    } else if (user.role === 'SUPERVISOR') {
      const target = await prisma.user.findUnique({
        where: { id: employeeId },
        select: { id: true, supervisorId: true },
      });
      where.userId = (target && target.supervisorId === user.id) ? employeeId : '__no_access__';
    } else {
      where.userId = employeeId;
    }
  } else {
    const scopedIds = await getScopedUserIds(user);
    if (scopedIds) userWhere.id = emptyOr(scopedIds);
  }

  if (Object.keys(userWhere).length) where.user = userWhere;

  if (competencyId) where.competencyId = competencyId;
  if (competencyLevel) where.level = competencyLevel;

  const competencyWhere = {};
  if (competencyName) competencyWhere.name = { contains: competencyName, mode: 'insensitive' };
  if (competencyCategory) competencyWhere.category = competencyCategory;
  if (Object.keys(competencyWhere).length) where.competency = competencyWhere;

  const scoreDetailConds = [];
  if (selfScoreMin !== undefined || selfScoreMax !== undefined) {
    const cond = { path: ['selfScore'] };
    if (selfScoreMin !== undefined) cond.gte = Number(selfScoreMin);
    if (selfScoreMax !== undefined) cond.lte = Number(selfScoreMax);
    scoreDetailConds.push({ scoreDetails: cond });
  }
  if (supervisorScoreMin !== undefined || supervisorScoreMax !== undefined) {
    const cond = { path: ['supervisorScore'] };
    if (supervisorScoreMin !== undefined) cond.gte = Number(supervisorScoreMin);
    if (supervisorScoreMax !== undefined) cond.lte = Number(supervisorScoreMax);
    scoreDetailConds.push({ scoreDetails: cond });
  }
  if (scoreDetailConds.length === 1) {
    where.scoreDetails = scoreDetailConds[0].scoreDetails;
  } else if (scoreDetailConds.length === 2) {
    where.AND = scoreDetailConds;
  }

  return where;
};

export const fetchLiveResults = (where) =>
  prisma.result.findMany({ where, include: RESULT_INCLUDE, orderBy: { updatedAt: 'desc' } });

const round1 = (n) => parseFloat(n.toFixed(1));
const round2 = (n) => parseFloat(n.toFixed(2));

/**
 * Shared breakdown computation from pre-grouped overallRows. Used by both the
 * pure `computeLiveStats` (called by tests) and the SQL-aggregated path.
 */
const _computeBreakdowns = (overallRows) => {
  const scores = overallRows.map(o => o.overallScore);

  const overall = {
    total: overallRows.length,
    avgScore: round1(scores.reduce((a, b) => a + b, 0) / scores.length),
    maxScore: Math.max(...scores),
    minScore: Math.min(...scores),
    uniqueEmployees: new Set(overallRows.map(o => o.userId)).size,
    uniqueDepts: new Set(overallRows.map(o => o.user?.department).filter(Boolean)).size,
    uniqueAssessments: new Set(overallRows.map(o => o.assessmentId)).size,
  };

  // Level distribution (by overall level)
  const levelMap = {};
  for (const o of overallRows) {
    if (!levelMap[o.overallLevel]) levelMap[o.overallLevel] = { _id: o.overallLevel, count: 0, totalScore: 0 };
    levelMap[o.overallLevel].count++;
    levelMap[o.overallLevel].totalScore += o.overallScore;
  }
  const levelDistribution = Object.values(levelMap)
    .map(l => ({ _id: l._id, count: l.count, avgScore: round1(l.totalScore / l.count) }))
    .sort((a, b) => b.avgScore - a.avgScore);

  // Department breakdown
  const deptMap = {};
  for (const o of overallRows) {
    const d = o.user?.department || 'Unspecified';
    if (!deptMap[d]) deptMap[d] = { count: 0, totalScore: 0, maxScore: -Infinity, minScore: Infinity, emps: new Set() };
    deptMap[d].count++;
    deptMap[d].totalScore += o.overallScore;
    deptMap[d].maxScore = Math.max(deptMap[d].maxScore, o.overallScore);
    deptMap[d].minScore = Math.min(deptMap[d].minScore, o.overallScore);
    deptMap[d].emps.add(o.userId);
  }
  const departmentBreakdown = Object.entries(deptMap)
    .map(([dept, d]) => ({
      _id: dept,
      count: d.count,
      avgScore: round1(d.totalScore / d.count),
      maxScore: d.maxScore,
      minScore: d.minScore,
      employeeCount: d.emps.size,
    }))
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 12);

  // Competency breakdown (per competency result row)
  const compMap = {};
  for (const o of overallRows) {
    for (const r of o.results) {
      const name = r.competency?.name || 'Unknown';
      if (!compMap[name]) compMap[name] = { competencyId: r.competency?.id || null, category: r.competency?.category || '', scores: [], expertCount: 0, basicCount: 0 };
      compMap[name].scores.push(Number(r.finalScore) || 0);
      if (r.level === 'Expert') compMap[name].expertCount++;
      if (r.level === 'Basic') compMap[name].basicCount++;
    }
  }
  const competencyBreakdown = Object.entries(compMap)
    .map(([name, c]) => ({
      _id: name,
      competencyId: c.competencyId,
      category: c.category,
      count: c.scores.length,
      avgScore: round1(c.scores.reduce((a, b) => a + b, 0) / c.scores.length),
      maxScore: Math.max(...c.scores),
      minScore: Math.min(...c.scores),
      expertCount: c.expertCount,
      basicCount: c.basicCount,
    }))
    .sort((a, b) => b.avgScore - a.avgScore);

  // Monthly trend (last 12 months, bucketed by assessment end date)
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const recentRows = overallRows.filter(o => o.assessment?.endDate && new Date(o.assessment.endDate) >= oneYearAgo);
  const trendMap = {};
  for (const o of recentRows) {
    const d = new Date(o.assessment.endDate);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!trendMap[key]) trendMap[key] = { year: d.getFullYear(), month: d.getMonth() + 1, count: 0, totalScore: 0 };
    trendMap[key].count++;
    trendMap[key].totalScore += o.overallScore;
  }
  const monthlyTrend = Object.values(trendMap)
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .map(t => ({ month: `${MONTHS[t.month - 1]} ${t.year}`, count: t.count, avgScore: round1(t.totalScore / t.count) }));

  // Top / bottom performers (per employee across their overall rows)
  const empPerfMap = {};
  for (const o of overallRows) {
    const uid = o.userId;
    if (!empPerfMap[uid]) empPerfMap[uid] = { name: o.user?.name, department: o.user?.department, position: o.user?.position, scores: [], expertCount: 0, basicCount: 0 };
    empPerfMap[uid].scores.push(o.overallScore);
    if (o.overallLevel === 'Expert') empPerfMap[uid].expertCount++;
    if (o.overallLevel === 'Basic') empPerfMap[uid].basicCount++;
  }
  const empPerfArr = Object.entries(empPerfMap).map(([uid, e]) => ({
    _id: uid,
    name: e.name,
    department: e.department,
    position: e.position,
    avgScore: round1(e.scores.reduce((a, b) => a + b, 0) / e.scores.length),
    count: e.scores.length,
    expertCount: e.expertCount,
    basicCount: e.basicCount,
  }));
  const topPerformers = [...empPerfArr].sort((a, b) => b.avgScore - a.avgScore).slice(0, 5);
  const bottomPerformers = [...empPerfArr].sort((a, b) => a.avgScore - b.avgScore).slice(0, 5);

  // Assessment breakdown
  const assessGroup = {};
  for (const o of overallRows) {
    const a = o.assessment || {};
    if (!assessGroup[o.assessmentId]) assessGroup[o.assessmentId] = { description: a.description, type: a.type, purpose: a.purpose, targetGroup: a.targetGroup, scores: [] };
    assessGroup[o.assessmentId].scores.push(o.overallScore);
  }
  const assessmentBreakdown = Object.entries(assessGroup)
    .map(([aid, a]) => ({
      _id: aid,
      description: a.description,
      type: a.type,
      purpose: a.purpose,
      targetGroup: a.targetGroup,
      count: a.scores.length,
      avgScore: round1(a.scores.reduce((s, v) => s + v, 0) / a.scores.length),
      maxScore: Math.max(...a.scores),
      minScore: Math.min(...a.scores),
    }))
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 20);

  // Gender breakdown
  const genderMap = {};
  for (const o of overallRows) {
    const g = o.user?.gender || 'Unspecified';
    if (!genderMap[g]) genderMap[g] = { count: 0, totalScore: 0 };
    genderMap[g].count++;
    genderMap[g].totalScore += o.overallScore;
  }
  const genderBreakdown = Object.entries(genderMap)
    .map(([g, d]) => ({ _id: g, count: d.count, avgScore: round1(d.totalScore / d.count) }));

  // Position breakdown
  const posMap = {};
  for (const o of overallRows) {
    const p = o.user?.position || 'Unspecified';
    if (!posMap[p]) posMap[p] = { count: 0, totalScore: 0 };
    posMap[p].count++;
    posMap[p].totalScore += o.overallScore;
  }
  const positionBreakdown = Object.entries(posMap)
    .map(([p, d]) => ({ _id: p, count: d.count, avgScore: round1(d.totalScore / d.count) }))
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 10);

  return {
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
  };
};

/**
 * Pure aggregator — mirrors the previous dashboard shape exactly, but derived
 * from live Result rows. scoreMin / scoreMax / overallLevel are applied AFTER
 * grouping so "overall" means the per (user × assessment) mean score.
 *
 * Kept for exactness (and pinned by unit tests); the HTTP path uses
 * `aggregateStatsSql` so grouping happens in the database.
 */
export const computeLiveStats = (results, query = {}) => {
  const scoreMin = query.scoreMin !== undefined && query.scoreMin !== '' ? Number(query.scoreMin) : null;
  const scoreMax = query.scoreMax !== undefined && query.scoreMax !== '' ? Number(query.scoreMax) : null;
  const overallLevelFilter = query.overallLevel || null;

  const groups = new Map();
  for (const r of results) {
    const key = `${r.userId}|||${r.assessmentId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const overallRows = [];
  for (const rs of groups.values()) {
    const total = rs.reduce((s, x) => s + (Number(x.finalScore) || 0), 0);
    const overallScore = Math.round(total / rs.length);
    if (scoreMin !== null && overallScore < scoreMin) continue;
    if (scoreMax !== null && overallScore > scoreMax) continue;
    const overallLevel = assignLevel(overallScore);
    if (overallLevelFilter && overallLevel !== overallLevelFilter) continue;
    overallRows.push({
      userId: rs[0].userId,
      assessmentId: rs[0].assessmentId,
      user: rs[0].user,
      assessment: rs[0].assessment,
      results: rs,
      overallScore,
      overallLevel,
    });
  }

  if (!overallRows.length) return ZERO_STATS;
  return _computeBreakdowns(overallRows);
};

/**
 * P5: Live-stats aggregation with the heavy lifting pushed into SQL.
 * Per (user × assessment) grouping is done by Prisma `groupBy` (a single
 * SQL GROUP BY over the Result table) instead of loading every matching row
 * into memory. After the post-group scoreMin/scoreMax/overallLevel gate, only
 * the minimal rows needed for the smaller breakdowns are fetched.
 */
export const aggregateStatsSql = async (baseWhere, query = {}) => {
  const scoreMin = query.scoreMin !== undefined && query.scoreMin !== '' ? Number(query.scoreMin) : null;
  const scoreMax = query.scoreMax !== undefined && query.scoreMax !== '' ? Number(query.scoreMax) : null;
  const overallLevelFilter = query.overallLevel || null;

  const pairsRaw = await prisma.result.groupBy({
    by: ['userId', 'assessmentId'],
    _avg: { finalScore: true },
    where: baseWhere,
  });

  const pairs = [];
  for (const p of pairsRaw) {
    const overallScore = Math.round(p._avg.finalScore || 0);
    if (scoreMin !== null && overallScore < scoreMin) continue;
    if (scoreMax !== null && overallScore > scoreMax) continue;
    const overallLevel = assignLevel(overallScore);
    if (overallLevelFilter && overallLevel !== overallLevelFilter) continue;
    pairs.push({ userId: p.userId, assessmentId: p.assessmentId, overallScore, overallLevel });
  }

  if (!pairs.length) return ZERO_STATS;

  const userIds = [...new Set(pairs.map(p => p.userId))];
  const assessmentIds = [...new Set(pairs.map(p => p.assessmentId))];
  const pairSet = new Set(pairs.map(p => `${p.userId}|||${p.assessmentId}`));

  const [users, assessments, resultRows] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, department: true, position: true, gender: true },
    }),
    prisma.assessment.findMany({
      where: { id: { in: assessmentIds } },
      select: { id: true, description: true, type: true, purpose: true, targetGroup: true, endDate: true },
    }),
    prisma.result.findMany({
      where: { status: 'FINAL', userId: { in: userIds }, assessmentId: { in: assessmentIds } },
      select: {
        userId: true,
        assessmentId: true,
        finalScore: true,
        level: true,
        competency: { select: { id: true, name: true, category: true } },
      },
    }),
  ]);

  const userMap = Object.fromEntries(users.map(u => [u.id, u]));
  const assessMap = Object.fromEntries(assessments.map(a => [a.id, a]));

  const resultsByPair = {};
  for (const r of resultRows) {
    const key = `${r.userId}|||${r.assessmentId}`;
    if (!pairSet.has(key)) continue;
    if (!resultsByPair[key]) resultsByPair[key] = [];
    resultsByPair[key].push(r);
  }

  const overallRows = pairs.map(p => {
    const key = `${p.userId}|||${p.assessmentId}`;
    return {
      userId: p.userId,
      assessmentId: p.assessmentId,
      user: userMap[p.userId],
      assessment: assessMap[p.assessmentId],
      results: resultsByPair[key] || [],
      overallScore: p.overallScore,
      overallLevel: p.overallLevel,
    };
  });

  return _computeBreakdowns(overallRows);
};

export const computeHeatmap = (results) => {
  const grouped = {};
  for (const r of results) {
    const comp = r.competency?.name || 'Unknown';
    const dept = r.user?.department || 'Unspecified';
    const key = `${comp}|||${dept}`;
    if (!grouped[key]) grouped[key] = { scores: [], count: 0 };
    grouped[key].scores.push(Number(r.finalScore) || 0);
    grouped[key].count++;
  }

  const map = {};
  for (const [key, data] of Object.entries(grouped)) {
    const [comp, dept] = key.split('|||');
    const avg = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
    if (!map[comp]) map[comp] = [];
    map[comp].push({ department: dept, avgScore: round2(avg), count: data.count });
  }
  for (const arr of Object.values(map)) {
    arr.sort((a, b) => a.department.localeCompare(b.department));
  }
  return map;
};

export const computeDepartmentSummary = (results, department) => {
  const grouped = {};
  for (const r of results) {
    const name = r.competency?.name || 'Unknown';
    if (!grouped[name]) grouped[name] = { scores: [], levels: [] };
    grouped[name].scores.push(Number(r.finalScore) || 0);
    grouped[name].levels.push(r.level);
  }

  const summary = Object.entries(grouped).map(([name, data]) => {
    const dist = { Basic: 0, Intermediate: 0, Advanced: 0, Expert: 0 };
    data.levels.forEach(l => { if (dist[l] !== undefined) dist[l]++; });
    const avg = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
    return { competencyName: name, avgScore: round2(avg), totalReports: data.scores.length, levelDistribution: dist };
  }).sort((a, b) => a.competencyName.localeCompare(b.competencyName));

  return { department, summary };
};

export const getLiveFilterOptions = async (user) => {
  const scopedIds = await getScopedUserIds(user);
  const userWhere = scopedIds ? { id: emptyOr(scopedIds) } : {};

  const [deptRows, posRows, genderRows, competencies] = await Promise.all([
    prisma.user.findMany({ where: userWhere, distinct: ['department'], select: { department: true } }),
    prisma.user.findMany({ where: userWhere, distinct: ['position'], select: { position: true } }),
    prisma.user.findMany({ where: userWhere, distinct: ['gender'], select: { gender: true } }),
    prisma.competency.findMany({ select: { id: true, name: true, category: true }, orderBy: { name: 'asc' } }),
  ]);

  const departments = deptRows.map(r => r.department).filter(Boolean).sort();
  const positions = posRows.map(r => r.position).filter(Boolean).sort();
  const genders = genderRows.map(r => r.gender).filter(Boolean).sort();

  const assessmentListRaw = await prisma.assessment.findMany({
    where: { status: 'COMPLETED' },
    select: { id: true, description: true, type: true, purpose: true, targetGroup: true },
    orderBy: { endDate: 'desc' },
  });

  const assessments = assessmentListRaw.map(a => ({
    _id: a.id,
    description: a.description,
    type: a.type,
    purpose: a.purpose,
    targetGroup: a.targetGroup,
  }));

  const scoreRange = await prisma.result.aggregate({
    where: { status: 'FINAL', assessment: { status: 'COMPLETED' }, ...(scopedIds ? { userId: emptyOr(scopedIds) } : {}) },
    _min: { finalScore: true },
    _max: { finalScore: true },
  });

  return {
    departments,
    positions,
    genders,
    competencies: competencies.map(c => ({ _id: c.id, name: c.name, category: c.category })),
    competencyCategories: [...new Set(competencies.map(c => c.category).filter(Boolean))].sort(),
    assessments,
    assessmentTypes: [...new Set(assessmentListRaw.map(a => a.type).filter(Boolean))].sort(),
    purposes: [...new Set(assessmentListRaw.map(a => a.purpose).filter(Boolean))].sort(),
    targetGroups: [...new Set(assessmentListRaw.map(a => a.targetGroup).filter(Boolean))].sort(),
    levels: ['Basic', 'Intermediate', 'Advanced', 'Expert'],
    statuses: ['FINAL'],
    scoreRange: scoreRange._min.finalScore != null
      ? { min: Math.floor(scoreRange._min.finalScore), max: Math.ceil(scoreRange._max.finalScore) }
      : { min: 0, max: 100 },
  };
};