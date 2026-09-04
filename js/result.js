/**
 * ENGLISH QUEST — RESULT & ACHIEVEMENT CONTROLLER
 * Renders celebratory completion screen, gamified achievement badges,
 * smooth score count-up animations, full answer review modal, and printable certificate.
 */

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Identify student
    let studentName = '';
    let studentId = '';

    if (window.AuthManager && typeof window.AuthManager.getCurrentStudent === 'function') {
        const authData = window.AuthManager.getCurrentStudent();
        if (authData) {
            studentName = authData.name;
            studentId = authData.id;
        }
    }

    if (!studentName) {
        studentName = localStorage.getItem('studentName') || sessionStorage.getItem('studentName') || '';
    }

    if (window.firebaseService && studentName) {
        studentId = window.firebaseService.normalizeStudentId(studentName);
    } else if (studentName) {
        studentId = 'student_' + studentName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    }

    // Check if a specific task was requested via URL, e.g. result.html?task=1
    const urlParams = (typeof window !== 'undefined' && window.location) ? new URLSearchParams(window.location.search) : null;
    const requestedTask = urlParams ? parseInt(urlParams.get('task'), 10) : null;

    // 2. Retrieve result data safely from multiple fallback keys or Firestore
    let result = null;
    const raw = sessionStorage.getItem('english10_last_result') || 
                sessionStorage.getItem('english10_final_result') || 
                localStorage.getItem('english10_last_result') ||
                localStorage.getItem('english10_last_result_' + studentName) ||
                localStorage.getItem('english10_last_result_' + studentId);

    if (raw) {
        try {
            result = JSON.parse(raw);
        } catch (e) {
            console.warn('Failed to parse cached quiz result:', e);
        }
    }

    // If no local result, try fetching from Firestore
    if (!result && studentId && window.firebaseService) {
        try {
            const submissions = await window.firebaseService.getAllTaskSubmissionsForStudent(studentId);
            if (submissions && (submissions.task1 || submissions.task2 || submissions.task3 || submissions.task4)) {
                const t1 = submissions.task1 || {};
                const t2 = submissions.task2 || {};
                const t3 = submissions.task3 || {};
                const t4 = submissions.task4 || {};

                const t1Score = t1.score || 0;
                const t2Score = t2.score || 0;
                const t3Score = t3.score || 0;
                const t4Score = t4.score || 0;
                const totalScore = t1Score + t2Score + t3Score + t4Score;

                const combinedAnswers = Object.assign({}, t1.answers || {}, t2.answers || {}, t3.answers || {}, t4.answers || {});

                result = {
                    studentName: studentName,
                    studentId: studentId,
                    task1Score: t1Score,
                    task1Correct: t1.correctCount !== undefined ? t1.correctCount : t1Score,
                    task1Wrong: t1.wrongCount !== undefined ? t1.wrongCount : (10 - t1Score),
                    task1Unanswered: t1.unansweredCount || 0,

                    task2Score: t2Score,
                    task2Correct: t2.correctCount !== undefined ? t2.correctCount : t2Score,
                    task2Wrong: t2.wrongCount !== undefined ? t2.wrongCount : (10 - t2Score),
                    task2Unanswered: t2.unansweredCount || 0,

                    task3Score: t3Score,
                    task3Correct: t3.correctCount !== undefined ? t3.correctCount : t3Score,
                    task3Wrong: t3.wrongCount !== undefined ? t3.wrongCount : (12 - t3Score),
                    task3Unanswered: t3.unansweredCount || 0,

                    task4Score: t4Score,
                    task4Correct: t4.correctCount !== undefined ? t4.correctCount : t4Score,
                    task4Wrong: t4.wrongCount !== undefined ? t4.wrongCount : (10 - t4Score),
                    task4Unanswered: t4.unansweredCount || 0,

                    totalScore: totalScore,
                    totalQuestions: 42,
                    percentage: Number(((totalScore / 42) * 100).toFixed(2)),
                    earnedXP: totalScore * 10,
                    maxStreak: 5,
                    timeUsed: 0,
                    completedAt: t4.submittedAt || t3.submittedAt || t2.submittedAt || t1.submittedAt || new Date().toISOString(),
                    answersMap: combinedAnswers
                };
            }
        } catch (e) {
            console.error('Failed to retrieve cloud submissions:', e);
        }
    }

    if (!result) {
        if (studentName) {
            window.location.replace('student.html');
        } else {
            window.location.replace('index.html');
        }
        return;
    }

    // 2. Cache DOM Elements
    const dom = {
        studentName: document.getElementById('resStudentName'),
        finalScore: document.getElementById('resFinalScore'),
        percentage: document.getElementById('resPercentage'),
        earnedXP: document.getElementById('resEarnedXP'),
        bestStreak: document.getElementById('resBestStreak'),
        badge: document.getElementById('resBadge'),
        evaluationText: document.getElementById('resEvaluationText'),

        task1Score: document.getElementById('resTask1Score'),
        task1Details: document.getElementById('resTask1Details'),
        task2Score: document.getElementById('resTask2Score'),
        task2Details: document.getElementById('resTask2Details'),
        task3Score: document.getElementById('resTask3Score'),
        task3Details: document.getElementById('resTask3Details'),
        task4Score: document.getElementById('resTask4Score'),
        task4Details: document.getElementById('resTask4Details'),

        totalCorrect: document.getElementById('resTotalCorrect'),
        totalWrong: document.getElementById('resTotalWrong'),
        totalUnanswered: document.getElementById('resTotalUnanswered'),
        timeUsed: document.getElementById('resTimeUsed'),
        completedAt: document.getElementById('resCompletedAt'),
        autoSubmitNotice: document.getElementById('autoSubmitNotice'),

        reviewBtn: document.getElementById('reviewAnswersBtn'),
        printBtn: document.getElementById('printReportBtn'),

        reviewModal: document.getElementById('answerReviewModal'),
        reviewItemsList: document.getElementById('reviewItemsList'),
        closeReviewModalBtn: document.getElementById('closeReviewModalBtn'),
        dismissReviewBtn: document.getElementById('dismissReviewBtn')
    };

    // 3. Populate Results with count-up animations
    if (dom.studentName) dom.studentName.textContent = result.studentName || studentName || 'Learner';
    
    const totalScore = (typeof result.totalScore === 'number') ? result.totalScore : 0;
    const totalQuestions = result.totalQuestions || 42;
    const pct = typeof result.percentage === 'number' ? result.percentage : Number(((totalScore / totalQuestions) * 100).toFixed(2));
    const xp = (typeof result.earnedXP === 'number') ? result.earnedXP : (totalScore * 10);
    const streak = result.maxStreak || 0;

    // Count-up animations for hero stats
    animateCountUp(dom.finalScore, totalScore, 1000, ' / ' + totalQuestions);
    animateCountUp(dom.percentage, pct, 1200, '%', true);
    animateCountUp(dom.earnedXP, xp, 1000, ' XP');
    if (dom.bestStreak) dom.bestStreak.textContent = 'x' + streak;

    // 4. Achievement Badges & Evaluation Text (Standardized 5-Tier Gamification)
    applyAchievementBadge(dom.badge, dom.evaluationText, pct);

    // 5. Task Breakdown
    const t1Score = (typeof result.task1Score === 'number') ? result.task1Score : (result.task1Correct || 0);
    const t2Score = (typeof result.task2Score === 'number') ? result.task2Score : (result.task2Correct || 0);
    const t3Score = (typeof result.task3Score === 'number') ? result.task3Score : (result.task3Correct || 0);
    const t4Score = (typeof result.task4Score === 'number') ? result.task4Score : (result.task4Correct || 0);

    const t1Wrong = (typeof result.task1Wrong === 'number') ? result.task1Wrong : (10 - t1Score);
    const t2Wrong = (typeof result.task2Wrong === 'number') ? result.task2Wrong : (10 - t2Score);
    const t3Wrong = (typeof result.task3Wrong === 'number') ? result.task3Wrong : (12 - t3Score);
    const t4Wrong = (typeof result.task4Wrong === 'number') ? result.task4Wrong : (10 - t4Score);

    if (dom.task1Score) dom.task1Score.textContent = t1Score + ' / 10';
    if (dom.task1Details) dom.task1Details.textContent = t1Score + ' Correct • ' + t1Wrong + ' Wrong';

    if (dom.task2Score) dom.task2Score.textContent = t2Score + ' / 10';
    if (dom.task2Details) dom.task2Details.textContent = t2Score + ' Correct • ' + t2Wrong + ' Wrong';

    if (dom.task3Score) dom.task3Score.textContent = t3Score + ' / 12';
    if (dom.task3Details) dom.task3Details.textContent = t3Score + ' Correct • ' + t3Wrong + ' Wrong';

    if (dom.task4Score) dom.task4Score.textContent = t4Score + ' / 10';
    if (dom.task4Details) dom.task4Details.textContent = t4Score + ' Correct • ' + t4Wrong + ' Wrong';

    // 6. Summary Stats
    const totalCorrect = totalScore;
    const totalWrong = (result.totalWrong !== undefined) ? result.totalWrong : (totalQuestions - totalCorrect);
    const totalUnanswered = result.totalUnanswered || 0;

    if (dom.totalCorrect) dom.totalCorrect.textContent = totalCorrect;
    if (dom.totalWrong) dom.totalWrong.textContent = totalWrong;
    if (dom.totalUnanswered) dom.totalUnanswered.textContent = totalUnanswered;

    if (dom.timeUsed) {
        const secs = result.timeUsed || 0;
        const mins = Math.floor(secs / 60);
        const remSecs = secs % 60;
        dom.timeUsed.textContent = (mins < 10 ? '0' : '') + mins + ':' + (remSecs < 10 ? '0' : '') + remSecs;
    }

    if (dom.completedAt) {
        const d = result.completedAt ? new Date(result.completedAt) : new Date();
        dom.completedAt.textContent = d.toLocaleString();
    }

    if (dom.autoSubmitNotice && result.autoSubmitted) {
        dom.autoSubmitNotice.classList.remove('hidden');
    }

    // 7. Bind Action Buttons
    if (dom.printBtn) {
        dom.printBtn.addEventListener('click', () => window.print());
    }

    if (dom.reviewBtn) {
        dom.reviewBtn.addEventListener('click', () => {
            renderAnswerReviewModal(result, dom.reviewItemsList, requestedTask);
            dom.reviewModal.classList.remove('hidden');
        });
    }

    if (dom.closeReviewModalBtn) {
        dom.closeReviewModalBtn.addEventListener('click', () => dom.reviewModal.classList.add('hidden'));
    }

    if (dom.dismissReviewBtn) {
        dom.dismissReviewBtn.addEventListener('click', () => dom.reviewModal.classList.add('hidden'));
    }

    // 8. Launch celebratory confetti
    launchConfetti();

    function animateCountUp(element, target, duration = 1000, suffix = '', isDecimal = false) {
        if (!element) return;
        const startTime = performance.now();
        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3);
            const current = target * ease;
            element.textContent = (isDecimal ? current.toFixed(1) : Math.round(current)) + suffix;
            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                element.textContent = (isDecimal ? target.toFixed(1) : target) + suffix;
            }
        }
        requestAnimationFrame(update);
    }

    function applyAchievementBadge(badgeEl, textEl, percentage) {
        if (!badgeEl || !textEl) return;

        if (percentage >= 90) {
            badgeEl.className = 'perf-badge badge-master';
            badgeEl.textContent = '🏆 ENGLISH MASTER';
            textEl.textContent = 'Outstanding Mastery! You demonstrated exceptional comprehension across all literary and language standards.';
        } else if (percentage >= 80) {
            badgeEl.className = 'perf-badge badge-explorer';
            badgeEl.textContent = '🌟 ENGLISH EXPLORER';
            textEl.textContent = 'Impressive work! You demonstrated solid understanding and strong analytical skills.';
        } else if (percentage >= 75) {
            badgeEl.className = 'perf-badge badge-reader';
            badgeEl.textContent = '📖 RISING READER';
            textEl.textContent = 'Great progress! You have satisfied the core competencies for Grade 10 English Term 1 Remediation.';
        } else if (percentage >= 60) {
            badgeEl.className = 'perf-badge badge-builder';
            badgeEl.textContent = '🛠️ SKILL BUILDER';
            textEl.textContent = 'Good effort! You showed promising understanding. Keep practicing key areas to boost your mastery.';
        } else {
            badgeEl.className = 'perf-badge badge-remediation';
            badgeEl.textContent = '🌱 KEEP PRACTICING';
            textEl.textContent = 'Further practice recommended. Review the specific feedback items below to strengthen your fundamentals.';
        }
    }

    function renderAnswerReviewModal(res, container, filterTask = null) {
        if (!container) return;
        container.innerHTML = '';

        const answersMap = res.answersMap || (res.attemptAudit && res.attemptAudit.selected_answers) || {};
        const allQuestions = [];

        // Aggregate questions from master bank
        const taskKeys = filterTask ? ['task' + filterTask] : ['task1', 'task2', 'task3', 'task4'];
        taskKeys.forEach(taskKey => {
            if (typeof masterQuestionBank !== 'undefined' && masterQuestionBank[taskKey]) {
                allQuestions.push(...masterQuestionBank[taskKey]);
            }
        });

        allQuestions.forEach((q, idx) => {
            const userChoiceId = answersMap[q.question_id];
            const isCorrect = (userChoiceId === q.correct_option_id);
            const isUnanswered = !userChoiceId;

            const correctChoice = q.choices ? q.choices.find(c => c.option_id === q.correct_option_id) : null;
            const userChoice = q.choices ? q.choices.find(c => c.option_id === userChoiceId) : null;

            const card = document.createElement('div');
            card.className = 'review-question-card ' + (isCorrect ? 'rev-correct' : (isUnanswered ? 'rev-unanswered' : 'rev-wrong'));

            const statusLabel = isCorrect ? '✓ CORRECT (+10 XP)' : (isUnanswered ? '○ UNANSWERED' : '✕ INCORRECT');

            card.innerHTML = 
                '<div class="rev-card-header">' +
                    '<span class="rev-num">Item ' + (idx + 1) + ' (Task ' + q.task_id + ')</span>' +
                    '<span class="rev-status ' + (isCorrect ? 'status-correct' : 'status-wrong') + '">' + statusLabel + '</span>' +
                '</div>' +
                '<div class="rev-question-text">' + q.question_text + '</div>' +
                '<div class="rev-choices-grid">' +
                    '<div class="rev-choice-box rev-user-choice ' + (isCorrect ? 'box-correct' : 'box-wrong') + '">' +
                        '<span class="rev-box-tag">Your Answer:</span>' +
                        '<span class="rev-box-val">' + (userChoice ? userChoice.text : '<em>No answer provided</em>') + '</span>' +
                    '</div>' +
                    (!isCorrect ? (
                    '<div class="rev-choice-box rev-correct-choice box-correct">' +
                        '<span class="rev-box-tag">Correct Answer:</span>' +
                        '<span class="rev-box-val">' + (correctChoice ? correctChoice.text : 'N/A') + '</span>' +
                    '</div>'
                    ) : '') +
                '</div>';

            container.appendChild(card);
        });
    }

    function launchConfetti() {
        const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#3b82f6', '#8b5cf6'];
        const container = document.body;

        for (let i = 0; i < 35; i++) {
            const piece = document.createElement('div');
            piece.className = 'confetti-piece';
            piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            piece.style.left = (Math.random() * 100) + 'vw';
            piece.style.top = '-20px';
            piece.style.transform = 'rotate(' + (Math.random() * 360) + 'deg)';
            piece.style.animationDelay = (Math.random() * 1.5) + 's';
            piece.style.animationDuration = (2 + Math.random() * 2.5) + 's';
            container.appendChild(piece);

            setTimeout(() => piece.remove(), 4500);
        }
    }
});
