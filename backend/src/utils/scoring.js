import logger from '../utils/logger.js';
/* utils/scoring.js */

/**
 * Master Scoring Logic for all Question Types
 * UPDATED: Now captures per-question details for result storage
 */

/**
 * Extract the correct answer from a question for display purposes
 */
const getCorrectAnswer = (question) => {
    const type = (question.type || '').toLowerCase();
    switch (type) {
        case 'mcq':
        case 'scenariomcq':
        case 'truefalse':
            return question.correctAnswer;
        case 'multiselect':
            return question.correctAnswers || [];
        case 'matching':
            return question.matchingPairs || [];
        case 'ordering':
            return question.correctOrder || [];
        case 'dragdropclassification':
            return question.categories || {};
        case 'rating':
            return '5 (max rating)';
        case 'shortanswer':
            return question.correctAnswer || 'Manual grading required';
        default:
            return null;
    }
};

const scoreSingleResponse = (question, response) => {
    const type = (question.type || '').toLowerCase();
    const maxScore = Number(question.score) || 1;
    let awarded = 0;

    switch (type) {
        // --- Single Match Types ---
        case 'mcq':
        case 'scenariomcq':
        case 'truefalse':
            awarded = response.selectedAnswer === question.correctAnswer ? maxScore : 0;
            return awarded;

        // --- Proportional Types ---
        case 'rating':
            const rating = Number(response.selectedAnswer) || 0;
            awarded = (Math.min(Math.max(rating, 1), 5) / 5) * maxScore;
            return awarded;

        // --- Partial Credit: Hits minus Misses ---
        case 'multiselect': {
            const correctSet = new Set(question.correctAnswers || []);

            // Handle both array and object formats
            let selectedArray = [];
            if (Array.isArray(response.selectedAnswer)) {
                selectedArray = response.selectedAnswer;
            } else if (response.selectedAnswer && typeof response.selectedAnswer === 'object') {
                selectedArray = Object.values(response.selectedAnswer).filter(Boolean);
            }

            const selectedSet = new Set(selectedArray);
            let hits = 0, misses = 0;

            selectedSet.forEach(s => correctSet.has(s) ? hits++ : misses++);

            // Avoid negative scores
            const netCorrect = Math.max(0, hits - misses);
            awarded = correctSet.size > 0 ? (netCorrect / correctSet.size) * maxScore : 0;
            return awarded;
        }

        // --- Partial Credit: Per correct pair ---
        case 'matching': {
            const pairs = question.matchingPairs || [];
            if (pairs.length === 0) return 0;

            let correctCount = 0;
            const userPairs = response.selectedAnswer || {};

            pairs.forEach(({ left, right }) => {
                if (userPairs[left] === right) correctCount++;
            });

            awarded = (correctCount / pairs.length) * maxScore;
            return awarded;
        }

        // --- Partial Credit: Per correct position ---
        case 'ordering': {
            const correctOrder = question.correctOrder || [];
            if (correctOrder.length === 0) return 0;

            // The take-assessment UI stores answers as {item: rank}, so invert
            // to a rank-indexed array before comparing positions. (Comparing
            // raw Object.values — ranks — against item texts always scored 0.)
            let userAtRank = [];
            const ans = response.selectedAnswer;
            if (Array.isArray(ans)) {
                userAtRank = ans;
            } else if (ans && typeof ans === 'object') {
                Object.entries(ans).forEach(([item, rank]) => {
                    const r = Number(rank);
                    if (Number.isInteger(r) && r >= 1 && r <= correctOrder.length) {
                        userAtRank[r - 1] = item;
                    }
                });
            }

            let correctPos = 0;
            for (let i = 0; i < correctOrder.length; i++) {
                if (userAtRank[i] !== undefined && userAtRank[i] === correctOrder[i]) correctPos++;
            }

            awarded = (correctPos / correctOrder.length) * maxScore;
            return awarded;
        }

        // --- Partial Credit: Per correctly classified item ---
        case 'dragdropclassification': {
            const cats = question.categories || {};
            const categoryNames = Object.keys(cats);
            if (categoryNames.length === 0) return 0;

            let totalItems = 0, classificationHits = 0;
            const userAnswer = response.selectedAnswer || {};

            // --- Convert {item: category} to {category: [items]} ---
            const userCategories = {};
            categoryNames.forEach(cat => userCategories[cat] = []);
            Object.entries(userAnswer).forEach(([item, cat]) => {
                if (userCategories[cat]) userCategories[cat].push(item);
            });

            // --- Score ---
            Object.entries(cats).forEach(([catName, items]) => {
                totalItems += items.length;
                const userItems = userCategories[catName] || [];
                userItems.forEach(item => {
                    if (items.includes(item)) classificationHits++;
                });
            });

            awarded = totalItems > 0 ? (classificationHits / totalItems) * maxScore : 0;
            return awarded;
        }

        case 'shortanswer':
            awarded = Math.min(Math.max(Number(response.manualScore) || 0, 0), maxScore);
            return awarded;

        default:
            return 0;
    }
};

