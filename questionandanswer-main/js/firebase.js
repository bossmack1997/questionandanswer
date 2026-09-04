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
     * Save final submitted quiz result matching the exact schema requirement.
     */
    async saveQuizResult(data) {
        const payload = {
            studentName: data.studentName || data.student_name || "Anonymous",
            studentId: data.studentId || data.student_id || this.normalizeStudentId(data.studentName || data.student_name),
            attemptId: data.attemptId || data.attempt_id || ('quest_' + Date.now()),

            task1Score: data.task1Score || 0,
            task1Correct: data.task1Correct || 0,
            task1Wrong: data.task1Wrong || 0,
            task1Unanswered: data.task1Unanswered || 0,

            task2Score: data.task2Score || 0,
            task2Correct: data.task2Correct || 0,
            task2Wrong: data.task2Wrong || 0,
            task2Unanswered: data.task2Unanswered || 0,

            task3Score: data.task3Score || 0,
            task3Correct: data.task3Correct || 0,
            task3Wrong: data.task3Wrong || 0,
            task3Unanswered: data.task3Unanswered || 0,

            totalScore: data.totalScore || 0,
            totalQuestions: 32,

            percentage: typeof data.percentage === 'number' ? Number(data.percentage.toFixed(2)) : Number(((data.totalScore / 32) * 100).toFixed(2)),
            earnedXP: data.earnedXP || (data.totalScore * 10),
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
