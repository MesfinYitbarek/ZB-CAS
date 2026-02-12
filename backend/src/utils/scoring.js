/**
 * Master Scoring Logic for all Question Types
 */
const scoreSingleResponse = (question, response) => {
    const type = (question.type || '').toLowerCase();
    const maxScore = Number(question.score) || 1;
    let awarded = 0;

    // respondentType check is handled by controller; here we focus on the math
    switch (type) {
        // --- Single Match Types ---
        case 'mcq':
        case 'scenariomcq':
        case 'truefalse':
            awarded = response.selectedAnswer === question.correctAnswer ? maxScore : 0;
            console.log(`      [Q-LOG] ${type.toUpperCase()}: User='${response.selectedAnswer}' | Correct='${question.correctAnswer}' -> Score: ${awarded}/${maxScore}`);
            return awarded;

        // --- Proportional Types ---
        case 'rating':
            const rating = Number(response.selectedAnswer) || 0;
            awarded = (Math.min(Math.max(rating, 1), 5) / 5) * maxScore;
            console.log(`      [Q-LOG] RATING: User='${rating}/5' -> Score: ${awarded}/${maxScore}`);
            return awarded;

        // --- Partial Credit: Hits minus Misses ---
        case 'multiselect':
            const correctSet = new Set(question.correctAnswers || []);
            const selectedSet = new Set(Array.isArray(response.selectedAnswers) ? response.selectedAnswers : []);
            let hits = 0, misses = 0;
            selectedSet.forEach(s => correctSet.has(s) ? hits++ : misses++);
            awarded = (Math.max(0, hits - misses) / Math.max(correctSet.size, 1)) * maxScore;
            console.log(`      [Q-LOG] MULTI: Hits:${hits} Misses:${misses} | TotalCorrect:${correctSet.size} -> Score: ${awarded.toFixed(2)}`);
            return awarded;

        // --- Partial Credit: Per correct pair ---
        case 'matching':
            const pairs = question.matchingPairs || [];
            let correctCount = 0;
            pairs.forEach(({ left, right }) => { 
                if (response.selectedPairs?.[left] === right) correctCount++; 
            });
            awarded = pairs.length === 0 ? 0 : (correctCount / pairs.length) * maxScore;
            console.log(`      [Q-LOG] MATCHING: ${correctCount}/${pairs.length} pairs correct -> Score: ${awarded.toFixed(2)}`);
            return awarded;

        // --- Partial Credit: Per correct position ---
        case 'ordering':
            const correctOrder = question.correctOrder || [];
            const userOrder = Array.isArray(response.selectedOrder) ? response.selectedOrder : [];
            let correctPos = 0;
            for (let i = 0; i < Math.min(correctOrder.length, userOrder.length); i++) {
                if (userOrder[i] === correctOrder[i]) correctPos++;
            }
            awarded = correctOrder.length === 0 ? 0 : (correctPos / correctOrder.length) * maxScore;
            console.log(`      [Q-LOG] ORDERING: ${correctPos}/${correctOrder.length} in correct sequence -> Score: ${awarded.toFixed(2)}`);
            return awarded;

        // --- Partial Credit: Per correctly classified item ---
        case 'dragdropclassification':
            const cats = question.categories || {};
            let totalItems = 0, classificationHits = 0;
            Object.entries(cats).forEach(([catName, items]) => {
                totalItems += items.length;
                const userItems = response.selectedCategories?.[catName] || [];
                userItems.forEach(item => {
                    if (items.includes(item)) classificationHits++;
                });
            });
            awarded = totalItems === 0 ? 0 : (classificationHits / totalItems) * maxScore;
            console.log(`      [Q-LOG] DRAGDROP: ${classificationHits}/${totalItems} items correctly classified -> Score: ${awarded.toFixed(2)}`);
            return awarded;

        case 'shortanswer':
            awarded = Math.min(Math.max(Number(response.manualScore) || 0, 0), maxScore);
            console.log(`      [Q-LOG] SHORT-ANSWER: Manual Score assigned: ${awarded}`);
            return awarded;

        default:
            console.log(`      [Q-LOG] ERROR: Unknown type ${type}`);
            return 0;
    }
};

const computeRawScore = (questions, responses) => {
    let rawScore = 0, totalPossible = 0;
    console.log(`   --- Question-by-Question Breakdown ---`);
    questions.forEach((q, idx) => {
        const resp = responses.find(r => r.questionId?.toString() === q._id.toString());
        const points = Number(q.score) || 1;
        totalPossible += points;
        if (!resp) {
            console.log(`      [Q${idx + 1}] UNANSWERED. Points possible: ${points} | Awarded: 0`);
        } else {
            process.stdout.write(`      [Q${idx + 1}] `);
            rawScore += scoreSingleResponse(q, resp);
        }
    });
    const percentage = totalPossible === 0 ? 0 : (rawScore / totalPossible) * 100;
    console.log(`   --- Totals: ${rawScore.toFixed(2)} / ${totalPossible} (${percentage.toFixed(2)}%) ---`);
    return { rawScore, percentage };
};

const computeWeightedScore = (selfPerc, supPerc, weights) => {
    let sW = Number(weights?.selfAssessment ?? 20);
    let vW = Number(weights?.supervisor ?? 80);
    const total = sW + vW;
    if (total !== 100 && total > 0) { // Normalize if admin entered wrong values
        sW = (sW / total) * 100;
        vW = (vW / total) * 100;
    }
    const final = (selfPerc * sW / 100) + (supPerc * vW / 100);
    return Number(final.toFixed(2));
};

const assignLevel = (percentage) => {
    if (percentage >= 80) return 'Expert';
    if (percentage >= 60) return 'Advanced';
    if (percentage >= 40) return 'Intermediate';
    return 'Basic';
};

export { scoreSingleResponse, computeRawScore, computeWeightedScore, assignLevel };
