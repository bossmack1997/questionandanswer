/**
 * QUIZ SYSTEM CONFIGURATION
 * Single source of truth for timers, scoring rules, anti-cheating, and feedback.
 */

const QUIZ_CONFIG = {
    // Central tasks definition
    TASKS: [1, 2, 3],

    // Timer configuration (in seconds)
    task1TimePerQuestion: 60,
    task2TimePerQuestion: 60,
    task3TimePerQuestion: 60,
    overallTimerSeconds: 1920, // 32 minutes for 32 questions

    // Anti-cheating rules
    maxTabSwitches: 3,

    // Points and totals
    pointsPerCorrect: 1,
    totalQuestions: 32,
    maxXP: 320,
    task1Total: 10,
    task2Total: 10,
    task3Total: 12,

    // Gamification thresholds
    streakThresholds: {
        bronze: 3,
        silver: 5,
        gold: 8
    },

    // Dynamic helpers
    getTasks() {
        return this.TASKS || [1, 2, 3];
    },
    getTaskKeys() {
        return (this.TASKS || [1, 2, 3]).map(t => 'task' + t);
    },
    getTaskTotal(taskKey) {
        if (typeof masterQuestionBank !== 'undefined' && masterQuestionBank[taskKey]) {
            return masterQuestionBank[taskKey].length;
        }
        if (taskKey === 'task1') return this.task1Total || 10;
        if (taskKey === 'task2') return this.task2Total || 10;
        if (taskKey === 'task3') return this.task3Total || 12;
        return 10;
    },
    getTotalQuestions() {
        if (typeof masterQuestionBank !== 'undefined') {
            return this.getTaskKeys().reduce((sum, key) => sum + (masterQuestionBank[key]?.length || 0), 0) || this.totalQuestions || 32;
        }
        return this.totalQuestions || 32;
    },
    getMaxXP() {
        return this.getTotalQuestions() * (this.pointsPerCorrect || 1) * 10;
    },

    // Positive and supportive feedback messages (child-friendly & encouraging)
    feedbackMessages: {
        correct: [
            "🎉 Great job!",
            "⭐ Excellent!",
            "🔥 You're on fire!",
            "🎯 Spot on!",
            "✨ Brilliant work!",
            "🚀 Fantastic thinking!",
            "👏 Outstanding!"
        ],
        wrong: [
            "😊 Nice try!",
            "💪 Keep going!",
            "🌟 Don't give up!",
            "💡 You'll get the next one!",
            "🌱 Learning in progress!",
            "✨ Stay focused!"
        ],
        timeUp: [
            "⏱️ Time is up!",
            "⚡ Moving to the next question!",
            "💪 Keep your rhythm going!"
        ]
    }
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = { QUIZ_CONFIG };
}
if (typeof window !== "undefined") {
    window.QUIZ_CONFIG = QUIZ_CONFIG;
}
