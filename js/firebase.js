/**
 * FIREBASE INITIALIZATION & FIRESTORE ADAPTER (MULTI-DEVICE ACTIVE ATTEMPT SYNC)
 * Handles authentication, real-time active attempt synchronization,
 * atomic task submissions (Tasks 1, 2, 3, 4) with duplicate prevention,
 * and saving completed quiz results to Firestore collection 'quiz_results'.
 */

const firebaseConfig = {
    apiKey: "AIzaSyAwdV8U4uZ0yBKbWFld3bV-zR1gKnX6EZI",
    authDomain: "questionandanswer-1d20f.firebaseapp.com",
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
     * Ensures consistent identification across devices, case-sensitivity, and spaces.
     */
    normalizeStudentId(name) {
        if (!name || typeof name !== 'string') return 'student_anonymous';
        const clean = name.trim().toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '');
        return 'student_' + (clean || 'anonymous');
    }

    /**
     * Get active in-progress attempt for a student across any device/browser.
     */
    async getActiveAttempt(studentId, studentName) {
        const id = studentId || this.normalizeStudentId(studentName);

        // 1. Try Firestore First (Authoritative source across devices)
        if (this.initialized && this.db) {
            try {
                const docSnap = await this.db.collection('active_attempts').doc(id).get();
                if (docSnap.exists) {
                    const data = docSnap.data();
                    if (data && data.status === 'in_progress') {
                        // Mirror to local cache for responsiveness
                        localStorage.setItem('english10_active_attempt_' + id, JSON.stringify(data));
                        return data;
                    }
                }
            } catch (err) {
                console.warn('[FirebaseService] Active attempt fetch note:', err.message);
            }
        }

        // 2. Fallback to Local Storage Cache
        const local = localStorage.getItem('english10_active_attempt_' + id) ||
                      localStorage.getItem('english10_quest_attempt_' + studentName);
        if (local) {
            try {
                const parsed = JSON.parse(local);
                if (parsed && (!parsed.status || parsed.status === 'in_progress')) {
                    return parsed;
                }
            } catch (e) {
                console.warn('[FirebaseService] Corrupt local active attempt:', e);
            }
        }

        return null;
    }

    /**
     * Save/Update in-progress attempt in real time (Multi-device state).
     */
    async saveActiveAttempt(attemptData) {
        if (!attemptData) return false;
        const studentId = attemptData.student_id || this.normalizeStudentId(attemptData.student_name || attemptData.studentName);
        attemptData.student_id = studentId;
        attemptData.status = 'in_progress';
        attemptData.last_activity_at = new Date().toISOString();

        // Save to local cache immediately
        try {
            localStorage.setItem('english10_active_attempt_' + studentId, JSON.stringify(attemptData));
            if (attemptData.student_name || attemptData.studentName) {
                localStorage.setItem('english10_quest_attempt_' + (attemptData.student_name || attemptData.studentName), JSON.stringify(attemptData));
            }
        } catch (e) {
            console.warn('[FirebaseService] LocalStorage write warning:', e);
        }

        // Push to Cloud Firestore
        if (this.initialized && this.db && navigator.onLine) {
            try {
                await this.db.collection('active_attempts').doc(studentId).set({
                    ...attemptData,
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
                    last_activity_at: new Date().toISOString(),
                    server_updated_at: firebase.firestore.FieldValue.serverTimestamp()
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
                const docSnap = await this.db.collection('submissions').doc(docId).get();
                if (docSnap.exists) {
                    const data = docSnap.data();
                    if (data && data.status === 'completed') {
                        localStorage.setItem('english10_sub_' + docId, JSON.stringify(data));
                        return data;
                    }
                }
                return null;
            } catch (err) {
                console.warn(`[FirebaseService] Firestore task submission query error for ${docId}:`, err.message);
                throw err;
            }
        }

        // 2. Fallback to local cache only if Firestore is not initialized
        const local = localStorage.getItem('english10_sub_' + docId) ||
                      localStorage.getItem('english10_sub_' + sid + '_' + tNum);
        if (local) {
            try {
                const parsed = JSON.parse(local);
                if (parsed && parsed.status === 'completed') {
                    return parsed;
                }
            } catch (e) {}
        }

        return null;
    }

    /**
     * Retrieve all completed task submissions for student (Tasks 1, 2, 3, 4).
     */
    async getAllTaskSubmissionsForStudent(studentId) {
        const sid = studentId || 'student_anonymous';
        const results = { 1: null, 2: null, 3: null, 4: null };

        for (let t = 1; t <= 4; t++) {
            try {
                results[t] = await this.getTaskSubmission(sid, t);
            } catch (err) {
                console.warn(`[FirebaseService] Error checking task ${t} submission for ${sid}:`, err.message);
                // Check local cache if network error
                const localSub = localStorage.getItem(`english10_sub_${sid}_task${t}`);
                if (localSub) {
                    try { results[t] = JSON.parse(localSub); } catch(e){}
                }
            }
        }

        return results;
    }

    /**
     * Atomic save of task submission with Firestore transaction duplicate protection.
     */
    async saveTaskSubmission(taskData) {
        if (!taskData) throw new Error('Submission data is missing.');

        const sid = taskData.studentId || this.normalizeStudentId(taskData.studentName);
        const tNum = parseInt(taskData.taskId, 10) || 1;
        const docId = `${sid}_task${tNum}`;

        const taskTotals = { 1: 10, 2: 10, 3: 12, 4: 10 };
        const totalQ = taskData.totalQuestions || taskTotals[tNum] || 10;
        const score = typeof taskData.score === 'number' ? taskData.score : 0;
        const pct = typeof taskData.percentage === 'number' ? Number(taskData.percentage.toFixed(2)) : Number(((score / totalQ) * 100).toFixed(2));

        const payload = {
            studentId: sid,
            studentName: taskData.studentName || 'Student',
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
                console.error(`[FirebaseService] Firestore transaction error for ${docId}:`, err);
                throw new Error("We couldn't verify your quiz status. Please check your connection and try again.");
            }
        } else {
            console.warn('[FirebaseService] Firestore not initialized during saveTaskSubmission.');
        }

        return payload;
    }

    /**
     * Save final submitted quiz result matching schema requirement,
     * and atomically persist each task's submission record (Tasks 1..4).
     */
    async saveQuizResult(data) {
        const studentId = data.studentId || data.student_id || this.normalizeStudentId(data.studentName || data.student_name);
        const studentName = data.studentName || data.student_name || "Anonymous";

        const answersMap = data.answersMap || (data.attemptAudit && data.attemptAudit.selected_answers) || {};
        
        const t1Total = 10;
        const t2Total = 10;
        const t3Total = 12;
        const t4Total = 10;
        const totalOverallQuestions = 42;

        const t1Score = (typeof data.task1Score === 'number') ? data.task1Score : (data.task1Correct || 0);
        const t2Score = (typeof data.task2Score === 'number') ? data.task2Score : (data.task2Correct || 0);
        const t3Score = (typeof data.task3Score === 'number') ? data.task3Score : (data.task3Correct || 0);
        const t4Score = (typeof data.task4Score === 'number') ? data.task4Score : (data.task4Correct || 0);

        const totalScore = (typeof data.totalScore === 'number') ? data.totalScore : (t1Score + t2Score + t3Score + t4Score);
        const percentage = typeof data.percentage === 'number' ? Number(data.percentage.toFixed(2)) : Number(((totalScore / totalOverallQuestions) * 100).toFixed(2));

        // Atomically ensure each task submission is recorded
        const taskScoresArray = [
            { taskId: 1, score: t1Score, total: t1Total },
            { taskId: 2, score: t2Score, total: t2Total },
            { taskId: 3, score: t3Score, total: t3Total },
            { taskId: 4, score: t4Score, total: t4Total }
        ];

        for (const tInfo of taskScoresArray) {
            try {
                await this.saveTaskSubmission({
                    studentId: studentId,
                    studentName: studentName,
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

            task4Score: t4Score,
            task4Correct: data.task4Correct !== undefined ? data.task4Correct : t4Score,
            task4Wrong: data.task4Wrong !== undefined ? data.task4Wrong : (t4Total - t4Score),
            task4Unanswered: data.task4Unanswered || 0,

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
                console.error('[FirebaseService] Error saving quiz_results to Firestore:', err);
                throw new Error("Failed to save final quiz result to database. Please check your connection.");
            }
        }

        // Clean active in-progress attempt upon verified completion
        await this.deleteActiveAttempt(studentId, studentName);

        return payload;
    }

    /**
     * Retrieve all student quiz results for Teacher Dashboard from Firestore.
     */
    async getAllResults() {
        if (this.initialized && this.db) {
            try {
                const snapshot = await this.db.collection('quiz_results').orderBy('completedAt', 'desc').get();
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
                console.warn('[FirebaseService] Firestore results query note, checking fallback:', err);
            }
        }

        return JSON.parse(localStorage.getItem('english10_quiz_submissions') || '[]');
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

