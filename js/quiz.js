/**
 * ENGLISH QUEST — MASTER QUIZ ENGINE
 * Fully dynamic task structure, immutable attempt randomization, server-aware timer,
 * anti-cheating focus monitor, race-condition guards, live navigator tracker,
 * and multi-device persistence for Grade 10 English Remediation Assessment.
 */

class EnglishQuestEngine {
    constructor() {
        this.studentName = "";
        this.studentSection = "Grade 10";
        this.studentId = "student_anonymous";
        this.attemptId = "quest_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6);
        this.startedAt = new Date().toISOString();
        this.startedAtMs = Date.now();
        this.currentTask = 1;
        this.currentQuestionIndex = 0;
        
        // Single Source of Truth for Quiz Configuration
        this.quizConfig = (typeof QUIZ_CONFIG !== 'undefined') ? QUIZ_CONFIG : {
            TASKS: [1, 2, 3],
            pointsPerCorrect: 1,
            maxTabSwitches: 3,
            overallTimerSeconds: 1920
        };

        // Reading materials reference
        this.readingMaterials = (typeof READING_PASSAGES !== 'undefined') ? READING_PASSAGES : 
                                ((typeof readingMaterials !== 'undefined') ? readingMaterials : 
                                ((typeof window !== 'undefined' && (window.READING_PASSAGES || window.readingMaterials)) || {}));

        // Dynamic Questions & Task Scores structures
        this.taskQuestions = {};
        this.taskScores = {};
        this.getTaskKeys().forEach(taskKey => {
            this.taskQuestions[taskKey] = [];
            this.taskScores[taskKey] = {
                correct: 0,
                wrong: 0,
                unanswered: 0,
                score: 0,
                xp: 0,
                total: this.getTaskConfiguredTotal(taskKey),
                completed: false
            };
        });

        this.currentQuestion = null;
        this.selectedOptionId = null;
        this.isQuestionLocked = false;
        this.isSubmitting = false;
        this.autoNextTimeout = null;
        this.syncDebounceTimeout = null;
        this.heartbeatTimer = null;

        // User answers map: { "T1-Q01": "T1Q01-C", ... }
        this.answersMap = {};

        // Gamification & Scores
        this.score = 0;             // Total correct count
        this.earnedXP = 0;          // Total XP
        this.streak = 0;            // Current consecutive correct streak
        this.maxStreak = 0;         // Best streak achieved
        
        // Overall Timer (in seconds)
        this.totalDurationSeconds = this.quizConfig.overallTimerSeconds || 1920;
        this.timeRemaining = this.totalDurationSeconds;
        this.totalTimeUsed = 0;
        this.timer = null;

        // Attempt Audit Trail
        this.attemptAudit = {
            attempt_id: this.attemptId,
            student_name: "",
            student_section: "",
            student_id: "",
            started_at: this.startedAt,
            task_order: this.getTasks(),
            question_order: {},
            option_order: {},
            selected_answers: {}
        };
        this.getTaskKeys().forEach(taskKey => {
            this.attemptAudit.question_order[taskKey] = [];
        });

        // Anti-cheating & security
        this.tabSwitches = 0;
        this.autoSubmitted = false;

        this.init();
    }

    // ==========================================
    // DYNAMIC STRUCTURE HELPER METHODS
    // ==========================================

    getTasks() {
        if (this.quizConfig && Array.isArray(this.quizConfig.TASKS)) {
            return [...this.quizConfig.TASKS];
        }
        return [1, 2, 3];
    }

    getTaskKeys() {
        return this.getTasks().map(t => 'task' + t);
    }

    getTaskConfiguredTotal(taskKey) {
        if (typeof masterQuestionBank !== 'undefined' && masterQuestionBank[taskKey]) {
            return masterQuestionBank[taskKey].length;
        }
        if (this.quizConfig && typeof this.quizConfig.getTaskTotal === 'function') {
            return this.quizConfig.getTaskTotal(taskKey);
        }
        if (taskKey === 'task1') return 10;
        if (taskKey === 'task2') return 10;
        if (taskKey === 'task3') return 12;
        return 10;
    }

    getTaskQuestionCount(taskKey) {
        if (this.taskQuestions[taskKey] && this.taskQuestions[taskKey].length > 0) {
            return this.taskQuestions[taskKey].length;
        }
        return this.getTaskConfiguredTotal(taskKey);
    }

    getTotalQuestions() {
        let total = 0;
        this.getTaskKeys().forEach(taskKey => {
            total += this.getTaskQuestionCount(taskKey);
        });
        return total || 32;
    }

    getMaxXP() {
        return this.getTotalQuestions() * (this.quizConfig.pointsPerCorrect || 1) * 10;
    }

    getOverallQuestionNumber(taskNum, indexInTask) {
        let count = 0;
        const tasks = this.getTasks();
        for (const t of tasks) {
            if (t < taskNum) {
                count += this.getTaskQuestionCount('task' + t);
            } else if (t === taskNum) {
                count += (indexInTask + 1);
                break;
            }
        }
        return count;
    }

    safePlaySound(fnName) {
        try {
            if (typeof window !== "undefined" && window.soundSystem && typeof window.soundSystem[fnName] === 'function') {
                window.soundSystem[fnName]();
            }
        } catch (e) {
            // Audio error gracefully ignored
        }
    }

    // ==========================================
    // INITIALIZATION & AUTH
    // ==========================================

    init() {
        // Run database integrity check
        if (typeof window !== "undefined" && typeof window.validateQuizDatabase === "function") {
            const audit = window.validateQuizDatabase();
            if (!audit.passed) {
                console.error("Quiz database validation error:", audit.errors);
                alert("Quiz database integrity check failed. Please check console.");
                return;
            }
        }

        // Student identity check
        if (typeof localStorage !== "undefined" && typeof sessionStorage !== "undefined") {
            let sessionObj = null;
            if (typeof window !== "undefined" && window.AuthManager && typeof window.AuthManager.getCurrentStudent === "function") {
                sessionObj = window.AuthManager.getCurrentStudent();
            }
            this.studentName = (sessionObj && sessionObj.name) || localStorage.getItem('english10_student_name') || localStorage.getItem('studentName') || sessionStorage.getItem('studentName') || '';
            this.studentSection = (sessionObj && sessionObj.section) || localStorage.getItem('english10_student_section') || 'Grade 10';

            if (!this.studentName || this.studentName.trim().length < 2) {
                if (typeof window !== "undefined" && window.location) {
                    window.location.replace('student.html');
                }
                return;
            }
        } else {
            this.studentName = "Student";
            this.studentSection = "Grade 10";
        }
        
        if (typeof window !== "undefined" && window.firebaseService) {
            this.studentId = window.firebaseService.normalizeStudentId(this.studentName, this.studentSection);
        } else {
            const cleanName = this.studentName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
            const cleanSec = this.studentSection.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
            this.studentId = `student_${cleanName}_sec_${cleanSec}`;
        }

        this.attemptAudit.student_name = this.studentName;
        this.attemptAudit.student_section = this.studentSection;
        this.attemptAudit.student_id = this.studentId;

        this.cacheDOM();
        this.bindEvents();
        this.setupAntiCheating();
        this.setupNetworkMonitoring();

        // Check target task from URL query parameters (e.g. quiz.html?task=2)
        const urlParams = (typeof window !== 'undefined' && window.location) ? new URLSearchParams(window.location.search) : null;
        const requestedTask = urlParams ? parseInt(urlParams.get('task'), 10) : null;
        const validTasks = this.getTasks();
        if (requestedTask && validTasks.includes(requestedTask)) {
            this.currentTask = requestedTask;
        }

        // Run strict pre-quiz verification with Firestore & LocalStorage
        this.verifyAndInitializeQuiz();
    }

