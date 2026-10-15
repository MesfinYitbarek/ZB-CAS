/* services/assessmentMetaCache.js
 *
 * 60s TTL cache of an assessment's question IDs, used by the auto-save hot
 * path (saveAnswer). Loading the full question list on every 600ms-debounced
 * answer save was the single largest source of wasted DB work at scale.
 *
 * Why this is safe:
 *  - Question sets are immutable while an assessment is ACTIVE (the edit
 *    form only allows DRAFT), and saves are only accepted while ACTIVE.
 *  - Assessment STATUS is deliberately NOT cached here — callers must read
 *    it live so the SCHEDULED->ACTIVE->COMPLETED transitions stay exact.
 *  - Worst-case staleness is TTL_MS (a question deleted mid-assessment keeps
 *    passing the membership check for <=60s, then fails cleanly).
 *
 * The app is single-process (in-memory scheduler timers and rate-limit
 * store — see schedulerService/security.js), so a plain Map is correct.
 */
import prisma from '../config/prisma.js';

const TTL_MS = 60_000;
const cache = new Map(); // assessmentId -> { questionIds: string[], fetchedAt: number }

/**
 * Returns the assessment's question ID list (cached up to 60s), or null if
 * the assessment does not exist.
 */
export const getCachedQuestionIds = async (assessmentId) => {
  const key = String(assessmentId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.fetchedAt < TTL_MS) return hit.questionIds;

  const row = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { assessmentQuestions: { select: { questionId: true } } },
  });
  if (!row) {
    cache.delete(key);
    return null;
  }

  const entry = {
    questionIds: row.assessmentQuestions.map((aq) => aq.questionId),
    fetchedAt: Date.now(),
  };
  cache.set(key, entry);
  return entry.questionIds;
};

/** Drop the cached entry (e.g. after an admin edits an ACTIVE assessment). */
export const invalidateAssessmentMeta = (assessmentId) => {
  cache.delete(String(assessmentId));
};
