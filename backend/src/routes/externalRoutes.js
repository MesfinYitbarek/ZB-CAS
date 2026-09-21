/* routes/externalRoutes.js
 * Endpoints for external system integration (ZB_SP Succession Planning).
 * Secured via shared API key in the x-api-key header, no JWT auth required.
 *
 * POST /api/external/assessment-requests        â€” receive request, auto-create competency + assessment
 * GET  /api/external/assessment-requests        â€” list all requests (for ZB CAS dashboard)
 * PATCH /api/external/assessment-requests/:id/mark-complete â€” one-click complete & auto-link results
 * GET  /api/external/assessment-requests/:id/user-results   â€” show only assessments user has results for
 * GET  /api/external/assessment-results/:id     â€” return results for ZB_SP sync
 * PATCH /api/external/assessment-requests/:id   â€” update request status/linking (legacy)
 */
import express from 'express';
import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';

const router = express.Router();

// â”€â”€ Type â†’ Category mapping â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const TYPE_TO_CATEGORY = {
  'TECHNICAL': 'Technical',
  'LEADERSHIP': 'Leadership',
  'MANAGERIAL': 'Managerial',
  'CORE': 'Core_Behavioral',
  'BEHAVIORAL': 'Core_Behavioral',
  'PERSONAL': 'Core_Personal_effectiveness',
};

// â”€â”€ Map display category strings to CompetencyCategory enum values â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CATEGORY_TO_ENUM = {
  'Technical': 'Technical',
  'Leadership': 'Leadership',
  'Managerial': 'Managerial',
  'Core-Behavioral': 'Core_Behavioral',
  'Core-Personal effectiveness': 'Core_Personal_effectiveness',
};

// â”€â”€ Helper: strip level bracket from competency name for matching â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// e.g. "leadership_SP (Expert)" â†’ "leadership_sp"
const stripLevel = (name) => (name || '').replace(/\s*\([^)]*\)\s*$/, '').toLowerCase().trim();

// â”€â”€ Helper: map ExternalTargetGroup enum â†’ TargetGroup enum â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const extTgToTg = (tg) => {
  if (tg === 'MANAGERIAL') return 'managerial';
  if (tg === 'NON_MANAGERIAL') return 'non_managerial';
  return 'common';
};

// â”€â”€ Helper: map legacy lowercase/hyphenated targetGroup to ExternalTargetGroup enum
const toExtTargetGroup = (tg) => {
  const upper = (tg || 'COMMON').toUpperCase().replace(/-/g, '_');
  if (upper === 'NON_MANAGERIAL') return 'NON_MANAGERIAL';
  if (upper === 'MANAGERIAL') return 'MANAGERIAL';
  return 'COMMON';
};

// â”€â”€ Helper: load junction extras onto a request object â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function loadRequestExtras(request) {
  const comps = await prisma.externalRequestCompetency.findMany({
    where: { externalRequestId: request.id },
  });
  const links = await prisma.externalRequestLinkedAssessment.findMany({
    where: { externalRequestId: request.id },
    select: { assessmentId: true },
  });
  request.competencies = comps.map(c => ({
    name: c.name,
    type: c.type,
    requiredLevel: c.requiredLevel,
    targetGroup: c.targetGroup,
  }));
  request.linkedAssessmentIds = links.map(l => l.assessmentId);
  return request;
}

// â”€â”€ API Key middleware â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const expectedKey = process.env.ZB_SP_API_KEY;

  if (!expectedKey || !apiKey || apiKey !== expectedKey) {
    return res.status(401).json({ status: 'fail', message: 'Invalid or missing API key.' });
  }
  next();
};

// Every external integration endpoint requires the shared API key.
// No hardcoded fallback: the key MUST come from the environment, otherwise
// external access is denied entirely.
router.use(validateApiKey);

