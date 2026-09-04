/**
 * AUTH & STUDENT SESSION MANAGER — ENGLISH QUEST
 * Manages clean student sessions with unique stable identifiers based on Full Name & Section
 */

const AuthManager = {
    SESSION_KEY: 'english_quest_student_session',

    // Generate deterministic clean unique student ID from Name + Section
    generateStudentId(name, section = '') {
        const cleanName = (name || 'student').trim().toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
        const cleanSec = (section || 'general').trim().toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
        return `student_${cleanName || 'anonymous'}_sec_${cleanSec || 'general'}`;
    },

    // Initialize or retrieve student session with Full Name and Section
    loginStudent(studentName, studentSection = '') {
        if (!studentName || !studentName.trim()) {
            throw new Error('Student name is required.');
        }

        const trimmedName = studentName.trim();
        const trimmedSection = (studentSection || '').trim() || 'Grade 10';
        const studentId = this.generateStudentId(trimmedName, trimmedSection);

        const newSession = {
            student_id: studentId,
            studentId: studentId,
            name: trimmedName,
            studentName: trimmedName,
            section: trimmedSection,
            studentSection: trimmedSection,
            logged_in_at: new Date().toISOString(),
            logged_in_at_ms: Date.now()
        };

        try {
            localStorage.setItem(this.SESSION_KEY, JSON.stringify(newSession));
            localStorage.setItem('english10_student_name', trimmedName);
            localStorage.setItem('english10_student_section', trimmedSection);
            localStorage.setItem('english10_student_id', studentId);
        } catch (e) {
            console.error('[AuthManager] Session save error:', e);
        }

        return newSession;
    },

    // Retrieve active student session
    getStudentSession() {
        try {
            const raw = localStorage.getItem(this.SESSION_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.name) return parsed;
            }
            const fallbackName = localStorage.getItem('english10_student_name');
            const fallbackSection = localStorage.getItem('english10_student_section') || 'Grade 10';
            if (fallbackName) {
                return {
                    student_id: this.generateStudentId(fallbackName, fallbackSection),
                    name: fallbackName,
                    section: fallbackSection
                };
            }
            return null;
        } catch (e) {
            return null;
        }
    },

    // Convenient getter for current student
    getCurrentStudent() {
        return this.getStudentSession();
    },

    // Logout / Clear session
    logout() {
        try {
            localStorage.removeItem(this.SESSION_KEY);
            localStorage.removeItem('english10_student_name');
            localStorage.removeItem('english10_student_section');
            localStorage.removeItem('english10_student_id');
            sessionStorage.removeItem('english10_active_state');
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


