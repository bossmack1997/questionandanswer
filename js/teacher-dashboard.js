/**
 * TEACHER DASHBOARD CONTROLLER — REAL-TIME QUIZ MONITORING & AUTO-RESTORE
 * 
 * Features:
 * - Real-time Firestore onSnapshot() synchronization for active attempts & completed results
 * - Single source of truth with deterministic studentId deduplication
 * - Live progress tracking (answeredQuestions / totalQuestions * 100)
 * - View Tabs: All, Live / In Progress, Completed, Auto-Submitted
 * - Dynamic Section, Performance Level, and Status Filters
 * - Human-Readable Relative Time (Just now, 2m ago, Today H:MM A) with periodic ticker
 * - Interactive Student Assessment Drill-Down Modal & Answer Key Modal
 * - CSV Export for Gradebook & Remediation reporting
 * - Unsubscribe cleanup preventing memory leaks or duplicate listeners
 */

class TeacherDashboard {
    constructor() {
        this.activeAttempts = [];
        this.completedResults = [];
        this.taskSubmissions = [];
        this.activeStudents = [];
        this.combinedLearners = [];
        this.filteredLearners = [];

        this.currentView = 'all'; // 'all', 'in_progress', 'completed', 'auto_submitted'
        this.currentSort = { field: 'updatedAt', order: 'desc' };

        this.unsubActiveAttempts = null;
        this.unsubQuizResults = null;
        this.unsubSubmissions = null;
        this.unsubActiveStudents = null;
        this.relativeTimeTicker = null;

        this.init();
    }

    // ==========================================
    // INITIALIZATION & REAL-TIME AUTH / LISTENERS
    // ==========================================

    init() {
        if (typeof window === "undefined" || !window.firebaseService) {
            console.error('[TeacherDashboard] FirebaseService not detected.');
            return;
        }

        const localTeacherEmail = localStorage.getItem('english10_teacher_email');
        const hasTeacherAuth = sessionStorage.getItem('english10_teacher_auth') || localTeacherEmail;
        const userEmailEl = document.getElementById('teacherUserEmail');

        if (localTeacherEmail && userEmailEl) {
            userEmailEl.textContent = localTeacherEmail;
        }

        // 1. Initial Local Cache & Realtime Listeners (Immediate Auto-Restore)
        this.setupRealtimeListeners();
        this.fetchInitialData();

        // 2. Auth State Validation
        window.firebaseService.onAuthStateChanged((user) => {
            if (user) {
                if (userEmailEl) userEmailEl.textContent = user.email || 'Teacher';
                localStorage.setItem('english10_teacher_email', user.email);
            } else if (!hasTeacherAuth) {
                this.cleanupListeners();
                window.location.replace('teacher-login.html');
                return;
            }
        });

        // 3. Cross-Tab Auto-Sync: Instant real-time restore when students submit in another tab
        window.addEventListener('storage', (e) => {
            if (e.key && e.key.startsWith('english10_')) {
                this.reconcileData();
            }
        });

        this.bindEvents();

        // Window unload cleanup
        window.addEventListener('beforeunload', () => {
            this.cleanupListeners();
        });
    }

    async fetchInitialData() {
        try {
            const results = await window.firebaseService.getAllResults();
            if (Array.isArray(results) && results.length > 0) {
                this.completedResults = results;
            }

            const subs = await window.firebaseService.getAllSubmissions();
            if (Array.isArray(subs) && subs.length > 0) {
                this.taskSubmissions = subs;
            }

            const students = await window.firebaseService.getActiveStudents();
            if (Array.isArray(students) && students.length > 0) {
                this.activeStudents = students;
            }

            if (window.firebaseService.initialized && window.firebaseService.db) {
                const attemptsSnap = await window.firebaseService.db.collection('active_attempts').get();
                const list = [];
                attemptsSnap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
                if (list.length > 0) this.activeAttempts = list;
            }

            this.reconcileData();
        } catch (e) {
            console.warn('[TeacherDashboard] Direct fetch note:', e);
            this.reconcileData();
        }
    }

    setupRealtimeListeners() {
        this.cleanupListeners();

        const loadingIndicator = document.getElementById('tableLoading');
        if (loadingIndicator) loadingIndicator.classList.remove('hidden');

        // Initial Local Cache Reconciliation (Zero-delay render)
        this.reconcileData();

        // 1. Subscribe to In-Progress Active Quiz Attempts
        if (typeof window.firebaseService.listenToActiveAttempts === 'function') {
            this.unsubActiveAttempts = window.firebaseService.listenToActiveAttempts(
                (attempts) => {
                    this.activeAttempts = attempts || [];
                    this.reconcileData();
                    if (loadingIndicator) loadingIndicator.classList.add('hidden');
                },
                (err) => {
                    console.warn('[TeacherDashboard] Active attempts listener warning:', err.message);
                    if (loadingIndicator) loadingIndicator.classList.add('hidden');
                }
            );
        }

        // 2. Subscribe to Historical & Live Completed Quiz Results
        if (typeof window.firebaseService.listenToQuizResults === 'function') {
            this.unsubQuizResults = window.firebaseService.listenToQuizResults(
                (results) => {
                    this.completedResults = results || [];
                    this.reconcileData();
                    if (loadingIndicator) loadingIndicator.classList.add('hidden');
                },
                (err) => {
                    console.warn('[TeacherDashboard] Quiz results listener warning:', err.message);
                    if (loadingIndicator) loadingIndicator.classList.add('hidden');
                }
            );
        }

        // 3. Subscribe to Individual Task Submissions (Tasks 1, 2, 3)
        if (typeof window.firebaseService.listenToSubmissions === 'function') {
            this.unsubSubmissions = window.firebaseService.listenToSubmissions(
                (submissions) => {
                    this.taskSubmissions = submissions || [];
                    this.reconcileData();
                    if (loadingIndicator) loadingIndicator.classList.add('hidden');
                },
                (err) => {
                    console.warn('[TeacherDashboard] Submissions listener warning:', err.message);
                }
            );
        }

        // 4. Subscribe to Registered / Logged-in Active Students
        if (typeof window.firebaseService.listenToActiveStudents === 'function') {
            this.unsubActiveStudents = window.firebaseService.listenToActiveStudents(
                (students) => {
                    this.activeStudents = students || [];
                    this.reconcileData();
                    if (loadingIndicator) loadingIndicator.classList.add('hidden');
                },
                (err) => {
                    console.warn('[TeacherDashboard] Active students listener warning:', err.message);
                }
            );
        }

        // 5. Start 30-second relative time ticker
        this.relativeTimeTicker = setInterval(() => {
            this.updateRelativeTimeDisplays();
        }, 30000);
    }

    cleanupListeners() {
        if (typeof this.unsubActiveAttempts === 'function') {
            try { this.unsubActiveAttempts(); } catch (e) {}
            this.unsubActiveAttempts = null;
        }
        if (typeof this.unsubQuizResults === 'function') {
            try { this.unsubQuizResults(); } catch (e) {}
            this.unsubQuizResults = null;
        }
        if (typeof this.unsubSubmissions === 'function') {
            try { this.unsubSubmissions(); } catch (e) {}
            this.unsubSubmissions = null;
        }
        if (typeof this.unsubActiveStudents === 'function') {
            try { this.unsubActiveStudents(); } catch (e) {}
            this.unsubActiveStudents = null;
        }
        if (this.relativeTimeTicker) {
            clearInterval(this.relativeTimeTicker);
            this.relativeTimeTicker = null;
        }
    }

