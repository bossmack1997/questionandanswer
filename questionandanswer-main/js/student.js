/**
 * STUDENT ENTRY & QUEST BRIEFING CONTROLLER (WITH MULTI-DEVICE RESUME DETECTION)
 * Handles name input, validation, active Firestore/LocalStorage attempt check,
 * and seamless continuation or fresh start.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const nameForm = document.getElementById('studentNameForm');
    const nameInput = document.getElementById('studentNameInput');
    const nameError = document.getElementById('nameError');
    const nameEntryCard = document.getElementById('nameEntryCard');
    const challengeReadyCard = document.getElementById('challengeReadyCard');
    const welcomeStudentName = document.getElementById('welcomeStudentName');
    const startChallengeBtn = document.getElementById('startChallengeBtn');
    const startBtnText = document.getElementById('startBtnText');
    const startBtnIcon = document.getElementById('startBtnIcon');
    const changeNameBtn = document.getElementById('changeNameBtn');
    const startOverBtn = document.getElementById('startOverBtn');

    // Resume elements
    const activeAttemptBanner = document.getElementById('activeAttemptBanner');
    const resumeTaskName = document.getElementById('resumeTaskName');
    const resumeProgress = document.getElementById('resumeProgress');
    const resumeXP = document.getElementById('resumeXP');
    const resumeTimeLeft = document.getElementById('resumeTimeLeft');

    let activeAttemptData = null;

    // Check if name already stored in session
    const existingName = localStorage.getItem('studentName') || sessionStorage.getItem('studentName');
    if (existingName && existingName.trim().length >= 2) {
        nameInput.value = existingName;
        await checkAndShowBriefing(existingName);
    }

    if (nameForm) {
        nameForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const rawName = nameInput.value.trim();

            // Validation: Name cannot be empty and minimum 2 characters
            if (!rawName || rawName.length < 2) {
                showError('Please enter your name (at least 2 characters).');
                nameInput.focus();
                return;
            }

            if (rawName.length > 50) {
                showError('Name is too long. Please use 50 characters or less.');
                nameInput.focus();
                return;
            }

            // Sanitize against HTML injection
            const cleanName = rawName.replace(/[<>]/g, '');

            // Store active session locally
            localStorage.setItem('studentName', cleanName);
            sessionStorage.setItem('studentName', cleanName);

            await checkAndShowBriefing(cleanName);
        });
    }

    if (changeNameBtn) {
        changeNameBtn.addEventListener('click', () => {
            challengeReadyCard.classList.add('hidden');
            nameEntryCard.classList.remove('hidden');
            hideError();
            nameInput.focus();
        });
    }

    if (startOverBtn) {
        startOverBtn.addEventListener('click', async () => {
            if (confirm('Start a fresh quest? Your previous active progress will be reset.')) {
                const currentName = localStorage.getItem('studentName') || sessionStorage.getItem('studentName');
                if (currentName) {
                    const studentId = window.firebaseService ? window.firebaseService.normalizeStudentId(currentName) : ('student_' + currentName.toLowerCase().replace(/[^a-z0-9]/g, '_'));
                    if (window.firebaseService) {
                        await window.firebaseService.deleteActiveAttempt(studentId, currentName);
                    }
                    localStorage.removeItem('english10_quest_attempt_' + currentName);
                    localStorage.removeItem('english10_active_attempt_' + studentId);
                    sessionStorage.removeItem('english10_active_state');
                }
                activeAttemptData = null;
                updateBriefingUI(currentName, null);
            }
        });
    }

    if (startChallengeBtn) {
        startChallengeBtn.addEventListener('click', () => {
            startChallengeBtn.disabled = true;
            if (activeAttemptData) {
                startChallengeBtn.innerHTML = '<span>Resuming Quest...</span> <span>⚔️</span>';
            } else {
                startChallengeBtn.innerHTML = '<span>Launching Quest...</span> <span>🚀</span>';
            }
            window.location.href = 'quiz.html';
        });
    }

    async function checkAndShowBriefing(name) {
        hideError();
        const studentId = window.firebaseService ? window.firebaseService.normalizeStudentId(name) : ('student_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_'));
        
        // Check Firestore or LocalStorage for active attempt
        let attempt = null;
        if (window.firebaseService) {
            try {
                attempt = await window.firebaseService.getActiveAttempt(studentId, name);
            } catch (err) {
                console.warn('Could not query active attempt:', err);
            }
        }
        if (!attempt) {
            const local = localStorage.getItem('english10_active_attempt_' + studentId) || localStorage.getItem('english10_quest_attempt_' + name);
            if (local) {
                try { attempt = JSON.parse(local); } catch (e) {}
            }
        }

        activeAttemptData = attempt;
        updateBriefingUI(name, attempt);

        nameEntryCard.classList.add('hidden');
        challengeReadyCard.classList.remove('hidden');
    }

    function updateBriefingUI(name, attempt) {
        welcomeStudentName.textContent = name;

        if (attempt && attempt.answersMap && Object.keys(attempt.answersMap).length > 0) {
            const answeredCount = Object.keys(attempt.answersMap).length;
            const currentTask = attempt.currentTask || 1;
            const xp = attempt.earnedXP || (attempt.score ? attempt.score * 10 : 0);

            // Compute time remaining from started_at
            let timeRemainingSec = 1800;
            if (attempt.started_at_ms || attempt.started_at) {
                const startMs = attempt.started_at_ms || new Date(attempt.started_at).getTime();
                const elapsedSec = Math.floor((Date.now() - startMs) / 1000);
                timeRemainingSec = Math.max(0, 1800 - elapsedSec);
            } else if (typeof attempt.timeRemaining === 'number') {
                timeRemainingSec = attempt.timeRemaining;
            }

            const m = Math.floor(timeRemainingSec / 60);
            const s = timeRemainingSec % 60;
            const formattedTime = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;

            if (resumeTaskName) resumeTaskName.textContent = 'Task ' + currentTask;
            if (resumeProgress) resumeProgress.textContent = answeredCount + ' / 32';
            if (resumeXP) resumeXP.textContent = xp + ' XP';
            if (resumeTimeLeft) resumeTimeLeft.textContent = formattedTime;

            if (activeAttemptBanner) activeAttemptBanner.classList.remove('hidden');
            if (startOverBtn) startOverBtn.classList.remove('hidden');

            if (startBtnText) startBtnText.textContent = 'RESUME QUEST';
            if (startBtnIcon) startBtnIcon.textContent = '⚔️';
        } else {
            if (activeAttemptBanner) activeAttemptBanner.classList.add('hidden');
            if (startOverBtn) startOverBtn.classList.add('hidden');

            if (startBtnText) startBtnText.textContent = 'START THE QUEST';
            if (startBtnIcon) startBtnIcon.textContent = '🔥';
        }
    }

    function showError(msg) {
        if (nameError) {
            nameError.textContent = msg;
            nameError.classList.remove('hidden');
        }
    }

    function hideError() {
        if (nameError) {
            nameError.textContent = '';
            nameError.classList.add('hidden');
        }
    }
});
