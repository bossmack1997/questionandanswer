/**
 * STUDENT DASHBOARD & QUEST BRIEFING CONTROLLER
 * Handles student Full Name & Section authentication, individual learner dashboard,
 * instant local briefing rendering, and non-blocking background Firestore sync.
 */

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const nameEntryCard = document.getElementById('nameEntryCard');
    const challengeReadyCard = document.getElementById('challengeReadyCard');
    const studentNameForm = document.getElementById('studentNameForm');
    const studentNameInput = document.getElementById('studentNameInput');
    const studentSectionInput = document.getElementById('studentSectionInput');
    const nameError = document.getElementById('nameError');
    const nameSubmitBtn = document.getElementById('nameSubmitBtn');

    const welcomeStudentName = document.getElementById('welcomeStudentName');
    const welcomeStudentSection = document.getElementById('welcomeStudentSection');
    const welcomeStudentIdBadge = document.getElementById('welcomeStudentIdBadge');
    const briefingSubtitle = document.getElementById('briefingSubtitle');
    const activeAttemptBanner = document.getElementById('activeAttemptBanner');
    const resumeTaskName = document.getElementById('resumeTaskName');
    const resumeProgress = document.getElementById('resumeProgress');
    const resumeXP = document.getElementById('resumeXP');
    const resumeTimeLeft = document.getElementById('resumeTimeLeft');

    const startActionsBar = document.getElementById('startActionsBar');
    const changeNameBtn = document.getElementById('changeNameBtn');
    const startOverBtn = document.getElementById('startOverBtn');
    const startChallengeBtn = document.getElementById('startChallengeBtn');
    const startBtnText = document.getElementById('startBtnText');
    const startBtnIcon = document.getElementById('startBtnIcon');
    const allTasksCompletedBox = document.getElementById('allTasksCompletedBox');

    // Local State
    let currentStudentName = '';
    let currentStudentSection = '';
    let currentStudentId = '';
    let activeAttemptData = null;
    let studentSubmissions = { 1: null, 2: null, 3: null, 4: null };

    console.info('[Student] Controller initialized.');

    // Helper: Normalize Student ID
    function getStudentId(name, section) {
        if (window.AuthManager && typeof window.AuthManager.generateStudentId === 'function') {
            return window.AuthManager.generateStudentId(name, section);
        }
        if (window.firebaseService && typeof window.firebaseService.normalizeStudentId === 'function') {
            return window.firebaseService.normalizeStudentId(name, section);
        }
        const cleanName = (name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
        const cleanSec = (section || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
        return `student_${cleanName || 'anonymous'}_sec_${cleanSec || 'general'}`;
    }

    // Helper: Check if a task is completed
    function isTaskCompleted(sub) {
        if (!sub) return false;
        if (sub.status === 'completed') return true;
        if (typeof sub.score === 'number' && sub.score >= 0) return true;
        return false;
    }

    // Helper: Determine next uncompleted task (1, 2, 3)
    function determineNextTask(submissions) {
        const s = submissions || {};
        for (let t = 1; t <= 3; t++) {
            const sub = s[t] || s['task' + t];
            if (!isTaskCompleted(sub)) {
                return t;
            }
        }
        return 4; // All 3 completed
    }

    // Helper: Check if all tasks are complete
    function allTasksCompleted(submissions) {
        return determineNextTask(submissions) > 3;
    }

    // Bind Event Listeners Synchronously
    function bindEvents() {
        // 1. Student Full Name & Section Form Submit
        if (studentNameForm) {
            studentNameForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const rawName = studentNameInput ? studentNameInput.value.trim() : '';
                const rawSection = studentSectionInput ? studentSectionInput.value.trim() : '';
                const cleanName = rawName.replace(/[<>]/g, '').trim();
                const cleanSection = rawSection.replace(/[<>]/g, '').trim();

                if (cleanName.length < 2) {
                    showError('Please enter your full name (at least 2 characters).');
                    if (studentNameInput) studentNameInput.focus();
                    return;
                }

                if (cleanName.length > 50) {
                    showError('Full name cannot exceed 50 characters.');
                    if (studentNameInput) studentNameInput.focus();
                    return;
                }

                if (cleanSection.length < 1) {
                    showError('Please enter your Section (e.g. 10 - Rizal, Grade 10 - Diamond).');
                    if (studentSectionInput) studentSectionInput.focus();
                    return;
                }

                hideError();
                currentStudentName = cleanName;
                currentStudentSection = cleanSection;
                currentStudentId = getStudentId(cleanName, cleanSection);

                console.info('[Student] Name & Section submitted:', currentStudentName, '| Section:', currentStudentSection, '| ID:', currentStudentId);

                // Save to AuthManager / LocalStorage safely
                try {
                    if (window.AuthManager && typeof window.AuthManager.loginStudent === 'function') {
                        window.AuthManager.loginStudent(currentStudentName, currentStudentSection);
                    } else {
                        localStorage.setItem('english10_student_name', currentStudentName);
                        localStorage.setItem('english10_student_section', currentStudentSection);
                        localStorage.setItem('english10_student_id', currentStudentId);
                    }
                } catch (err) {
                    console.warn('[Student] Auth login storage notice:', err);
                }

                // Register student active session in Firebase (for teacher visibility)
                if (window.firebaseService && typeof window.firebaseService.registerStudentSession === 'function') {
                 window.firebaseService.registerStudentSession({
    studentId: currentStudentId,
    studentName: currentStudentName,
    studentSection: currentStudentSection,
    status: 'online',
    lastActive: new Date().toISOString()
})
.then(() => {
    console.info('[Student] ✅ Active student successfully saved to Firestore:', currentStudentId);
})
.catch((err) => {
    console.error('[Student] ❌ Failed to save active student to Firestore:', err);
});
                }

                // Show briefing screen immediately
                await checkAndShowBriefing(currentStudentName, currentStudentSection);
            });
        }

        // 2. Start / Resume Challenge Button
        if (startChallengeBtn) {
            startChallengeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.info('[Student] Start button clicked.');

                if (!currentStudentName) {
                    currentStudentName = (studentNameInput ? studentNameInput.value.trim() : '') ||
                                         localStorage.getItem('english10_student_name') || 'Student';
                }
                if (!currentStudentSection) {
                    currentStudentSection = (studentSectionInput ? studentSectionInput.value.trim() : '') ||
                                            localStorage.getItem('english10_student_section') || 'Grade 10';
                }
                currentStudentId = getStudentId(currentStudentName, currentStudentSection);

                // Check if active in-progress attempt exists
                if (activeAttemptData && activeAttemptData.currentTask && !isTaskCompleted(studentSubmissions[activeAttemptData.currentTask])) {
                    const taskNum = activeAttemptData.currentTask || 1;
                    console.info(`[Student] Resuming active task ${taskNum}...`);
                    window.location.href = `quiz.html?task=${taskNum}`;
                    return;
                }

                // Determine next sequential uncompleted task
                const nextTask = determineNextTask(studentSubmissions);
                if (nextTask > 3) {
                    console.info('[Student] All tasks completed, navigating to result.html');
                    window.location.href = 'result.html';
                    return;
                }

                console.info(`[Student] Navigating to quiz.html?task=${nextTask}`);
                window.location.href = `quiz.html?task=${nextTask}`;
            });
        }

        // 3. Switch Student / Change Name Button
        if (changeNameBtn) {
            changeNameBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (nameEntryCard) nameEntryCard.classList.remove('hidden');
                if (challengeReadyCard) challengeReadyCard.classList.add('hidden');
                if (studentNameInput) {
                    studentNameInput.focus();
                    studentNameInput.select();
                }
            });
        }

        // 4. Start Over Button
        if (startOverBtn) {
            startOverBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (confirm('Start this task fresh from Question 1?')) {
                    if (window.firebaseService && typeof window.firebaseService.deleteActiveAttempt === 'function') {
                        window.firebaseService.deleteActiveAttempt(currentStudentId, currentStudentName);
                    }
                    localStorage.removeItem('english10_active_attempt_' + currentStudentId);
                    localStorage.removeItem('english10_quest_attempt_' + currentStudentName);
                    sessionStorage.removeItem('english10_active_state');

                    activeAttemptData = null;
                    const nextTask = determineNextTask(studentSubmissions);
                    window.location.href = `quiz.html?task=${nextTask > 3 ? 1 : nextTask}`;
                }
            });
        }

        // 5. Input Clear Error on Typing
        if (studentNameInput) {
            studentNameInput.addEventListener('input', () => hideError());
        }
        if (studentSectionInput) {
            studentSectionInput.addEventListener('input', () => hideError());
        }
    }

    // Load Local Storage Submissions Instantly (0ms latency)
    function loadLocalSubmissions(sid) {
        const localSubs = { 1: null, 2: null, 3: null, task1: null, task2: null, task3: null };
        for (let t = 1; t <= 3; t++) {
            const keys = [
                `english10_sub_${sid}_task${t}`,
                `english10_task_submission_${sid}_task${t}`,
                `english10_sub_${sid}_${t}`
            ];
            for (const k of keys) {
                const raw = localStorage.getItem(k);
                if (raw) {
                    try {
                        const parsed = JSON.parse(raw);
                        if (parsed && (parsed.status === 'completed' || typeof parsed.score === 'number')) {
                            localSubs[t] = parsed;
                            localSubs['task' + t] = parsed;
                            break;
                        }
                    } catch (e) {}
                }
            }
        }
        return localSubs;
    }

    // Load Local Active Attempt Instantly
    function loadLocalAttempt(sid, name) {
        const keys = [
            `english10_active_attempt_${sid}`,
            `english10_quest_attempt_${name}`
        ];
        for (const k of keys) {
            const raw = localStorage.getItem(k);
            if (raw) {
                try {
                    const parsed = JSON.parse(raw);
                    if (parsed && (!parsed.status || parsed.status === 'in_progress')) {
                        return parsed;
                    }
                } catch (e) {}
            }
        }
        return null;
    }

    // Main Briefing Handler
    async function checkAndShowBriefing(name, section = '') {
        currentStudentName = name;
        currentStudentSection = section || localStorage.getItem('english10_student_section') || 'Grade 10';
        currentStudentId = getStudentId(currentStudentName, currentStudentSection);

        console.info('[Student] checkAndShowBriefing for:', currentStudentName, '| Section:', currentStudentSection, '| ID:', currentStudentId);

        // Step 1: Render immediately from Local Storage cache (0ms delay)
        studentSubmissions = loadLocalSubmissions(currentStudentId);
        activeAttemptData = loadLocalAttempt(currentStudentId, currentStudentName);

        updateBriefingUI(currentStudentName, currentStudentSection, currentStudentId, activeAttemptData, studentSubmissions);

        if (nameEntryCard) nameEntryCard.classList.add('hidden');
        if (challengeReadyCard) challengeReadyCard.classList.remove('hidden');

        // Step 2: Query Firestore asynchronously in background to sync newest records
        if (window.firebaseService) {
            try {
                const cloudSubmissions = await window.firebaseService.getAllTaskSubmissionsForStudent(currentStudentId);
                if (cloudSubmissions) {
                    for (let t = 1; t <= 3; t++) {
                        if (cloudSubmissions[t]) {
                            studentSubmissions[t] = cloudSubmissions[t];
                            studentSubmissions['task' + t] = cloudSubmissions[t];
                        }
                    }
                }

                const cloudAttempt = await window.firebaseService.getActiveAttempt(currentStudentId, currentStudentName);
                if (cloudAttempt) {
                    activeAttemptData = cloudAttempt;
                }

                // Re-render with synced cloud data
                updateBriefingUI(currentStudentName, currentStudentSection, currentStudentId, activeAttemptData, studentSubmissions);
            } catch (err) {
                console.info('[Student] Background cloud sync note (using local cache):', err.message || err);
            }
        }
    }

    // Update the UI Roadmap and Action Buttons
    function updateBriefingUI(name, section, studentId, attempt, submissions) {
        if (welcomeStudentName) {
            welcomeStudentName.textContent = name || 'Learner';
        }
        if (welcomeStudentSection) {
            welcomeStudentSection.textContent = `🏫 Section: ${section || 'Grade 10'}`;
        }
        if (welcomeStudentIdBadge) {
            welcomeStudentIdBadge.textContent = `🆔 ${studentId}`;
        }

        const totalTasks = 3;
        let completedCount = 0;

        for (let t = 1; t <= totalTasks; t++) {
            const stepCard = document.getElementById('mapStep' + t);
            const tagEl = document.getElementById('mapStepTag' + t);
            const scoreEl = document.getElementById('mapStepScore' + t);
            const actionEl = document.getElementById('mapStepAction' + t);

            if (!stepCard) continue;

            const sub = submissions ? (submissions[t] || submissions['task' + t]) : null;
            const completed = isTaskCompleted(sub);
            const prevSub = (t === 1) ? true : (submissions ? (submissions[t - 1] || submissions['task' + (t - 1)]) : null);
            const prevCompleted = (t === 1) || isTaskCompleted(prevSub);
            const isCurrentActive = attempt && attempt.currentTask === t && !completed;

            stepCard.classList.remove('step-unlocked', 'step-locked', 'step-completed');

            if (completed) {
                completedCount++;
                stepCard.classList.add('step-completed');
                if (tagEl) {
                    tagEl.className = 'step-status-tag status-completed';
                    tagEl.textContent = '✓ COMPLETED 🔒';
                }
                if (scoreEl) {
                    scoreEl.classList.remove('hidden');
                    const totalQ = sub.totalQuestions || (t === 3 ? 12 : 10);
                    const score = typeof sub.score === 'number' ? sub.score : 0;
                    const pct = typeof sub.percentage === 'number' ? Math.round(sub.percentage) : Math.round((score / totalQ) * 100);
                    scoreEl.textContent = `Score: ${score} / ${totalQ} (${pct}%)`;
                }
                if (actionEl) {
                    actionEl.innerHTML = `<a href="result.html" class="btn-step-action btn-view-sub"><span>View Result 👁️</span></a>`;
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
                    tagEl.textContent = '● READY';
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

        // Check if all 3 tasks are complete
        if (completedCount >= totalTasks) {
            if (allTasksCompletedBox) allTasksCompletedBox.classList.remove('hidden');
            if (startActionsBar) startActionsBar.classList.add('hidden');
            if (activeAttemptBanner) activeAttemptBanner.classList.add('hidden');
            return;
        }

        if (allTasksCompletedBox) allTasksCompletedBox.classList.add('hidden');
        if (startActionsBar) startActionsBar.classList.remove('hidden');

        // Check if there is an active resume attempt
        const hasActiveAnswers = attempt && attempt.answersMap && Object.keys(attempt.answersMap).length > 0;
        const activeTaskCompleted = attempt && attempt.currentTask && isTaskCompleted(submissions ? (submissions[attempt.currentTask] || submissions['task' + attempt.currentTask]) : null);

        if (hasActiveAnswers && !activeTaskCompleted) {
            const answeredCount = Object.keys(attempt.answersMap).length;
            const currentTask = attempt.currentTask || 1;
            const xp = attempt.earnedXP || (attempt.score ? attempt.score * 10 : 0);

            let timeRemainingSec = 1920;
            if (attempt.started_at_ms || attempt.started_at) {
                const startMs = attempt.started_at_ms || new Date(attempt.started_at).getTime();
                const elapsedSec = Math.floor((Date.now() - startMs) / 1000);
                timeRemainingSec = Math.max(0, 1920 - elapsedSec);
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

            const nextTask = determineNextTask(submissions);
            if (startBtnText) startBtnText.textContent = (nextTask === 1 ? 'START THE QUEST' : 'START TASK ' + nextTask);
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

    // Initialize: Bind events immediately
    bindEvents();

    // Check for existing logged in student session
    let existingName = '';
    let existingSection = '';
    try {
        if (window.AuthManager && typeof window.AuthManager.getCurrentStudent === 'function') {
            const studentObj = window.AuthManager.getCurrentStudent();
            if (studentObj && studentObj.name) {
                existingName = studentObj.name;
                existingSection = studentObj.section || '';
            }
        }
        if (!existingName) {
            existingName = localStorage.getItem('english10_student_name') || '';
            existingSection = localStorage.getItem('english10_student_section') || '';
        }
    } catch (e) {
        existingName = localStorage.getItem('english10_student_name') || '';
        existingSection = localStorage.getItem('english10_student_section') || '';
    }

    if (existingName && existingName.trim().length >= 2) {
        if (studentNameInput) studentNameInput.value = existingName.trim();
        if (studentSectionInput) studentSectionInput.value = (existingSection || '').trim();
        checkAndShowBriefing(existingName.trim(), existingSection.trim());
    } else {
        if (nameEntryCard) nameEntryCard.classList.remove('hidden');
        if (challengeReadyCard) challengeReadyCard.classList.add('hidden');
        if (studentNameInput) studentNameInput.focus();
    }
});