    // ==========================================
    // MULTI-SOURCE DATA RECONCILIATION & DEDUPLICATION
    // ==========================================

    reconcileData() {
        const learnerMap = new Map();
        const studentTaskMap = new Map();
        const totalConfiguredQuestions = (typeof QUIZ_CONFIG !== 'undefined' && QUIZ_CONFIG.totalQuestions) ? QUIZ_CONFIG.totalQuestions : 32;

        // -------------------------------------------------------------
        // SOURCE 0: LocalStorage Backups (Offline & Sandbox Test Cache)
        // -------------------------------------------------------------
        if (typeof localStorage !== 'undefined') {
            // A. Cached Completed Submissions list
            try {
                const localSubmissions = JSON.parse(localStorage.getItem('english10_quiz_submissions') || '[]');
                if (Array.isArray(localSubmissions)) {
                    localSubmissions.forEach(r => {
                        if (!r || (!r.studentName && !r.studentId)) return;
                        const sid = r.studentId || window.firebaseService.normalizeStudentId(r.studentName, r.section || r.studentSection);
                        const totalQ = r.totalQuestions || totalConfiguredQuestions;
                        const score = typeof r.totalScore === 'number' ? r.totalScore : (typeof r.score === 'number' ? r.score : 0);
                        const pct = typeof r.percentage === 'number' ? r.percentage : (totalQ > 0 ? Number(((score / totalQ) * 100).toFixed(2)) : 0);
                        const completedTime = r.completedAt ? new Date(r.completedAt).toISOString() : new Date().toISOString();

                        learnerMap.set(sid, {
                            id: r.id || sid,
                            attemptId: r.attemptId || ('quest_' + sid),
                            studentId: sid,
                            studentName: r.studentName || 'Student',
                            section: r.section || r.studentSection || 'Grade 10',
                            status: r.autoSubmitted ? 'auto_submitted' : 'completed',
                            currentTaskDisplay: 'Completed',
                            currentTaskNum: 3,
                            currentQuestion: totalQ,
                            totalQuestions: totalQ,
                            answeredQuestions: totalQ,
                            score: score,
                            percentage: pct,
                            earnedXP: r.earnedXP || (score * 10),
                            maxStreak: r.maxStreak || 0,
                            timeUsed: r.timeUsed || 0,
                            autoSubmitted: Boolean(r.autoSubmitted),
                            tabSwitches: r.tabSwitches || 0,
                            task1Score: r.task1Score !== undefined ? r.task1Score : (r.task1Correct || 0),
                            task1Correct: r.task1Correct,
                            task1Wrong: r.task1Wrong,
                            task1Unanswered: r.task1Unanswered,
                            task2Score: r.task2Score !== undefined ? r.task2Score : (r.task2Correct || 0),
                            task2Correct: r.task2Correct,
                            task2Wrong: r.task2Wrong,
                            task2Unanswered: r.task2Unanswered,
                            task3Score: r.task3Score !== undefined ? r.task3Score : (r.task3Correct || 0),
                            task3Correct: r.task3Correct,
                            task3Wrong: r.task3Wrong,
                            task3Unanswered: r.task3Unanswered,
                            startedAt: r.startedAt || completedTime,
                            updatedAt: completedTime,
                            completedAt: completedTime,
                            isLive: false,
                            rawDoc: r
                        });
                    });
                }
            } catch (e) {}

            // B. Scan all localStorage keys for active attempts, single results, task submissions
            try {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (!key) continue;

                    if (key.startsWith('english10_last_result')) {
                        const val = localStorage.getItem(key);
                        if (val) {
                            try {
                                const r = JSON.parse(val);
                                if (r && (r.studentName || r.studentId)) {
                                    const sid = r.studentId || window.firebaseService.normalizeStudentId(r.studentName, r.section || r.studentSection);
                                    const totalQ = r.totalQuestions || totalConfiguredQuestions;
                                    const score = typeof r.totalScore === 'number' ? r.totalScore : (typeof r.score === 'number' ? r.score : 0);
                                    const pct = typeof r.percentage === 'number' ? r.percentage : (totalQ > 0 ? Number(((score / totalQ) * 100).toFixed(2)) : 0);
                                    const completedTime = r.completedAt ? new Date(r.completedAt).toISOString() : new Date().toISOString();

                                    if (!learnerMap.has(sid) || new Date(completedTime).getTime() >= new Date(learnerMap.get(sid).completedAt || 0).getTime()) {
                                        learnerMap.set(sid, {
                                            id: r.id || sid,
                                            attemptId: r.attemptId || ('quest_' + sid),
                                            studentId: sid,
                                            studentName: r.studentName || 'Student',
                                            section: r.section || r.studentSection || 'Grade 10',
                                            status: r.autoSubmitted ? 'auto_submitted' : 'completed',
                                            currentTaskDisplay: 'Completed',
                                            currentTaskNum: 3,
                                            currentQuestion: totalQ,
                                            totalQuestions: totalQ,
                                            answeredQuestions: totalQ,
                                            score: score,
                                            percentage: pct,
                                            earnedXP: r.earnedXP || (score * 10),
                                            maxStreak: r.maxStreak || 0,
                                            timeUsed: r.timeUsed || 0,
                                            autoSubmitted: Boolean(r.autoSubmitted),
                                            tabSwitches: r.tabSwitches || 0,
                                            task1Score: r.task1Score !== undefined ? r.task1Score : (r.task1Correct || 0),
                                            task1Correct: r.task1Correct,
                                            task1Wrong: r.task1Wrong,
                                            task1Unanswered: r.task1Unanswered,
                                            task2Score: r.task2Score !== undefined ? r.task2Score : (r.task2Correct || 0),
                                            task2Correct: r.task2Correct,
                                            task2Wrong: r.task2Wrong,
                                            task2Unanswered: r.task2Unanswered,
                                            task3Score: r.task3Score !== undefined ? r.task3Score : (r.task3Correct || 0),
                                            task3Correct: r.task3Correct,
                                            task3Wrong: r.task3Wrong,
                                            task3Unanswered: r.task3Unanswered,
                                            startedAt: r.startedAt || completedTime,
                                            updatedAt: completedTime,
                                            completedAt: completedTime,
                                            isLive: false,
                                            rawDoc: r
                                        });
                                    }
                                }
                            } catch (e) {}
                        }
                    } else if (key.startsWith('english10_task_submission_') || key.startsWith('english10_sub_')) {
                        const val = localStorage.getItem(key);
                        if (val) {
                            try {
                                const sub = JSON.parse(val);
                                if (sub && (sub.studentName || sub.studentId)) {
                                    const sid = sub.studentId || window.firebaseService.normalizeStudentId(sub.studentName, sub.section || sub.studentSection);
                                    if (!studentTaskMap.has(sid)) {
                                        studentTaskMap.set(sid, {
                                            studentId: sid,
                                            studentName: sub.studentName,
                                            section: sub.section || sub.studentSection,
                                            tasks: {},
                                            latestSubmittedAt: sub.submittedAt
                                        });
                                    }
                                    const tNum = parseInt(sub.taskId, 10) || 1;
                                    studentTaskMap.get(sid).tasks[tNum] = sub;
                                }
                            } catch (e) {}
                        }
                    } else if (key.startsWith('english10_active_attempt_') || key.startsWith('english10_quest_attempt_')) {
                        const val = localStorage.getItem(key);
                        if (val) {
                            try {
                                const a = JSON.parse(val);
                                if (a && (a.studentName || a.studentId)) {
                                    const sid = a.studentId || a.id || window.firebaseService.normalizeStudentId(a.studentName, a.section || a.studentSection);
                                    if (!learnerMap.has(sid) || learnerMap.get(sid).status === 'in_progress') {
                                        const totalQ = a.totalQuestions || totalConfiguredQuestions;
                                        const answersMap = a.answersMap || {};
                                        const answeredQ = a.answeredQuestions !== undefined ? a.answeredQuestions : Object.keys(answersMap).length;
                                        const score = typeof a.score === 'number' ? a.score : 0;
                                        const progressPct = a.progressPercentage !== undefined ? a.progressPercentage : (totalQ > 0 ? Math.min(100, Math.round((answeredQ / totalQ) * 100)) : 0);
                                        const taskNum = a.currentTask || 1;
                                        const updatedIso = a.updatedAt || a.startedAt || new Date().toISOString();

                                        learnerMap.set(sid, {
                                            id: a.id || sid,
                                            attemptId: a.attemptId || ('quest_' + sid),
                                            studentId: sid,
                                            studentName: a.studentName || 'Student',
                                            section: a.section || a.studentSection || 'Grade 10',
                                            status: a.status || 'in_progress',
                                            currentTaskDisplay: 'Task ' + taskNum,
                                            currentTaskNum: taskNum,
                                            currentQuestion: a.currentQuestion || (a.currentQuestionIndex !== undefined ? a.currentQuestionIndex + 1 : 1),
                                            totalQuestions: totalQ,
                                            answeredQuestions: answeredQ,
                                            score: score,
                                            percentage: a.percentage !== undefined ? a.percentage : (totalQ > 0 ? Number(((score / totalQ) * 100).toFixed(2)) : 0),
                                            progressPercentage: progressPct,
                                            earnedXP: a.earnedXP || (score * 10),
                                            streak: a.streak || 0,
                                            maxStreak: a.maxStreak || 0,
                                            timeUsed: a.totalTimeUsed || 0,
                                            autoSubmitted: Boolean(a.autoSubmitted),
                                            tabSwitches: a.tabSwitches || 0,
                                            taskScores: a.taskScores || {},
                                            task1Score: (a.taskScores && a.taskScores.task1) ? a.taskScores.task1.score : (a.task1Score || 0),
                                            task2Score: (a.taskScores && a.taskScores.task2) ? a.taskScores.task2.score : (a.task2Score || 0),
                                            task3Score: (a.taskScores && a.taskScores.task3) ? a.taskScores.task3.score : (a.task3Score || 0),
                                            startedAt: a.startedAt || updatedIso,
                                            updatedAt: updatedIso,
                                            completedAt: a.submittedAt || null,
                                            isLive: true,
                                            rawDoc: a
                                        });
                                    }
                                }
                            } catch (e) {}
                        }
                    }
                }
            } catch (e) {}
        }

