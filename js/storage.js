/**
 * STORAGE & PERSISTENCE MODULE — ENGLISH QUEST
 * Multi-layer persistence: Firestore Cloud Sync + LocalStorage Cache with Offline Recovery
 */

const StorageManager = {
    KEYS: {
        ACTIVE_ATTEMPT: 'english_quest_active_attempt',
        STUDENT_SESSION: 'english_quest_student_session',
        COMPLETED_RESULTS: 'english_quest_completed_results',
        OFFLINE_QUEUE: 'english_quest_offline_queue'
    },

    // Save active attempt with offline recovery support
    saveAttempt(attemptData) {
        if (!attemptData) return;
        try {
            attemptData.updated_at = new Date().toISOString();
            attemptData.updated_at_ms = Date.now();
            localStorage.setItem(this.KEYS.ACTIVE_ATTEMPT, JSON.stringify(attemptData));
            
            // If Firebase is available and online, sync to cloud
            if (typeof window !== 'undefined' && window.FirebaseDB && window.FirebaseDB.syncAttempt) {
                window.FirebaseDB.syncAttempt(attemptData).catch(err => {
                    console.warn('[StorageManager] Cloud sync deferred (offline):', err.message);
                    this.queueOfflineSync(attemptData);
                });
            }
        } catch (e) {
            console.error('[StorageManager] LocalStorage save error:', e);
        }
    },

    // Retrieve active attempt
    getAttempt() {
        try {
            const raw = localStorage.getItem(this.KEYS.ACTIVE_ATTEMPT);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            console.error('[StorageManager] LocalStorage read error:', e);
            return null;
        }
    },

    // Clear active attempt (after completion or reset)
    clearAttempt() {
        try {
            localStorage.removeItem(this.KEYS.ACTIVE_ATTEMPT);
        } catch (e) {
            console.error('[StorageManager] LocalStorage clear error:', e);
        }
    },

    // Save finalized results
    saveCompletedResult(resultData) {
        if (!resultData) return;
        try {
            localStorage.setItem(this.KEYS.COMPLETED_RESULTS, JSON.stringify(resultData));
            if (typeof window !== 'undefined' && window.FirebaseDB && window.FirebaseDB.submitCompletedAttempt) {
                window.FirebaseDB.submitCompletedAttempt(resultData).catch(err => {
                    console.warn('[StorageManager] Final result sync deferred:', err.message);
                });
            }
        } catch (e) {
            console.error('[StorageManager] Save completed result error:', e);
        }
    },

    // Get finalized results
    getCompletedResult() {
        try {
            const raw = localStorage.getItem(this.KEYS.COMPLETED_RESULTS);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    },

    // Queue for offline synchronization
    queueOfflineSync(attemptData) {
        try {
            localStorage.setItem(this.KEYS.OFFLINE_QUEUE, JSON.stringify(attemptData));
        } catch (e) {
            console.error('[StorageManager] Offline queue error:', e);
        }
    },

    // Process queued offline sync when back online
    flushOfflineQueue() {
        try {
            const queued = localStorage.getItem(this.KEYS.OFFLINE_QUEUE);
            if (queued && window.FirebaseDB && window.FirebaseDB.syncAttempt) {
                const attempt = JSON.parse(queued);
                window.FirebaseDB.syncAttempt(attempt).then(() => {
                    localStorage.removeItem(this.KEYS.OFFLINE_QUEUE);
                    console.log('[StorageManager] Offline queue successfully synchronized to cloud.');
                });
            }
        } catch (e) {
            console.error('[StorageManager] Flush queue error:', e);
        }
    }
};

// Listen for network reconnect to flush offline queue
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => StorageManager.flushOfflineQueue());
    window.StorageManager = StorageManager;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StorageManager };
}

