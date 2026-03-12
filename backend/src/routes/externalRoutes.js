/* routes/externalRoutes.js
 * Endpoints for external system integration (ZB_SP Succession Planning).
 * Secured via shared API key in the x-api-key header, no JWT auth required.
 *
 * POST /api/external/assessment-requests   — receive a new assessment request
 * GET  /api/external/assessment-requests   — list all requests (for ZB CAS dashboard)
 * GET  /api/external/assessment-results/:id — return results for a completed request
 * PATCH /api/external/assessment-requests/:id — update request status/linking
 */
import express from 'express';
import ExternalRequest from '../models/ExternalRequest.js';
import Result from '../models/Result.js';
import logger from '../utils/logger.js';

const router = express.Router();

// ── API Key middleware ──────────────────────────────────────────────────────────
const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const expectedKey = process.env.ZB_SP_API_KEY || 'zb-integration-key-2026';

  if (!apiKey || apiKey !== expectedKey) {
    return res.status(401).json({ status: 'fail', message: 'Invalid or missing API key.' });
  }
  next();
};

// ── POST /api/external/assessment-requests ──────────────────────────────────────
// Receives a new assessment request from ZB_SP
router.post('/assessment-requests', validateApiKey, async (req, res) => {
  try {
    const { employeeName, employeeEmail, positionTitle, competencies, sourceAssessmentId } = req.body;

    if (!employeeName || !employeeEmail || !positionTitle) {
      return res.status(400).json({
        status: 'fail',
        message: 'employeeName, employeeEmail, and positionTitle are required.',
      });
    }

    const request = await ExternalRequest.create({
      sourceSystem: 'ZB_SP',
      sourceAssessmentId: sourceAssessmentId || null,
      employeeName,
      employeeEmail,
      positionTitle,
      competencies: competencies || [],
      status: 'PENDING',
    });

    logger.info({
      event: 'external_request_received',
      requestId: request._id,
      employee: employeeName,
      source: 'ZB_SP',
    });

    res.status(201).json({
      status: 'success',
      data: {
        externalId: request._id.toString(),
        status: request.status,
        message: `Assessment request received for ${employeeName}. ZB CAS Admin will process it.`,
      },
    });
  } catch (error) {
    logger.error({ event: 'external_request_error', error: error.message });
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ── GET /api/external/assessment-requests ───────────────────────────────────────
// List all external requests (for ZB CAS admin dashboard)
router.get('/assessment-requests', async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const requests = await ExternalRequest.find(filter)
      .populate('linkedUserId', 'name email')
      .populate('linkedAssessmentId', 'status startDate endDate')
      .populate('linkedAssessmentIds', 'status startDate endDate')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ status: 'success', data: { requests } });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ── PATCH /api/external/assessment-requests/:id ─────────────────────────────────
// Update request status/linking (by ZB CAS admin or internal process)
router.patch('/assessment-requests/:id', async (req, res) => {
  try {
    const request = await ExternalRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ status: 'fail', message: 'Request not found.' });
    }

    const oldStatus = request.status;
    const { status, linkedUserId, linkedAssessmentId, linkedAssessmentIds, notes } = req.body;
    if (status) request.status = status;
    if (linkedUserId) request.linkedUserId = linkedUserId;
    if (linkedAssessmentId) request.linkedAssessmentId = linkedAssessmentId;
    if (linkedAssessmentIds) request.linkedAssessmentIds = linkedAssessmentIds;
    if (notes !== undefined) request.notes = notes;

    await request.save();

    logger.info({
      event: 'external_request_updated',
      requestId: request._id,
      employee: request.employeeName,
      oldStatus,
      newStatus: request.status,
      linkedAssessmentIds: request.linkedAssessmentIds,
    });

    res.status(200).json({ status: 'success', data: { request } });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ── GET /api/external/assessment-results/:id ────────────────────────────────────
// Return assessment results for a specific external request (called by ZB_SP Sync)
router.get('/assessment-results/:id', validateApiKey, async (req, res) => {
  try {
    const request = await ExternalRequest.findById(req.params.id)
      .populate('linkedUserId', 'name email')
      .lean();

    if (!request) {
      return res.status(404).json({ status: 'fail', message: 'External request not found.' });
    }

    // Combine old string id and new array of ids for backwards compatibility
    const assessmentIds = request.linkedAssessmentIds?.length > 0 
      ? request.linkedAssessmentIds 
      : (request.linkedAssessmentId ? [request.linkedAssessmentId] : []);

    // If assessment not linked yet
    if (assessmentIds.length === 0) {
      return res.status(200).json({
        status: 'success',
        data: {
          requestStatus: request.status,
          message: 'Assessment has not been linked yet. ZB CAS Admin is still processing.',
          competencies: [],
        },
      });
    }

    // If status is NOT COMPLETED or SYNCED, return status only — no scores
    if (request.status !== 'COMPLETED' && request.status !== 'SYNCED') {
      return res.status(200).json({
        status: 'success',
        data: {
          requestStatus: request.status,
          message: `Assessment is ${request.status}. Scores will be available once completed.`,
          competencies: [],
        },
      });
    }

    // ── COMPLETED: fetch actual results from ZB CAS Result model ──
    const results = await Result.find({
      assessmentId: { $in: assessmentIds },
      ...(request.linkedUserId ? { userId: request.linkedUserId } : {}),
    })
      .populate('competencyId', 'name category')
      .lean();

    if (!results.length) {
      return res.status(200).json({
        status: 'success',
        data: {
          requestStatus: 'COMPLETED',
          message: 'Assessment is completed but no result records found yet.',
          competencies: [],
        },
      });
    }

    // Map ZB CAS results to the format ZB_SP expects
    const competencies = results.map((r) => ({
      name: r.competencyId?.name || 'Unknown',
      category: r.competencyId?.category || 'General',
      level: r.level,
      score: r.finalScore,
      selfScore: r.scoreDetails?.selfScore || null,
      supervisorScore: r.scoreDetails?.supervisorScore || null,
    }));

    // Auto-update request status to SYNCED
    await ExternalRequest.findByIdAndUpdate(req.params.id, { status: 'SYNCED' });

    res.status(200).json({
      status: 'success',
      data: {
        requestStatus: 'COMPLETED',
        employeeName: request.employeeName,
        employeeEmail: request.employeeEmail,
        competencies,
      },
    });
  } catch (error) {
    logger.error({ event: 'external_results_error', error: error.message });
    res.status(500).json({ status: 'error', message: error.message });
  }
});

export default router;
