/* utils/scoring.js */

/**
 * Master Scoring Logic for all Question Types
 */
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
            console.log(`      [Q-LOG] ${type.toUpperCase()}: User='${response.selectedAnswer}' | Correct='${question.correctAnswer}' -> Score: ${awarded}/${maxScore}`);
            return awarded;

        // --- Proportional Types ---
        case 'rating':
            const rating = Number(response.selectedAnswer) || 0;
            awarded = (Math.min(Math.max(rating, 1), 5) / 5) * maxScore;
            console.log(`      [Q-LOG] RATING: User='${rating}/5' -> Score: ${awarded.toFixed(2)}/${maxScore}`);
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
            
            console.log(`      [Q-LOG] MULTI: Hits:${hits} Misses:${misses} | TotalCorrect:${correctSet.size} -> Score: ${awarded.toFixed(2)}/${maxScore}`);
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
            console.log(`      [Q-LOG] MATCHING: ${correctCount}/${pairs.length} pairs correct -> Score: ${awarded.toFixed(2)}/${maxScore}`);
            return awarded;
        }

        // --- Partial Credit: Per correct position ---
        case 'ordering': {
            const correctOrder = question.correctOrder || [];
            if (correctOrder.length === 0) return 0;
            
            // Handle both array and object formats
            let userOrder = [];
            if (Array.isArray(response.selectedAnswer)) {
                userOrder = response.selectedAnswer;
            } else if (response.selectedAnswer && typeof response.selectedAnswer === 'object') {
                userOrder = Object.values(response.selectedAnswer);
            }
            
            let correctPos = 0;
            for (let i = 0; i < Math.min(correctOrder.length, userOrder.length); i++) {
                if (userOrder[i] === correctOrder[i]) correctPos++;
            }
            
            awarded = (correctPos / correctOrder.length) * maxScore;
            console.log(`      [Q-LOG] ORDERING: ${correctPos}/${correctOrder.length} in correct sequence -> Score: ${awarded.toFixed(2)}/${maxScore}`);
            return awarded;
        }

        // --- Partial Credit: Per correctly classified item ---
        case 'dragdropclassification': {
            const cats = question.categories || {};
            const categoryNames = Object.keys(cats);
            if (categoryNames.length === 0) return 0;
            
            let totalItems = 0, classificationHits = 0;
            const userCategories = response.selectedAnswer || {};
            
            Object.entries(cats).forEach(([catName, items]) => {
                totalItems += items.length;
                const userItems = userCategories[catName] || [];
                
                userItems.forEach(item => {
                    if (items.includes(item)) classificationHits++;
                });
            });
            
            awarded = totalItems > 0 ? (classificationHits / totalItems) * maxScore : 0;
            console.log(`      [Q-LOG] DRAGDROP: ${classificationHits}/${totalItems} items correctly classified -> Score: ${awarded.toFixed(2)}/${maxScore}`);
            return awarded;
        }

        case 'shortanswer':
            awarded = Math.min(Math.max(Number(response.manualScore) || 0, 0), maxScore);
            console.log(`      [Q-LOG] SHORT-ANSWER: Manual Score assigned: ${awarded}/${maxScore}`);
            return awarded;

        default:
            console.log(`      [Q-LOG] ⚠️ UNKNOWN TYPE: ${type}`);
            return 0;
    }
};

const computeRawScore = (questions, responses) => {
    let rawScore = 0, totalPossible = 0;
    
    console.log(`\n   ╔═══ Question-by-Question Breakdown ═══╗`);
    
    questions.forEach((q, idx) => {
        const resp = responses.find(r => r.questionId?.toString() === q._id.toString());
        const points = Number(q.score) || 1;
        totalPossible += points;
        
        if (!resp || resp.selectedAnswer === null || resp.selectedAnswer === undefined) {
            console.log(`   ║ [Q${idx + 1}] ⊘ UNANSWERED | Possible: ${points} | Awarded: 0`);
        } else {
            const scoreEarned = scoreSingleResponse(q, resp);
            rawScore += scoreEarned;
        }
    });
    
    const percentage = totalPossible === 0 ? 0 : (rawScore / totalPossible) * 100;
    
    console.log(`   ╠═══════════════════════════════════════╣`);
    console.log(`   ║ TOTALS: ${rawScore.toFixed(2)} / ${totalPossible} (${percentage.toFixed(2)}%)`);
    console.log(`   ╚═══════════════════════════════════════╝\n`);
    
    return { rawScore, percentage };
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
    
    console.log(`   [WEIGHT] Self: ${selfPerc.toFixed(2)}% × ${sW.toFixed(0)}% = ${(selfPerc * sW / 100).toFixed(2)}`);
    console.log(`   [WEIGHT] Supervisor: ${supPerc.toFixed(2)}% × ${vW.toFixed(0)}% = ${(supPerc * vW / 100).toFixed(2)}`);
    console.log(`   [WEIGHT] Final Weighted Score: ${final.toFixed(2)}%`);
    
    return Number(final.toFixed(2));
};

const assignLevel = (percentage) => {
    if (percentage >= 80) return 'Expert';
    if (percentage >= 60) return 'Advanced';
    if (percentage >= 40) return 'Intermediate';
    return 'Basic';
};

export { scoreSingleResponse, computeRawScore, computeWeightedScore, assignLevel };