        // -------------------------------------------------------------
        // SOURCE 1: Registered Active Students (from active_students)
        // -------------------------------------------------------------
        this.activeStudents.forEach(st => {
            const sid = st.studentId || window.firebaseService.normalizeStudentId(st.studentName, st.studentSection || st.section);
            if (!learnerMap.has(sid)) {
                learnerMap.set(sid, {
                    id: st.id || sid,
                    attemptId: 'reg_' + sid,
                    studentId: sid,
                    studentName: st.studentName || 'Student',
                    section: st.studentSection || st.section || 'Grade 10',
                    status: 'in_progress',
                    currentTaskDisplay: 'Task ' + (st.currentTask || 1),
                    currentTaskNum: st.currentTask || 1,
                    currentQuestion: 1,
                    totalQuestions: totalConfiguredQuestions,
                    answeredQuestions: 0,
                    score: 0,
                    percentage: 0,
                    progressPercentage: 0,
                    earnedXP: 0,
                    streak: 0,
                    maxStreak: 0,
                    timeUsed: 0,
                    autoSubmitted: false,
                    tabSwitches: 0,
                    task1Score: 0,
                    task2Score: 0,
                    task3Score: 0,
                    startedAt: st.lastActive || new Date().toISOString(),
                    updatedAt: st.lastActive || new Date().toISOString(),
                    completedAt: null,
                    isLive: true,
                    rawDoc: st
                });
            }
        });

        // -------------------------------------------------------------
        // SOURCE 2: Task-Level Submissions (from submissions collection)
        // -------------------------------------------------------------
        this.taskSubmissions.forEach(sub => {
            const sid = sub.studentId || window.firebaseService.normalizeStudentId(sub.studentName, sub.section || sub.studentSection);
            if (!studentTaskMap.has(sid)) {
                studentTaskMap.set(sid, {
                    studentId: sid,
                    studentName: sub.studentName,
                    section: sub.section || sub.studentSection,
                    tasks: {},
                    latestSubmittedAt: sub.submittedAt
                });
            }
            const entry = studentTaskMap.get(sid);
            const tNum = parseInt(sub.taskId, 10) || 1;
            entry.tasks[tNum] = sub;
            if (sub.submittedAt && (!entry.latestSubmittedAt || new Date(sub.submittedAt).getTime() > new Date(entry.latestSubmittedAt).getTime())) {
                entry.latestSubmittedAt = sub.submittedAt;
            }
        });