/**
 * UPDATED: Now returns questionDetails array alongside rawScore and percentage
 * Each question detail includes: questionId, text, type, options, user answer,
 * correct answer, score awarded, max score, and correctness status
 */
const computeRawScore = (questions, responses) => {
    let rawScore = 0, totalPossible = 0;
    const questionDetails = [];

    questions.forEach((q, idx) => {
        const resp = responses.find(r => r.questionId?.toString() === q._id.toString());
        const points = Number(q.score) || 1;
        totalPossible += points;

        const type = (q.type || '').toLowerCase();

        const detail = {
            questionId: q._id,
            questionNumber: idx + 1,
            questionText: q.questionText || q.text || q.question || `Question ${idx + 1}`,
            questionType: q.type || 'Unknown',
            maxScore: points,
            options: q.options || q.choices || [],
            userAnswer: null,
            correctAnswer: getCorrectAnswer(q),
            scoreAwarded: 0,
            scorePercentage: 0,
            isCorrect: false,
            isPartial: false,
            isUnanswered: true
        };

        if (!resp || resp.selectedAnswer === null || resp.selectedAnswer === undefined) {
            // unanswered
        } else {
            const scoreEarned = scoreSingleResponse(q, resp);
            rawScore += scoreEarned;

            detail.userAnswer = resp.selectedAnswer;
            detail.scoreAwarded = Number(scoreEarned.toFixed(2));
            detail.scorePercentage = points > 0
                ? Number(((scoreEarned / points) * 100).toFixed(2))
                : 0;

            detail.isCorrect = scoreEarned >= points;
            detail.isPartial = scoreEarned > 0 && scoreEarned < points;
            detail.isUnanswered = false;
        }

        questionDetails.push(detail);
    });

    const percentage = totalPossible === 0
        ? 0
        : (rawScore / totalPossible) * 100;

    // ✅ Round final values to 2 decimals
    const roundedRawScore = Number(rawScore.toFixed(2));
    const roundedPercentage = Number(percentage.toFixed(2));

    return {
        rawScore: roundedRawScore,
        percentage: roundedPercentage,
        questionDetails
    };
};

const computeWeightedScore = (selfPerc, supPerc, weights) => {
    let sW = Number(weights?.selfAssessment ?? 20);
    let vW = Number(weights?.supervisor ?? 80);

    const total = sW + vW;

    // Normalize if weights don't sum to 100
    if (total !== 100 && total > 0) {
        sW = (sW / total) * 100;
        vW = (vW / total) * 100;
    }

    const final = (selfPerc * sW / 100) + (supPerc * vW / 100);



    return Number(final.toFixed(2));
};

export const LEVEL_THRESHOLDS = { Expert: 80, Advanced: 60, Intermediate: 40 };

const assignLevel = (percentage) => {
    if (percentage >= LEVEL_THRESHOLDS.Expert) return 'Expert';
    if (percentage >= LEVEL_THRESHOLDS.Advanced) return 'Advanced';
    if (percentage >= LEVEL_THRESHOLDS.Intermediate) return 'Intermediate';
    return 'Basic';
};

export { scoreSingleResponse, computeRawScore, computeWeightedScore, assignLevel, getCorrectAnswer };
