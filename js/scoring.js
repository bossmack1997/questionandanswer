/**
 * SCORING & GAMIFICATION ENGINE — ENGLISH QUEST
 * Academic scoring and gamified 5-Tier achievement calculations
 */

const ScoringEngine = {
    TOTAL_QUESTIONS: 32,
    TASK_COUNTS: {
        task1: 10,
        task2: 10,
        task3: 12
    },
    XP_PER_CORRECT: 10,

    // Calculate score breakdown and totals
    calculateScores(answers, masterBank) {
        const breakdown = {
            task1: { score: 0, total: 10, correct: 0, wrong: 0 },
            task2: { score: 0, total: 10, correct: 0, wrong: 0 },
            task3: { score: 0, total: 12, correct: 0, wrong: 0 },
            totalScore: 0,
            totalPossible: 32,
            totalCorrect: 0,
            totalWrong: 0,
            percentage: 0,
            earnedXP: 0
        };

        if (!answers || !masterBank) return breakdown;

        // Iterate through all tasks
        ['task1', 'task2', 'task3'].forEach(taskKey => {
            const taskQuestions = masterBank[taskKey] || [];
            taskQuestions.forEach(q => {
                const userChoiceId = answers[q.question_id];
                if (userChoiceId) {
                    const isCorrect = userChoiceId === q.correct_option_id;
                    if (isCorrect) {
                        breakdown[taskKey].score += (q.points || 1);
                        breakdown[taskKey].correct += 1;
                        breakdown.totalCorrect += 1;
                        breakdown.earnedXP += this.XP_PER_CORRECT;
                    } else {
                        breakdown[taskKey].wrong += 1;
                        breakdown.totalWrong += 1;
                    }
                }
            });
            breakdown.totalScore += breakdown[taskKey].score;
        });

        breakdown.percentage = Number(((breakdown.totalScore / breakdown.totalPossible) * 100).toFixed(2));
        return breakdown;
    },

    // 5-Tier Achievement Badge Resolver
    getTierBadge(percentage) {
        if (percentage >= 90) {
            return {
                tier: 'ENGLISH_MASTER',
                title: 'ENGLISH MASTER',
                icon: '👑',
                color: '#10b981',
                gradient: 'linear-gradient(135deg, #10b981, #059669)',
                description: 'Outstanding mastery of English 10 literary elements, text analysis, and grammatical cohesion!',
                badgeClass: 'badge-master'
            };
        } else if (percentage >= 80) {
            return {
                tier: 'ENGLISH_EXPLORER',
                title: 'ENGLISH EXPLORER',
                icon: '🧭',
                color: '#3b82f6',
                gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                description: 'Great job! You demonstrated a strong grasp of complex literary concepts and analysis.',
                badgeClass: 'badge-explorer'
            };
        } else if (percentage >= 75) {
            return {
                tier: 'RISING_READER',
                title: 'RISING READER',
                icon: '📚',
                color: '#8b5cf6',
                gradient: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                description: 'Solid effort! You met the core proficiency standard with good comprehension.',
                badgeClass: 'badge-reader'
            };
        } else if (percentage >= 60) {
            return {
                tier: 'SKILL_BUILDER',
                title: 'SKILL BUILDER',
                icon: '🛠️',
                color: '#f59e0b',
                gradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
                description: 'Promising progress! Additional practice with textual evidence will strengthen your skills.',
                badgeClass: 'badge-builder'
            };
        } else {
            return {
                tier: 'KEEP_PRACTICING',
                title: 'KEEP PRACTICING',
                icon: '💪',
                color: '#ef4444',
                gradient: 'linear-gradient(135deg, #ef4444, #dc2626)',
                description: 'Do not give up! Review the study materials and retake the quest to master these competencies.',
                badgeClass: 'badge-practice'
            };
        }
    }
};

if (typeof window !== 'undefined') {
    window.ScoringEngine = ScoringEngine;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ScoringEngine };
}