    cacheDOM() {
        if (typeof document === "undefined") return;

        this.dom = {
            // Overlays & Loaders
            verificationLoader: document.getElementById('quizVerificationLoader'),
            taskLockedModal: document.getElementById('taskLockedModal'),
            lockedTaskHeading: document.getElementById('lockedTaskHeading'),
            lockedTaskMessage: document.getElementById('lockedTaskMessage'),
            lockedTaskScoreText: document.getElementById('lockedTaskScoreText'),
            lockedTaskDateText: document.getElementById('lockedTaskDateText'),
            lockedViewResultBtn: document.getElementById('lockedViewResultBtn'),
            verificationErrorModal: document.getElementById('quizVerificationErrorModal'),
            retryVerificationBtn: document.getElementById('retryVerificationBtn'),

            // HUD
            hudStudentName: document.getElementById('hudStudentName'),
            hudTaskBadge: document.getElementById('hudTaskBadge'),
            hudTaskProgress: document.getElementById('hudTaskProgress'),
            hudOverallProgress: document.getElementById('hudOverallProgress'),
            hudProgressBar: document.getElementById('hudProgressBar'),
            timerDisplay: document.getElementById('timerDisplay'),
            hudTimer: document.getElementById('hudTimer'),
            xpDisplay: document.getElementById('xpDisplay'),
            streakDisplay: document.getElementById('streakDisplay'),
            streakPill: document.getElementById('streakPill'),
            soundToggleBtn: document.getElementById('soundToggleBtn'),
            questMapToggleBtn: document.getElementById('questMapToggleBtn'),

            // Cloud Sync Indicator
            hudSyncStatus: document.getElementById('hudSyncStatus'),
            syncIcon: document.getElementById('syncIcon'),
            syncText: document.getElementById('syncText'),

            // Task Nav Tabs
            taskTabsNav: document.getElementById('taskTabsNav'),
            tabTask1: document.getElementById('tabTask1'),
            tabTask2: document.getElementById('tabTask2'),
            tabTask3: document.getElementById('tabTask3'),

            // Question Navigator Pills
            questionPillsContainer: document.getElementById('questionPillsContainer'),

            // Reading Passage
            readingCard: document.getElementById('readingPassageCard'),
            readingTitle: document.getElementById('readingPassageTitle'),
            readingInstructions: document.getElementById('readingPassageInstructions'),
            readingContent: document.getElementById('readingPassageContent'),
            readingCollapsible: document.getElementById('readingPassageCollapsible'),
            toggleReadingBtn: document.getElementById('toggleReadingBtn'),
            toggleReadingText: document.getElementById('toggleReadingText'),

            // Question Board
            questionCard: document.getElementById('questionCard'),
            questionTag: document.getElementById('questionCounterBadge'),
            questionText: document.getElementById('questionText'),
            choicesGrid: document.getElementById('choicesGrid'),
            selectionHintText: document.getElementById('selectionHintText'),
            prevBtn: document.getElementById('prevQuestionBtn'),
            nextBtn: document.getElementById('nextQuestionBtn'),
            nextBtnText: document.getElementById('nextBtnText'),

            // Feedback Toast
            feedbackToast: document.getElementById('feedbackToast'),
            feedbackIcon: document.getElementById('feedbackIcon'),
            feedbackTitle: document.getElementById('feedbackTitle'),
            feedbackSubtitle: document.getElementById('feedbackSubtitle'),

            // Task Intro Modal
            taskIntroModal: document.getElementById('taskIntroModal'),
            taskIntroIcon: document.getElementById('taskIntroIcon'),
            taskIntroTitle: document.getElementById('taskIntroTitle'),
            taskIntroFocus: document.getElementById('taskIntroFocus'),
            taskIntroQuestionsCount: document.getElementById('taskIntroQuestionsCount'),
            taskIntroXPCount: document.getElementById('taskIntroXPCount'),
            taskIntroPassageType: document.getElementById('taskIntroPassageType'),
            startTaskBtn: document.getElementById('startTaskBtn'),
            startTaskBtnText: document.getElementById('startTaskBtnText'),

            // Task Completion Milestone Modal
            completionModal: document.getElementById('taskCompletionModal'),
            milestoneHeading: document.getElementById('milestoneHeading'),
            milestoneSub: document.getElementById('milestoneSub'),
            milestoneTaskScore: document.getElementById('milestoneTaskScore'),
            milestoneTaskXP: document.getElementById('milestoneTaskXP'),
            milestoneTaskStreak: document.getElementById('milestoneTaskStreak'),
            continueBtn: document.getElementById('continueToNextTaskBtn'),
            continueBtnText: document.getElementById('continueBtnText'),

            // Final Quest Complete Modal
            finalQuestCompleteModal: document.getElementById('finalQuestCompleteModal'),
            finalModalScore: document.getElementById('finalModalScore'),
            finalModalXP: document.getElementById('finalModalXP'),
            finalModalStreak: document.getElementById('finalModalStreak'),
            confirmSubmitFinalQuestBtn: document.getElementById('submitFinalQuestBtn') || document.getElementById('confirmSubmitFinalQuestBtn'),

            // Quest Map Modal
            questMapModal: document.getElementById('questMapModal'),
            closeQuestMapBtn: document.getElementById('closeQuestMapBtn'),
            resumeQuestBtn: document.getElementById('resumeQuestBtn'),
            mapStudentName: document.getElementById('mapStudentName'),
            mapTotalXP: document.getElementById('mapTotalXP'),
            mapTimeLeft: document.getElementById('mapTimeLeft'),
            mapItemTask1: document.getElementById('mapItemTask1'),
            mapStatusTask1: document.getElementById('mapStatusTask1'),
            mapItemTask2: document.getElementById('mapItemTask2'),
            mapStatusTask2: document.getElementById('mapStatusTask2'),
            mapItemTask3: document.getElementById('mapItemTask3'),
            mapStatusTask3: document.getElementById('mapStatusTask3'),

            // Anti-Cheat Modal
            antiCheatModal: document.getElementById('antiCheatWarningModal'),
            antiCheatCount: document.getElementById('antiCheatCount'),
            dismissAntiCheatBtn: document.getElementById('dismissAntiCheatBtn')
        };
    }

