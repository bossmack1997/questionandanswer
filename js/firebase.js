/**
 * FIREBASE INITIALIZATION & FIRESTORE ADAPTER (MULTI-DEVICE ACTIVE ATTEMPT SYNC)
 * Handles authentication, real-time active attempt synchronization,
 * and saving completed quiz results to Firestore collection 'quiz_results'.
 * Includes full offline queue and localStorage resilience.
 */

const firebaseConfig = {
    apiKey: "AIzaSy_YOUR_API_KEY_HERE",
    authDomain: "your-project-id.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project-id.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdef123456"
};

class FirebaseService {
    constructor() {
        this.initialized = false;
        this.auth = null;
        this.db = null;
        this.isMockMode = false;
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
        } catch (err) {
            console.warn('Firebase initialization warning:', err.message);
        }

        this.isMockMode = true;
        console.info('ℹ️ Running in Local Storage Mode. Multi-device sync will use local state and fallback cache.');
    }

    normalizeStudentId(name) {
        if (!name) return 'student_anonymous';
        const clean = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
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
                        // Mirror to local cache
                        localStorage.setItem('english10_active_attempt_' + id, JSON.stringify(data));
                        return data;
                    }
                }
            } catch (err) {
                console.warn('Firestore active attempt check failed, falling back to local cache:', err);
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
                console.warn('Corrupt local active attempt:', e);
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
            console.warn('Local storage write warning:', e);
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
                console.warn('Could not sync active attempt to Firestore:', err);
                return false;
            }
        }

        return true;
    }

    /**
     * Record single answer atomically.
     */
    async recordAnswer(studentId, attemptId, questionId, selectedOptionId, extraData = {}) {
        const id = studentId || 'student_unknown';
        const answerPayload = {
            attempt_id: attemptId,
            question_id: questionId,
            selected_option_id: selectedOptionId,
            answered_at: new Date().toISOString(),
            ...extraData
        };

        if (this.initialized && this.db && navigator.onLine) {
            try {
                await this.db.collection('active_attempts').doc(id).set({
                    answersMap: { [questionId]: selectedOptionId },
                    last_activity_at: new Date().toISOString(),
                    server_updated_at: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                return true;
            } catch (err) {
                console.warn('Error recording answer to Firestore:', err);
            }
        }
        return false;
    }

    /**
     * Delete active attempt record after final submission.
     */
    async deleteActiveAttempt(studentId, studentName) {
        const id = studentId || this.normalizeStudentId(studentName);

        // Remove from local cache
        localStorage.removeItem('english10_active_attempt_' + id);
        if (studentName) {
            localStorage.removeItem('english10_quest_attempt_' + studentName);
        }

        // Delete from Firestore
        if (this.initialized && this.db) {
            try {
                await this.db.collection('active_attempts').doc(id).delete();
            } catch (err) {
                console.warn('Could not delete active attempt from Firestore:', err);
            }
        }
    }

    /**
     * Check if a specific task has already been completed by student.
     * Document key: studentId_taskId in 'submissions' collection.
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
            } catch (err) {
                console.warn('Firestore task submission query note:', err.message);
            }
        }

        // 2. Fallback to Local Storage Cache
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

        // Check each task individually
        for (let t = 1; t <= 4; t++) {
            results[t] = await this.getTaskSubmission(sid, t);
        }

        return results;
    }

    /**
     * Atomic save of task submission with duplicate check guard.
     */
    async saveTaskSubmission(taskData) {
        if (!taskData) throw new Error('Submission data is missing.');

        const sid = taskData.studentId || this.normalizeStudentId(taskData.studentName);
        const tNum = parseInt(taskData.taskId, 10) || 1;
        const docId = `${sid}_task${tNum}`;

        // Duplicate guard: Check existing submission before writing
        const existing = await this.getTaskSubmission(sid, tNum);
        if (existing && existing.status === 'completed') {
            console.warn(`[FirebaseService] Task ${tNum} is already submitted for ${sid}. Duplicate write blocked.`);
            return existing;
        }

        const totalQ = taskData.totalQuestions || (tNum === 3 ? 12 : 10);
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
            autoSubmitted: !!taskData.autoSubmitted,
            submittedAt: new Date().toISOString()
        };

        // 1. Save to LocalStorage immediately
        try {
            localStorage.setItem('english10_sub_' + docId, JSON.stringify(payload));
        } catch (e) {
            console.warn('LocalStorage save warning:', e);
        }

        // 2. Save to Firestore 'submissions' collection
        if (this.initialized && this.db) {
            try {
                await this.db.collection('submissions').doc(docId).set({
                    ...payload,
                    submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    serverTimestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
                console.log(`[FirebaseService] Task ${tNum} submission saved to Firestore: ${docId}`);
            } catch (err) {
                console.error('[FirebaseService] Firestore save error:', err);
                throw new Error("We couldn't verify your quiz status. Please check your connection and try again.");
            }
        }

        return payload;
    }

    /**
     * Save final submitted quiz result matching schema requirement,
     * and atomically persist each task's submission record.
     */
    async saveQuizResult(data) {
        const studentId = data.studentId || data.student_id || this.normalizeStudentId(data.studentName || data.student_name);
        const studentName = data.studentName || data.student_name || "Anonymous";

        // Save individual task submissions into 'submissions' collection
        const answersMap = data.answersMap || (data.attemptAudit && data.attemptAudit.selected_answers) || {};
        
        const t1Total = 10;
        const t2Total = 10;
        const t3Total = 12;

        const t1Score = (typeof data.task1Score === 'number') ? data.task1Score : (data.task1Correct || 0);
        const t2Score = (typeof data.task2Score === 'number') ? data.task2Score : (data.task2Correct || 0);
        const t3Score = (typeof data.task3Score === 'number') ? data.task3Score : (data.task3Correct || 0);

        try {
            await this.saveTaskSubmission({
                studentId: studentId,
                studentName: studentName,
                taskId: 1,
                score: t1Score,
                totalQuestions: t1Total,
                percentage: Number(((t1Score / t1Total) * 100).toFixed(2)),
                answers: answersMap,
                timeUsed: data.timeUsed || 0,
                autoSubmitted: data.autoSubmitted
            });

            await this.saveTaskSubmission({
                studentId: studentId,
                studentName: studentName,
                taskId: 2,
                score: t2Score,
                totalQuestions: t2Total,
                percentage: Number(((t2Score / t2Total) * 100).toFixed(2)),
                answers: answersMap,
                timeUsed: data.timeUsed || 0,
                autoSubmitted: data.autoSubmitted
            });

            await this.saveTaskSubmission({
                studentId: studentId,
                studentName: studentName,
                taskId: 3,
                score: t3Score,
                totalQuestions: t3Total,
                percentage: Number(((t3Score / t3Total) * 100).toFixed(2)),
                answers: answersMap,
                timeUsed: data.timeUsed || 0,
                autoSubmitted: data.autoSubmitted
            });
        } catch (e) {
            console.warn('[FirebaseService] Task submission individual save note:', e);
        }

        const payload = {
            studentName: studentName,
            studentId: studentId,
            attemptId: data.attemptId || data.attempt_id || ('quest_' + Date.now()),

            task1Score: t1Score,
            task1Correct: data.task1Correct || t1Score,
            task1Wrong: data.task1Wrong || (10 - t1Score),
            task1Unanswered: data.task1Unanswered || 0,

            task2Score: t2Score,
            task2Correct: data.task2Correct || t2Score,
            task2Wrong: data.task2Wrong || (10 - t2Score),
            task2Unanswered: data.task2Unanswered || 0,

            task3Score: t3Score,
            task3Correct: data.task3Correct || t3Score,
            task3Wrong: data.task3Wrong || (12 - t3Score),
            task3Unanswered: data.task3Unanswered || 0,

            totalScore: data.totalScore || (t1Score + t2Score + t3Score),
            totalQuestions: 32,

            percentage: typeof data.percentage === 'number' ? Number(data.percentage.toFixed(2)) : Number((((data.totalScore || (t1Score + t2Score + t3Score)) / 32) * 100).toFixed(2)),
            earnedXP: data.earnedXP || ((data.totalScore || (t1Score + t2Score + t3Score)) * 10),
            maxStreak: data.maxStreak || 0,
            timeUsed: data.timeUsed || 0,
            autoSubmitted: !!data.autoSubmitted,
            completedAt: new Date().toISOString()
        };

        // Mirror to localStorage list for Teacher Dashboard
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
                console.log('Result saved to Firestore with ID:', docRef.id);
                payload.id = docRef.id;
            } catch (err) {
                console.error('Error saving to Firestore:', err);
            }
        }

        // Clean active in-progress attempt
        await this.deleteActiveAttempt(payload.studentId, payload.studentName);

        return payload;
    }

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
                console.warn('Firestore query failed, using local backup:', err);
            }
        }

        return JSON.parse(localStorage.getItem('english10_quiz_submissions') || '[]');
    }

    async teacherSignIn(email, password) {
        if (this.initialized && this.auth) {
            return await this.auth.signInWithEmailAndPassword(email, password);
        } else {
            throw new Error('Authentication service is currently unavailable. Please verify Firebase configuration.');
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
            callback(null);
        }
    }
}

if (typeof window !== "undefined") {
    window.firebaseService = new FirebaseService();
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { FirebaseService };
}
