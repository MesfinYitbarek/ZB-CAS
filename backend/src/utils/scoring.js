/* utils/scoring.js
 * Pure-function scoring engine.
 * Supports every question type the doc requires while keeping scoring
 * deterministic so it can be automated (OWASP: no eval / dynamic execution).
 *
 * Question types and their scoring logic:
 *   MCQ          – 1 point if selectedAnswer === correctAnswer, else 0
 *   Rating       – value IS the score (1-5 scale)
 *   TrueFalse    – 1 point if selectedAnswer === correctAnswer, else 0
 *   ShortAnswer  – score must be set manually (defaults to 0 until reviewed)
 *
 * Weighting:
 *   Combined assessments blend self + supervisor scores by configured weights.
 *
 * Level assignment (after final score is computed as a percentage):
 *   0  – 39  → Basic
 *   40 – 59  → Intermediate
 *   60 – 79  → Advanced
 *   80 – 100 → Expert
 */

// ─── score a single response ─────────────────────────────────────────────────
const scoreSingleResponse = (question, response) => {
  const type = (question.type || '').toLowerCase();

  switch (type) {
    case 'mcq':
    case 'truefalse':
      return response.selectedAnswer === question.correctAnswer ? 1 : 0;

    case 'rating':
      // Rating value (1-5) is the raw score; normalised later.
      return typeof response.selectedAnswer === 'number'
        ? Math.min(Math.max(response.selectedAnswer, 1), 5)   // clamp 1-5
        : 0;

    case 'shortanswer':
      // Manual review only – return existing manualScore or 0.
      return typeof response.manualScore === 'number' ? response.manualScore : 0;

    default:
      return 0;
  }
};

// ─── compute total raw score for a set of responses ─────────────────────────
// questions : [{ type, correctAnswer, maxScore? }]
// responses : [{ questionId, selectedAnswer, manualScore? }]
// Returns { rawScore, totalPossible, percentage }
const computeRawScore = (questions, responses) => {
  let rawScore      = 0;
  let totalPossible = 0;

  questions.forEach((q) => {
    const resp = responses.find(
      (r) => r.questionId && q._id && r.questionId.toString() === q._id.toString()
    );

    if (!resp) return;   // unanswered → 0

    const qType = (q.type || '').toLowerCase();
    const maxForQuestion = qType === 'rating' ? 5 : 1;   // rating scale max
    totalPossible += maxForQuestion;
    rawScore += scoreSingleResponse(q, resp);
  });

  const percentage = totalPossible > 0
    ? parseFloat(((rawScore / totalPossible) * 100).toFixed(2))
    : 0;

  return { rawScore, totalPossible, percentage };
};

// ─── blend self + supervisor scores with configured weights ─────────────────
// selfPercentage       : number 0-100
// supervisorPercentage : number 0-100
// weights              : { self: number, supervisor: number } must sum ≤ 100
const computeWeightedScore = (selfPercentage, supervisorPercentage, weights) => {
  const selfW = weights.self / 100;
  const supW  = weights.supervisor / 100;

  const blended = (selfPercentage * selfW) + (supervisorPercentage * supW);
  return parseFloat(blended.toFixed(2));
};

// ─── assign competency level from a final percentage ─────────────────────────
const assignLevel = (percentage) => {
  if (percentage >= 80) return 'Expert';
  if (percentage >= 60) return 'Advanced';
  if (percentage >= 40) return 'Intermediate';
  return 'Basic';
};

module.exports = {
  scoreSingleResponse,
  computeRawScore,
  computeWeightedScore,
  assignLevel,
};