        studentTaskMap.forEach((entry, sid) => {
            const t1 = entry.tasks[1];
            const t2 = entry.tasks[2];
            const t3 = entry.tasks[3];

            const t1Score = t1 ? (t1.score || 0) : 0;
            const t2Score = t2 ? (t2.score || 0) : 0;
            const t3Score = t3 ? (t3.score || 0) : 0;
            const totalScore = t1Score + t2Score + t3Score;

            const t1Total = t1 ? (t1.totalQuestions || 10) : 10;
            const t2Total = t2 ? (t2.totalQuestions || 10) : 10;
            const t3Total = t3 ? (t3.totalQuestions || 12) : 12;

            let completedTasksCount = 0;
            let answeredQ = 0;
            if (t1) { completedTasksCount++; answeredQ += t1Total; }
            if (t2) { completedTasksCount++; answeredQ += t2Total; }
            if (t3) { completedTasksCount++; answeredQ += t3Total; }

            const isAllCompleted = completedTasksCount >= 3;
            const nextTaskNum = Math.min(3, completedTasksCount + 1);
            const status = isAllCompleted ? 'completed' : 'in_progress';
            const progressPct = Math.min(100, Math.round((answeredQ / totalConfiguredQuestions) * 100));
            const pct = totalConfiguredQuestions > 0 ? Number(((totalScore / totalConfiguredQuestions) * 100).toFixed(2)) : 0;

            // Only overlay if record doesn't exist or is not completed
            if (!learnerMap.has(sid) || learnerMap.get(sid).status !== 'completed') {
                learnerMap.set(sid, {
                    id: sid,
                    attemptId: 'task_subs_' + sid,
                    studentId: sid,
                    studentName: entry.studentName || 'Student',
                    section: entry.section || 'Grade 10',
                    status: status,
                    currentTaskDisplay: isAllCompleted ? 'Completed' : ('Task ' + nextTaskNum),
                    currentTaskNum: nextTaskNum,
                    currentQuestion: answeredQ,
                    totalQuestions: totalConfiguredQuestions,
                    answeredQuestions: answeredQ,
                    score: totalScore,
                    percentage: pct,
                    progressPercentage: progressPct,
                    earnedXP: totalScore * 10,
                    maxStreak: 0,
                    timeUsed: (t1?.timeUsed || 0) + (t2?.timeUsed || 0) + (t3?.timeUsed || 0),
                    autoSubmitted: Boolean(t1?.autoSubmitted || t2?.autoSubmitted || t3?.autoSubmitted),
                    tabSwitches: 0,
                    task1Score: t1Score,
                    task1Correct: t1Score,
                    task1Wrong: t1Total - t1Score,
                    task1Unanswered: 0,
                    task2Score: t2Score,
                    task2Correct: t2Score,
                    task2Wrong: t2Total - t2Score,
                    task2Unanswered: 0,
                    task3Score: t3Score,
                    task3Correct: t3Score,
                    task3Wrong: t3Total - t3Score,
                    task3Unanswered: 0,
                    startedAt: entry.latestSubmittedAt || new Date().toISOString(),
                    updatedAt: entry.latestSubmittedAt || new Date().toISOString(),
                    completedAt: isAllCompleted ? entry.latestSubmittedAt : null,
                    isLive: !isAllCompleted,
                    rawDoc: entry
                });
            }
        });

        // -------------------------------------------------------------
        // SOURCE 3: Completed Quiz Results (from quiz_results collection)
        // -------------------------------------------------------------
        this.completedResults.forEach(r => {
            const sid = r.studentId || window.firebaseService.normalizeStudentId(r.studentName, r.section || r.studentSection);
            const totalQ = r.totalQuestions || totalConfiguredQuestions;
            const score = typeof r.totalScore === 'number' ? r.totalScore : (typeof r.score === 'number' ? r.score : 0);
            const pct = typeof r.percentage === 'number' ? r.percentage : (totalQ > 0 ? Number(((score / totalQ) * 100).toFixed(2)) : 0);
            const completedTime = r.completedAt ? new Date(r.completedAt).toISOString() : new Date().toISOString();

            const record = {
                id: r.id || sid,
                attemptId: r.attemptId || ('quest_' + sid),
                studentId: sid,
                studentName: r.studentName || 'Student',
                section: r.section || r.studentSection || 'Grade 10',
                status: r.autoSubmitted ? 'auto_submitted' : 'completed',
                currentTaskDisplay: 'Completed',
                currentTaskNum: 3,
                currentQuestion: totalQ,
                totalQuestions: totalQ,
                answeredQuestions: totalQ,
                score: score,
                percentage: pct,
                progressPercentage: 100,
                earnedXP: r.earnedXP || (score * 10),
                maxStreak: r.maxStreak || 0,
                timeUsed: r.timeUsed || 0,
                autoSubmitted: Boolean(r.autoSubmitted),
                tabSwitches: r.tabSwitches || 0,
                task1Score: r.task1Score !== undefined ? r.task1Score : (r.task1Correct || 0),
                task1Correct: r.task1Correct,
                task1Wrong: r.task1Wrong,
                task1Unanswered: r.task1Unanswered,
                task2Score: r.task2Score !== undefined ? r.task2Score : (r.task2Correct || 0),
                task2Correct: r.task2Correct,
                task2Wrong: r.task2Wrong,
                task2Unanswered: r.task2Unanswered,
                task3Score: r.task3Score !== undefined ? r.task3Score : (r.task3Correct || 0),
                task3Correct: r.task3Correct,
                task3Wrong: r.task3Wrong,
                task3Unanswered: r.task3Unanswered,
                startedAt: r.startedAt || completedTime,
                updatedAt: completedTime,
                completedAt: completedTime,
                isLive: false,
                rawDoc: r
            };

            // If multiple submissions exist for same student, preserve the newest one
            if (!learnerMap.has(sid) || new Date(record.completedAt).getTime() >= new Date(learnerMap.get(sid).completedAt || 0).getTime()) {
                learnerMap.set(sid, record);
            }
        });

        // -------------------------------------------------------------
        // SOURCE 4: Live In-Progress Attempts (from active_attempts)
        // -------------------------------------------------------------
        this.activeAttempts.forEach(a => {
            const sid = a.studentId || a.id || window.firebaseService.normalizeStudentId(a.studentName, a.section || a.studentSection);
            const isCompletedInActive = a.status === 'completed' || a.status === 'auto_submitted';

            // If student already has a completed record, preserve completed unless active attempt is strictly newer
            if (learnerMap.has(sid) && !isCompletedInActive) {
                const existing = learnerMap.get(sid);
                const activeUpdatedMs = new Date(a.updatedAt || a.startedAt || 0).getTime();
                const completedMs = new Date(existing.completedAt || 0).getTime();

                if (existing.status === 'completed' && activeUpdatedMs <= completedMs) {
                    return; // Ignore stale in-progress document
                }
            }

            const totalQ = a.totalQuestions || totalConfiguredQuestions;
            const answersMap = a.answersMap || {};
            const answeredQ = a.answeredQuestions !== undefined ? a.answeredQuestions : Object.keys(answersMap).length;
            const score = typeof a.score === 'number' ? a.score : 0;
            const progressPct = a.progressPercentage !== undefined ? a.progressPercentage : (totalQ > 0 ? Math.min(100, Math.round((answeredQ / totalQ) * 100)) : 0);
            const taskNum = a.currentTask || 1;
            const updatedIso = a.updatedAt || a.last_activity_at || a.startedAt || new Date().toISOString();

            // Determine active status: check for expired/abandoned (> 40 mins inactive)
            let status = a.status || 'in_progress';
            const inactiveMinutes = (Date.now() - new Date(updatedIso).getTime()) / (1000 * 60);
            if (status === 'in_progress' && inactiveMinutes > 40) {
                status = 'expired';
            }

            const record = {
                id: a.id || sid,
                attemptId: a.attemptId || ('quest_' + sid),
                studentId: sid,
                studentName: a.studentName || 'Student',
                section: a.section || a.studentSection || 'Grade 10',
                status: status,
                currentTaskDisplay: isCompletedInActive ? 'Completed' : ('Task ' + taskNum),
                currentTaskNum: taskNum,
                currentQuestion: a.currentQuestion || (a.currentQuestionIndex !== undefined ? a.currentQuestionIndex + 1 : 1),
                totalQuestions: totalQ,
                answeredQuestions: answeredQ,
                score: score,
                percentage: a.percentage !== undefined ? a.percentage : (totalQ > 0 ? Number(((score / totalQ) * 100).toFixed(2)) : 0),
                progressPercentage: progressPct,
                earnedXP: a.earnedXP || (score * 10),
                streak: a.streak || 0,
                maxStreak: a.maxStreak || 0,
                timeUsed: a.totalTimeUsed || 0,
                autoSubmitted: a.autoSubmitted || (status === 'auto_submitted'),
                tabSwitches: a.tabSwitches || 0,
                taskScores: a.taskScores || {},
                task1Score: (a.taskScores && a.taskScores.task1) ? a.taskScores.task1.score : (a.task1Score || 0),
                task2Score: (a.taskScores && a.taskScores.task2) ? a.taskScores.task2.score : (a.task2Score || 0),
                task3Score: (a.taskScores && a.taskScores.task3) ? a.taskScores.task3.score : (a.task3Score || 0),
                startedAt: a.startedAt || updatedIso,
                updatedAt: updatedIso,
                completedAt: a.submittedAt || (isCompletedInActive ? updatedIso : null),
                isLive: (status === 'in_progress'),
                rawDoc: a
            };

            learnerMap.set(sid, record);
        });

