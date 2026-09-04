/**
 * AUTH & STUDENT SESSION MANAGER — ENGLISH QUEST
 * Manages clean student sessions with unique stable identifiers
 */

const AuthManager = {
    SESSION_KEY: 'english_quest_student_session',

    // Generate clean unique student ID
    generateStudentId(name) {
        const cleanName = (name || 'student').trim().toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 15);
        const timestamp = Date.now().toString(36);
        const randomHex = Math.random().toString(36).substring(2, 6);
        return `STU_${cleanName}_${timestamp}_${randomHex}`;
    },

    // Initialize or retrieve student session
    loginStudent(studentName) {
        if (!studentName || !studentName.trim()) {
            throw new Error('Student name is required.');
        }

        const trimmedName = studentName.trim();
        const existingSession = this.getStudentSession();

        // If same student name, preserve existing student ID
        if (existingSession && existingSession.name.toLowerCase() === trimmedName.toLowerCase()) {
            return existingSession;
        }

        const newSession = {
            student_id: this.generateStudentId(trimmedName),
            name: trimmedName,
            logged_in_at: new Date().toISOString(),
            logged_in_at_ms: Date.now()
        };

        try {
            localStorage.setItem(this.SESSION_KEY, JSON.stringify(newSession));
        } catch (e) {
            console.error('[AuthManager] Session save error:', e);
        }

        return newSession;
    },

    // Retrieve active student session
    getStudentSession() {
        try {
            const raw = localStorage.getItem(this.SESSION_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    },

    // Logout / Clear session
    logout() {
        try {
            localStorage.removeItem(this.SESSION_KEY);
        } catch (e) {
            console.error('[AuthManager] Session clear error:', e);
        }
    }
};

if (typeof window !== 'undefined') {
    window.AuthManager = AuthManager;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AuthManager };
}

