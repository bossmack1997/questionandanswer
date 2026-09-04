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
    let studentSubmissions = { 1: null, 2: null, 3: null, 4: null };

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

            // Store active session locally & in AuthManager
            if (typeof AuthManager !== 'undefined') {
                AuthManager.loginStudent(cleanName);
            }
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
            if (confirm('Start a fresh quest for in-progress tasks? Completed tasks will remain permanently locked.')) {
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
                await checkAndShowBriefing(currentName);
            }
        });
    }

    if (startChallengeBtn) {
        startChallengeBtn.addEventListener('click', () => {
            startChallengeBtn.disabled = true;
            
            // Determine first uncompleted task
            let targetTask = 1;
            if (studentSubmissions[1] && !studentSubmissions[2]) targetTask = 2;
            else if (studentSubmissions[1] && studentSubmissions[2] && !studentSubmissions[3]) targetTask = 3;
            else if (studentSubmissions[1] && studentSubmissions[2] && studentSubmissions[3]) {
                window.location.href = 'result.html';
                return;
            }

            if (activeAttemptData) {
                startChallengeBtn.innerHTML = '<span>Resuming Quest...</span> <span>⚔️</span>';
            } else {
                startChallengeBtn.innerHTML = '<span>Launching Task ' + targetTask + '...</span> <span>🚀</span>';
            }
            window.location.href = 'quiz.html?task=' + targetTask;
        });
    }

    async function checkAndShowBriefing(name) {
        hideError();
        const studentId = window.firebaseService ? window.firebaseService.normalizeStudentId(name) : ('student_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_'));
        
        // 1. Fetch all completed task submissions from Firestore / LocalStorage
        try {
            if (window.firebaseService) {
                studentSubmissions = await window.firebaseService.getAllTaskSubmissionsForStudent(studentId);
            }
        } catch (err) {
            console.warn('Could not query task submissions:', err);
        }

        // Fallback local checks if offline
        for (let t = 1; t <= 3; t++) {
            if (!studentSubmissions[t]) {
                const localSub = localStorage.getItem('english10_sub_' + studentId + '_task' + t);
                if (localSub) {
                    try { studentSubmissions[t] = JSON.parse(localSub); } catch(e) {}
                }
            }
        }

        // 2. Check Firestore or LocalStorage for active attempt
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
        updateBriefingUI(name, attempt, studentSubmissions);

        nameEntryCard.classList.add('hidden');
        challengeReadyCard.classList.remove('hidden');
    }

    function updateBriefingUI(name, attempt, submissions) {
        welcomeStudentName.textContent = name;

        // Update Roadmap Step Cards (Tasks 1, 2, 3)
        const totalTasks = 3;
        let completedCount = 0;
        let totalScore = 0;
        let totalQuestions = 0;

        for (let t = 1; t <= totalTasks; t++) {
            const stepCard = document.getElementById('mapStep' + t);
            const tagEl = document.getElementById('mapStepTag' + t);
            const scoreEl = document.getElementById('mapStepScore' + t);
            const actionEl = document.getElementById('mapStepAction' + t);

            if (!stepCard) continue;

            const sub = submissions ? submissions[t] : null;
            const isCompleted = sub && sub.status === 'completed';
            const prevCompleted = (t === 1) || (submissions && submissions[t - 1] && submissions[t - 1].status === 'completed');
            const isCurrentActive = attempt && attempt.currentTask === t && (!isCompleted);

            stepCard.classList.remove('step-unlocked', 'step-locked', 'step-completed');

            if (isCompleted) {
                completedCount++;
                totalScore += (sub.score || 0);
                totalQuestions += (sub.totalQuestions || (t === 3 ? 12 : 10));

                stepCard.classList.add('step-completed');
                if (tagEl) {
                    tagEl.className = 'step-status-tag status-completed';
                    tagEl.textContent = '✓ COMPLETED 🔒';
                }
                if (scoreEl) {
                    scoreEl.classList.remove('hidden');
                    scoreEl.textContent = `Score: ${sub.score} / ${sub.totalQuestions} (${Math.round(sub.percentage)}%)`;
                }
                if (actionEl) {
                    actionEl.innerHTML = `<a href="result.html?task=${t}" class="btn-step-action btn-view-sub"><span>View Result 👁️</span></a>`;
                }
            } else if (isCurrentActive) {
                stepCard.classList.add('step-unlocked');
                if (tagEl) {
                    tagEl.className = 'step-status-tag status-active';
                    tagEl.textContent = '⚡ IN PROGRESS';
                }
                if (scoreEl) scoreEl.classList.add('hidden');
                if (actionEl) {
                    actionEl.innerHTML = `<a href="quiz.html?task=${t}" class="btn-step-action btn-resume-task"><span>Resume ⚔️</span></a>`;
                }
            } else if (prevCompleted) {
                stepCard.classList.add('step-unlocked');
                if (tagEl) {
                    tagEl.className = 'step-status-tag status-available';
                    tagEl.textContent = '● AVAILABLE';
                }
                if (scoreEl) scoreEl.classList.add('hidden');
                if (actionEl) {
                    actionEl.innerHTML = `<a href="quiz.html?task=${t}" class="btn-step-action btn-start-task"><span>Start Task 🚀</span></a>`;
                }
            } else {
                stepCard.classList.add('step-locked');
                if (tagEl) {
                    tagEl.className = 'step-status-tag status-locked';
                    tagEl.textContent = `🔒 LOCKED (Complete Task ${t - 1})`;
                }
                if (scoreEl) scoreEl.classList.add('hidden');
                if (actionEl) {
                    actionEl.innerHTML = `<button type="button" class="btn-step-action btn-locked-task" disabled><span>Locked 🔒</span></button>`;
                }
            }
        }

        // Check if all tasks are complete
        const allDoneBox = document.getElementById('allTasksCompletedBox');
        const startActionsBar = document.getElementById('startActionsBar');

        if (completedCount >= totalTasks) {
            if (allDoneBox) allDoneBox.classList.remove('hidden');
            if (startActionsBar) startActionsBar.classList.add('hidden');
            if (activeAttemptBanner) activeAttemptBanner.classList.add('hidden');
        } else {
            if (allDoneBox) allDoneBox.classList.add('hidden');
            if (startActionsBar) startActionsBar.classList.remove('hidden');

            if (attempt && attempt.answersMap && Object.keys(attempt.answersMap).length > 0 && (!submissions || !submissions[attempt.currentTask])) {
                const answeredCount = Object.keys(attempt.answersMap).length;
                const currentTask = attempt.currentTask || 1;
                const xp = attempt.earnedXP || (attempt.score ? attempt.score * 10 : 0);

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

                if (startBtnText) startBtnText.textContent = 'RESUME TASK ' + currentTask;
                if (startBtnIcon) startBtnIcon.textContent = '⚔️';
            } else {
                if (activeAttemptBanner) activeAttemptBanner.classList.add('hidden');
                if (startOverBtn) startOverBtn.classList.add('hidden');

                let nextTask = 1;
                if (submissions && submissions[1] && !submissions[2]) nextTask = 2;
                else if (submissions && submissions[1] && submissions[2] && !submissions[3]) nextTask = 3;

                if (startBtnText) startBtnText.textContent = 'START TASK ' + nextTask;
                if (startBtnIcon) startBtnIcon.textContent = '🔥';
            }
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
