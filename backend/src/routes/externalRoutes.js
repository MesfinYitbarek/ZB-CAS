/* routes/externalRoutes.js
 * Endpoints for external system integration (ZB_SP Succession Planning).
 * Secured via shared API key in the x-api-key header, no JWT auth required.
 *
 * POST /api/external/assessment-requests        — receive request, auto-create competency + assessment
 * GET  /api/external/assessment-requests        — list all requests (for ZB CAS dashboard)
 * PATCH /api/external/assessment-requests/:id/mark-complete — one-click complete & auto-link results
 * GET  /api/external/assessment-requests/:id/user-results   — show only assessments user has results for
 * GET  /api/external/assessment-results/:id     — return results for ZB_SP sync
 * PATCH /api/external/assessment-requests/:id   — update request status/linking (legacy)
 */
import express from 'express';
import ExternalRequest from '../models/ExternalRequest.js';
import Competency from '../models/Competency.js';
import Result from '../models/Result.js';
import logger from '../utils/logger.js';

const router = express.Router();

// ── Type → Category mapping ─────────────────────────────────────────────────────
const TYPE_TO_CATEGORY = {
  'TECHNICAL': 'Technical',
  'LEADERSHIP': 'Leadership',
  'MANAGERIAL': 'Managerial',
  'CORE': 'Core-Behavioral',
  'BEHAVIORAL': 'Core-Behavioral',
  'PERSONAL': 'Core-Personal effectiveness',
};

