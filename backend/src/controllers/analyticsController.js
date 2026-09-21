import asyncHandler from '../utils/asyncHandler.js';
import {
  buildResultFilter,
  fetchLiveResults,
  aggregateStatsSql,
  computeHeatmap,
  computeDepartmentSummary,
  getLiveFilterOptions,
} from '../services/analyticsService.js';

// ─── LIVE ANALYTICS (Tier 1) ─────────────────────────────────────────────────
// High-level views computed on-request from FINAL results of COMPLETED
// assessments only. No snapshot/report tables involved.

export const getLiveStats = asyncHandler(async (req, res) => {
  // P5: pairing + aggregation runs in SQL; only filtered pairs are fetched back.
  const where = await buildResultFilter(req.query, req.user);
  const data = await aggregateStatsSql(where, req.query);
  res.status(200).json({ status: 'success', data });
});

export const getLiveHeatmap = asyncHandler(async (req, res) => {
  const where = await buildResultFilter(req.query, req.user);
  const results = await fetchLiveResults(where);
  res.status(200).json({ status: 'success', data: { heatmap: computeHeatmap(results) } });
});

export const getLiveDepartmentSummary = asyncHandler(async (req, res) => {
  const { department } = req.params;
  const where = await buildResultFilter({}, req.user, { department });
  const results = await fetchLiveResults(where);
  res.status(200).json({ status: 'success', data: computeDepartmentSummary(results, department) });
});

export const getFilterOptions = asyncHandler(async (req, res) => {
  const data = await getLiveFilterOptions(req.user);
  res.status(200).json({ status: 'success', data });
});