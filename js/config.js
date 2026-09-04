/**
 * QUIZ SYSTEM CONFIGURATION
 * Single source of truth for timers, scoring rules, anti-cheating, and feedback.
 */

const QUIZ_CONFIG = {
    // Timer per question in seconds
    task1TimePerQuestion: 60,
    task2TimePerQuestion: 60,
    task3TimePerQuestion: 60,

    // Anti-cheating rules
    maxTabSwitches: 3,

    // Points and totals
    pointsPerCorrect: 1,
    totalQuestions: 32,
    task1Total: 10,
    task2Total: 10,
    task3Total: 12,

    // Gamification thresholds
    streakThresholds: {
        bronze: 3,
        silver: 5,
        gold: 8
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