    bindEvents() {
        if (!this.dom) return;

        // Navigation buttons
        if (this.dom.prevBtn) {
            this.dom.prevBtn.addEventListener('click', () => this.goToPrevQuestion());
        }

        if (this.dom.nextBtn) {
            this.dom.nextBtn.addEventListener('click', () => this.handleNextOrSubmitAction());
        }

        // Reading drawer toggle
        if (this.dom.toggleReadingBtn) {
            this.dom.toggleReadingBtn.addEventListener('click', () => this.toggleReadingPassage());
        }

        // Task Nav Tabs
        this.getTasks().forEach(tNum => {
            const tab = this.dom['tabTask' + tNum];
            if (tab) {
                tab.addEventListener('click', () => this.handleTaskTabClick(tNum));
            }
        });

        // Quest Map Task Items
        this.getTasks().forEach(tNum => {
            const mapItem = this.dom['mapItemTask' + tNum];
            if (mapItem) {
                mapItem.style.cursor = 'pointer';
                mapItem.addEventListener('click', () => {
                    const taskKey = 'task' + tNum;
                    const isCompleted = (this.taskScores[taskKey] && this.taskScores[taskKey].completed) || (tNum < this.currentTask);
                    const isActive = (tNum === this.currentTask);
                    if (isActive || isCompleted) {
                        this.closeQuestMapModal();
                        if (this.currentTask !== tNum) {
                            this.currentTask = tNum;
                            this.currentQuestionIndex = 0;
                            this.renderReadingSection('task' + tNum);
                            this.renderCurrentQuestion();
                            this.updateTaskTabsUI();
                            this.saveState();
                        }
                    } else {
                        this.safePlaySound('playTick');
                        this.showToastWarning('🔒 Task ' + tNum + ' is locked. Complete Task ' + (tNum - 1) + ' first!');
                    }
                });
            }
        });

        // Start Task Modal Action
        if (this.dom.startTaskBtn) {
            this.dom.startTaskBtn.addEventListener('click', () => {
                if (this.dom.taskIntroModal) this.dom.taskIntroModal.classList.add('hidden');
                this.renderReadingSection('task' + this.currentTask);
                this.renderCurrentQuestion();
                this.updateTaskTabsUI();
                this.saveState();
                this.startTimer();
            });
        }

        // Milestone Continue Action
        if (this.dom.continueBtn) {
            this.dom.continueBtn.addEventListener('click', () => {
                if (this.dom.completionModal) this.dom.completionModal.classList.add('hidden');
                const tasks = this.getTasks();
                const maxTask = Math.max(...tasks);
                if (this.currentTask < maxTask) {
                    this.currentTask++;
                    this.currentQuestionIndex = 0;
                    this.renderReadingSection('task' + this.currentTask);
                    this.renderCurrentQuestion();
                    this.updateTaskTabsUI();
                    this.saveState();
                    this.showTaskIntro(this.currentTask);
                } else {
                    this.finishQuiz();
                }
            });
        }

        // Final Quest Submit Button
        if (this.dom.confirmSubmitFinalQuestBtn) {
            this.dom.confirmSubmitFinalQuestBtn.addEventListener('click', () => {
                if (this.dom.finalQuestCompleteModal) this.dom.finalQuestCompleteModal.classList.add('hidden');
                this.finishQuiz();
            });
        }

        // Quest Map Modal Toggles
        if (this.dom.questMapToggleBtn) {
            this.dom.questMapToggleBtn.addEventListener('click', () => this.openQuestMapModal());
        }
        if (this.dom.closeQuestMapBtn) {
            this.dom.closeQuestMapBtn.addEventListener('click', () => this.closeQuestMapModal());
        }
        if (this.dom.resumeQuestBtn) {
            this.dom.resumeQuestBtn.addEventListener('click', () => this.closeQuestMapModal());
        }

        // Sound System Toggle
        if (this.dom.soundToggleBtn && typeof window !== "undefined" && window.soundSystem) {
            this.dom.soundToggleBtn.addEventListener('click', () => {
                const muted = window.soundSystem.toggleMute();
                this.dom.soundToggleBtn.innerHTML = muted ? '🔇' : '🔊';
            });
            if (window.soundSystem.isMuted()) {
                this.dom.soundToggleBtn.innerHTML = '🔇';
            }
        }

        // Dismiss Anti-Cheat Alert
        if (this.dom.dismissAntiCheatBtn) {
            this.dom.dismissAntiCheatBtn.addEventListener('click', () => {
                if (this.dom.antiCheatModal) this.dom.antiCheatModal.classList.add('hidden');
                this.resumeTimer();
            });
        }

        // Keyboard Shortcuts
        if (typeof document !== "undefined") {
            document.addEventListener('keydown', (e) => {
                if (this.isSubmitting || this.isQuestionLocked) return;
                if (this.dom.taskIntroModal && !this.dom.taskIntroModal.classList.contains('hidden')) return;
                if (this.dom.completionModal && !this.dom.completionModal.classList.contains('hidden')) return;
                if (this.dom.finalQuestCompleteModal && !this.dom.finalQuestCompleteModal.classList.contains('hidden')) return;
                if (this.dom.questMapModal && !this.dom.questMapModal.classList.contains('hidden')) return;
                if (this.dom.antiCheatModal && !this.dom.antiCheatModal.classList.contains('hidden')) return;

                const key = e.key.toUpperCase();
                const choiceLetters = ['A', 'B', 'C', 'D'];
                let index = -1;

                if (['1', '2', '3', '4'].includes(key)) {
                    index = parseInt(key, 10) - 1;
                } else if (choiceLetters.includes(key)) {
                    index = choiceLetters.indexOf(key);
                } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
                    this.handleNextOrSubmitAction();
                    return;
                } else if (e.key === 'ArrowLeft') {
                    this.goToPrevQuestion();
                    return;
                }

                if (index >= 0 && this.currentQuestion && this.currentQuestion.choices[index] && this.dom.choicesGrid) {
                    const choice = this.currentQuestion.choices[index];
                    const btn = this.dom.choicesGrid.querySelector('[data-option-id="' + choice.option_id + '"]');
                    if (btn) {
                        this.handleAnswerSelection(choice.option_id, btn);
                    }
                }
            });
        }
    }

    setupNetworkMonitoring() {
        if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;

        window.addEventListener('online', () => {
            this.updateSyncUI('saving', 'Syncing...');
            this.saveState();
        });

        window.addEventListener('offline', () => {
            this.updateSyncUI('offline', 'Offline');
        });
    }

    updateSyncUI(status, label) {
        if (!this.dom || !this.dom.hudSyncStatus) return;
        const pill = this.dom.hudSyncStatus;
        const icon = this.dom.syncIcon;
        const text = this.dom.syncText;

        pill.classList.remove('saved', 'saving', 'offline');

        if (status === 'saving') {
            pill.classList.add('saving');
            if (icon) icon.textContent = '⏳';
            if (text) text.textContent = label || 'Saving...';
        } else if (status === 'offline') {
            pill.classList.add('offline');
            if (icon) icon.textContent = '📶';
            if (text) text.textContent = label || 'Offline';
        } else {
            pill.classList.add('saved');
            if (icon) icon.textContent = '☁️';
            if (text) text.textContent = label || 'Saved';
        }
    }

    // ==========================================
    // PRE-QUIZ VERIFICATION & TASK RESTRICTIONS
    // ==========================================

    async verifyAndInitializeQuiz() {
        if (this.dom && this.dom.verificationLoader) {
            this.dom.verificationLoader.classList.remove('hidden');
        }

        try {
            // Check submission records in Cloud Firestore
            let submissions = {};
            if (typeof window !== "undefined" && window.firebaseService) {
                submissions = await window.firebaseService.getAllTaskSubmissionsForStudent(this.studentId);
            }

            // Also check local storage backups
            const tasks = this.getTasks();
            tasks.forEach(tNum => {
                if (!submissions['task' + tNum]) {
                    const localSub = localStorage.getItem('english10_task_submission_' + this.studentId + '_task' + tNum) ||
                                     localStorage.getItem('english10_sub_' + this.studentId + '_task' + tNum);
                    if (localSub) {
                        try { submissions['task' + tNum] = JSON.parse(localSub); } catch(e){}
                    }
                }
            });

            // If all tasks are already submitted, lock entirely
            const allDone = tasks.every(tNum => Boolean(submissions['task' + tNum]));
            if (allDone) {
                if (this.dom && this.dom.verificationLoader) this.dom.verificationLoader.classList.add('hidden');
                this.showTaskLockedScreen('all', {
                    message: "You have already completed all tasks in this assessment. Retaking the quiz is not allowed.",
                    title: "ASSESSMENT COMPLETED"
                });
                return;
            }

            // If the specific requested task is already submitted, lock that task
            const targetTaskKey = 'task' + this.currentTask;
            if (submissions[targetTaskKey]) {
                if (this.dom && this.dom.verificationLoader) this.dom.verificationLoader.classList.add('hidden');
                this.showTaskLockedScreen(this.currentTask, submissions[targetTaskKey]);
                return;
            }

            // Strict Sequential progression check:
            // Ensure student cannot jump to Task N if Task N-1 is not yet submitted
            for (let i = 1; i < this.currentTask; i++) {
                if (!submissions['task' + i]) {
                    this.currentTask = i;
                    break;
                }
            }

            // Populate already submitted task scores into taskScores
            tasks.forEach(tNum => {
                const sub = submissions['task' + tNum];
                if (sub) {
                    const taskKey = 'task' + tNum;
                    const totalQ = sub.totalQuestions || this.getTaskConfiguredTotal(taskKey);
                    this.taskScores[taskKey] = {
                        correct: sub.correctCount !== undefined ? sub.correctCount : (sub.score || 0),
                        wrong: sub.wrongCount !== undefined ? sub.wrongCount : (totalQ - (sub.score || 0)),
                        unanswered: sub.unansweredCount || 0,
                        score: sub.score || 0,
                        xp: sub.xp || (sub.score * 10),
                        total: totalQ,
                        completed: true
                    };
                }
            });

            // If verified, hide loader and proceed
            if (this.dom && this.dom.verificationLoader) {
                this.dom.verificationLoader.classList.add('hidden');
            }

            this.loadLocalQuestState();
            await this.reconcileCloudQuestState();
            this.startPeriodicSyncHeartbeat();

        } catch (error) {
            console.error("Verification check error:", error);
            if (this.dom && this.dom.verificationLoader) {
                this.dom.verificationLoader.classList.add('hidden');
            }

            if (this.dom && this.dom.verificationErrorModal) {
                this.dom.verificationErrorModal.classList.remove('hidden');
                if (this.dom.retryVerificationBtn) {
                    this.dom.retryVerificationBtn.onclick = () => {
                        this.dom.verificationErrorModal.classList.add('hidden');
                        this.verifyAndInitializeQuiz();
                    };
                }
            } else {
                this.loadLocalQuestState();
            }
        }
    }

    showTaskLockedScreen(taskNum, submission) {
        if (!this.dom || !this.dom.taskLockedModal) return;

        if (this.dom.lockedTaskHeading) {
            this.dom.lockedTaskHeading.textContent = taskNum === 'all' ? "ASSESSMENT COMPLETED" : "TASK " + taskNum + " COMPLETED";
        }
        if (this.dom.lockedTaskMessage) {
            this.dom.lockedTaskMessage.textContent = (submission && submission.message) 
                ? submission.message 
                : "You have already completed and submitted Task " + taskNum + ". Retaking this task is not allowed.";
        }
        if (this.dom.lockedTaskScoreText) {
            if (submission && typeof submission.score === 'number') {
                const total = submission.totalQuestions || this.getTaskConfiguredTotal('task' + taskNum);
                this.dom.lockedTaskScoreText.textContent = "Score: " + submission.score + " / " + total + " (" + (submission.xp || (submission.score * 10)) + " XP)";
                this.dom.lockedTaskScoreText.style.display = 'block';
            } else {
                this.dom.lockedTaskScoreText.style.display = 'none';
            }
        }
        if (this.dom.lockedTaskDateText) {
            if (submission && submission.submittedAt) {
                const d = new Date(submission.submittedAt);
                this.dom.lockedTaskDateText.textContent = "Submitted on: " + d.toLocaleString();
                this.dom.lockedTaskDateText.style.display = 'block';
            } else {
                this.dom.lockedTaskDateText.textContent = "Submitted securely to Teacher Records";
            }
        }
        if (this.dom.lockedViewResultBtn) {
            this.dom.lockedViewResultBtn.href = (taskNum === 'all') ? "result.html" : ("result.html?task=" + taskNum);
        }

        this.dom.taskLockedModal.classList.remove('hidden');
        this.safePlaySound('playTick');
    }

    handleTaskTabClick(taskNum) {
        if (this.autoNextTimeout) clearTimeout(this.autoNextTimeout);

        if (taskNum === this.currentTask) return;

        const targetCompleted = this.taskScores['task' + taskNum] && this.taskScores['task' + taskNum].completed;

        if (targetCompleted) {
            this.showToastWarning('🔒 Task ' + taskNum + ' is already submitted and locked.');
            return;
        }

        const isPrevious = (taskNum < this.currentTask);
        const prevTaskCompleted = (taskNum === 1) || (this.taskScores['task' + (taskNum - 1)] && this.taskScores['task' + (taskNum - 1)].completed);

        if (isPrevious || prevTaskCompleted) {
            this.currentTask = taskNum;
            this.currentQuestionIndex = 0;
            this.renderReadingSection('task' + taskNum);
            this.renderCurrentQuestion();
            this.updateTaskTabsUI();
            this.saveState();
            this.safePlaySound('playClick');
        } else {
            const tabEl = this.dom['tabTask' + taskNum];
            if (tabEl) {
                tabEl.classList.remove('tab-shake');
                void tabEl.offsetWidth;
                tabEl.classList.add('tab-shake');
            }
            this.safePlaySound('playTick');
            const prevTask = taskNum - 1;
            this.showToastWarning('🔒 Task ' + taskNum + ' is locked. Complete Task ' + prevTask + ' first!');
        }
    }

    showToastWarning(msg) {
        if (!this.dom || !this.dom.feedbackToast) return;
        const toast = this.dom.feedbackToast;

        if (this.dom.feedbackIcon) this.dom.feedbackIcon.textContent = "🔒";
        if (this.dom.feedbackTitle) this.dom.feedbackTitle.textContent = "LOCKED TASK";
        if (this.dom.feedbackSubtitle) this.dom.feedbackSubtitle.textContent = msg;
        toast.className = "feedback-toast toast-locked show";

        setTimeout(() => {
            toast.classList.remove('show');
        }, 1600);
    }

    // ==========================================
    // ANTI-CHEATING MONITOR
    // ==========================================

    setupAntiCheating() {
        if (typeof document === "undefined") return;

        document.addEventListener('visibilitychange', () => {
            if (document.hidden && !this.isSubmitting) {
                this.tabSwitches++;
                this.pauseTimer();
                const maxSwitches = this.quizConfig.maxTabSwitches || 3;
                
                if (this.dom && this.dom.antiCheatCount) {
                    this.dom.antiCheatCount.textContent = this.tabSwitches + ' / ' + maxSwitches;
                }
                if (this.dom && this.dom.antiCheatModal) {
                    this.dom.antiCheatModal.classList.remove('hidden');
                }
                this.safePlaySound('playWrong');

                // If exceeded configured violation limit, auto-submit
                if (this.tabSwitches >= maxSwitches) {
                    this.autoSubmitted = true;
                    setTimeout(() => {
                        this.finishQuiz(true);
                    }, 2000);
                }
            }
        });
    }

    // ==========================================
    // ATTEMPT RESUME & IMMUTABLE RANDOMIZATION
    // ==========================================

    loadLocalQuestState() {
        let attempt = null;

        if (typeof localStorage !== "undefined") {
            const raw = localStorage.getItem('english10_active_attempt_' + this.studentId) ||
                        localStorage.getItem('english10_quest_attempt_' + this.studentName);
            if (raw) {
                try { attempt = JSON.parse(raw); } catch (e) {}
            }
        }

        // Validate that all current task keys exist and have questions
        const requiredKeys = this.getTaskKeys();
        const hasAllTasks = attempt && attempt.taskQuestions && requiredKeys.every(k => {
            return Array.isArray(attempt.taskQuestions[k]) && attempt.taskQuestions[k].length === this.getTaskConfiguredTotal(k);
        });

        if (hasAllTasks) {
            this.restoreFromAttempt(attempt);
            this.updateSyncUI('saved', 'Resumed');
            return;
        }

        // Initialize fresh randomized attempt
        this.generateAllTaskQuestions();
        this.currentTask = 1;
        this.currentQuestionIndex = 0;
        this.startedAt = new Date().toISOString();
        this.startedAtMs = Date.now();
        this.timeRemaining = this.totalDurationSeconds;

        this.renderReadingSection('task1');
        this.renderCurrentQuestion();
        this.updateTaskTabsUI();
        this.showTaskIntro(1);
        this.saveState();
        this.updateSyncUI('saved', 'Ready');
    }

    async reconcileCloudQuestState() {
        if (typeof window === "undefined" || !window.firebaseService) return;

        try {
            const cloudAttempt = await window.firebaseService.getActiveAttempt(this.studentId, this.studentName, this.studentSection);
            const requiredKeys = this.getTaskKeys();
            const hasAllTasks = cloudAttempt && cloudAttempt.taskQuestions && requiredKeys.every(k => {
                return Array.isArray(cloudAttempt.taskQuestions[k]) && cloudAttempt.taskQuestions[k].length === this.getTaskConfiguredTotal(k);
            });

            if (hasAllTasks) {
                const cloudAnsCount = cloudAttempt.answersMap ? Object.keys(cloudAttempt.answersMap).length : 0;
                const localAnsCount = this.answersMap ? Object.keys(this.answersMap).length : 0;

                // Sync if cloud has more answers or newer timestamp
                if (cloudAnsCount > localAnsCount) {
                    this.restoreFromAttempt(cloudAttempt);
                    this.updateSyncUI('saved', 'Cloud Synced');
                }
            }
        } catch (err) {
            console.warn('[EnglishQuestEngine] Cloud state reconciliation note:', err);
        }
    }

    restoreFromAttempt(attempt) {
        this.attemptId = attempt.attempt_id || attempt.attemptId || this.attemptId;
        this.startedAt = attempt.started_at || this.startedAt;
        this.startedAtMs = attempt.started_at_ms || (attempt.started_at ? new Date(attempt.started_at).getTime() : this.startedAtMs);
        this.attemptAudit = attempt.attemptAudit || attempt.attempt_audit || this.attemptAudit;
        
        const tasks = this.getTasks();
        const maxTask = Math.max(...tasks);
        this.currentTask = (typeof attempt.currentTask === 'number' && attempt.currentTask >= 1 && attempt.currentTask <= maxTask) ? attempt.currentTask : 1;
        
        const taskTotal = this.getTaskConfiguredTotal('task' + this.currentTask);
        this.currentQuestionIndex = (typeof attempt.currentQuestionIndex === 'number' && attempt.currentQuestionIndex >= 0 && attempt.currentQuestionIndex < taskTotal) ? attempt.currentQuestionIndex : 0;
        
        this.taskQuestions = attempt.taskQuestions;
        this.answersMap = attempt.answersMap || attempt.selected_answers || {};
        this.score = attempt.score || 0;
        this.earnedXP = attempt.earnedXP || 0;
        this.streak = attempt.streak || 0;
        this.maxStreak = attempt.maxStreak || 0;
        this.taskScores = attempt.taskScores || this.taskScores;
        this.tabSwitches = attempt.tabSwitches || 0;
        this.totalTimeUsed = attempt.totalTimeUsed || 0;

        // Compute server-aware elapsed timer
        const elapsed = Math.floor((Date.now() - this.startedAtMs) / 1000);
        this.timeRemaining = Math.max(0, this.totalDurationSeconds - elapsed);

        this.recalculateLiveGamification();
        this.renderReadingSection('task' + this.currentTask);
        this.renderCurrentQuestion();
        this.updateHUD();
        this.updateTaskTabsUI();
        this.startTimer();

        if (this.timeRemaining <= 0) {
            this.finishQuiz(true);
        }
    }

    generateAllTaskQuestions() {
        const questionBank = (typeof masterQuestionBank !== 'undefined') ? masterQuestionBank : 
                             ((typeof window !== 'undefined' && window.masterQuestionBank) ? window.masterQuestionBank : 
                             ((typeof global !== 'undefined' && global.masterQuestionBank) ? global.masterQuestionBank : {}));

        this.getTaskKeys().forEach(taskKey => {
            const raw = questionBank[taskKey] || [];
            const shuffledQ = this.shuffleArray(raw);
            this.attemptAudit.question_order[taskKey] = shuffledQ.map(q => q.question_id);

            this.taskQuestions[taskKey] = shuffledQ.map(q => {
                const shuffledChoices = this.shuffleArray(q.choices);
                this.attemptAudit.option_order[q.question_id] = shuffledChoices.map(c => c.option_id);
                return {
                    task_id: q.task_id,
                    question_id: q.question_id,
                    original_number: q.original_number,
                    question_text: q.question_text,
                    choices: shuffledChoices,
                    correct_option_id: q.correct_option_id,
                    points: q.points || 1
                };
            });
        });
    }

    saveState() {
        const totalQ = this.getTotalQuestions();
        const answeredQ = Object.keys(this.answersMap || {}).length;
        const correctQ = this.score || 0;
        const wrongQ = Math.max(0, answeredQ - correctQ);
        const progressPct = totalQ > 0 ? Math.min(100, Math.round((answeredQ / totalQ) * 100)) : 0;
        const nowIso = new Date().toISOString();

        const state = {
            attemptId: this.attemptId,
            attempt_id: this.attemptId,
            student_name: this.studentName,
            studentName: this.studentName,
            student_section: this.studentSection,
            section: this.studentSection,
            studentSection: this.studentSection,
            student_id: this.studentId,
            studentId: this.studentId,
            status: 'in_progress',
            currentTask: this.currentTask,
            currentQuestion: this.currentQuestionIndex + 1,
            currentQuestionIndex: this.currentQuestionIndex,
            totalQuestions: totalQ,
            answeredQuestions: answeredQ,
            correctAnswers: correctQ,
            wrongAnswers: wrongQ,
            progressPercentage: progressPct,
            score: correctQ,
            earnedXP: this.earnedXP,
            streak: this.streak,
            maxStreak: this.maxStreak,
            taskScores: this.taskScores,
            tabSwitches: this.tabSwitches,
            totalTimeUsed: this.totalTimeUsed,
            timeRemaining: this.timeRemaining,
            startedAt: this.startedAt,
            started_at: this.startedAt,
            startedAtMs: this.startedAtMs,
            started_at_ms: this.startedAtMs,
            updatedAt: nowIso,
            submittedAt: null,
            answersMap: this.answersMap,
            taskQuestions: this.taskQuestions,
            attemptAudit: this.attemptAudit
        };

        // 1. Save locally immediately
        if (typeof localStorage !== "undefined") {
            localStorage.setItem('english10_active_attempt_' + this.studentId, JSON.stringify(state));
            localStorage.setItem('english10_quest_attempt_' + this.studentName, JSON.stringify(state));
        }
        if (typeof sessionStorage !== "undefined") {
            sessionStorage.setItem('english10_active_state', JSON.stringify(state));
        }

        // 2. Debounced push to Cloud Firestore
        if (this.syncDebounceTimeout) clearTimeout(this.syncDebounceTimeout);
        this.updateSyncUI('saving', 'Saving...');

        this.syncDebounceTimeout = setTimeout(async () => {
            if (typeof window !== "undefined" && window.firebaseService) {
                try {
                    const ok = await window.firebaseService.saveActiveAttempt(state);
                    if (ok) {
                        this.updateSyncUI('saved', 'Saved');
                    } else {
                        this.updateSyncUI('offline', 'Saved Locally');
                    }
                } catch (e) {
                    this.updateSyncUI('offline', 'Saved Locally');
                }
            } else {
                this.updateSyncUI('saved', 'Saved');
            }
        }, 300);
    }

    startPeriodicSyncHeartbeat() {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = setInterval(() => {
            if (!this.isSubmitting) {
                this.saveState();
            }
        }, 12000);
    }

    // ==========================================
    // UI RENDERING & QUESTION BOARD
    // ==========================================

    showTaskIntro(taskNum) {
        if (!this.dom || !this.dom.taskIntroModal) return;

        const intros = {
            1: {
                icon: "🎯",
                title: "TASK 1<br><span>UNDERSTANDING LITERARY ELEMENTS</span>",
                focus: "Conflict • Characterization • Plot • Diction • Tone/Mood • Point of View • Narrative Techniques",
                count: this.getTaskQuestionCount('task1') + " Questions",
                xp: "+" + (this.getTaskQuestionCount('task1') * 10) + " XP Max",
                passage: "Story: Mara and the Tomato Plant"
            },
            2: {
                icon: "🔎",
                title: "TASK 2<br><span>ANALYZING & EVALUATING A LITERARY TEXT</span>",
                focus: "Values • Maxims • Universal Truths • Philosophies • Contexts (Historical, Biographical, Psychological, Sociocultural)",
                count: this.getTaskQuestionCount('task2') + " Questions",
                xp: "+" + (this.getTaskQuestionCount('task2') * 10) + " XP Max",
                passage: "Statement: Community & Future Generations"
            },
            3: {
                icon: "✍️",
                title: "TASK 3<br><span>LANGUAGE, STYLE, COHESION, AND CULTURE</span>",
                focus: "Diction • Style • Tone • Coherence • Cohesion • Purpose • Audience • Filipino Cultural Identity",
                count: this.getTaskQuestionCount('task3') + " Questions",
                xp: "+" + (this.getTaskQuestionCount('task3') * 10) + " XP Max",
                passage: "Multiple Language Skills & Culture Items"
            }
        };

        const info = intros[taskNum] || intros[1];
        if (this.dom.taskIntroIcon) this.dom.taskIntroIcon.textContent = info.icon;
        if (this.dom.taskIntroTitle) this.dom.taskIntroTitle.innerHTML = info.title;
        if (this.dom.taskIntroFocus) this.dom.taskIntroFocus.textContent = info.focus;
        if (this.dom.taskIntroQuestionsCount) this.dom.taskIntroQuestionsCount.textContent = info.count;
        if (this.dom.taskIntroXPCount) this.dom.taskIntroXPCount.textContent = info.xp;
        if (this.dom.taskIntroPassageType) this.dom.taskIntroPassageType.textContent = info.passage;
        if (this.dom.startTaskBtnText) this.dom.startTaskBtnText.textContent = 'START TASK ' + taskNum + ' 🚀';
        this.dom.taskIntroModal.classList.remove('hidden');
        this.safePlaySound('playTaskIntro');
    }

    renderReadingSection(taskKey) {
        if (!this.dom || !this.dom.readingCard) return;

        const materials = this.readingMaterials;
        const material = (materials && taskKey) ? materials[taskKey] : null;

        if (!material || !material.content || !material.title) {
            this.dom.readingCard.classList.add('hidden');
            return;
        }

        this.dom.readingCard.classList.remove('hidden');
        if (this.dom.readingTitle) this.dom.readingTitle.textContent = material.title || '';
        if (this.dom.readingInstructions) this.dom.readingInstructions.textContent = material.instructions || '';
        if (this.dom.readingContent) this.dom.readingContent.innerHTML = material.content || '';

        if (this.dom.readingCollapsible) this.dom.readingCollapsible.classList.remove('collapsed');
        if (this.dom.toggleReadingText) this.dom.toggleReadingText.textContent = 'Hide Passage ▴';
    }

    toggleReadingPassage() {
        if (!this.dom || !this.dom.readingCollapsible) return;
        const isCollapsed = this.dom.readingCollapsible.classList.toggle('collapsed');
        if (this.dom.toggleReadingText) this.dom.toggleReadingText.textContent = isCollapsed ? 'Show Passage ▾' : 'Hide Passage ▴';
        this.safePlaySound('playClick');
    }

    renderCurrentQuestion() {
        if (!this.dom) return;
        const taskKey = 'task' + this.currentTask;
        const questionsList = this.taskQuestions[taskKey];
        if (!questionsList || questionsList.length === 0) return;

        const totalInTask = questionsList.length;
        if (this.currentQuestionIndex >= totalInTask) {
            this.currentQuestionIndex = totalInTask - 1;
        }
        if (this.currentQuestionIndex < 0) {
            this.currentQuestionIndex = 0;
        }

        const q = questionsList[this.currentQuestionIndex];
        this.currentQuestion = q;
        this.isQuestionLocked = false;

        // Animate question card entry
        if (this.dom.questionCard) {
            this.dom.questionCard.classList.remove('card-enter-active');
            void this.dom.questionCard.offsetWidth;
            this.dom.questionCard.classList.add('card-enter-active');
        }

        // Update Question Badges & Text dynamically
        const itemNum = this.currentQuestionIndex + 1;
        const overallItemNum = this.getOverallQuestionNumber(this.currentTask, this.currentQuestionIndex);
        const totalOverallQuestions = this.getTotalQuestions();

        if (this.dom.questionTag) {
            this.dom.questionTag.textContent = 'ITEM ' + itemNum + ' OF ' + totalInTask + ' (TASK ' + this.currentTask + ' • QUESTION #' + overallItemNum + ' OF ' + totalOverallQuestions + ')';
        }
        if (this.dom.questionText) this.dom.questionText.innerHTML = q.question_text;

        // Render Choices
        if (this.dom.choicesGrid) {
            this.dom.choicesGrid.innerHTML = '';
            const selectedChoiceId = this.answersMap[q.question_id] || null;
            this.selectedOptionId = selectedChoiceId;

            const choiceLetters = ['A', 'B', 'C', 'D'];
            q.choices.forEach((choice, idx) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'choice-btn';
                btn.dataset.optionId = choice.option_id;
                btn.setAttribute('role', 'radio');
                btn.setAttribute('aria-checked', choice.option_id === selectedChoiceId ? 'true' : 'false');

                const isSelected = (choice.option_id === selectedChoiceId);
                if (isSelected) {
                    btn.classList.add('selected');
                }

                const letter = choiceLetters[idx] || String.fromCharCode(65 + idx);
                btn.innerHTML = '<div class="choice-badge">' + letter + '</div>' +
                                '<div class="choice-text">' + choice.text + '</div>' +
                                '<div class="choice-radio-indicator"></div>';

                btn.addEventListener('click', () => this.handleAnswerSelection(choice.option_id, btn));
                this.dom.choicesGrid.appendChild(btn);
            });
        }

        // Update Question Navigator Pills
        this.renderQuestionPills(totalInTask);

        // Update HUD Task Badges & Progress Bars
        this.updateHUDProgress(totalInTask);

        // Update Navigation Button States
        this.updateNavButtons(totalInTask);

        // Update Task Navigation Tabs UI
        this.updateTaskTabsUI();
    }

    renderQuestionPills(totalInTask) {
        if (!this.dom || !this.dom.questionPillsContainer) return;
        this.dom.questionPillsContainer.innerHTML = '';
        const taskKey = 'task' + this.currentTask;
        const questionsList = this.taskQuestions[taskKey];
        if (!questionsList) return;

        questionsList.forEach((q, idx) => {
            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = 'nav-pill';
            pill.dataset.index = idx;
            pill.dataset.questionId = q.question_id;

            const itemNum = idx + 1;
            const isCurrent = (idx === this.currentQuestionIndex);
            const userAns = this.answersMap[q.question_id];
            const isAnswered = Boolean(userAns);
            const isCorrect = isAnswered && (userAns === q.correct_option_id);

            if (isCurrent) {
                pill.classList.add('pill-current');
                pill.setAttribute('aria-current', 'step');
            }

            if (isAnswered) {
                if (isCorrect) {
                    pill.classList.add('pill-correct');
                    pill.setAttribute('aria-label', 'Item ' + itemNum + ': Correct' + (isCurrent ? ' (Current)' : ''));
                    pill.setAttribute('title', 'Item ' + itemNum + ': Correct');
                    pill.innerHTML = '<span class="pill-status-icon" aria-hidden="true">✓</span> <span class="pill-num">' + itemNum + '</span>';
                } else {
                    pill.classList.add('pill-wrong');
                    pill.setAttribute('aria-label', 'Item ' + itemNum + ': Incorrect' + (isCurrent ? ' (Current)' : ''));
                    pill.setAttribute('title', 'Item ' + itemNum + ': Incorrect');
                    pill.innerHTML = '<span class="pill-status-icon" aria-hidden="true">✕</span> <span class="pill-num">' + itemNum + '</span>';
                }
            } else {
                pill.setAttribute('aria-label', 'Item ' + itemNum + ': Unanswered' + (isCurrent ? ' (Current)' : ''));
                pill.setAttribute('title', 'Item ' + itemNum + ': Unanswered');
                pill.innerHTML = '<span class="pill-num">' + itemNum + '</span>';
            }

            pill.addEventListener('click', () => {
                if (this.autoNextTimeout) clearTimeout(this.autoNextTimeout);
                this.currentQuestionIndex = idx;
                this.renderCurrentQuestion();
                this.safePlaySound('playClick');
            });

            this.dom.questionPillsContainer.appendChild(pill);
        });
    }

    updateHUDProgress(totalInTask) {
        if (!this.dom) return;
        if (this.dom.hudStudentName) {
            this.dom.hudStudentName.textContent = this.studentSection ? `${this.studentName} • ${this.studentSection}` : this.studentName;
        }
        
        const taskTitles = {
            1: "🎯 TASK 1: Understanding Literary Elements",
            2: "🔎 TASK 2: Analyzing & Evaluating Literary Text",
            3: "✍️ TASK 3: Language, Style, Cohesion & Culture"
        };
        if (this.dom.hudTaskBadge) this.dom.hudTaskBadge.textContent = taskTitles[this.currentTask] || 'TASK ' + this.currentTask;
        if (this.dom.hudTaskProgress) this.dom.hudTaskProgress.textContent = 'Question ' + (this.currentQuestionIndex + 1) + ' of ' + totalInTask;

        const overallCurrent = this.getOverallQuestionNumber(this.currentTask, this.currentQuestionIndex);
        const totalOverallQuestions = this.getTotalQuestions();

        if (this.dom.hudOverallProgress) this.dom.hudOverallProgress.textContent = overallCurrent + ' / ' + totalOverallQuestions + ' Questions';
        
        const pct = Math.round((overallCurrent / totalOverallQuestions) * 100);
        if (this.dom.hudProgressBar) this.dom.hudProgressBar.style.width = pct + '%';
    }

    updateTaskTabsUI() {
        if (!this.dom) return;
        this.getTasks().forEach(tNum => {
            const tab = this.dom['tabTask' + tNum];
            if (!tab) return;

            const taskKey = 'task' + tNum;
            const isCompleted = (this.taskScores[taskKey] && this.taskScores[taskKey].completed) || (tNum < this.currentTask);
            const isActive = (tNum === this.currentTask);

            tab.classList.remove('tab-active', 'tab-completed', 'tab-locked');

            const statusEl = document.getElementById('tabStatus' + tNum) || tab.querySelector('.tab-state-tag');
            const iconEl = document.getElementById('tabIcon' + tNum) || tab.querySelector('.tab-indicator');

            if (isActive) {
                tab.classList.add('tab-active');
                if (iconEl) iconEl.textContent = '●';
                if (statusEl) statusEl.textContent = 'In Progress';
            } else if (isCompleted) {
                tab.classList.add('tab-completed');
                if (iconEl) iconEl.textContent = '✓';
                if (statusEl) statusEl.textContent = 'Completed';
            } else {
                tab.classList.add('tab-locked');
                if (iconEl) iconEl.textContent = '🔒';
                if (statusEl) statusEl.textContent = 'Locked';
            }
        });
    }

    // ==========================================
    // ANSWER LOGIC & LIVE GAMIFICATION
    // ==========================================

    handleAnswerSelection(optionId, btnElement) {
        if (this.isQuestionLocked || this.isSubmitting) return;

        if (this.autoNextTimeout) {
            clearTimeout(this.autoNextTimeout);
        }

        // Lock immediate duplicate inputs
        this.isQuestionLocked = true;
        this.selectedOptionId = optionId;

        // Save answer to master answers map
        this.answersMap[this.currentQuestion.question_id] = optionId;
        this.attemptAudit.selected_answers[this.currentQuestion.question_id] = optionId;

        // Visual choice selection indicator
        if (this.dom && this.dom.choicesGrid) {
            const allButtons = this.dom.choicesGrid.querySelectorAll('.choice-btn');
            allButtons.forEach(b => {
                b.classList.remove('selected');
                b.setAttribute('aria-checked', 'false');
            });
        }
        if (btnElement) {
            btnElement.classList.add('selected');
            btnElement.setAttribute('aria-checked', 'true');
        }

        // Recalculate live gamification
        const isCorrect = (optionId === this.currentQuestion.correct_option_id);
        this.recalculateLiveGamification();

        // Immediately update top navigator pill
        if (this.dom && this.dom.questionPillsContainer) {
            const currentPill = (this.dom.questionPillsContainer && this.dom.questionPillsContainer.children) ? this.dom.questionPillsContainer.children[this.currentQuestionIndex] : null;
            if (currentPill) {
                const itemNum = this.currentQuestionIndex + 1;
                currentPill.classList.remove('pill-correct', 'pill-wrong', 'pill-anim-correct', 'pill-anim-wrong');
                void currentPill.offsetWidth;
                if (isCorrect) {
                    currentPill.classList.add('pill-correct', 'pill-anim-correct');
                    currentPill.innerHTML = '<span class="pill-status-icon" aria-hidden="true">✓</span> <span class="pill-num">' + itemNum + '</span>';
                    currentPill.setAttribute('aria-label', 'Item ' + itemNum + ': Correct (Current)');
                    currentPill.setAttribute('title', 'Item ' + itemNum + ': Correct');
                } else {
                    currentPill.classList.add('pill-wrong', 'pill-anim-wrong');
                    currentPill.innerHTML = '<span class="pill-status-icon" aria-hidden="true">✕</span> <span class="pill-num">' + itemNum + '</span>';
                    currentPill.setAttribute('aria-label', 'Item ' + itemNum + ': Incorrect (Current)');
                    currentPill.setAttribute('title', 'Item ' + itemNum + ': Incorrect');
                }
            }
        }

        // Feedback
        if (isCorrect) {
            this.safePlaySound('playCorrect');
            this.showFeedback('correct');
        } else {
            this.safePlaySound('playWrong');
            this.showFeedback('neutral');
        }

        // Save progress
        this.saveState();

        // AUTO-NEXT: Smooth advance after 450ms
        this.autoNextTimeout = setTimeout(() => {
            this.handleNextOrSubmitAction();
        }, 450);
    }

    recalculateLiveGamification() {
        let totalScore = 0;
        let currentStreak = 0;
        let highestStreak = this.maxStreak || 0;

        this.getTaskKeys().forEach(taskKey => {
            const questions = this.taskQuestions[taskKey] || [];
            let taskCorrect = 0;
            let taskWrong = 0;
            let taskUnanswered = 0;

            questions.forEach(q => {
                const userAns = this.answersMap[q.question_id];
                if (!userAns) {
                    taskUnanswered++;
                } else if (userAns === q.correct_option_id) {
                    taskCorrect++;
                    totalScore++;
                    currentStreak++;
                    if (currentStreak > highestStreak) highestStreak = currentStreak;
                } else {
                    taskWrong++;
                    currentStreak = 0;
                }
            });

            if (!this.taskScores[taskKey]) {
                this.taskScores[taskKey] = { completed: false, total: questions.length };
            }
            this.taskScores[taskKey].correct = taskCorrect;
            this.taskScores[taskKey].wrong = taskWrong;
            this.taskScores[taskKey].unanswered = taskUnanswered;
            this.taskScores[taskKey].score = taskCorrect;
            this.taskScores[taskKey].xp = taskCorrect * 10;
            this.taskScores[taskKey].total = questions.length || this.getTaskConfiguredTotal(taskKey);
        });

        this.score = totalScore;
        this.earnedXP = totalScore * 10;
        this.streak = currentStreak;
        this.maxStreak = highestStreak;

        this.updateHUD();
    }

    updateHUD() {
        if (!this.dom) return;
        if (this.dom.xpDisplay) this.dom.xpDisplay.textContent = this.earnedXP;
        if (this.dom.streakDisplay) this.dom.streakDisplay.textContent = this.streak;

        if (this.dom.streakPill) {
            if (this.streak >= 2) {
                this.dom.streakPill.classList.add('streak-active');
            } else {
                this.dom.streakPill.classList.remove('streak-active');
            }
        }
    }

    showFeedback(type) {
        if (!this.dom || !this.dom.feedbackToast) return;
        const toast = this.dom.feedbackToast;

        if (type === 'correct') {
            if (this.dom.feedbackIcon) this.dom.feedbackIcon.textContent = "⚡";
            if (this.dom.feedbackTitle) this.dom.feedbackTitle.textContent = "CORRECT!";
            if (this.dom.feedbackSubtitle) this.dom.feedbackSubtitle.textContent = "+10 XP • STREAK x" + this.streak;
            toast.className = "feedback-toast toast-correct show";
        } else {
            const encouragements = [
                "ANSWER RECORDED",
                "KEEP GOING!",
                "GREAT EFFORT!",
                "ON TO THE NEXT!"
            ];
            const msg = encouragements[Math.floor(Math.random() * encouragements.length)];
            if (this.dom.feedbackIcon) this.dom.feedbackIcon.textContent = "✨";
            if (this.dom.feedbackTitle) this.dom.feedbackTitle.textContent = msg;
            if (this.dom.feedbackSubtitle) this.dom.feedbackSubtitle.textContent = "Moving to next item...";
            toast.className = "feedback-toast toast-neutral show";
        }

        setTimeout(() => {
            toast.classList.remove('show');
        }, 1100);
    }

    updateNavButtons(totalInTask) {
        if (!this.dom) return;

        // Previous button
        if (this.dom.prevBtn) {
            const isFirstOverall = (this.currentTask === 1 && this.currentQuestionIndex === 0);
            this.dom.prevBtn.disabled = isFirstOverall;
        }

        // Next button label & state
        if (this.dom.nextBtn && this.dom.nextBtnText) {
            const isLastInTask = (this.currentQuestionIndex === totalInTask - 1);
            const tasks = this.getTasks();
            const maxTask = Math.max(...tasks);

            if (isLastInTask) {
                if (this.currentTask < maxTask) {
                    this.dom.nextBtnText.textContent = "Complete Task " + this.currentTask + " →";
                } else {
                    this.dom.nextBtnText.textContent = "Finish Assessment 🚀";
                }
            } else {
                this.dom.nextBtnText.textContent = "Next Question →";
            }
        }
    }

    goToPrevQuestion() {
        if (this.autoNextTimeout) clearTimeout(this.autoNextTimeout);

        if (this.currentQuestionIndex > 0) {
            this.currentQuestionIndex--;
            this.renderCurrentQuestion();
            this.safePlaySound('playClick');
        } else if (this.currentTask > 1) {
            this.currentTask--;
            const prevTaskTotal = this.taskQuestions['task' + this.currentTask].length;
            this.currentQuestionIndex = prevTaskTotal - 1;
            this.renderReadingSection('task' + this.currentTask);
            this.renderCurrentQuestion();
            this.updateTaskTabsUI();
            this.saveState();
            this.safePlaySound('playClick');
        }
    }

    async handleNextOrSubmitAction() {
        if (this.autoNextTimeout) clearTimeout(this.autoNextTimeout);

        const currentTaskTotal = this.taskQuestions['task' + this.currentTask].length;

        if (this.currentQuestionIndex < currentTaskTotal - 1) {
            this.currentQuestionIndex++;
            this.renderCurrentQuestion();
            this.saveState();
            this.safePlaySound('playClick');
        } else {
            // Task completed - calculate task score and submit
            const taskNum = this.currentTask;
            const taskKey = 'task' + taskNum;
            this.recalculateLiveGamification();
            this.taskScores[taskKey].completed = true;

            const taskScoreData = this.taskScores[taskKey];
            const taskAnswers = {};
            (this.taskQuestions[taskKey] || []).forEach(q => {
                if (this.answersMap[q.question_id]) {
                    taskAnswers[q.question_id] = this.answersMap[q.question_id];
                }
            });

            const taskSubmission = {
                studentId: this.studentId,
                studentName: this.studentName,
                section: this.studentSection,
                studentSection: this.studentSection,
                taskId: taskNum,
                taskKey: taskKey,
                attemptId: this.attemptId,
                score: taskScoreData.score,
                totalQuestions: taskScoreData.total,
                correctCount: taskScoreData.correct,
                wrongCount: taskScoreData.wrong,
                unansweredCount: taskScoreData.unanswered,
                xp: taskScoreData.xp,
                submittedAt: new Date().toISOString(),
                answers: taskAnswers,
                questions: this.taskQuestions[taskKey]
            };

            // Disable button during submission
            if (this.dom.nextBtn) {
                this.dom.nextBtn.disabled = true;
            }
            if (this.dom.nextBtnText) {
                this.dom.nextBtnText.textContent = "Saving Task " + taskNum + "... ⏳";
            }

            // Save locally
            if (typeof localStorage !== "undefined") {
                localStorage.setItem('english10_task_submission_' + this.studentId + '_task' + taskNum, JSON.stringify(taskSubmission));
            }

            // Save to Firestore
            if (typeof window !== "undefined" && window.firebaseService) {
                try {
                    await window.firebaseService.saveTaskSubmission(taskSubmission);
                } catch (e) {
                    console.error("Error saving task " + taskNum + " submission to Firebase:", e);
                }
            }

            this.saveState();

            if (this.dom.nextBtn) {
                this.dom.nextBtn.disabled = false;
            }

            const tasks = this.getTasks();
            const maxTask = Math.max(...tasks);

            if (this.currentTask < maxTask) {
                this.showTaskCompletionMilestone(this.currentTask);
            } else {
                this.showFinalQuestCompleteModal();
            }
        }
    }

    showTaskCompletionMilestone(taskNum) {
        if (!this.dom || !this.dom.completionModal) return;

        const taskScore = this.taskScores['task' + taskNum] || { score: 0, total: 10 };
        const taskTitles = {
            1: "Literary Elements",
            2: "Text Analysis & Evaluation",
            3: "Language, Style & Culture"
        };

        if (this.dom.milestoneHeading) this.dom.milestoneHeading.textContent = "TASK " + taskNum + " COMPLETE!";
        if (this.dom.milestoneSub) this.dom.milestoneSub.textContent = "Great work on " + (taskTitles[taskNum] || "Task " + taskNum) + "!";
        if (this.dom.milestoneTaskScore) this.dom.milestoneTaskScore.textContent = taskScore.score + " / " + taskScore.total;
        if (this.dom.milestoneTaskXP) this.dom.milestoneTaskXP.textContent = "+" + (taskScore.score * 10) + " XP";
        if (this.dom.milestoneTaskStreak) this.dom.milestoneTaskStreak.textContent = "x" + this.maxStreak;
        if (this.dom.continueBtnText) this.dom.continueBtnText.textContent = "CONTINUE TO TASK " + (taskNum + 1) + " 🚀";

        this.dom.completionModal.classList.remove('hidden');
        this.safePlaySound('playMilestone');
    }

    showFinalQuestCompleteModal() {
        if (!this.dom || !this.dom.finalQuestCompleteModal) {
            this.finishQuiz();
            return;
        }

        const totalQuestions = this.getTotalQuestions();
        const answeredCount = Object.keys(this.answersMap).length;

        if (this.dom.finalModalScore) this.dom.finalModalScore.textContent = answeredCount + " / " + totalQuestions;
        if (this.dom.finalModalXP) this.dom.finalModalXP.textContent = "+" + this.earnedXP + " XP";
        if (this.dom.finalModalStreak) this.dom.finalModalStreak.textContent = "x" + this.maxStreak;

        this.dom.finalQuestCompleteModal.classList.remove('hidden');
        this.safePlaySound('playVictory');
    }

    openQuestMapModal() {
        if (!this.dom || !this.dom.questMapModal) return;

        if (this.dom.mapStudentName) this.dom.mapStudentName.textContent = this.studentName;
        if (this.dom.mapTotalXP) this.dom.mapTotalXP.textContent = this.earnedXP + ' / ' + this.getMaxXP() + ' XP';
        
        const m = Math.floor(this.timeRemaining / 60);
        const s = this.timeRemaining % 60;
        if (this.dom.mapTimeLeft) this.dom.mapTimeLeft.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;

        this.getTasks().forEach(tNum => {
            const item = this.dom['mapItemTask' + tNum];
            const status = this.dom['mapStatusTask' + tNum];
            if (!item || !status) return;

            item.classList.remove('step-unlocked', 'step-locked');
            const isCompleted = (this.taskScores['task' + tNum] && this.taskScores['task' + tNum].completed) || (tNum < this.currentTask);
            const isActive = (tNum === this.currentTask);

            if (isActive) {
                item.classList.add('step-unlocked');
                status.className = 'step-status-tag status-active';
                status.textContent = 'ACTIVE';
            } else if (isCompleted) {
                item.classList.add('step-unlocked');
                status.className = 'step-status-tag status-active';
                status.textContent = 'COMPLETED';
            } else {
                item.classList.add('step-locked');
                status.className = 'step-status-tag status-locked';
                status.textContent = 'LOCKED';
            }
        });

        this.dom.questMapModal.classList.remove('hidden');
        this.safePlaySound('playClick');
    }

    closeQuestMapModal() {
        if (!this.dom || !this.dom.questMapModal) return;
        this.dom.questMapModal.classList.add('hidden');
        this.safePlaySound('playClick');
    }

    // ==========================================
    // SERVER-AWARE TIMER
    // ==========================================

    startTimer() {
        if (this.timer) clearInterval(this.timer);
        this.updateTimerDisplay();

        this.timer = setInterval(() => {
            // Recalculate remaining time against start timestamp to prevent tab-sleep skew
            const elapsed = Math.floor((Date.now() - this.startedAtMs) / 1000);
            this.timeRemaining = Math.max(0, this.totalDurationSeconds - elapsed);
            this.totalTimeUsed = elapsed;
            this.updateTimerDisplay();

            if (this.timeRemaining === 300) {
                if (this.dom.hudTimer) this.dom.hudTimer.classList.add('timer-warning');
                this.safePlaySound('playTick');
            } else if (this.timeRemaining === 60) {
                if (this.dom.hudTimer) this.dom.hudTimer.classList.add('timer-critical');
                this.safePlaySound('playTick');
            }

            if (this.timeRemaining <= 0) {
                clearInterval(this.timer);
                this.autoSubmitted = true;
                this.finishQuiz(true);
            }
        }, 1000);
    }

    pauseTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    resumeTimer() {
        if (!this.timer && this.timeRemaining > 0) {
            this.startTimer();
        }
    }

    updateTimerDisplay() {
        if (!this.dom || !this.dom.timerDisplay) return;
        const m = Math.floor(this.timeRemaining / 60);
        const s = this.timeRemaining % 60;
        this.dom.timerDisplay.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }

    // ==========================================
    // FINAL SUBMISSION FLOW
    // ==========================================

    async finishQuiz(isAutoSubmit = false) {
        if (this.isSubmitting) return;
        this.isSubmitting = true;
        this.pauseTimer();
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

        if (this.dom.confirmSubmitFinalQuestBtn) {
            this.dom.confirmSubmitFinalQuestBtn.disabled = true;
            this.dom.confirmSubmitFinalQuestBtn.innerHTML = '<span>Submitting Assessment... ⏳</span>';
        }

        // Recalculate final score & breakdown authoritatively
        this.recalculateLiveGamification();
        const totalQuestions = this.getTotalQuestions();
        const percentage = Number(((this.score / totalQuestions) * 100).toFixed(2));

        const resultPayload = {
            studentName: this.studentName,
            studentSection: this.studentSection,
            section: this.studentSection,
            studentId: this.studentId,
            attemptId: this.attemptId,

            task1Score: this.taskScores.task1 ? this.taskScores.task1.score : 0,
            task1Correct: this.taskScores.task1 ? this.taskScores.task1.correct : 0,
            task1Wrong: this.taskScores.task1 ? this.taskScores.task1.wrong : 0,
            task1Unanswered: this.taskScores.task1 ? this.taskScores.task1.unanswered : 0,

            task2Score: this.taskScores.task2 ? this.taskScores.task2.score : 0,
            task2Correct: this.taskScores.task2 ? this.taskScores.task2.correct : 0,
            task2Wrong: this.taskScores.task2 ? this.taskScores.task2.wrong : 0,
            task2Unanswered: this.taskScores.task2 ? this.taskScores.task2.unanswered : 0,

            task3Score: this.taskScores.task3 ? this.taskScores.task3.score : 0,
            task3Correct: this.taskScores.task3 ? this.taskScores.task3.correct : 0,
            task3Wrong: this.taskScores.task3 ? this.taskScores.task3.wrong : 0,
            task3Unanswered: this.taskScores.task3 ? this.taskScores.task3.unanswered : 0,

            totalScore: this.score,
            totalQuestions: totalQuestions,
            percentage: percentage,
            earnedXP: this.earnedXP,
            maxStreak: this.maxStreak,
            timeUsed: this.totalTimeUsed,
            autoSubmitted: isAutoSubmit || this.autoSubmitted,
            attemptAudit: this.attemptAudit,
            answersMap: this.answersMap,
            completedAt: new Date().toISOString()
        };

        // Cache last result in localStorage & sessionStorage for result.html
        if (typeof localStorage !== "undefined") {
            localStorage.setItem('english10_last_result', JSON.stringify(resultPayload));
            localStorage.setItem('english10_last_result_' + this.studentId, JSON.stringify(resultPayload));
            localStorage.removeItem('english10_quest_attempt_' + this.studentName);
            localStorage.removeItem('english10_active_attempt_' + this.studentId);
        }
        if (typeof sessionStorage !== "undefined") {
            sessionStorage.setItem('english10_last_result', JSON.stringify(resultPayload));
            sessionStorage.removeItem('english10_active_state');
        }

        // Push all task submissions and final result to Firebase
        if (typeof window !== "undefined" && window.firebaseService) {
            try {
                // Ensure each task submission is recorded
                for (const tNum of this.getTasks()) {
                    const taskKey = 'task' + tNum;
                    const taskScoreData = this.taskScores[taskKey] || { score: 0, correct: 0, wrong: 0, unanswered: 0, xp: 0, total: 10 };
                    const taskAnswers = {};
                    (this.taskQuestions[taskKey] || []).forEach(q => {
                        if (this.answersMap[q.question_id]) {
                            taskAnswers[q.question_id] = this.answersMap[q.question_id];
                        }
                    });

                    const taskSub = {
                        studentId: this.studentId,
                        studentName: this.studentName,
                        section: this.studentSection,
                        studentSection: this.studentSection,
                        taskId: tNum,
                        taskKey: taskKey,
                        attemptId: this.attemptId,
                        score: taskScoreData.score,
                        totalQuestions: taskScoreData.total,
                        correctCount: taskScoreData.correct,
                        wrongCount: taskScoreData.wrong,
                        unansweredCount: taskScoreData.unanswered,
                        xp: taskScoreData.xp,
                        submittedAt: new Date().toISOString(),
                        answers: taskAnswers,
                        questions: this.taskQuestions[taskKey]
                    };

                    await window.firebaseService.saveTaskSubmission(taskSub);
                }

                await window.firebaseService.saveQuizResult(resultPayload);
            } catch (e) {
                console.error("Error saving final result to Firebase:", e);
            }
        }

        // Redirect to Result Page
        if (typeof window !== "undefined" && window.location) {
            window.location.replace('result.html');
        }
    }

    shuffleArray(arr) {
        if (!Array.isArray(arr)) return [];
        const copy = [...arr];
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    }
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener('DOMContentLoaded', () => {
        window.englishQuestEngine = new EnglishQuestEngine();
    });
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { EnglishQuestEngine };
}