// ── Helper: strip level bracket from competency name for matching ───────────────
// e.g. "leadership_SP (Expert)" → "leadership_sp"
const stripLevel = (name) => (name || '').replace(/\s*\([^)]*\)\s*$/, '').toLowerCase().trim();

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
// Receives a new assessment request from ZB_SP.
// AUTO-creates competencies + ACTIVE assessments assigned specifically to the employee.
router.post('/assessment-requests', validateApiKey, async (req, res) => {
  try {
    const { employeeName, employeeEmail, positionTitle, competencies, sourceAssessmentId } = req.body;

    if (!employeeName || !employeeEmail || !positionTitle) {
      return res.status(400).json({
        status: 'fail',
        message: 'employeeName, employeeEmail, and positionTitle are required.',
      });
    }

    // Create the external request record first
    const request = await ExternalRequest.create({
      sourceSystem: 'ZB_SP',
      sourceAssessmentId: sourceAssessmentId || null,
      employeeName,
      employeeEmail,
      positionTitle,
      competencies: competencies || [],
      status: 'PENDING',
    });

    // ── Auto-process: try to find user, create competencies + assessments ──────
    let autoCreated = { competencies: [], assessments: [], linkedUserId: null };

    try {
      const User = (await import('../models/User.js')).default;
      const Assessment = (await import('../models/Assessment.js')).default;

      // Find CAS user by email
      const user = employeeEmail
        ? await User.findOne({ email: employeeEmail.toLowerCase() }).lean()
        : null;

      if (user) {
        // Auto-link the user
        request.linkedUserId = user._id;
        autoCreated.linkedUserId = user._id;
      }

      // Auto-create competencies (level info goes in description, not name)
      // If competency already exists, append user info to its description
      if (competencies?.length) {
        const d = new Date();
        const yy = d.getFullYear(), mm = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
        const hh = d.getHours();
        const h12 = hh % 12 || 12;
        const ampm = hh >= 12 ? 'PM' : 'AM';
        const min = String(d.getMinutes()).padStart(2, '0');
        const now = `${yy}-${mm}-${dd} ${h12}:${min} ${ampm}`;

        for (const comp of competencies) {
          const category = TYPE_TO_CATEGORY[(comp.type || 'TECHNICAL').toUpperCase()] || 'Technical';
          const level = comp.requiredLevel || 'Intermediate';
          let compName = comp.name;
          // IMPORTANT: map MANAGERIAL -> managerial, NON_MANAGERIAL -> non-managerial
          const targetGroup = (comp.targetGroup || 'COMMON').toLowerCase().replace(/_/g, '-');
          const displayGroup = (comp.targetGroup || 'COMMON').replace(/_/g, ' ');
          const userEntry = `• ${employeeName} — ${positionTitle} | Target Group: ${displayGroup} (${now})`;

          // Case-insensitive lookup to avoid duplicates
          const existing = await Competency.findOne({ name: { $regex: new RegExp(`^${compName}$`, 'i') } });

          if (existing) {
            // Check if this specific target group already exists on this competency
            const tgIndex = existing.targetGroups?.findIndex(t => t.targetGroup === targetGroup);

            if (tgIndex !== -1 && tgIndex !== undefined && existing.targetGroups) {
              // Target group exists, append to its description
              const currentDesc = existing.targetGroups[tgIndex].description || '';
              if (!currentDesc.includes(`${employeeName} — ${positionTitle}`) || !currentDesc.includes(String(d.getDate()).padStart(2, '0'))) {
                existing.targetGroups[tgIndex].description = currentDesc
                  ? `${currentDesc}\n${userEntry}`
                  : `Created from ZB SP.\n${userEntry}`;
                await existing.save();
              }
            } else {
              // Target group doesn't exist on this competency, add it
              if (!existing.targetGroups) existing.targetGroups = [];
              existing.targetGroups.push({ targetGroup, description: `Created from ZB SP.\n${userEntry}` });
              await existing.save();
            }
            autoCreated.competencies.push(`${existing.name} (updated)`);
          } else {
            // Competency completely brand new
            try {
              await Competency.create({
                name: compName,
                category,
                targetGroups: [{
                  targetGroup,
                  description: `Created from ZB SP.\n${userEntry}`,
                }],
              });
              autoCreated.competencies.push(compName);
            } catch (e) {
              // Duplicate key race condition — already exists
            }
          }
        }
      }

      if (user) await request.save();
    } catch (autoErr) {
      logger.warn({ event: 'auto_process_warning', error: autoErr.message });
    }

    logger.info({
      event: 'external_request_received',
      requestId: request._id,
      employee: employeeName,
      source: 'ZB_SP',
      autoLinkedUser: !!autoCreated.linkedUserId,
      competenciesCreated: autoCreated.competencies.length,
    });

    res.status(201).json({
      status: 'success',
      data: {
        externalId: request._id.toString(),
        status: request.status,
        autoLinked: !!autoCreated.linkedUserId,
        competenciesCreated: autoCreated.competencies,
        message: autoCreated.linkedUserId
          ? `Request received for ${employeeName}. Competencies auto-created. HR admin can now create assessments.`
          : `Request received for ${employeeName}. Competencies auto-created. No matching ZB CAS user found yet.`,
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

// ── PATCH /api/external/assessment-requests/:id/mark-complete ───────────────────
// One-click: finds ALL assessments user has taken that match the requested competencies,
// auto-scores them, and marks the request as COMPLETED
router.patch('/assessment-requests/:id/mark-complete', async (req, res) => {
  try {
    const request = await ExternalRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ status: 'fail', message: 'Request not found.' });
    }
    if (!request.linkedUserId) {
      return res.status(400).json({ status: 'fail', message: 'No user linked to this request yet. Make sure the employee has a ZB CAS account with a matching email.' });
    }

    const { scoreIndividual } = await import('../services/scoringService.js');
    const Response = (await import('../models/Response.js')).default;
    const Assessment = (await import('../models/Assessment.js')).default;

    // Step 1: Find ALL assessments this user has submitted responses for
    const allUserResponses = await Response.find({
      employeeId: request.linkedUserId,
      respondentType: 'self',
    }).distinct('assessmentId');

    if (allUserResponses.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'The employee has not submitted any assessment answers yet.',
      });
    }

    // Step 2: Get those assessments with their competency names (exclude those with no competency)
    const userAssessments = await Assessment.find({
      _id: { $in: allUserResponses },
      competencyId: { $ne: null },
    }).populate('competencyId', 'name category').lean();

    // Filter out assessments where competencyId didn't populate (deleted competencies)
    const validAssessments = userAssessments.filter(a => a.competencyId?.name);

    // Step 3: Strictly filter to ONLY assessments matching this request's competencies
    const requestedComps = request.competencies?.map(c => stripLevel(c.name)) || [];
    let matchingAssessments = [];

    if (requestedComps.length > 0) {
      matchingAssessments = validAssessments.filter(a => {
        const compName = stripLevel(a.competencyId?.name);
        return requestedComps.some(rc =>
          compName.includes(rc) || rc.includes(compName)
        );
      });
    }

    if (matchingAssessments.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: `No matching assessments found for the requested competencies (${requestedComps.join(', ')}). Make sure the employee has taken assessments linked to these competencies.`,
      });
    }

    // Step 4: Auto-score each matching assessment
    const scoredAssessments = [];
    for (const assessment of matchingAssessments) {
      try {
        const result = await scoreIndividual(assessment._id.toString(), request.linkedUserId);
        if (result) scoredAssessments.push(assessment._id.toString());
      } catch (scoreErr) {
        logger.warn({ event: 'auto_score_fail', assessmentId: assessment._id, error: scoreErr.message });
      }
    }

    // Step 5: Get all results for this user across matching assessments
    const matchingIds = matchingAssessments.map(a => a._id);
    const allResults = await Result.find({
      userId: request.linkedUserId,
      assessmentId: { $in: matchingIds },
    }).sort({ createdAt: -1 }).lean(); // Sort newest first

    if (allResults.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Scoring was attempted but no results could be generated. The employee may need to complete all required questions first.',
      });
    }

    // Keep only the MOST RECENT result per competency
    const assessmentToComp = {};
    matchingAssessments.forEach(a => {
      assessmentToComp[a._id.toString()] = a.competencyId?._id?.toString() || a.competencyId?.toString();
    });

    const latestResultsMap = new Map();
    for (const r of allResults) {
      const compId = assessmentToComp[r.assessmentId.toString()];
      if (compId && !latestResultsMap.has(compId)) {
        latestResultsMap.set(compId, r); // First one is the newest
      }
    }

    // Step 6: Mark as completed and link the scored assessments
    const assessmentIdsWithResults = Array.from(latestResultsMap.values()).map(r => r.assessmentId.toString());
    request.linkedAssessmentIds = assessmentIdsWithResults;
    request.status = 'COMPLETED';
    await request.save();

    logger.info({
      event: 'external_request_marked_complete',
      requestId: request._id,
      employee: request.employeeName,
      assessmentsScored: scoredAssessments.length,
      assessmentsLinked: assessmentIdsWithResults.length,
    });

    // Fire webhook to ZB SP to generate system emails (ZB SP handles the Nodemailer logic)
    try {
      const ZB_SP_URL = process.env.ZB_SP_URL || 'http://localhost:5001';
      const ZB_SP_API_KEY = process.env.ZB_SP_API_KEY || 'zb-integration-key-2026';
      await fetch(`${ZB_SP_URL}/api/assessments/webhook/completed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ZB_SP_API_KEY
        },
        body: JSON.stringify({
          externalId: request._id,
          employeeName: request.employeeName,
          positionTitle: request.positionTitle,
          event: 'MARKED_COMPLETE'
        })
      });
    } catch (whErr) {
      logger.error({ event: 'webhook_dispatch_error', error: whErr.message });
      // We don't fail the CAS request if the webhook to SP fails
    }

    res.status(200).json({
      status: 'success',
      data: {
        request,
        assessmentsScored: scoredAssessments.length,
        assessmentsLinked: assessmentIdsWithResults.length,
        message: `Processed ${assessmentIdsWithResults.length} competency result(s) and marked request as completed.`,
      },
    });
  } catch (error) {
    logger.error({ event: 'mark_complete_error', error: error.message });
    res.status(500).json({ status: 'error', message: error.message });
  }
});


// ── PATCH /api/external/assessment-requests/:id ─────────────────────────────────
// Update request status/linking (legacy — kept for compatibility)
router.patch('/assessment-requests/:id', async (req, res) => {
  try {
    const request = await ExternalRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ status: 'fail', message: 'Request not found.' });
    }

    const { status, linkedUserId, linkedAssessmentIds, notes } = req.body;
    if (status) request.status = status;
    if (linkedUserId) request.linkedUserId = linkedUserId;
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

    // Fire webhook to ZB SP if it was marked as completed via legacy patch route
    if (status === 'COMPLETED') {
      try {
        const ZB_SP_URL = process.env.ZB_SP_URL || 'http://localhost:5001';
        const ZB_SP_API_KEY = process.env.ZB_SP_API_KEY || 'zb-integration-key-2026';
        await fetch(`${ZB_SP_URL}/api/assessments/webhook/completed`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ZB_SP_API_KEY
          },
          body: JSON.stringify({
            externalId: request._id,
            employeeName: request.employeeName,
            positionTitle: request.positionTitle,
            event: 'RESULTS_UPDATED'
          })
        });
      } catch (whErr) {
        logger.error({ event: 'webhook_dispatch_error', error: whErr.message });
      }
    }

    res.status(200).json({ status: 'success', data: { request } });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ── GET /api/external/assessment-requests/:id/user-results ──────────────────────
// Finds all assessments user has taken matching the requested competencies, auto-scores, returns results
router.get('/assessment-requests/:id/user-results', async (req, res) => {
  try {
    const request = await ExternalRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ status: 'fail', message: 'Request not found.' });
    }
    if (!request.linkedUserId) {
      return res.status(200).json({ status: 'success', data: { assessments: [] } });
    }

    const { scoreIndividual } = await import('../services/scoringService.js');
    const Response = (await import('../models/Response.js')).default;
    const Assessment = (await import('../models/Assessment.js')).default;

    // Step 1: Find ALL assessments this user has submitted responses for
    const userAssessmentIds = await Response.find({
      employeeId: request.linkedUserId,
      respondentType: 'self',
    }).distinct('assessmentId');

    if (userAssessmentIds.length === 0) {
      return res.status(200).json({ status: 'success', data: { assessments: [] } });
    }

    // Step 2: Get those assessments with competency info (exclude those with no competency)
    const userAssessments = await Assessment.find({
      _id: { $in: userAssessmentIds },
      competencyId: { $ne: null },
    }).populate('competencyId', 'name category').lean();

    // Filter out assessments where competencyId didn't populate (deleted competencies)
    const validAssessments = userAssessments.filter(a => a.competencyId?.name);

    // Step 3: Strictly filter to ONLY assessments matching this request's competencies
    const requestedComps = request.competencies?.map(c => stripLevel(c.name)) || [];
    let matchingAssessments = [];

    if (requestedComps.length > 0) {
      matchingAssessments = validAssessments.filter(a => {
        const compName = stripLevel(a.competencyId?.name);
        return requestedComps.some(rc =>
          compName.includes(rc) || rc.includes(compName)
        );
      });
    }

    // Step 4: Auto-score matching assessments
    for (const assessment of matchingAssessments) {
      try {
        await scoreIndividual(assessment._id.toString(), request.linkedUserId);
      } catch (e) {
        // Non-fatal
      }
    }

    // Step 5: Fetch results
    const matchingIds = matchingAssessments.map(a => a._id);
    const allResults = await Result.find({
      userId: request.linkedUserId,
      assessmentId: { $in: matchingIds },
    })
      .populate({ path: 'assessmentId', select: 'status startDate endDate competencyId', populate: { path: 'competencyId', select: 'name category' } })
      .sort({ createdAt: -1 }) // Sort newest first
      .lean();

    // Keep only the MOST RECENT result per competency
    const latestResultsMap = new Map();
    for (const r of allResults) {
      if (!r.assessmentId || !r.assessmentId.competencyId) continue;
      const compId = r.assessmentId.competencyId._id.toString();
      if (!latestResultsMap.has(compId)) {
        latestResultsMap.set(compId, r); // First seen is newest
      }
    }
    const results = Array.from(latestResultsMap.values());

    // Group by assessment
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
          finalScore: r.finalScore,
          level: r.level,
          alreadyLinked: true,
        };
      }
    });

    res.status(200).json({ status: 'success', data: { assessments: Object.values(assessmentMap) } });
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

    // If not yet completed
    if (request.status !== 'COMPLETED' && request.status !== 'SYNCED') {
      return res.status(200).json({
        status: 'success',
        data: {
          requestStatus: request.status,
          message: 'Assessment is still in progress. ZB CAS Admin has not marked it as completed yet.',
          competencies: [],
        },
      });
    }

    // If no assessments linked yet
    if (!request.linkedAssessmentIds || request.linkedAssessmentIds.length === 0) {
      return res.status(200).json({
        status: 'success',
        data: {
          requestStatus: request.status,
          message: 'No assessments have been linked yet.',
          competencies: [],
        },
      });
    }

    // Fetch results from ALL linked assessments for this user, sorted from newest to oldest
    const allResults = await Result.find({
      assessmentId: { $in: request.linkedAssessmentIds },
      ...(request.linkedUserId ? { userId: request.linkedUserId } : {}),
    })
      .sort({ createdAt: -1 }) // Sort newest first
      .populate('competencyId', 'name category')
      .lean();

    if (!allResults.length) {
      return res.status(200).json({
        status: 'success',
        data: {
          requestStatus: 'COMPLETED',
          message: 'Assessment is completed but no result records found yet.',
          competencies: [],
        },
      });
    }

    // Keep only the MOST RECENT result per competency to prevent old scores from overriding new ones
    const latestResultsMap = new Map();
    for (const r of allResults) {
      if (!r.competencyId) continue;
      const compIdStr = r.competencyId._id ? r.competencyId._id.toString() : r.competencyId.toString();
      if (!latestResultsMap.has(compIdStr)) {
        latestResultsMap.set(compIdStr, r);
      }
    }

    // Map ZB CAS results to the format ZB_SP expects
    const competencies = Array.from(latestResultsMap.values()).map((r) => {
      const qDetails = r.scoreDetails?.questionDetails || [];
      const totalQuestions = qDetails.length;
      const correctAnswers = qDetails.filter(q => q.isCorrect).length;
      const totalScore = qDetails.reduce((s, q) => s + (q.scoreAwarded || 0), 0);
      const maxPossibleScore = qDetails.reduce((s, q) => s + (q.maxScore || 0), 0);

      return {
        name: r.competencyId?.name || 'Unknown',
        category: r.competencyId?.category || 'General',
        level: r.level,
        score: r.finalScore,
        selfScore: r.scoreDetails?.selfScore || null,
        supervisorScore: r.scoreDetails?.supervisorScore || null,
        totalQuestions,
        correctAnswers,
        totalScore,
        maxPossibleScore,
      };
    });

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

// ── POST /api/external/assessment-requests/:id/link-user ────────────────────────
// Attempt to link request to a ZB CAS user (called by ZB CAS admin frontend)
router.post('/assessment-requests/:id/link-user', async (req, res) => {
  try {
    const request = await ExternalRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ status: 'fail', message: 'Request not found.' });

    if (request.linkedUserId) {
      return res.status(400).json({ status: 'fail', message: 'Request is already linked to a user.' });
    }

    const User = (await import('../models/User.js')).default;
    const user = await User.findOne({ email: request.employeeEmail.toLowerCase() }).lean();

    if (!user) {
      return res.status(404).json({
        status: 'fail',
        message: `No ZB CAS user found with email ${request.employeeEmail}. Please create the user first.`
      });
    }

    request.linkedUserId = user._id;
    await request.save();

    res.status(200).json({
      status: 'success',
      message: `Successfully linked request to ${user.name}.`,
      data: { linkedUserId: user }
    });
  } catch (error) {
    logger.error({ event: 'external_link_user_error', error: error.message });
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ── POST /api/external/assessment-requests/:id/create-competencies ──────────────
// Manual fallback to create competencies (kept for edge cases)
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
      const existing = await Competency.findOne({ name: comp.name, category });
      if (existing) { skipped.push(comp.name); continue; }

      try {
        const newComp = await Competency.create({
          name: comp.name,
          category,
          targetGroups: [{
            targetGroup: (comp.targetGroup || 'COMMON').toLowerCase().replace(/_/g, '-'),
            description: `Auto-created from ZB SP request for ${request.positionTitle}`
          }],
        });
        created.push(newComp.name);
      } catch (err) {
        skipped.push(comp.name);
      }
    }

    logger.info({ event: 'competencies_created_from_request', requestId: request._id, created: created.length, skipped: skipped.length });

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

// ── DELETE /api/external/assessment-requests/:id ────────────────────────────────
// Delete an external request (called by ZB CAS admin frontend)
router.delete('/assessment-requests/:id', async (req, res) => {
  try {
    const request = await ExternalRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ status: 'fail', message: 'Request not found.' });
    }

    await ExternalRequest.findByIdAndDelete(req.params.id);

    logger.info({ event: 'external_request_deleted', requestId: req.params.id });

    res.status(200).json({ status: 'success', message: 'Assessment request deleted successfully.' });
  } catch (error) {
    logger.error({ event: 'delete_request_error', error: error.message });
    res.status(500).json({ status: 'error', message: error.message });
  }
});

export default router;