        this.combinedLearners = Array.from(learnerMap.values());

        // Update UI components reactively
        this.updateKPIs();
        this.updateTabCounters();
        this.populateSectionDropdown();
        this.renderActivePresenceRoster();
        this.applyFilters();
    }

    // ==========================================
    // UI UPDATES & TAB COUNTERS
    // ==========================================

    updateKPIs() {
        const total = this.combinedLearners.length;
        const totalAttemptsEl = document.getElementById('kpiTotalAttempts');
        if (totalAttemptsEl) totalAttemptsEl.textContent = total;

        const completedList = this.combinedLearners.filter(l => l.status === 'completed' || l.status === 'auto_submitted');
        const completedCount = completedList.length;

        if (completedCount === 0) {
            const avgEl = document.getElementById('kpiAvgScore');
            const highEl = document.getElementById('kpiHighestScore');
            const profEl = document.getElementById('kpiProficiencyRate');
            if (avgEl) avgEl.textContent = '0%';
            if (highEl) highEl.textContent = '0%';
            if (profEl) profEl.textContent = '0%';
            return;
        }

        let sumPct = 0;
        let highest = 0;
        let proficientCount = 0;

        completedList.forEach(r => {
            const p = r.percentage || 0;
            sumPct += p;
            if (p > highest) highest = p;
            if (p >= 75) proficientCount++;
        });

        const avg = Math.round(sumPct / completedCount);
        const profRate = Math.round((proficientCount / completedCount) * 100);

        const avgEl = document.getElementById('kpiAvgScore');
        const highEl = document.getElementById('kpiHighestScore');
        const profEl = document.getElementById('kpiProficiencyRate');

        if (avgEl) avgEl.textContent = `${avg}%`;
        if (highEl) highEl.textContent = `${Math.round(highest)}%`;
        if (profEl) profEl.textContent = `${profRate}%`;
    }

    updateTabCounters() {
        const allCount = this.combinedLearners.length;
        const liveCount = this.combinedLearners.filter(l => l.status === 'in_progress').length;
        const completedCount = this.combinedLearners.filter(l => l.status === 'completed').length;
        const autoCount = this.combinedLearners.filter(l => l.status === 'auto_submitted' || l.status === 'expired').length;

        const tabAll = document.getElementById('tabCountAll');
        const tabLive = document.getElementById('tabCountLive');
        const tabCompleted = document.getElementById('tabCountCompleted');
        const tabAuto = document.getElementById('tabCountAuto');

        if (tabAll) tabAll.textContent = allCount;
        if (tabLive) tabLive.textContent = liveCount;
        if (tabCompleted) tabCompleted.textContent = completedCount;
        if (tabAuto) tabAuto.textContent = autoCount;
    }

    populateSectionDropdown() {
        const sectionSelect = document.getElementById('sectionFilter');
        if (!sectionSelect) return;

        const currentVal = sectionSelect.value;
        const sectionsSet = new Set();

        this.combinedLearners.forEach(l => {
            const s = (l.section || '').trim();
            if (s) sectionsSet.add(s);
        });

        const sortedSections = Array.from(sectionsSet).sort();

        sectionSelect.innerHTML = '<option value="all">All Sections</option>';
        sortedSections.forEach(sec => {
            const opt = document.createElement('option');
            opt.value = sec;
            opt.textContent = `Section: ${sec}`;
            sectionSelect.appendChild(opt);
        });

        if (sortedSections.includes(currentVal)) {
            sectionSelect.value = currentVal;
        }
    }

    renderActivePresenceRoster() {
        const container = document.getElementById('activeStudentsContainer');
        const badge = document.getElementById('activeStudentsCountBadge');

        const liveLearners = this.combinedLearners.filter(l => l.status === 'in_progress');

        if (badge) {
            badge.textContent = `${liveLearners.length} Live Now`;
        }

        if (!container) return;

        if (liveLearners.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; color: #94a3b8; font-size: 0.85rem; padding: 1rem;">
                    No learners are currently taking the quiz right now.
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        liveLearners.forEach(st => {
            const item = document.createElement('div');
            item.className = 'active-student-item';

            const timeStr = this.formatRelativeTime(st.updatedAt);
            const taskLabel = st.currentTaskDisplay || `Task ${st.currentTaskNum || 1}`;

            item.innerHTML = `
                <div class="active-student-info">
                    <span class="active-student-name">${st.studentName}</span>
                    <div class="active-student-meta">
                        <span class="section-pill">${st.section}</span>
                        <span>• ${taskLabel}</span>
                        <span>• ${timeStr}</span>
                    </div>
                </div>
                <span class="status-indicator status-progress">
                    <span class="dot-live-pulse"></span>
                    ${st.answeredQuestions}/${st.totalQuestions} (${st.progressPercentage}%)
                </span>
            `;

            item.addEventListener('click', () => this.showStudentDetails(st));
            container.appendChild(item);
        });
    }

    // ==========================================
    // FILTERING, SORTING & RENDERING
    // ==========================================

    applyFilters() {
        const searchInput = document.getElementById('searchInput');
        const query = (searchInput ? searchInput.value : '').toLowerCase().trim();
        const scoreVal = document.getElementById('scoreFilter')?.value || 'all';
        const sectionVal = document.getElementById('sectionFilter')?.value || 'all';
        const statusVal = document.getElementById('statusFilter')?.value || 'all';

        this.filteredLearners = this.combinedLearners.filter(l => {
            // Tab View Filter
            if (this.currentView === 'in_progress' && l.status !== 'in_progress') return false;
            if (this.currentView === 'completed' && l.status !== 'completed') return false;
            if (this.currentView === 'auto_submitted' && l.status !== 'auto_submitted' && l.status !== 'expired') return false;

            // Status Dropdown Filter
            if (statusVal !== 'all' && l.status !== statusVal) return false;

            // Section Filter
            if (sectionVal !== 'all' && (l.section || '') !== sectionVal) return false;

            // Search Query Filter
            if (query) {
                const name = (l.studentName || '').toLowerCase();
                const sid = (l.studentId || '').toLowerCase();
                const sec = (l.section || '').toLowerCase();
                const match = name.includes(query) || sid.includes(query) || sec.includes(query);
                if (!match) return false;
            }

            // Performance Level Filter
            if (scoreVal !== 'all') {
                const p = l.percentage || 0;
                if (scoreVal === 'mastery' && p < 90) return false;
                if (scoreVal === 'proficient' && (p < 75 || p >= 90)) return false;
                if (scoreVal === 'remediation' && p >= 75) return false;
            }

            return true;
        });

        // Sorting
        this.filteredLearners.sort((a, b) => {
            const field = this.currentSort.field;
            let valA = a[field];
            let valB = b[field];

            if (field === 'updatedAt' || field === 'completedAt' || field === 'startedAt') {
                valA = new Date(valA || 0).getTime();
                valB = new Date(valB || 0).getTime();
            } else if (field === 'studentName' || field === 'section' || field === 'status') {
                valA = (valA || '').toString().toLowerCase();
                valB = (valB || '').toString().toLowerCase();
            } else if (typeof valA === 'number') {
                valA = valA || 0;
                valB = valB || 0;
            }

            if (valA < valB) return this.currentSort.order === 'asc' ? -1 : 1;
            if (valA > valB) return this.currentSort.order === 'asc' ? 1 : -1;
            return 0;
        });

        this.renderTable();
    }

    updateSortIcons() {
        document.querySelectorAll('th[data-sort]').forEach(th => {
            const field = th.dataset.sort;
            if (field === this.currentSort.field) {
                th.classList.add('sorted');
            } else {
                th.classList.remove('sorted');
            }
        });
    }

    renderTable() {
        const tbody = document.getElementById('resultsTableBody');
        const countBadge = document.getElementById('resultCountBadge');

        if (countBadge) {
            countBadge.textContent = `Showing ${this.filteredLearners.length} of ${this.combinedLearners.length} learners`;
        }

        if (!tbody) return;
        tbody.innerHTML = '';

        if (this.filteredLearners.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 3rem; color: #64748b;">
                        🔍 No student records match the selected view or search criteria.
                    </td>
                </tr>
            `;
            return;
        }

        this.filteredLearners.forEach(l => {
            const tr = document.createElement('tr');

            // Status Pill formatting
            let statusPill = '';
            if (l.status === 'completed') {
                statusPill = `<span class="status-pill status-completed">🟢 Completed</span>`;
            } else if (l.status === 'auto_submitted') {
                statusPill = `<span class="status-pill status-auto-submitted">🔴 Auto Submitted</span>`;
            } else if (l.status === 'expired') {
                statusPill = `<span class="status-pill status-expired">⚪ Expired</span>`;
            } else {
                statusPill = `<span class="status-pill status-in-progress"><span class="dot-live-pulse"></span> In Progress</span>`;
            }

            // Progress Bar & Stats
            const progressPct = l.progressPercentage || 0;
            const isFinished = (l.status === 'completed' || l.status === 'auto_submitted');
            const fillClass = isFinished ? 'completed' : '';

            const progressCell = `
                <div class="table-progress-wrap">
                    <div class="table-progress-info">
                        <span>${l.answeredQuestions} / ${l.totalQuestions}</span>
                        <span>${progressPct}%</span>
                    </div>
                    <div class="table-progress-bar">
                        <div class="table-progress-fill ${fillClass}" style="width: ${progressPct}%"></div>
                    </div>
                </div>
            `;

            // Score Display
            let scoreDisplay = '';
            if (isFinished) {
                const p = Math.round(l.percentage || 0);
                let pillClass = 'pct-remediation';
                if (p >= 90) pillClass = 'pct-mastery';
                else if (p >= 75) pillClass = 'pct-proficient';
                scoreDisplay = `<strong>${l.score}/${l.totalQuestions}</strong> <span class="pill-pct ${pillClass}" style="font-size: 0.72rem; padding: 0.15rem 0.4rem;">${p}%</span>`;
            } else {
                scoreDisplay = `<span style="color: #64748b; font-size: 0.82rem;">${l.score} pts (${l.answeredQuestions} ans)</span>`;
            }

            // Last Activity Human-readable
            const timeStr = this.formatRelativeTime(l.updatedAt || l.completedAt || l.startedAt);

            tr.innerHTML = `
                <td>
                    <div style="font-weight: 800; color: #0f172a;">${l.studentName}</div>
                    <div style="font-size: 0.72rem; color: #64748b; font-family: monospace;">${l.studentId}</div>
                </td>
                <td><span class="section-pill">${l.section}</span></td>
                <td class="text-center" style="font-weight: 700; color: #334155;">${l.currentTaskDisplay}</td>
                <td>${progressCell}</td>
                <td class="text-center">${scoreDisplay}</td>
                <td class="text-center">${statusPill}</td>
                <td class="text-muted" style="font-size: 0.82rem;" title="${l.updatedAt || ''}">${timeStr}</td>
                <td class="text-center">
                    <button type="button" class="btn-view-result">👁️ View</button>
                </td>
            `;

            const viewBtn = tr.querySelector('.btn-view-result');
            if (viewBtn) {
                viewBtn.addEventListener('click', () => this.showStudentDetails(l));
            }

            tbody.appendChild(tr);
        });
    }

    updateRelativeTimeDisplays() {
        this.renderActivePresenceRoster();
        this.renderTable();
    }

    formatRelativeTime(dateStr) {
        if (!dateStr) return 'Just now';
        const timestamp = new Date(dateStr).getTime();
        if (isNaN(timestamp)) return 'Just now';

        const diffSeconds = Math.floor((Date.now() - timestamp) / 1000);

        if (diffSeconds < 15) return 'Just now';
        if (diffSeconds < 60) return `${diffSeconds}s ago`;
        
        const diffMinutes = Math.floor(diffSeconds / 60);
        if (diffMinutes < 60) return `${diffMinutes}m ago`;
        
        const diffHours = Math.floor(diffMinutes / 60);
        if (diffHours < 24) {
            const timePart = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return `Today ${timePart}`;
        }

        return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    // ==========================================
    // DETAIL MODAL & USER ACTIONS
    // ==========================================

    showStudentDetails(l) {
        this.currentSelectedLearner = l;
        const modal = document.getElementById('studentDetailModal');
        if (!modal) return;

        // Initials / Avatar
        const avatarEl = document.getElementById('modalAvatar');
        if (avatarEl) {
            const rawName = l.studentName || 'Student';
            const parts = rawName.trim().split(/\s+/);
            const initials = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : rawName.slice(0, 2).toUpperCase();
            avatarEl.textContent = initials || '👨‍🎓';
        }

        const nameEl = document.getElementById('modalStudentName');
        const secEl = document.getElementById('modalStudentSection');
        const sidEl = document.getElementById('modalStudentId');
        const tagEl = document.getElementById('modalDetailTag');

        if (nameEl) nameEl.textContent = l.studentName || 'Student';
        if (secEl) secEl.textContent = l.section || 'Grade 10';
        if (sidEl) sidEl.textContent = l.studentId || 'N/A';

        if (tagEl) {
            if (l.status === 'completed') {
                tagEl.className = 'status-pill status-completed';
                tagEl.textContent = '🟢 Completed Assessment';
            } else if (l.status === 'auto_submitted') {
                tagEl.className = 'status-pill status-auto-submitted';
                tagEl.textContent = '🔴 Auto Submitted';
            } else if (l.status === 'expired') {
                tagEl.className = 'status-pill status-expired';
                tagEl.textContent = '⚪ Expired / Inactive';
            } else {
                tagEl.className = 'status-pill status-in-progress';
                tagEl.innerHTML = '<span class="dot-live-pulse"></span> In Progress';
            }
        }

        // Summary KPI Cards
        const scoreEl = document.getElementById('modalFinalScore');
        const pctEl = document.getElementById('modalPercentage');
        const xpEl = document.getElementById('modalXP');
        const streakEl = document.getElementById('modalStreak');
        const timeUsedEl = document.getElementById('modalTimeUsed');

        if (scoreEl) scoreEl.textContent = `${l.score || 0} / ${l.totalQuestions || 32}`;
        if (pctEl) pctEl.textContent = `${Math.round(l.percentage || 0)}% Score`;
        if (xpEl) xpEl.textContent = `+${l.earnedXP || ((l.score || 0) * 10)} XP`;
        if (streakEl) streakEl.textContent = `x${l.maxStreak || 0}`;

        if (timeUsedEl) {
            const mins = Math.floor((l.timeUsed || 0) / 60);
            const secs = (l.timeUsed || 0) % 60;
            timeUsedEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }

        // Task 1 Breakdown
        const t1Score = l.task1Score !== undefined ? l.task1Score : (l.taskScores && l.taskScores.task1 ? l.taskScores.task1.score : 0);
        const t1Total = 10;
        const t1Correct = l.task1Correct !== undefined ? l.task1Correct : t1Score;
        const t1Wrong = l.task1Wrong !== undefined ? l.task1Wrong : (t1Total - t1Score);
        const t1Pct = Math.min(100, Math.round((t1Score / t1Total) * 100));

        const t1ScoreEl = document.getElementById('modalT1Score');
        const t1BarEl = document.getElementById('modalT1Bar');
        const t1CorrectChip = document.getElementById('modalT1CorrectChip');
        const t1WrongChip = document.getElementById('modalT1WrongChip');

        if (t1ScoreEl) t1ScoreEl.textContent = `${t1Score} / ${t1Total}`;
        if (t1BarEl) t1BarEl.style.width = `${t1Pct}%`;
        if (t1CorrectChip) t1CorrectChip.textContent = `✅ ${t1Correct} Correct`;
        if (t1WrongChip) t1WrongChip.textContent = `❌ ${t1Wrong} Wrong`;

        // Task 2 Breakdown
        const t2Score = l.task2Score !== undefined ? l.task2Score : (l.taskScores && l.taskScores.task2 ? l.taskScores.task2.score : 0);
        const t2Total = 10;
        const t2Correct = l.task2Correct !== undefined ? l.task2Correct : t2Score;
        const t2Wrong = l.task2Wrong !== undefined ? l.task2Wrong : (t2Total - t2Score);
        const t2Pct = Math.min(100, Math.round((t2Score / t2Total) * 100));

        const t2ScoreEl = document.getElementById('modalT2Score');
        const t2BarEl = document.getElementById('modalT2Bar');
        const t2CorrectChip = document.getElementById('modalT2CorrectChip');
        const t2WrongChip = document.getElementById('modalT2WrongChip');

        if (t2ScoreEl) t2ScoreEl.textContent = `${t2Score} / ${t2Total}`;
        if (t2BarEl) t2BarEl.style.width = `${t2Pct}%`;
        if (t2CorrectChip) t2CorrectChip.textContent = `✅ ${t2Correct} Correct`;
        if (t2WrongChip) t2WrongChip.textContent = `❌ ${t2Wrong} Wrong`;

        // Task 3 Breakdown
        const t3Score = l.task3Score !== undefined ? l.task3Score : (l.taskScores && l.taskScores.task3 ? l.taskScores.task3.score : 0);
        const t3Total = 12;
        const t3Correct = l.task3Correct !== undefined ? l.task3Correct : t3Score;
        const t3Wrong = l.task3Wrong !== undefined ? l.task3Wrong : (t3Total - t3Score);
        const t3Pct = Math.min(100, Math.round((t3Score / t3Total) * 100));

        const t3ScoreEl = document.getElementById('modalT3Score');
        const t3BarEl = document.getElementById('modalT3Bar');
        const t3CorrectChip = document.getElementById('modalT3CorrectChip');
        const t3WrongChip = document.getElementById('modalT3WrongChip');

        if (t3ScoreEl) t3ScoreEl.textContent = `${t3Score} / ${t3Total}`;
        if (t3BarEl) t3BarEl.style.width = `${t3Pct}%`;
        if (t3CorrectChip) t3CorrectChip.textContent = `✅ ${t3Correct} Correct`;
        if (t3WrongChip) t3WrongChip.textContent = `❌ ${t3Wrong} Wrong`;

        // Metadata & Timestamps
        const dateEl = document.getElementById('modalDate');
        if (dateEl) {
            const dateStr = l.completedAt || l.updatedAt || l.startedAt;
            dateEl.textContent = dateStr ? new Date(dateStr).toLocaleString() : 'N/A';
        }

        const tabSwitchesEl = document.getElementById('modalTabSwitches');
        if (tabSwitchesEl) {
            const switches = l.tabSwitches || 0;
            tabSwitchesEl.textContent = `${switches} violation${switches === 1 ? '' : 's'}`;
        }

        const autoWarn = document.getElementById('modalAutoSubmitWarning');
        if (autoWarn) {
            if (l.autoSubmitted) {
                autoWarn.classList.remove('hidden');
                autoWarn.textContent = `⚠️ Note: This quiz was automatically submitted due to multiple tab-switch alerts (${l.tabSwitches || 0} violations recorded).`;
            } else {
                autoWarn.classList.add('hidden');
            }
        }

        modal.classList.remove('hidden');
    }

    bindEvents() {
        // Sign Out
        const logoutBtn = document.getElementById('teacherLogoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                this.cleanupListeners();
                await window.firebaseService.teacherSignOut();
                window.location.replace('teacher-login.html');
            });
        }

        // View Tabs
        document.querySelectorAll('.dash-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.dash-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentView = btn.dataset.view || 'all';
                this.applyFilters();
            });
        });

        // Search Input
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', () => this.applyFilters());
        }

        // Section Filter
        const sectionFilter = document.getElementById('sectionFilter');
        if (sectionFilter) {
            sectionFilter.addEventListener('change', () => this.applyFilters());
        }

        // Status Filter
        const statusFilter = document.getElementById('statusFilter');
        if (statusFilter) {
            statusFilter.addEventListener('change', () => this.applyFilters());
        }

        // Score Filter
        const scoreFilter = document.getElementById('scoreFilter');
        if (scoreFilter) {
            scoreFilter.addEventListener('change', () => this.applyFilters());
        }

        // Sync Now Button
        const refreshBtn = document.getElementById('refreshDataBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.setupRealtimeListeners();
            });
        }

        // Export CSV Button
        const exportCsvBtn = document.getElementById('exportCsvBtn');
        if (exportCsvBtn) {
            exportCsvBtn.addEventListener('click', () => this.exportToCSV());
        }

        // Student Detail Modal Close Buttons
        const modal = document.getElementById('studentDetailModal');
        const closeModalBtn = document.getElementById('closeModalBtn');
        const closeModalBtnTop = document.getElementById('closeModalBtnTop');

        const hideDetailModal = () => {
            if (modal) modal.classList.add('hidden');
        };

        if (closeModalBtn) closeModalBtn.addEventListener('click', hideDetailModal);
        if (closeModalBtnTop) closeModalBtnTop.addEventListener('click', hideDetailModal);
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) hideDetailModal();
            });
        }

        // Copy Student Summary Button
        const copySummaryBtn = document.getElementById('copyStudentSummaryBtn');
        if (copySummaryBtn) {
            copySummaryBtn.addEventListener('click', () => {
                if (!this.currentSelectedLearner) return;
                const l = this.currentSelectedLearner;
                const summaryText = `--- ENGLISH QUEST ASSESSMENT RESULT ---
Learner: ${l.studentName}
Section: ${l.section}
Student ID: ${l.studentId}
Status: ${(l.status || '').toUpperCase()}
Score: ${l.score || 0} / ${l.totalQuestions || 32} (${Math.round(l.percentage || 0)}%)
XP Earned: +${l.earnedXP || 0} XP
Task 1 (Literary Elements): ${l.task1Score || 0} / 10
Task 2 (Vocabulary & Context): ${l.task2Score || 0} / 10
Task 3 (Style & Culture): ${l.task3Score || 0} / 12
Time Used: ${Math.floor((l.timeUsed || 0) / 60)}m ${(l.timeUsed || 0) % 60}s
Completed: ${l.completedAt || l.updatedAt || 'In Progress'}`;

                navigator.clipboard.writeText(summaryText).then(() => {
                    copySummaryBtn.innerHTML = '<span>✅ Copied Summary!</span>';
                    setTimeout(() => {
                        copySummaryBtn.innerHTML = '<span>📋 Copy Result Summary</span>';
                    }, 2000);
                }).catch(() => {
                    alert('Summary copied to clipboard:\n\n' + summaryText);
                });
            });
        }

        // Answer Key Modal
        const viewKeyBtn = document.getElementById('viewAnswerKeyBtn');
        const answerKeyModal = document.getElementById('answerKeyModal');
        const closeAnswerKeyBtn = document.getElementById('closeAnswerKeyBtn');
        const closeAnswerKeyBtnTop = document.getElementById('closeAnswerKeyBtnTop');

        const hideKeyModal = () => {
            if (answerKeyModal) answerKeyModal.classList.add('hidden');
        };

        if (viewKeyBtn && answerKeyModal) {
            viewKeyBtn.addEventListener('click', () => answerKeyModal.classList.remove('hidden'));
        }
        if (closeAnswerKeyBtn) closeAnswerKeyBtn.addEventListener('click', hideKeyModal);
        if (closeAnswerKeyBtnTop) closeAnswerKeyBtnTop.addEventListener('click', hideKeyModal);
        if (answerKeyModal) {
            answerKeyModal.addEventListener('click', (e) => {
                if (e.target === answerKeyModal) hideKeyModal();
            });
        }

        // Copy Official Answer Key Text
        const copyKeyBtn = document.getElementById('copyAnswerKeyBtn');
        if (copyKeyBtn) {
            copyKeyBtn.addEventListener('click', () => {
                const keyText = `--- ENGLISH QUEST OFFICIAL MASTER ANSWER KEY ---
GRADE 10 ENGLISH REMEDIATION ASSESSMENT (32 ITEMS TOTAL)

🎯 TASK 1 — Understanding Literary Elements (10 Questions):
1-C  2-C  3-B  4-A  5-B  6-A  7-C  8-A  9-A  10-B

🔎 TASK 2 — Analyzing & Evaluating a Literary Text (10 Questions):
1-B  2-A  3-A  4-A  5-B  6-B  7-A  8-A  9-B  10-A

✍️ TASK 3 — Language, Style, Cohesion & Culture (12 Questions):
1-A  2-B  3-A  4-A  5-A  6-B  7-A  8-A  9-A  10-A  11-B  12-A`;

                navigator.clipboard.writeText(keyText).then(() => {
                    copyKeyBtn.innerHTML = '<span>✅ Copied Key Text!</span>';
                    setTimeout(() => {
                        copyKeyBtn.innerHTML = '<span>📋 Copy Key Text</span>';
                    }, 2000);
                }).catch(() => {
                    alert('Official Key:\n\n' + keyText);
                });
            });
        }

        // Table Sorting Header Clicks
        document.querySelectorAll('th[data-sort]').forEach(th => {
            th.addEventListener('click', () => {
                const field = th.dataset.sort;
                if (this.currentSort.field === field) {
                    this.currentSort.order = (this.currentSort.order === 'asc') ? 'desc' : 'asc';
                } else {
                    this.currentSort.field = field;
                    this.currentSort.order = (field === 'studentName' || field === 'section') ? 'asc' : 'desc';
                }
                this.updateSortIcons();
                this.applyFilters();
            });
        });
    }

    exportToCSV() {
        if (this.filteredLearners.length === 0) {
            alert('No student records available to export with current filters.');
            return;
        }

        const headers = [
            'Student Name',
            'Student ID',
            'Section',
            'Status',
            'Current Task',
            'Answered Questions',
            'Total Questions',
            'Progress (%)',
            'Score',
            'Percentage (%)',
            'Task 1 (/10)',
            'Task 2 (/10)',
            'Task 3 (/12)',
            'Time Used (seconds)',
            'Auto Submitted',
            'Last Activity / Completed'
        ];

        const rows = this.filteredLearners.map(l => [
            `"${(l.studentName || '').replace(/"/g, '""')}"`,
            `"${(l.studentId || '').replace(/"/g, '""')}"`,
            `"${(l.section || 'Grade 10').replace(/"/g, '""')}"`,
            `"${(l.status || '').toUpperCase()}"`,
            `"${l.currentTaskDisplay || ''}"`,
            l.answeredQuestions || 0,
            l.totalQuestions || 32,
            l.progressPercentage || 0,
            l.score || 0,
            l.percentage || 0,
            l.task1Score || 0,
            l.task2Score || 0,
            l.task3Score || 0,
            l.timeUsed || 0,
            l.autoSubmitted ? "YES" : "NO",
            `"${l.completedAt || l.updatedAt || l.startedAt || ''}"`
        ]);

        const csv = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csv);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `EnglishQuest_LiveMonitoring_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.teacherDashboard = new TeacherDashboard();
});