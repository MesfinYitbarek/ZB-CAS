// utils/scoring.js

// ─── score a single response ─────────────────────────────────────────────────
const scoreSingleResponse = (question, response) => {
  const type = (question.type || '').toLowerCase();

  switch (type) {
    case 'mcq':
    case 'truefalse':
      return response.selectedAnswer === question.correctAnswer ? 1 : 0;

    case 'rating':
      const rating = Number(response.selectedAnswer);
      return !isNaN(rating) ? Math.min(Math.max(rating, 1), 5) : 0;

    case 'shortanswer':
      const manualScore = Number(response.manualScore);
      return !isNaN(manualScore) ? manualScore : 0;

    default:
      return 0;
  }
};

// ─── compute raw score → ALWAYS returns percentage 0–100 ────────────────────
const computeRawScore = (questions, responses) => {
  let rawScore = 0;
  let totalPossible = 0;

  questions.forEach((q) => {
    const resp = responses.find(
      (r) =>
        r.questionId &&
        q._id &&
        r.questionId.toString() === q._id.toString()
    );

    const qType = (q.type || '').toLowerCase();
    const maxForQuestion = qType === 'rating' ? 5 : 1;

    totalPossible += maxForQuestion;

    if (!resp) return; // unanswered → 0
    rawScore += scoreSingleResponse(q, resp);
  });

  if (totalPossible === 0) {
    return { rawScore: 0, totalPossible: 0, percentage: 0 };
  }

  // 🔒 Explicit rule: 1 question, 1 correct = 100%
  const percentage =
    totalPossible === 1
      ? rawScore === 1 ? 100 : 0
      : (rawScore / totalPossible) * 100;

  return {
    rawScore,
    totalPossible,
    percentage: Number(percentage.toFixed(2)),
  };
};

// ─── combine self + supervisor using WEIGHTS (NO double normalization) ───────
const computeWeightedScore = (selfPercentage, supervisorPercentage, weights) => {
  const selfPerc = Number(selfPercentage) || 0;
  const supPerc  = Number(supervisorPercentage) || 0;

  let selfWeight = Number(weights?.selfAssessment ?? 20);
  let supWeight  = Number(weights?.supervisor ?? 80);

  // 🔒 Normalize weights so they always sum to 100
  const totalWeight = selfWeight + supWeight;
  if (totalWeight > 0 && totalWeight !== 100) {
    selfWeight = (selfWeight / totalWeight) * 100;
    supWeight  = (supWeight / totalWeight) * 100;
  }

  const final =
    (selfPerc * selfWeight) / 100 +
    (supPerc * supWeight) / 100;

  return Math.min(100, Math.max(0, Number(final.toFixed(2))));
};

// ─── competency level ────────────────────────────────────────────────────────
const assignLevel = (percentage) => {
  const perc = Number(percentage) || 0;
  if (perc >= 80) return 'Expert';
  if (perc >= 60) return 'Advanced';
  if (perc >= 40) return 'Intermediate';
  return 'Basic';
};

module.exports = {
  scoreSingleResponse,
  computeRawScore,
  computeWeightedScore,
  assignLevel,
};
