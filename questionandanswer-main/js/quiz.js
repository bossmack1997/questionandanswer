/**
 * ENGLISH QUEST — MASTER QUIZ ENGINE
 * Complete Multi-Device Resume, Server-Aware Timer, Cloud Autosync,
 * Live Correct/Wrong Question Navigator Tracker, and Smooth Flow.
 * Grade 10 English Term 1 Remediation Assessment.
 */

class EnglishQuestEngine {
    constructor() {
        this.studentName = "";
        this.studentId = "student_anonymous";
        this.attemptId = "quest_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6);
        this.startedAt = new Date().toISOString();
        this.startedAtMs = Date.now();
        this.currentTask = 1;
        this.currentQuestionIndex = 0;
        
        // Reading materials dataset reference (guaranteed fallback)
        this.readingMaterials = (typeof READING_PASSAGES !== 'undefined') ? READING_PASSAGES : 
                                ((typeof readingMaterials !== 'undefined') ? readingMaterials : 
                                ((typeof window !== 'undefined' && (window.READING_PASSAGES || window.readingMaterials)) || {}));

        // Questions structure (10 in Task 1, 10 in Task 2, 12 in Task 3)
        this.taskQuestions = {
            task1: [],
            task2: [],
            task3: []
        };
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
        this.score = 0;             // Total correct count (0..32)
        this.earnedXP = 0;          // Total XP (0..320)
        this.streak = 0;            // Current consecutive correct streak
        this.maxStreak = 0;         // Best streak achieved
        
        // Task scores tracking
        this.taskScores = {
            task1: { correct: 0, wrong: 0, unanswered: 0, score: 0, xp: 0, total: 10, completed: false },
            task2: { correct: 0, wrong: 0, unanswered: 0, score: 0, xp: 0, total: 10, completed: false },
            task3: { correct: 0, wrong: 0, unanswered: 0, score: 0, xp: 0, total: 12, completed: false }
        };

        // 30-Minute Quest Challenge Timer (1800 seconds total)
        this.totalDurationSeconds = (typeof QUIZ_CONFIG !== "undefined" && QUIZ_CONFIG.overallTimerSeconds) || 1800;
        this.timeRemaining = this.totalDurationSeconds;
        this.totalTimeUsed = 0;
        this.timer = null;

        // Attempt Audit Trail
        this.attemptAudit = {
            attempt_id: this.attemptId,
            student_name: "",
            student_id: "",
            started_at: this.startedAt,
            task_order: [1, 2, 3],
            question_order: { task1: [], task2: [], task3: [] },
            option_order: {},
            selected_answers: {}
        };

        // Anti-cheating & security
        this.tabSwitches = 0;
        this.autoSubmitted = false;

        this.init();
    }

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
            this.studentName = localStorage.getItem('studentName') || sessionStorage.getItem('studentName');
            if (!this.studentName || this.studentName.trim().length < 2) {
                if (typeof window !== "undefined" && window.location) {
                    window.location.replace('student.html');
                }
                return;
            }
        } else {
            this.studentName = "Student";
        }
        
        if (typeof window !== "undefined" && window.firebaseService) {
            this.studentId = window.firebaseService.normalizeStudentId(this.studentName);
        } else {
            this.studentId = 'student_' + this.studentName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
        }

        this.attemptAudit.student_name = this.studentName;
        this.attemptAudit.student_id = this.studentId;

        this.cacheDOM();
        this.bindEvents();
        this.setupAntiCheating();
        this.setupNetworkMonitoring();

        // Synchronous initial load / restore
        this.loadLocalQuestState();

        // Asynchronous cloud reconciliation
        this.reconcileCloudQuestState();

        this.startPeriodicSyncHeartbeat();
    }

    cacheDOM() {
        if (typeof document === "undefined") return;

        this.dom = {
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

            // Final Quest Complete Modal (32/32 items)
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

        // Task Nav Tabs (Direct Navigation)
        [1, 2, 3].forEach(tNum => {
            const tab = this.dom['tabTask' + tNum];
            if (tab) {
                tab.addEventListener('click', () => this.handleTaskTabClick(tNum));
            }
        });

        // Quest Map Task Items
        [1, 2, 3].forEach(tNum => {
            const mapItem = this.dom['mapItemTask' + tNum];
            if (mapItem) {
                mapItem.style.cursor = 'pointer';
                mapItem.addEventListener('click', () => {
                    const isCompleted = this.taskScores['task' + tNum].completed || (tNum < this.currentTask);
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
                        if (typeof window !== "undefined" && window.soundSystem) window.soundSystem.playTick();
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

        // Milestone Continue Action (Task 1 -> 2 or Task 2 -> 3)
        if (this.dom.continueBtn) {
            this.dom.continueBtn.addEventListener('click', () => {
                if (this.dom.completionModal) this.dom.completionModal.classList.add('hidden');
                if (this.currentTask < 3) {
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

    handleTaskTabClick(taskNum) {
        if (this.autoNextTimeout) clearTimeout(this.autoNextTimeout);

        if (taskNum === this.currentTask) {
            return;
        }

        const targetCompleted = this.taskScores['task' + taskNum].completed;
        const isPrevious = (taskNum < this.currentTask);

        if (isPrevious || targetCompleted) {
            this.currentTask = taskNum;
            this.currentQuestionIndex = 0;
            this.renderReadingSection('task' + taskNum);
            this.renderCurrentQuestion();
            this.updateTaskTabsUI();
            this.saveState();
            if (typeof window !== "undefined" && window.soundSystem) window.soundSystem.playClick();
        } else {
            const tabEl = this.dom['tabTask' + taskNum];
            if (tabEl) {
                tabEl.classList.remove('tab-shake');
                void tabEl.offsetWidth;
                tabEl.classList.add('tab-shake');
            }
            if (typeof window !== "undefined" && window.soundSystem) window.soundSystem.playTick();
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

    setupAntiCheating() {
        if (typeof document === "undefined") return;

        document.addEventListener('visibilitychange', () => {
            if (document.hidden && !this.isSubmitting) {
                this.tabSwitches++;
                this.pauseTimer();
                if (this.dom && this.dom.antiCheatCount) this.dom.antiCheatCount.textContent = this.tabSwitches + ' / 3';
                if (this.dom && this.dom.antiCheatModal) this.dom.antiCheatModal.classList.remove('hidden');
                if (typeof window !== "undefined" && window.soundSystem) window.soundSystem.playWrong();
            }
        });
    }

    loadLocalQuestState() {
        const storageKey = 'english10_quest_attempt_' + this.studentName;
        let attempt = null;

        if (typeof localStorage !== "undefined") {
            const raw = localStorage.getItem(storageKey) || localStorage.getItem('english10_active_attempt_' + this.studentId);
            if (raw) {
                try { attempt = JSON.parse(raw); } catch (e) {}
            }
        }

        if (attempt && attempt.taskQuestions && attempt.taskQuestions.task1 && attempt.taskQuestions.task1.length === 10) {
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
            const cloudAttempt = await window.firebaseService.getActiveAttempt(this.studentId, this.studentName);
            if (cloudAttempt && cloudAttempt.taskQuestions && cloudAttempt.taskQuestions.task1 && cloudAttempt.taskQuestions.task1.length === 10) {
                const cloudAnsCount = cloudAttempt.answersMap ? Object.keys(cloudAttempt.answersMap).length : 0;
                const localAnsCount = this.answersMap ? Object.keys(this.answersMap).length : 0;

                if (cloudAnsCount >= localAnsCount) {
                    this.restoreFromAttempt(cloudAttempt);
                    this.updateSyncUI('saved', 'Cloud Synced');
                }
            }
        } catch (err) {
            console.warn('Cloud state reconciliation note:', err);
        }
    }

    restoreFromAttempt(attempt) {
        this.attemptId = attempt.attempt_id || attempt.attemptId || this.attemptId;
        this.startedAt = attempt.started_at || this.startedAt;
        this.startedAtMs = attempt.started_at_ms || (attempt.started_at ? new Date(attempt.started_at).getTime() : this.startedAtMs);
        this.attemptAudit = attempt.attemptAudit || attempt.attempt_audit || this.attemptAudit;
        this.currentTask = (typeof attempt.currentTask === 'number' && attempt.currentTask >= 1 && attempt.currentTask <= 3) ? attempt.currentTask : 1;
        this.currentQuestionIndex = (typeof attempt.currentQuestionIndex === 'number' && attempt.currentQuestionIndex >= 0) ? attempt.currentQuestionIndex : 0;
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

        ['task1', 'task2', 'task3'].forEach(taskKey => {
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
        const state = {
            attemptId: this.attemptId,
            attempt_id: this.attemptId,
            student_name: this.studentName,
            studentName: this.studentName,
            student_id: this.studentId,
            started_at: this.startedAt,
            started_at_ms: this.startedAtMs,
            attemptAudit: this.attemptAudit,
            currentTask: this.currentTask,
            currentQuestionIndex: this.currentQuestionIndex,
            taskQuestions: this.taskQuestions,
            answersMap: this.answersMap,
            score: this.score,
            earnedXP: this.earnedXP,
            streak: this.streak,
            maxStreak: this.maxStreak,
            taskScores: this.taskScores,
            tabSwitches: this.tabSwitches,
            totalTimeUsed: this.totalTimeUsed,
            timeRemaining: this.timeRemaining
        };

        // 1. Save locally immediately
        if (typeof localStorage !== "undefined") {
            localStorage.setItem('english10_quest_attempt_' + this.studentName, JSON.stringify(state));
            localStorage.setItem('english10_active_attempt_' + this.studentId, JSON.stringify(state));
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
        }, 10000);
    }

    showTaskIntro(taskNum) {
        if (!this.dom || !this.dom.taskIntroModal) return;

        const intros = {
            1: {
                icon: "🎯",
                title: "TASK 1<br><span>UNDERSTANDING LITERARY ELEMENTS</span>",
                focus: "Conflict • Characterization • Plot • Diction • Tone/Mood • Point of View • Narrative Techniques",
                count: "10 Questions",
                xp: "+100 XP Max",
                passage: "Story: Mara and the Tomato Plant"
            },
            2: {
                icon: "🔎",
                title: "TASK 2<br><span>ANALYZING & EVALUATING A LITERARY TEXT</span>",
                focus: "Values • Maxims • Universal Truths • Philosophies • Contexts (Historical, Biographical, Psychological, Sociocultural)",
                count: "10 Questions",
                xp: "+100 XP Max",
                passage: "Statement: Community & Future Generations"
            },
            3: {
                icon: "✍️",
                title: "TASK 3<br><span>LANGUAGE, STYLE, COHESION, AND CULTURE</span>",
                focus: "Diction • Style • Tone • Coherence • Cohesion • Purpose • Audience • Filipino Cultural Identity",
                count: "12 Questions",
                xp: "+120 XP Max",
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
        if (typeof window !== "undefined" && window.soundSystem) window.soundSystem.playTaskIntro();
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
        if (typeof window !== "undefined" && window.soundSystem) window.soundSystem.playClick();
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

        // Update Question Badges & Text
        const itemNum = this.currentQuestionIndex + 1;
        let overallItemNum = this.currentQuestionIndex + 1;
        if (this.currentTask === 2) overallItemNum += 10;
        if (this.currentTask === 3) overallItemNum += 20;

        if (this.dom.questionTag) {
            this.dom.questionTag.textContent = 'ITEM ' + itemNum + ' OF ' + totalInTask + ' (TASK ' + this.currentTask + ' • QUESTION #' + overallItemNum + ' OF 32)';
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

        // Update Question Navigator Pills (with Green/Red correct/wrong live tracker)
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
                if (typeof window !== "undefined" && window.soundSystem) window.soundSystem.playClick();
            });

            this.dom.questionPillsContainer.appendChild(pill);
        });
    }

    updateHUDProgress(totalInTask) {
        if (!this.dom) return;
        if (this.dom.hudStudentName) this.dom.hudStudentName.textContent = this.studentName;
        
        const taskTitles = {
            1: "🎯 TASK 1: Understanding Literary Elements",
            2: "🔎 TASK 2: Analyzing & Evaluating Literary Text",
            3: "✍️ TASK 3: Language, Style, Cohesion & Culture"
        };
        if (this.dom.hudTaskBadge) this.dom.hudTaskBadge.textContent = taskTitles[this.currentTask] || 'TASK ' + this.currentTask;
        if (this.dom.hudTaskProgress) this.dom.hudTaskProgress.textContent = 'Question ' + (this.currentQuestionIndex + 1) + ' of ' + totalInTask;

        let overallCurrent = this.currentQuestionIndex + 1;
        if (this.currentTask === 2) overallCurrent += 10;
        if (this.currentTask === 3) overallCurrent += 20;

        const totalOverallQuestions = 32;
        if (this.dom.hudOverallProgress) this.dom.hudOverallProgress.textContent = overallCurrent + ' / ' + totalOverallQuestions + ' Questions';
        
        const pct = Math.round((overallCurrent / totalOverallQuestions) * 100);
        if (this.dom.hudProgressBar) this.dom.hudProgressBar.style.width = pct + '%';
    }

    updateTaskTabsUI() {
        if (!this.dom) return;
        [1, 2, 3].forEach(tNum => {
            const tab = this.dom['tabTask' + tNum];
            if (!tab) return;

            const isCompleted = this.taskScores['task' + tNum].completed || (tNum < this.currentTask);
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

        // Immediately update the top navigator pill status for current question
        if (this.dom && this.dom.questionPillsContainer) {
            const currentPill = (this.dom.questionPillsContainer && this.dom.questionPillsContainer.children) ? this.dom.questionPillsContainer.children[this.currentQuestionIndex] : null;
            if (currentPill) {
                const itemNum = this.currentQuestionIndex + 1;
                currentPill.classList.remove('pill-correct', 'pill-wrong', 'pill-anim-correct', 'pill-anim-wrong');
                void currentPill.offsetWidth; // Force CSS reflow to trigger pulse/shake
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

        // Audio & neutral motivational feedback (NEVER reveals correct answer text if wrong)
        if (typeof window !== "undefined" && window.soundSystem) {
            if (isCorrect) {
                window.soundSystem.playCorrect();
                this.showFeedback('correct');
            } else {
                window.soundSystem.playWrong();
                this.showFeedback('neutral');
            }
        }

        // Save progress to storage and cloud
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

        ['task1', 'task2', 'task3'].forEach(taskKey => {
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

            this.taskScores[taskKey].correct = taskCorrect;
            this.taskScores[taskKey].wrong = taskWrong;
            this.taskScores[taskKey].unanswered = taskUnanswered;
            this.taskScores[taskKey].score = taskCorrect;
            this.taskScores[taskKey].xp = taskCorrect * 10;
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
            if (isLastInTask) {
                if (this.currentTask === 1) {
                    this.dom.nextBtnText.textContent = "Complete Task 1 →";
                } else if (this.currentTask === 2) {
                    this.dom.nextBtnText.textContent = "Complete Task 2 →";
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
            if (typeof window !== "undefined" && window.soundSystem) window.soundSystem.playClick();
        } else if (this.currentTask > 1) {
            // Smoothly navigate to previous task's last question
            this.currentTask--;
            const prevTaskTotal = this.taskQuestions['task' + this.currentTask].length;
            this.currentQuestionIndex = prevTaskTotal - 1;
            this.renderReadingSection('task' + this.currentTask);
            this.renderCurrentQuestion();
            this.updateTaskTabsUI();
            this.saveState();
            if (typeof window !== "undefined" && window.soundSystem) window.soundSystem.playClick();
        }
    }

    handleNextOrSubmitAction() {
        if (this.autoNextTimeout) clearTimeout(this.autoNextTimeout);

        const currentTaskTotal = this.taskQuestions['task' + this.currentTask].length;

        if (this.currentQuestionIndex < currentTaskTotal - 1) {
            this.currentQuestionIndex++;
            this.renderCurrentQuestion();
            this.saveState();
            if (typeof window !== "undefined" && window.soundSystem) window.soundSystem.playClick();
        } else {
            this.taskScores['task' + this.currentTask].completed = true;
            this.saveState();

            if (this.currentTask < 3) {
                this.showTaskCompletionMilestone(this.currentTask);
            } else {
                this.showFinalQuestCompleteModal();
            }
        }
    }

    showTaskCompletionMilestone(taskNum) {
        if (!this.dom || !this.dom.completionModal) return;

        const taskScore = this.taskScores['task' + taskNum];
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
        if (typeof window !== "undefined" && window.soundSystem) window.soundSystem.playMilestone();
    }

    showFinalQuestCompleteModal() {
        if (!this.dom || !this.dom.finalQuestCompleteModal) {
            this.finishQuiz();
            return;
        }

        const answeredCount = Object.keys(this.answersMap).length;
        if (this.dom.finalModalScore) this.dom.finalModalScore.textContent = answeredCount + " / 32";
        if (this.dom.finalModalXP) this.dom.finalModalXP.textContent = "+" + (this.score * 10) + " XP";
        if (this.dom.finalModalStreak) this.dom.finalModalStreak.textContent = "x" + this.maxStreak;

        this.dom.finalQuestCompleteModal.classList.remove('hidden');
        if (typeof window !== "undefined" && window.soundSystem) window.soundSystem.playVictory();
    }

    openQuestMapModal() {
        if (!this.dom || !this.dom.questMapModal) return;

        if (this.dom.mapStudentName) this.dom.mapStudentName.textContent = this.studentName;
        if (this.dom.mapTotalXP) this.dom.mapTotalXP.textContent = this.earnedXP + ' / 320 XP';
        
        const m = Math.floor(this.timeRemaining / 60);
        const s = this.timeRemaining % 60;
        if (this.dom.mapTimeLeft) this.dom.mapTimeLeft.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;

        [1, 2, 3].forEach(tNum => {
            const item = this.dom['mapItemTask' + tNum];
            const status = this.dom['mapStatusTask' + tNum];
            if (!item || !status) return;

            item.classList.remove('step-unlocked', 'step-locked');
            const isCompleted = this.taskScores['task' + tNum].completed || (tNum < this.currentTask);
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
        if (typeof window !== "undefined" && window.soundSystem) window.soundSystem.playClick();
    }

    closeQuestMapModal() {
        if (!this.dom || !this.dom.questMapModal) return;
        this.dom.questMapModal.classList.add('hidden');
        if (typeof window !== "undefined" && window.soundSystem) window.soundSystem.playClick();
    }

    startTimer() {
        if (this.timer) clearInterval(this.timer);
        this.updateTimerDisplay();

        this.timer = setInterval(() => {
            if (this.timeRemaining > 0) {
                this.timeRemaining--;
                this.totalTimeUsed++;
                this.updateTimerDisplay();

                if (this.timeRemaining === 300) {
                    if (this.dom.hudTimer) this.dom.hudTimer.classList.add('timer-warning');
                    if (typeof window !== "undefined" && window.soundSystem) window.soundSystem.playTick();
                } else if (this.timeRemaining === 60) {
                    if (this.dom.hudTimer) this.dom.hudTimer.classList.add('timer-critical');
                    if (typeof window !== "undefined" && window.soundSystem) window.soundSystem.playTick();
                }
            } else {
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

    async finishQuiz(isAutoSubmit = false) {
        if (this.isSubmitting) return;
        this.isSubmitting = true;
        this.pauseTimer();
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

        // Recalculate final score & breakdown authoritatively
        this.recalculateLiveGamification();

        const resultPayload = {
            studentName: this.studentName,
            studentId: this.studentId,
            attemptId: this.attemptId,

            task1Score: this.taskScores.task1.score,
            task1Correct: this.taskScores.task1.correct,
            task1Wrong: this.taskScores.task1.wrong,
            task1Unanswered: this.taskScores.task1.unanswered,

            task2Score: this.taskScores.task2.score,
            task2Correct: this.taskScores.task2.correct,
            task2Wrong: this.taskScores.task2.wrong,
            task2Unanswered: this.taskScores.task2.unanswered,

            task3Score: this.taskScores.task3.score,
            task3Correct: this.taskScores.task3.correct,
            task3Wrong: this.taskScores.task3.wrong,
            task3Unanswered: this.taskScores.task3.unanswered,

            totalScore: this.score,
            totalQuestions: 32,
            percentage: Number(((this.score / 32) * 100).toFixed(2)),
            earnedXP: this.earnedXP,
            maxStreak: this.maxStreak,
            timeUsed: this.totalTimeUsed,
            autoSubmitted: isAutoSubmit || this.autoSubmitted,
            attemptAudit: this.attemptAudit
        };

        // Cache last result in localStorage & sessionStorage for result.html
        if (typeof localStorage !== "undefined") {
            localStorage.setItem('english10_last_result', JSON.stringify(resultPayload));
            localStorage.removeItem('english10_quest_attempt_' + this.studentName);
            localStorage.removeItem('english10_active_attempt_' + this.studentId);
        }
        if (typeof sessionStorage !== "undefined") {
            sessionStorage.setItem('english10_last_result', JSON.stringify(resultPayload));
            sessionStorage.removeItem('english10_active_state');
        }

        // Push to Firebase and cleanup active in-progress record
        if (typeof window !== "undefined" && window.firebaseService) {
            try {
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
