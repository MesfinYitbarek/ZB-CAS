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
import Competency from '../models/Competency.js';
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
      .populate({ path: 'linkedAssessmentIds', select: 'status startDate endDate competencyId', populate: { path: 'competencyId', select: 'name' } })
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

    const { status, linkedUserId, linkedAssessmentIds, notes } = req.body;
    if (status) request.status = status;
    if (linkedUserId) request.linkedUserId = linkedUserId;
    // Merge new assessment IDs without duplicates
    if (linkedAssessmentIds && Array.isArray(linkedAssessmentIds)) {
      const existing = (request.linkedAssessmentIds || []).map(id => id.toString());
      linkedAssessmentIds.forEach(id => {
        if (!existing.includes(id.toString())) {
          request.linkedAssessmentIds.push(id);
        }
      });
    }
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

// ── GET /api/external/assessment-requests/:id/user-results ──────────────────────
// Fetch assessments where the matched user has completed results (for checkbox UI)
router.get('/assessment-requests/:id/user-results', async (req, res) => {
  try {
    const request = await ExternalRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ status: 'fail', message: 'Request not found.' });
    }
    if (!request.linkedUserId) {
      return res.status(200).json({ status: 'success', data: { assessments: [] } });
    }

    // Find all results for this user
    const results = await Result.find({ userId: request.linkedUserId })
      .populate({ path: 'assessmentId', select: 'status startDate endDate competencyId', populate: { path: 'competencyId', select: 'name category' } })
      .lean();

    // Group by assessment and get unique assessments
    const assessmentMap = {};
    results.forEach(r => {
      const aId = r.assessmentId?._id?.toString();
      if (!aId) return;
      if (!assessmentMap[aId]) {
        assessmentMap[aId] = {
          _id: aId,
          competencyName: r.assessmentId?.competencyId?.name || 'Unknown',
          category: r.assessmentId?.competencyId?.category || '',
          status: r.assessmentId?.status,
          startDate: r.assessmentId?.startDate,
          endDate: r.assessmentId?.endDate,
          resultCount: 0,
        };
      }
      assessmentMap[aId].resultCount++;
    });

    const alreadyLinked = (request.linkedAssessmentIds || []).map(id => id.toString());
    const assessments = Object.values(assessmentMap).map(a => ({
      ...a,
      alreadyLinked: alreadyLinked.includes(a._id),
    }));

    res.status(200).json({ status: 'success', data: { assessments } });
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

    // If no assessments linked yet
    if (!request.linkedAssessmentIds || request.linkedAssessmentIds.length === 0) {
      return res.status(200).json({
        status: 'success',
        data: {
          requestStatus: request.status,
          message: 'No assessments have been linked yet. ZB CAS Admin is still processing.',
          competencies: [],
        },
      });
    }

    // Fetch results from ALL linked assessments
    const results = await Result.find({
      assessmentId: { $in: request.linkedAssessmentIds },
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

// ── POST /api/external/assessment-requests/:id/create-competencies ──────────
// Auto-create ZB CAS competencies from the request's competency list

const TYPE_TO_CATEGORY = {
  'TECHNICAL': 'Technical',
  'LEADERSHIP': 'Leadership',
  'MANAGERIAL': 'Managerial',
  'CORE': 'Core-Behavioral',
  'BEHAVIORAL': 'Core-Behavioral',
  'PERSONAL': 'Core-Personal effectiveness',
};

router.post('/assessment-requests/:id/create-competencies', async (req, res) => {
  try {
    const request = await ExternalRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ status: 'fail', message: 'Request not found.' });
    }

    if (!request.competencies?.length) {
      return res.status(400).json({ status: 'fail', message: 'No competencies in this request.' });
    }

    const created = [];
    const skipped = [];

    for (const comp of request.competencies) {
      const category = TYPE_TO_CATEGORY[(comp.type || 'TECHNICAL').toUpperCase()] || 'Technical';

      // Check if competency already exists (by name + category)
      const existing = await Competency.findOne({ name: comp.name, category });
      if (existing) {
        skipped.push(comp.name);
        continue;
      }

      try {
        const newComp = await Competency.create({
          name: comp.name,
          category,
          targetGroups: [{ targetGroup: 'common', description: `Auto-created from ZB SP request for ${request.positionTitle}` }],
        });
        created.push(newComp.name);
      } catch (err) {
        // Duplicate key or validation error — skip
        skipped.push(comp.name);
      }
    }

    logger.info({
      event: 'competencies_created_from_request',
      requestId: request._id,
      created: created.length,
      skipped: skipped.length,
    });

    res.status(201).json({
      status: 'success',
      data: {
        created,
        skipped,
        message: `Created ${created.length} competencies. ${skipped.length} already existed.`,
      },
    });
  } catch (error) {
    logger.error({ event: 'create_competencies_error', error: error.message });
    res.status(500).json({ status: 'error', message: error.message });
  }
});

export default router;
