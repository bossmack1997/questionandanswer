/**
 * FIREBASE INITIALIZATION & FIRESTORE ADAPTER (MULTI-DEVICE ACTIVE ATTEMPT SYNC)
 * Handles authentication, real-time active attempt synchronization,
 * atomic task submissions (Tasks 1, 2, 3, 4) with duplicate prevention,
 * and saving completed quiz results to Firestore collection 'quiz_results'.
 */

const firebaseConfig = {
    apiKey: "AIzaSyAwdV8U4uZ0yBKbWFld3bV-zR1gKnX6EZI",
    authDomain: "questionandanswer-1d20f.firebaseapp.com",
     databaseURL: "https://questionandanswer-1d20f-default-rtdb.firebaseio.com",
    projectId: "questionandanswer-1d20f",
    storageBucket: "questionandanswer-1d20f.firebasestorage.app",
    messagingSenderId: "67343470260",
    appId: "1:67343470260:web:ef251a3c84729c713991e1",
    measurementId: "G-PSFGEX57RQ"
};

class FirebaseService {

    constructor() {
        this.initialized = false;
        this.auth = null;
        this.db = null;
        this.init();
    }

    init() {
        try {
            if (typeof firebase !== 'undefined' && firebase.initializeApp) {
                if (firebaseConfig.apiKey && !firebaseConfig.apiKey.includes('YOUR_API_KEY')) {
                    if (!firebase.apps.length) {
                        firebase.initializeApp(firebaseConfig);
                    }
                    this.auth = firebase.auth();
                    this.db = firebase.firestore();

                    // Enable offline persistence when supported
                    if (typeof this.db.enablePersistence === 'function') {
                        this.db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
                            if (err.code !== 'failed-precondition' && err.code !== 'unimplemented') {
                                // Ignore benign multi-tab precondition errors
                            }
                        });
                    }

                    this.initialized = true;
                    console.info('🔥 Firebase initialized successfully.');
                    return;
                }
            }
            console.error('Firebase SDK not detected or configuration is invalid.');
        } catch (err) {
            console.error('Firebase initialization error:', err);
        }
    }

    /**
     * Deterministic Student ID Generation
     * Ensures consistent identification across devices, case-sensitivity, spaces, and sections.
     */
    normalizeStudentId(name, section = '') {
        if (!name || typeof name !== 'string') return 'student_anonymous';
        const cleanName = name.trim().toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '');
        const cleanSec = (section || '').trim().toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '');
        return 'student_' + (cleanName || 'anonymous') + (cleanSec ? ('_sec_' + cleanSec) : '');
    }

    /**
     * Register student active session in real-time for Teacher Monitoring.
     */
    async registerStudentSession(studentData) {
        if (!studentData) return;
        const sid = studentData.studentId || this.normalizeStudentId(studentData.studentName, studentData.studentSection);
        const name = studentData.studentName || 'Student';
        const section = studentData.studentSection || studentData.section || 'Grade 10';
        const status = studentData.status || 'online';

        const record = {
            studentId: sid,
            studentName: name,
            studentSection: section,
            status: status,
            currentTask: studentData.currentTask || 1,
            lastActive: new Date().toISOString(),
            lastActiveMs: Date.now()
        };

        // Mirror to local list for offline / teacher backup
        try {
            const raw = localStorage.getItem('english10_active_students');
            const list = raw ? JSON.parse(raw) : [];
            const idx = list.findIndex(item => item.studentId === sid);
            if (idx >= 0) {
                list[idx] = { ...list[idx], ...record };
            } else {
                list.unshift(record);
            }
            localStorage.setItem('english10_active_students', JSON.stringify(list));
        } catch (e) {}

        // Push to Cloud Firestore collection 'active_students'
        if (this.initialized && this.db) {
            try {
                await this.db.collection('active_students').doc(sid).set({
                    ...record,
                    serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            } catch (err) {
                // Silently fallback on offline
            }
        }
    }

    /**
     * Retrieve all active / logged-in student sessions for Teacher Dashboard.
     */
    async getActiveStudents() {
        if (this.initialized && this.db) {
            try {
                const fetchPromise = this.db.collection('active_students').get();
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
                const snapshot = await Promise.race([fetchPromise, timeoutPromise]);
                const list = [];
                snapshot.forEach(doc => {
                    list.push({ id: doc.id, ...doc.data() });
                });
                if (list.length > 0) return list;
            } catch (err) {
                // Silently fallback
            }
        }

        try {
            const raw = localStorage.getItem('english10_active_students');
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    /**
     * Get active in-progress attempt for a student across any device/browser.
     */
    async getActiveAttempt(studentId, studentName, studentSection = '') {
        const id = studentId || this.normalizeStudentId(studentName, studentSection);

        // 1. Try Firestore First (Authoritative source across devices)
        if (this.initialized && this.db) {
            try {
                const getPromise = this.db.collection('active_attempts').doc(id).get();
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
                const docSnap = await Promise.race([getPromise, timeoutPromise]);

                if (docSnap && docSnap.exists) {
                    const data = docSnap.data();
                    if (data && data.status === 'in_progress') {
                        try {
                            localStorage.setItem('english10_active_attempt_' + id, JSON.stringify(data));
                        } catch (e) {}
                        return data;
                    }
                }
            } catch (err) {
                // Silently fallback to local cache on offline / timeout
            }
        }

        // 2. Fallback to Local Storage Cache
        const localKeys = [
            'english10_active_attempt_' + id,
            'english10_quest_attempt_' + (studentName || id)
        ];
        for (const k of localKeys) {
            const local = localStorage.getItem(k);
            if (local) {
                try {
                    const parsed = JSON.parse(local);
                    if (parsed && (!parsed.status || parsed.status === 'in_progress')) {
                        return parsed;
                    }
                } catch (e) {}
            }
        }

        return null;
    }

    /**
     * Save/Update in-progress attempt in real time (Multi-device state).
     * Maintains complete attempt schema required for real-time teacher monitoring.
     */
    async saveActiveAttempt(attemptData) {
        if (!attemptData) return false;
        const studentName = attemptData.studentName || attemptData.student_name || 'Student';
        const section = attemptData.section || attemptData.studentSection || attemptData.student_section || 'Grade 10';
        const studentId = attemptData.studentId || attemptData.student_id || this.normalizeStudentId(studentName, section);
        const attemptId = attemptData.attemptId || attemptData.attempt_id || ('quest_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6));

        const totalQ = attemptData.totalQuestions || 32;
        const answersMap = attemptData.answersMap || attemptData.selected_answers || {};
        const answeredQ = attemptData.answeredQuestions !== undefined ? attemptData.answeredQuestions : Object.keys(answersMap).length;
        const score = typeof attemptData.score === 'number' ? attemptData.score : (attemptData.correctAnswers || 0);
        const correctAnswers = attemptData.correctAnswers !== undefined ? attemptData.correctAnswers : score;
        const wrongAnswers = attemptData.wrongAnswers !== undefined ? attemptData.wrongAnswers : Math.max(0, answeredQ - correctAnswers);
        const progressPct = totalQ > 0 ? Math.min(100, Math.round((answeredQ / totalQ) * 100)) : 0;
        const currentQ = attemptData.currentQuestion !== undefined ? attemptData.currentQuestion : ((attemptData.currentQuestionIndex !== undefined ? attemptData.currentQuestionIndex : 0) + 1);
        const nowIso = new Date().toISOString();

        const payload = {
            attemptId: attemptId,
            studentId: studentId,
            studentName: studentName,
            section: section,
            studentSection: section,
            status: attemptData.status || 'in_progress',
            currentTask: attemptData.currentTask || 1,
            currentQuestion: currentQ,
            currentQuestionIndex: attemptData.currentQuestionIndex !== undefined ? attemptData.currentQuestionIndex : (currentQ - 1),
            totalQuestions: totalQ,
            answeredQuestions: answeredQ,
            correctAnswers: correctAnswers,
            wrongAnswers: wrongAnswers,
            progressPercentage: progressPct,
            score: score,
            earnedXP: attemptData.earnedXP || (score * 10),
            streak: attemptData.streak || 0,
            maxStreak: attemptData.maxStreak || 0,
            tabSwitches: attemptData.tabSwitches || 0,
            timeRemaining: attemptData.timeRemaining !== undefined ? attemptData.timeRemaining : null,
            totalTimeUsed: attemptData.totalTimeUsed || 0,
            startedAt: attemptData.startedAt || attemptData.started_at || nowIso,
            startedAtMs: attemptData.startedAtMs || attemptData.started_at_ms || Date.now(),
            updatedAt: nowIso,
            submittedAt: attemptData.submittedAt || null,
            answersMap: answersMap,
            taskQuestions: attemptData.taskQuestions || {},
            taskScores: attemptData.taskScores || {},
            attemptAudit: attemptData.attemptAudit || attemptData.attempt_audit || {}
        };

        // Save to local cache immediately
        try {
            localStorage.setItem('english10_active_attempt_' + studentId, JSON.stringify(payload));
            localStorage.setItem('english10_quest_attempt_' + studentName, JSON.stringify(payload));
        } catch (e) {
            console.warn('[FirebaseService] LocalStorage write warning:', e);
        }

        // Push to Cloud Firestore collection 'active_attempts'
        if (this.initialized && this.db && navigator.onLine) {
            try {
                await this.db.collection('active_attempts').doc(studentId).set({
                    ...payload,
                    server_updated_at: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                return true;
            } catch (err) {
                console.warn('[FirebaseService] Could not sync active attempt to Firestore:', err);
                return false;
            }
        }

        return true;
    }

    /**
     * Record single answer atomically in active attempt.
     */
    async recordAnswer(studentId, attemptId, questionId, selectedOptionId, extraData = {}) {
        const id = studentId || 'student_unknown';

        if (this.initialized && this.db && navigator.onLine) {
            try {
                await this.db.collection('active_attempts').doc(id).set({
                    answersMap: { [questionId]: selectedOptionId },
                    updatedAt: new Date().toISOString(),
                    server_updated_at: firebase.firestore.FieldValue.serverTimestamp(),
                    ...extraData
                }, { merge: true });
                return true;
            } catch (err) {
                console.warn('[FirebaseService] Error recording answer to Firestore:', err);
            }
        }
        return false;
    }

    /**
     * Delete active attempt record after confirmed final submission.
     */
    async deleteActiveAttempt(studentId, studentName) {
        const id = studentId || this.normalizeStudentId(studentName);

        // Remove from local cache
        localStorage.removeItem('english10_active_attempt_' + id);
        if (studentName) {
            localStorage.removeItem('english10_quest_attempt_' + studentName);
        }
        sessionStorage.removeItem('english10_active_state');

        // Delete from Firestore
        if (this.initialized && this.db) {
            try {
                await this.db.collection('active_attempts').doc(id).delete();
            } catch (err) {
                console.warn('[FirebaseService] Could not delete active attempt from Firestore:', err);
            }
        }
    }

    /**
     * Check if a specific task has already been completed by student.
     * Document key: studentId_task{taskId} in 'submissions' collection.
     */
    async getTaskSubmission(studentId, taskId) {
        const sid = studentId || 'student_anonymous';
        const tNum = parseInt(taskId, 10) || 1;
        const docId = `${sid}_task${tNum}`;

        // 1. Try Firestore First (Authoritative source across devices)
        if (this.initialized && this.db) {
            try {
                const getPromise = this.db.collection('submissions').doc(docId).get();
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
                const docSnap = await Promise.race([getPromise, timeoutPromise]);

                if (docSnap && docSnap.exists) {
                    const data = docSnap.data();
                    if (data && data.status === 'completed') {
                        try {
                            localStorage.setItem('english10_sub_' + docId, JSON.stringify(data));
                        } catch (e) {}
                        return data;
                    }
                }
            } catch (err) {
                // Silently handle expected offline/timeout states without throwing
            }
        }

        // 2. Fallback to Local Storage Cache
        const localKeys = [
            `english10_sub_${docId}`,
            `english10_task_submission_${sid}_task${tNum}`,
            `english10_sub_${sid}_${tNum}`
        ];
        for (const k of localKeys) {
            const local = localStorage.getItem(k);
            if (local) {
                try {
                    const parsed = JSON.parse(local);
                    if (parsed && (parsed.status === 'completed' || typeof parsed.score === 'number')) {
                        return parsed;
                    }
                } catch (e) {}
            }
        }

        return null;
    }

    /**
     * Retrieve all completed task submissions for student (Tasks 1, 2, 3).
     */
    async getAllTaskSubmissionsForStudent(studentId) {
        const sid = studentId || 'student_anonymous';
        const results = { 
            1: null, 2: null, 3: null,
            task1: null, task2: null, task3: null
        };

        for (let t = 1; t <= 3; t++) {
            let sub = null;
            try {
                sub = await this.getTaskSubmission(sid, t);
            } catch (err) {
                // Fallback handled inside getTaskSubmission
            }

            results[t] = sub;
            results['task' + t] = sub;
        }

        return results;
    }

    /**
     * Atomic save of task submission with Firestore transaction duplicate protection.
     */
    async saveTaskSubmission(taskData) {
        if (!taskData) throw new Error('Submission data is missing.');

        const section = taskData.section || taskData.studentSection || localStorage.getItem('english10_student_section') || 'Grade 10';
        const sid = taskData.studentId || this.normalizeStudentId(taskData.studentName, section);
        const tNum = parseInt(taskData.taskId, 10) || 1;
        const docId = `${sid}_task${tNum}`;

        const taskTotals = { 1: 10, 2: 10, 3: 12, 4: 10 };
        const totalQ = taskData.totalQuestions || taskTotals[tNum] || 10;
        const score = typeof taskData.score === 'number' ? taskData.score : 0;
        const pct = typeof taskData.percentage === 'number' ? Number(taskData.percentage.toFixed(2)) : Number(((score / totalQ) * 100).toFixed(2));

        const payload = {
            studentId: sid,
            studentName: taskData.studentName || 'Student',
            section: section,
            studentSection: section,
            taskId: tNum,
            status: 'completed',
            score: score,
            totalQuestions: totalQ,
            percentage: pct,
            answers: taskData.answers || {},
            timeUsed: taskData.timeUsed || 0,
            autoSubmitted: Boolean(taskData.autoSubmitted),
            submittedAt: new Date().toISOString()
        };

        // Save to LocalStorage cache immediately
        try {
            localStorage.setItem('english10_sub_' + docId, JSON.stringify(payload));
        } catch (e) {
            console.warn('[FirebaseService] LocalStorage save warning:', e);
        }

        // Atomic Transaction in Cloud Firestore
        if (this.initialized && this.db) {
            try {
                const docRef = this.db.collection('submissions').doc(docId);

                await this.db.runTransaction(async (transaction) => {
                    const docSnap = await transaction.get(docRef);
                    if (docSnap.exists) {
                        const existingData = docSnap.data();
                        if (existingData && existingData.status === 'completed') {
                            console.warn(`[FirebaseService] Task ${tNum} is already submitted for ${sid}. Duplicate write blocked.`);
                            return existingData;
                        }
                    }

                    transaction.set(docRef, {
                        ...payload,
                        submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        serverTimestamp: firebase.firestore.FieldValue.serverTimestamp()
                    });
                });

                console.info(`[FirebaseService] Task ${tNum} submission saved atomically to Firestore: ${docId}`);
            } catch (err) {
                console.warn(`[FirebaseService] Firestore transaction notice for ${docId} (saved locally):`, err.message);
            }
        } else {
            console.info('[FirebaseService] Local storage used for saveTaskSubmission (Firestore offline or unconfigured).');
        }

        return payload;
    }

    /**
     * Save final submitted quiz result matching schema requirement,
     * and atomically persist each task's submission record (Tasks 1..4).
     */
    async saveQuizResult(data) {
        const section = data.section || data.studentSection || data.student_section || localStorage.getItem('english10_student_section') || 'Grade 10';
        const studentId = data.studentId || data.student_id || this.normalizeStudentId(data.studentName || data.student_name, section);
        const studentName = data.studentName || data.student_name || "Anonymous";

        const answersMap = data.answersMap || (data.attemptAudit && data.attemptAudit.selected_answers) || {};
        
        const t1Total = 10;
        const t2Total = 10;
        const t3Total = 12;
        const totalOverallQuestions = 32;

        const t1Score = (typeof data.task1Score === 'number') ? data.task1Score : (data.task1Correct || 0);
        const t2Score = (typeof data.task2Score === 'number') ? data.task2Score : (data.task2Correct || 0);
        const t3Score = (typeof data.task3Score === 'number') ? data.task3Score : (data.task3Correct || 0);

        const totalScore = (typeof data.totalScore === 'number') ? data.totalScore : (t1Score + t2Score + t3Score);
        const percentage = typeof data.percentage === 'number' ? Number(data.percentage.toFixed(2)) : Number(((totalScore / totalOverallQuestions) * 100).toFixed(2));

        // Atomically ensure each task submission is recorded
        const taskScoresArray = [
            { taskId: 1, score: t1Score, total: t1Total },
            { taskId: 2, score: t2Score, total: t2Total },
            { taskId: 3, score: t3Score, total: t3Total }
        ];

        for (const tInfo of taskScoresArray) {
            try {
                await this.saveTaskSubmission({
                    studentId: studentId,
                    studentName: studentName,
                    section: section,
                    studentSection: section,
                    taskId: tInfo.taskId,
                    score: tInfo.score,
                    totalQuestions: tInfo.total,
                    percentage: Number(((tInfo.score / tInfo.total) * 100).toFixed(2)),
                    answers: answersMap,
                    timeUsed: data.timeUsed || 0,
                    autoSubmitted: data.autoSubmitted
                });
            } catch (e) {
                console.warn(`[FirebaseService] Task ${tInfo.taskId} submission sync notice:`, e.message);
            }
        }

        const payload = {
            studentName: studentName,
            studentId: studentId,
            section: section,
            studentSection: section,
            attemptId: data.attemptId || data.attempt_id || ('quest_' + Date.now()),

            task1Score: t1Score,
            task1Correct: data.task1Correct !== undefined ? data.task1Correct : t1Score,
            task1Wrong: data.task1Wrong !== undefined ? data.task1Wrong : (t1Total - t1Score),
            task1Unanswered: data.task1Unanswered || 0,

            task2Score: t2Score,
            task2Correct: data.task2Correct !== undefined ? data.task2Correct : t2Score,
            task2Wrong: data.task2Wrong !== undefined ? data.task2Wrong : (t2Total - t2Score),
            task2Unanswered: data.task2Unanswered || 0,

            task3Score: t3Score,
            task3Correct: data.task3Correct !== undefined ? data.task3Correct : t3Score,
            task3Wrong: data.task3Wrong !== undefined ? data.task3Wrong : (t3Total - t3Score),
            task3Unanswered: data.task3Unanswered || 0,

            totalScore: totalScore,
            totalQuestions: totalOverallQuestions,
            percentage: percentage,
            earnedXP: data.earnedXP || (totalScore * 10),
            maxStreak: data.maxStreak || 0,
            timeUsed: data.timeUsed || 0,
            autoSubmitted: Boolean(data.autoSubmitted),
            completedAt: new Date().toISOString()
        };

        // Mirror to localStorage list for Teacher Dashboard backup
        const existing = JSON.parse(localStorage.getItem('english10_quiz_submissions') || '[]');
        payload.id = 'sub_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        existing.unshift(payload);
        localStorage.setItem('english10_quiz_submissions', JSON.stringify(existing));

        // Save to Firestore 'quiz_results'
        if (this.initialized && this.db) {
            try {
                const docRef = await this.db.collection('quiz_results').add({
                    ...payload,
                    completedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                console.info('[FirebaseService] Quiz result saved to Firestore with ID:', docRef.id);
                payload.id = docRef.id;
            } catch (err) {
                console.warn('[FirebaseService] Quiz result saved locally (Firestore write notice):', err.message);
            }
        }

        // Clean active in-progress attempt upon verified completion
        await this.deleteActiveAttempt(studentId, studentName);

        return payload;
    }

    /**
     * Real-time Firestore Listener for In-Progress Quiz Attempts (Teacher Live Monitoring).
     * Automatically triggers callback whenever a student starts, answers, moves tasks, or updates.
     */
    listenToActiveAttempts(onUpdate, onError) {
        if (this.initialized && this.db) {
            try {
                return this.db.collection('active_attempts').onSnapshot((snapshot) => {
                    const attempts = [];
                    snapshot.forEach(doc => {
                        const data = doc.data();
                        attempts.push({ id: doc.id, ...data });
                    });
                    if (typeof onUpdate === 'function') {
                        onUpdate(attempts);
                    }
                }, (err) => {
                    console.warn('[FirebaseService] active_attempts snapshot warning:', err.message);
                    if (typeof onError === 'function') onError(err);
                });
            } catch (err) {
                console.error('[FirebaseService] Error setting up active_attempts snapshot listener:', err);
                if (typeof onError === 'function') onError(err);
                return () => {};
            }
        }
        return () => {};
    }

    /**
     * Real-time Firestore Listener for Completed Quiz Results (Teacher Historical & Live Submissions).
     * Automatically triggers callback whenever a final quiz result is saved.
     */
    listenToQuizResults(onUpdate, onError) {
        if (this.initialized && this.db) {
            try {
                return this.db.collection('quiz_results').onSnapshot((snapshot) => {
                    const results = [];
                    snapshot.forEach(doc => {
                        const d = doc.data();
                        let dateStr = new Date().toISOString();
                        if (d.completedAt && d.completedAt.toDate) {
                            dateStr = d.completedAt.toDate().toISOString();
                        } else if (typeof d.completedAt === 'string') {
                            dateStr = d.completedAt;
                        }
                        results.push({
                            id: doc.id,
                            ...d,
                            completedAt: dateStr
                        });
                    });
                    if (typeof onUpdate === 'function') {
                        onUpdate(results);
                    }
                }, (err) => {
                    console.warn('[FirebaseService] quiz_results snapshot warning:', err.message);
                    if (typeof onError === 'function') onError(err);
                });
            } catch (err) {
                console.error('[FirebaseService] Error setting up quiz_results snapshot listener:', err);
                if (typeof onError === 'function') onError(err);
                return () => {};
            }
        }
        return () => {};
    }

    /**
     * Real-time Firestore Listener for Task-Level Submissions (Tasks 1, 2, 3).
     */
    listenToSubmissions(onUpdate, onError) {
        if (this.initialized && this.db) {
            try {
                return this.db.collection('submissions').onSnapshot((snapshot) => {
                    const submissions = [];
                    snapshot.forEach(doc => {
                        const d = doc.data();
                        let dateStr = new Date().toISOString();
                        if (d.submittedAt && d.submittedAt.toDate) {
                            dateStr = d.submittedAt.toDate().toISOString();
                        } else if (typeof d.submittedAt === 'string') {
                            dateStr = d.submittedAt;
                        }
                        submissions.push({
                            id: doc.id,
                            ...d,
                            submittedAt: dateStr
                        });
                    });
                    if (typeof onUpdate === 'function') {
                        onUpdate(submissions);
                    }
                }, (err) => {
                    console.warn('[FirebaseService] submissions snapshot warning:', err.message);
                    if (typeof onError === 'function') onError(err);
                });
            } catch (err) {
                console.error('[FirebaseService] Error setting up submissions snapshot listener:', err);
                if (typeof onError === 'function') onError(err);
                return () => {};
            }
        }
        return () => {};
    }

    /**
     * Real-time Firestore Listener for Registered Active Students.
     */
    listenToActiveStudents(onUpdate, onError) {
        if (this.initialized && this.db) {
            try {
                return this.db.collection('active_students').onSnapshot((snapshot) => {
                    const students = [];
                    snapshot.forEach(doc => {
                        const d = doc.data();
                        students.push({
                            id: doc.id,
                            ...d
                        });
                    });
                    if (typeof onUpdate === 'function') {
                        onUpdate(students);
                    }
                }, (err) => {
                    console.warn('[FirebaseService] active_students snapshot warning:', err.message);
                    if (typeof onError === 'function') onError(err);
                });
            } catch (err) {
                console.error('[FirebaseService] Error setting up active_students snapshot listener:', err);
                if (typeof onError === 'function') onError(err);
                return () => {};
            }
        }
        return () => {};
    }

    /**
     * Retrieve all student quiz results for Teacher Dashboard from Firestore.
     */
    async getAllResults() {
        if (this.initialized && this.db) {
            try {
                const fetchPromise = this.db.collection('quiz_results').get();
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000));
                const snapshot = await Promise.race([fetchPromise, timeoutPromise]);

                const list = [];
                snapshot.forEach(doc => {
                    const d = doc.data();
                    let dateStr = new Date().toISOString();
                    if (d.completedAt && d.completedAt.toDate) {
                        dateStr = d.completedAt.toDate().toISOString();
                    } else if (typeof d.completedAt === 'string') {
                        dateStr = d.completedAt;
                    }
                    list.push({
                        id: doc.id,
                        ...d,
                        completedAt: dateStr
                    });
                });
                return list;
            } catch (err) {
                // Silently fallback to local list on offline or timeout
            }
        }

        return JSON.parse(localStorage.getItem('english10_quiz_submissions') || '[]');
    }

    /**
     * Retrieve all task submissions from Firestore.
     */
    async getAllSubmissions() {
        if (this.initialized && this.db) {
            try {
                const fetchPromise = this.db.collection('submissions').get();
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000));
                const snapshot = await Promise.race([fetchPromise, timeoutPromise]);

                const list = [];
                snapshot.forEach(doc => {
                    const d = doc.data();
                    let dateStr = new Date().toISOString();
                    if (d.submittedAt && d.submittedAt.toDate) {
                        dateStr = d.submittedAt.toDate().toISOString();
                    } else if (typeof d.submittedAt === 'string') {
                        dateStr = d.submittedAt;
                    }
                    list.push({
                        id: doc.id,
                        ...d,
                        submittedAt: dateStr
                    });
                });
                return list;
            } catch (err) {
                // Silently fallback
            }
        }
        return [];
    }

    /**
     * Teacher Authentication Methods (Firebase Auth Email/Password)
     */
    async teacherSignIn(email, password) {
        if (this.initialized && this.auth) {
            return await this.auth.signInWithEmailAndPassword(email, password);
        } else {
            throw new Error('Authentication service is currently unavailable. Please verify your connection.');
        }
    }

    async teacherSignOut() {
        if (this.initialized && this.auth) {
            return await this.auth.signOut();
        }
    }

    async sendPasswordReset(email) {
        if (this.initialized && this.auth) {
            return await this.auth.sendPasswordResetEmail(email);
        } else {
            throw new Error('Authentication service is currently unavailable.');
        }
    }

    onAuthStateChanged(callback) {
        if (this.initialized && this.auth) {
            this.auth.onAuthStateChanged(callback);
        } else {
            // Re-check after slight delay if auth was initializing
            setTimeout(() => {
                if (this.initialized && this.auth) {
                    this.auth.onAuthStateChanged(callback);
                } else {
                    callback(null);
                }
            }, 500);
        }
    }
}

if (typeof window !== "undefined") {
    window.firebaseService = new FirebaseService();
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { FirebaseService, firebaseConfig };
}