// â”€â”€ POST /api/external/assessment-requests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/assessment-requests', async (req, res) => {
  try {
    const { employeeName, employeeEmail, positionTitle, competencies, sourceAssessmentId } = req.body;

    if (!employeeName || !employeeEmail || !positionTitle) {
      return res.status(400).json({
        status: 'fail',
        message: 'employeeName, employeeEmail, and positionTitle are required.',
      });
    }

    const request = await prisma.externalRequest.create({
      data: {
        sourceSystem: 'ZB_SP',
        sourceAssessmentId: sourceAssessmentId || null,
        employeeName,
        employeeEmail,
        positionTitle,
        status: 'PENDING',
      },
    });

    if (competencies?.length) {
      await prisma.externalRequestCompetency.createMany({
        data: competencies.map(c => ({
          externalRequestId: request.id,
          name: c.name,
          type: c.type || 'TECHNICAL',
          requiredLevel: c.requiredLevel || 'Intermediate',
          targetGroup: toExtTargetGroup(c.targetGroup),
        })),
      });
    }

    // â”€â”€ Auto-process: try to find user, create competencies + assessments â”€â”€â”€â”€â”€â”€
    let autoCreated = { competencies: [], assessments: [], linkedUserId: null };

    try {
      const user = employeeEmail
        ? await prisma.user.findUnique({ where: { email: employeeEmail.toLowerCase() } })
        : null;

      let linkedUserId = null;
      if (user) {
        linkedUserId = user.id;
        autoCreated.linkedUserId = user.id;
      }

      // Auto-create competencies
      if (competencies?.length) {
        const d = new Date();
        const yy = d.getFullYear(), mm = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
        const hh = d.getHours();
        const h12 = hh % 12 || 12;
        const ampm = hh >= 12 ? 'PM' : 'AM';
        const min = String(d.getMinutes()).padStart(2, '0');
        const now = `${yy}-${mm}-${dd} ${h12}:${min} ${ampm}`;

        for (const comp of competencies) {
          const rawCategory = TYPE_TO_CATEGORY[(comp.type || 'TECHNICAL').toUpperCase()] || 'Technical';
          const category = CATEGORY_TO_ENUM[rawCategory] || rawCategory;
          const level = comp.requiredLevel || 'Intermediate';
          const compName = comp.name;
          const targetGroupEnum = toExtTargetGroup(comp.targetGroup);
          const tgForCompetency = extTgToTg(targetGroupEnum);
          const displayGroup = (comp.targetGroup || 'COMMON').replace(/_/g, ' ');
          const userEntry = `â€¢ ${employeeName} â€” ${positionTitle} | Target Group: ${displayGroup} (${now})`;

          const existing = await prisma.competency.findFirst({
            where: { name: { equals: compName, mode: 'insensitive' } },
            include: { targetGroups: true },
          });

          if (existing) {
            const tgRow = existing.targetGroups.find(t => t.targetGroup === tgForCompetency);
            if (tgRow) {
              const currentDesc = tgRow.description || '';
              if (!currentDesc.includes(`${employeeName} â€” ${positionTitle}`) || !currentDesc.includes(String(d.getDate()).padStart(2, '0'))) {
                await prisma.competencyTargetGroup.update({
                  where: { id: tgRow.id },
                  data: {
                    description: currentDesc
                      ? `${currentDesc}\n${userEntry}`
                      : `Created from ZB SP.\n${userEntry}`,
                  },
                });
              }
            } else {
              await prisma.competencyTargetGroup.create({
                data: {
                  competencyId: existing.id,
                  targetGroup: tgForCompetency,
                  description: `Created from ZB SP.\n${userEntry}`,
                },
              });
            }
            autoCreated.competencies.push(`${existing.name} (updated)`);
          } else {
            try {
              await prisma.competency.create({
                data: {
                  name: compName,
                  category,
                  targetGroups: {
                    create: [{
                      targetGroup: tgForCompetency,
                      description: `Created from ZB SP.\n${userEntry}`,
                    }],
                  },
                },
              });
              autoCreated.competencies.push(compName);
            } catch (e) {
              // Duplicate key race condition â€” already exists
            }
          }
        }
      }

      if (linkedUserId) {
        await prisma.externalRequest.update({
          where: { id: request.id },
          data: { linkedUserId },
        });
        request.linkedUserId = linkedUserId;
      }
    } catch (autoErr) {
      logger.warn({ event: 'auto_process_warning', error: autoErr.message });
    }

    logger.info({
      event: 'external_request_received',
      requestId: request.id,
      employee: employeeName,
      source: 'ZB_SP',
      autoLinkedUser: !!autoCreated.linkedUserId,
      competenciesCreated: autoCreated.competencies.length,
    });

    res.status(201).json({
      status: 'success',
      data: {
        externalId: request.id,
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

// â”€â”€ GET /api/external/assessment-requests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/assessment-requests', async (req, res) => {
  try {
    const { status } = req.query;
    const where = {};
    if (status) where.status = status;

    const requests = await prisma.externalRequest.findMany({
      where,
      include: {
        linkedUser: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Load extras for each request
    for (const r of requests) {
      await loadRequestExtras(r);
    }

    // Batch-load linked assessment details
    const allLinkedIds = requests.flatMap(r => r.linkedAssessmentIds || []);
    const assessmentsMap = new Map();
    if (allLinkedIds.length > 0) {
      const assessments = await prisma.assessment.findMany({
        where: { id: { in: allLinkedIds } },
        include: { competency: { select: { name: true } } },
      });
      for (const a of assessments) {
        assessmentsMap.set(a.id, a);
      }
    }

    // Attach full linked assessment objects
    const result = requests.map(r => {
      const linkedAssessmentObjs = (r.linkedAssessmentIds || []).map(aid => {
        const a = assessmentsMap.get(aid);
        if (!a) return { _id: aid };
        return {
          _id: a.id,
          status: a.status,
          startDate: a.startDate,
          endDate: a.endDate,
          competencyId: a.competencyId,
          competency: a.competency,
        };
      });
      return { ...r, linkedAssessmentIds: r.linkedAssessmentIds, linkedAssessments: linkedAssessmentObjs };
    });

    res.status(200).json({ status: 'success', data: { requests: result } });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// â”€â”€ PATCH /api/external/assessment-requests/:id/mark-complete â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.patch('/assessment-requests/:id/mark-complete', async (req, res) => {
  try {
    const request = await prisma.externalRequest.findUnique({ where: { id: req.params.id } });
    if (!request) {
      return res.status(404).json({ status: 'fail', message: 'Request not found.' });
    }
    if (!request.linkedUserId) {
      return res.status(400).json({ status: 'fail', message: 'No user linked to this request yet. Make sure the employee has a ZB CAS account with a matching email.' });
    }

    const { scoreIndividual } = await import('../services/scoringService.js');

    // Step 1: Find ALL assessments this user has submitted responses for
    const allUserResponses = await prisma.response.findMany({
      where: {
        employeeId: request.linkedUserId,
        respondentType: 'self',
      },
      select: { assessmentId: true },
      distinct: ['assessmentId'],
    });

    const allUserResponseIds = allUserResponses.map(r => r.assessmentId);

    if (allUserResponseIds.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'The employee has not submitted any assessment answers yet.',
      });
    }

    // Step 2: Get those assessments with their competency names (exclude those with no competency)
    const userAssessments = await prisma.assessment.findMany({
      where: {
        id: { in: allUserResponseIds },
        competencyId: { not: null },
      },
      include: { competency: { select: { id: true, name: true, category: true } } },
    });

    const validAssessments = userAssessments.filter(a => a.competency?.name);

    // Step 3: Strictly filter to ONLY assessments matching this request's competencies
    const requestComps = await prisma.externalRequestCompetency.findMany({
      where: { externalRequestId: request.id },
    });
    const requestedComps = requestComps.map(c => stripLevel(c.name)) || [];
    let matchingAssessments = [];

    if (requestedComps.length > 0) {
      matchingAssessments = validAssessments.filter(a => {
        const compName = stripLevel(a.competency?.name);
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
        const result = await scoreIndividual(assessment.id, request.linkedUserId);
        if (result) scoredAssessments.push(assessment.id);
      } catch (scoreErr) {
        logger.warn({ event: 'auto_score_fail', assessmentId: assessment.id, error: scoreErr.message });
      }
    }

    // Step 5: Get all results for this user across matching assessments
    const matchingIds = matchingAssessments.map(a => a.id);
    const allResults = await prisma.result.findMany({
      where: {
        userId: request.linkedUserId,
        assessmentId: { in: matchingIds },
        status: 'FINAL',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (allResults.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Scoring was attempted but no results could be generated. The employee may need to complete all required questions first.',
      });
    }

    // Keep only the MOST RECENT result per competency
    const assessmentToComp = {};
    matchingAssessments.forEach(a => {
      assessmentToComp[a.id] = a.competency?.id || a.competencyId;
    });

    const latestResultsMap = new Map();
    for (const r of allResults) {
      const compId = assessmentToComp[r.assessmentId];
      if (compId && !latestResultsMap.has(compId)) {
        latestResultsMap.set(compId, r);
      }
    }

    // Step 6: Mark as completed and link the scored assessments
    const assessmentIdsWithResults = Array.from(latestResultsMap.values()).map(r => r.assessmentId);

    // Delete existing linked assessments then create new ones
    await prisma.externalRequestLinkedAssessment.deleteMany({
      where: { externalRequestId: request.id },
    });
    if (assessmentIdsWithResults.length > 0) {
      await prisma.externalRequestLinkedAssessment.createMany({
        data: assessmentIdsWithResults.map(aid => ({
          externalRequestId: request.id,
          assessmentId: aid,
        })),
      });
    }

    await prisma.externalRequest.update({
      where: { id: request.id },
      data: { status: 'COMPLETED' },
    });

    // Reconstruct extras for response
    await loadRequestExtras(request);

    logger.info({
      event: 'external_request_marked_complete',
      requestId: request.id,
      employee: request.employeeName,
      assessmentsScored: scoredAssessments.length,
      assessmentsLinked: assessmentIdsWithResults.length,
    });

    // Fire webhook to ZB SP
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
          externalId: request.id,
          employeeName: request.employeeName,
          positionTitle: request.positionTitle,
          event: 'MARKED_COMPLETE'
        })
      });
    } catch (whErr) {
      logger.error({ event: 'webhook_dispatch_error', error: whErr.message });
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


// â”€â”€ PATCH /api/external/assessment-requests/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.patch('/assessment-requests/:id', async (req, res) => {
  try {
    const request = await prisma.externalRequest.findUnique({ where: { id: req.params.id } });
    if (!request) {
      return res.status(404).json({ status: 'fail', message: 'Request not found.' });
    }

    const { status, linkedUserId, linkedAssessmentIds, notes } = req.body;

    const updateData = {};
    if (status) updateData.status = status;
    if (linkedUserId) updateData.linkedUserId = linkedUserId;
    if (notes !== undefined) updateData.notes = notes;

    await prisma.externalRequest.update({
      where: { id: request.id },
      data: updateData,
    });

    // Handle linkedAssessmentIds junction persistence
    if (linkedAssessmentIds && Array.isArray(linkedAssessmentIds)) {
      const existing = await prisma.externalRequestLinkedAssessment.findMany({
        where: { externalRequestId: request.id },
        select: { assessmentId: true },
      });
      const existingIds = existing.map(e => e.assessmentId);
      const newIds = linkedAssessmentIds.filter(id => !existingIds.includes(id));
      if (newIds.length > 0) {
        await prisma.externalRequestLinkedAssessment.createMany({
          data: newIds.map(aid => ({
            externalRequestId: request.id,
            assessmentId: aid,
          })),
        });
      }
    }

    // Reconstruct extras for response
    await loadRequestExtras(request);

    // Fire webhook to ZB SP if it was marked as completed
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
            externalId: request.id,
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

// â”€â”€ GET /api/external/assessment-requests/:id/user-results â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/assessment-requests/:id/user-results', async (req, res) => {
  try {
    const request = await prisma.externalRequest.findUnique({ where: { id: req.params.id } });
    if (!request) {
      return res.status(404).json({ status: 'fail', message: 'Request not found.' });
    }
    if (!request.linkedUserId) {
      return res.status(200).json({ status: 'success', data: { assessments: [] } });
    }

    const { scoreIndividual } = await import('../services/scoringService.js');

    // Step 1: Find ALL assessments this user has submitted responses for
    const userAssessmentRows = await prisma.response.findMany({
      where: {
        employeeId: request.linkedUserId,
        respondentType: 'self',
      },
      select: { assessmentId: true },
      distinct: ['assessmentId'],
    });

    const userAssessmentIds = userAssessmentRows.map(r => r.assessmentId);

    if (userAssessmentIds.length === 0) {
      return res.status(200).json({ status: 'success', data: { assessments: [] } });
    }

    // Step 2: Get those assessments with competency info
    const userAssessments = await prisma.assessment.findMany({
      where: {
        id: { in: userAssessmentIds },
        competencyId: { not: null },
      },
      include: { competency: { select: { id: true, name: true, category: true } } },
    });

    const validAssessments = userAssessments.filter(a => a.competency?.name);

    // Step 3: Filter to only assessments matching this request's competencies
    const requestComps = await prisma.externalRequestCompetency.findMany({
      where: { externalRequestId: request.id },
    });
    const requestedComps = requestComps.map(c => stripLevel(c.name)) || [];
    let matchingAssessments = [];

    if (requestedComps.length > 0) {
      matchingAssessments = validAssessments.filter(a => {
        const compName = stripLevel(a.competency?.name);
        return requestedComps.some(rc =>
          compName.includes(rc) || rc.includes(compName)
        );
      });
    }

    // Step 4: Auto-score matching assessments
    for (const assessment of matchingAssessments) {
      try {
        await scoreIndividual(assessment.id, request.linkedUserId);
      } catch (e) {
        // Non-fatal
      }
    }

    // Step 5: Fetch results
    const matchingIds = matchingAssessments.map(a => a.id);
    const allResults = await prisma.result.findMany({
      where: {
        userId: request.linkedUserId,
        assessmentId: { in: matchingIds },
        status: 'FINAL',
      },
      include: {
        assessment: {
          select: {
            id: true,
            status: true,
            startDate: true,
            endDate: true,
            competencyId: true,
            competency: { select: { id: true, name: true, category: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Keep only the MOST RECENT result per competency
    const latestResultsMap = new Map();
    for (const r of allResults) {
      if (!r.assessment || !r.assessment.competency) continue;
      const compId = r.assessment.competency.id;
      if (!latestResultsMap.has(compId)) {
        latestResultsMap.set(compId, r);
      }
    }
    const results = Array.from(latestResultsMap.values());

    // Group by assessment
    const assessmentMap = {};
    results.forEach(r => {
      const aId = r.assessment?.id;
      if (!aId) return;
      if (!assessmentMap[aId]) {
        assessmentMap[aId] = {
          _id: aId,
          competencyName: r.assessment?.competency?.name || 'Unknown',
          category: r.assessment?.competency?.category || '',
          status: r.assessment?.status,
          startDate: r.assessment?.startDate,
          endDate: r.assessment?.endDate,
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

// â”€â”€ GET /api/external/assessment-results/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/assessment-results/:id', async (req, res) => {
  try {
    const rawRequest = await prisma.externalRequest.findUnique({
      where: { id: req.params.id },
      include: {
        linkedUser: { select: { id: true, name: true, email: true } },
      },
    });

    if (!rawRequest) {
      return res.status(404).json({ status: 'fail', message: 'External request not found.' });
    }

    // Load extras
    const request = await loadRequestExtras(rawRequest);

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

    // Fetch results from ALL linked assessments for this user
    const resultWhere = {
      assessmentId: { in: request.linkedAssessmentIds },
    };
    if (request.linkedUserId) {
      resultWhere.userId = request.linkedUserId;
    }

    const allResults = await prisma.result.findMany({
      where: { ...resultWhere, status: 'FINAL' },
      orderBy: { createdAt: 'desc' },
      include: {
        competency: { select: { id: true, name: true, category: true } },
      },
    });

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

    // Keep only the MOST RECENT result per competency
    const latestResultsMap = new Map();
    for (const r of allResults) {
      if (!r.competency) continue;
      const compIdStr = r.competency.id;
      if (!latestResultsMap.has(compIdStr)) {
        latestResultsMap.set(compIdStr, r);
      }
    }

    // Map ZB CAS results to the format ZB_SP expects
    const competencies = Array.from(latestResultsMap.values()).map((r) => {
      const scoreDet = r.scoreDetails || {};
      const qDetails = scoreDet.questionDetails || [];
      const totalQuestions = qDetails.length;
      const correctAnswers = qDetails.filter(q => q.isCorrect).length;
      const totalScore = qDetails.reduce((s, q) => s + (q.scoreAwarded || 0), 0);
      const maxPossibleScore = qDetails.reduce((s, q) => s + (q.maxScore || 0), 0);

      return {
        name: r.competency?.name || 'Unknown',
        category: r.competency?.category || 'General',
        level: r.level,
        score: r.finalScore,
        selfScore: scoreDet.selfScore || null,
        supervisorScore: scoreDet.supervisorScore || null,
        totalQuestions,
        correctAnswers,
        totalScore,
        maxPossibleScore,
      };
    });

    // Auto-update request status to SYNCED
    await prisma.externalRequest.update({
      where: { id: req.params.id },
      data: { status: 'SYNCED' },
    });

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

// â”€â”€ POST /api/external/assessment-requests/:id/link-user â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/assessment-requests/:id/link-user', async (req, res) => {
  try {
    const request = await prisma.externalRequest.findUnique({ where: { id: req.params.id } });
    if (!request) return res.status(404).json({ status: 'fail', message: 'Request not found.' });

    if (request.linkedUserId) {
      return res.status(400).json({ status: 'fail', message: 'Request is already linked to a user.' });
    }

    const user = await prisma.user.findUnique({ where: { email: request.employeeEmail.toLowerCase() } });

    if (!user) {
      return res.status(404).json({
        status: 'fail',
        message: `No ZB CAS user found with email ${request.employeeEmail}. Please create the user first.`
      });
    }

    await prisma.externalRequest.update({
      where: { id: request.id },
      data: { linkedUserId: user.id },
    });

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

// â”€â”€ POST /api/external/assessment-requests/:id/create-competencies â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/assessment-requests/:id/create-competencies', async (req, res) => {
  try {
    const request = await prisma.externalRequest.findUnique({ where: { id: req.params.id } });
    if (!request) {
      return res.status(404).json({ status: 'fail', message: 'Request not found.' });
    }

    const comps = await prisma.externalRequestCompetency.findMany({
      where: { externalRequestId: request.id },
    });

    if (!comps.length) {
      return res.status(400).json({ status: 'fail', message: 'No competencies in this request.' });
    }

    const created = [];
    const skipped = [];

    for (const comp of comps) {
      const rawCategory = TYPE_TO_CATEGORY[(comp.type || 'TECHNICAL').toUpperCase()] || 'Technical';
      const category = CATEGORY_TO_ENUM[rawCategory] || rawCategory;
      const existing = await prisma.competency.findFirst({
        where: { name: comp.name, category },
      });
      if (existing) { skipped.push(comp.name); continue; }

      try {
        const tgForCompetency = extTgToTg(comp.targetGroup);
        const newComp = await prisma.competency.create({
          data: {
            name: comp.name,
            category,
            targetGroups: {
              create: [{
                targetGroup: tgForCompetency,
                description: `Auto-created from ZB SP request for ${request.positionTitle}`,
              }],
            },
          },
        });
        created.push(newComp.name);
      } catch (err) {
        skipped.push(comp.name);
      }
    }

    logger.info({ event: 'competencies_created_from_request', requestId: request.id, created: created.length, skipped: skipped.length });

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

// â”€â”€ DELETE /api/external/assessment-requests/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.delete('/assessment-requests/:id', async (req, res) => {
  try {
    const request = await prisma.externalRequest.findUnique({ where: { id: req.params.id } });
    if (!request) {
      return res.status(404).json({ status: 'fail', message: 'Request not found.' });
    }

    await prisma.externalRequest.delete({ where: { id: req.params.id } });

    logger.info({ event: 'external_request_deleted', requestId: req.params.id });

    res.status(200).json({ status: 'success', message: 'Assessment request deleted successfully.' });
  } catch (error) {
    logger.error({ event: 'delete_request_error', error: error.message });
    res.status(500).json({ status: 'error', message: error.message });
  }
});

export default router;
