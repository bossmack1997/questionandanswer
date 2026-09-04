/**
 * TEACHER DASHBOARD CONTROLLER
 * Real-time results retrieval, KPI calculations, search, filters,
 * column sorting, student drill-down modal, official answer key viewer, and CSV export.
 */

class TeacherDashboard {
    constructor() {
        this.results = [];
        this.filteredResults = [];
        this.currentSort = { field: 'completedAt', order: 'desc' };

        this.init();
    }

    init() {
        window.firebaseService.onAuthStateChanged((user) => {
            if (!user) {
                window.location.replace('teacher-login.html');
                return;
            }
            const userEmailEl = document.getElementById('teacherUserEmail');
            if (userEmailEl) userEmailEl.textContent = user.email || 'Teacher';
            this.loadData();
        });

        this.bindEvents();
    }

    bindEvents() {
        const logoutBtn = document.getElementById('teacherLogoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                await window.firebaseService.teacherSignOut();
                window.location.replace('teacher-login.html');
            });
        }

        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', () => this.applyFilters());
        }

        const scoreFilter = document.getElementById('scoreFilter');
        if (scoreFilter) {
            scoreFilter.addEventListener('change', () => this.applyFilters());
        }

        const refreshBtn = document.getElementById('refreshDataBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadData());
        }

        const exportCsvBtn = document.getElementById('exportCsvBtn');
        if (exportCsvBtn) {
            exportCsvBtn.addEventListener('click', () => this.exportToCSV());
        }

        // Student Detail Modal
        const modalCloseBtn = document.getElementById('closeModalBtn');
        const modal = document.getElementById('studentDetailModal');
        if (modalCloseBtn && modal) {
            modalCloseBtn.addEventListener('click', () => modal.classList.add('hidden'));
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.add('hidden');
            });
        }

        // Answer Key Modal
        const viewKeyBtn = document.getElementById('viewAnswerKeyBtn');
        const answerKeyModal = document.getElementById('answerKeyModal');
        const closeAnswerKeyBtn = document.getElementById('closeAnswerKeyBtn');

        if (viewKeyBtn && answerKeyModal) {
            viewKeyBtn.addEventListener('click', () => answerKeyModal.classList.remove('hidden'));
        }
        if (closeAnswerKeyBtn && answerKeyModal) {
            closeAnswerKeyBtn.addEventListener('click', () => answerKeyModal.classList.add('hidden'));
            answerKeyModal.addEventListener('click', (e) => {
                if (e.target === answerKeyModal) answerKeyModal.classList.add('hidden');
            });
        }

        document.querySelectorAll('th[data-sort]').forEach(th => {
            th.addEventListener('click', () => {
                const field = th.dataset.sort;
                if (this.currentSort.field === field) {
                    this.currentSort.order = (this.currentSort.order === 'asc') ? 'desc' : 'asc';
                } else {
                    this.currentSort.field = field;
                    this.currentSort.order = (field === 'studentName') ? 'asc' : 'desc';
                }
                this.updateSortIcons();
                this.applyFilters();
            });
        });
    }

    async loadData() {
        const loadingIndicator = document.getElementById('tableLoading');
        if (loadingIndicator) loadingIndicator.classList.remove('hidden');

        try {
            this.results = await window.firebaseService.getAllResults();
            this.updateKPIs();
            this.applyFilters();
        } catch (err) {
            console.error('Error loading dashboard data:', err);
            alert('Error fetching student submissions. Please check your connection.');
        } finally {
            if (loadingIndicator) loadingIndicator.classList.add('hidden');
        }
    }

    updateKPIs() {
        const total = this.results.length;
        document.getElementById('kpiTotalAttempts').textContent = total;

        if (total === 0) {
            document.getElementById('kpiAvgScore').textContent = '0%';
            document.getElementById('kpiHighestScore').textContent = '0%';
            document.getElementById('kpiProficiencyRate').textContent = '0%';
            return;
        }

        let sumPct = 0;
        let highest = 0;
        let proficientCount = 0;

        this.results.forEach(r => {
            const p = r.percentage || 0;
            sumPct += p;
            if (p > highest) highest = p;
            if (p >= 75) proficientCount++;
        });

        const avg = Math.round(sumPct / total);
        const profRate = Math.round((proficientCount / total) * 100);

        document.getElementById('kpiAvgScore').textContent = `${avg}%`;
        document.getElementById('kpiHighestScore').textContent = `${Math.round(highest)}%`;
        document.getElementById('kpiProficiencyRate').textContent = `${profRate}%`;
    }

    applyFilters() {
        const query = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
        const scoreVal = document.getElementById('scoreFilter')?.value || 'all';

        this.filteredResults = this.results.filter(r => {
            const nameMatch = (r.studentName || '').toLowerCase().includes(query);
            if (query && !nameMatch) return false;

            const p = r.percentage || 0;
            if (scoreVal === 'mastery' && p < 90) return false;
            if (scoreVal === 'proficient' && (p < 75 || p >= 90)) return false;
            if (scoreVal === 'remediation' && p >= 75) return false;

            return true;
        });

        this.filteredResults.sort((a, b) => {
            const field = this.currentSort.field;
            let valA = a[field];
            let valB = b[field];

            if (field === 'completedAt') {
                valA = new Date(valA || 0).getTime();
                valB = new Date(valB || 0).getTime();
            } else if (field === 't1') {
                valA = a.task1Score || 0;
                valB = b.task1Score || 0;
            } else if (field === 't2') {
                valA = a.task2Score || 0;
                valB = b.task2Score || 0;
            } else if (field === 't3') {
                valA = a.task3Score || 0;
                valB = b.task3Score || 0;
            } else if (field === 't4') {
                valA = a.task4Score || 0;
                valB = b.task4Score || 0;
            } else if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = (valB || '').toLowerCase();
            }

            if (valA < valB) return this.currentSort.order === 'asc' ? -1 : 1;
            if (valA > valB) return this.currentSort.order === 'asc' ? 1 : -1;
            return 0;
        });

        this.renderTable();
    }

    updateSortIcons() {
        document.querySelectorAll('th[data-sort]').forEach(th => {
            const field = th.dataset.sort;
            if (field === this.currentSort.field) {
                th.classList.add('sorted');
            } else {
                th.classList.remove('sorted');
            }
        });
    }

    renderTable() {
        const tbody = document.getElementById('resultsTableBody');
        const countBadge = document.getElementById('resultCountBadge');

        if (countBadge) {
            countBadge.textContent = `Showing ${this.filteredResults.length} of ${this.results.length} submissions`;
        }

        if (!tbody) return;
        tbody.innerHTML = '';

        if (this.filteredResults.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 3rem; color: #64748b;">
                        🔍 No student submissions match the current search or filters.
                    </td>
                </tr>
            `;
            return;
        }

        this.filteredResults.forEach(r => {
            const tr = document.createElement('tr');

            const p = Math.round(r.percentage || 0);
            let pillClass = 'pct-remediation';
            if (p >= 90) pillClass = 'pct-mastery';
            else if (p >= 75) pillClass = 'pct-proficient';

            const dateStr = r.completedAt ? new Date(r.completedAt).toLocaleDateString() : 'N/A';

            tr.innerHTML = `
                <td style="font-weight: 800; color: #0f172a;">${r.studentName || 'N/A'}</td>
                <td class="text-center">${r.task1Score || 0}/10</td>
                <td class="text-center">${r.task2Score || 0}/10</td>
                <td class="text-center">${r.task3Score || 0}/12</td>
                <td class="text-center">${r.task4Score || 0}/10</td>
                <td class="text-center" style="font-weight: 800;">${r.totalScore || 0}/42</td>
                <td class="text-center"><span class="pill-pct ${pillClass}">${p}%</span></td>
                <td class="text-muted" style="font-size: 0.85rem;">${dateStr}</td>
                <td class="text-center">
                    <button type="button" class="btn-view-result">👁️ View</button>
                </td>
            `;

            const viewBtn = tr.querySelector('.btn-view-result');
            if (viewBtn) {
                viewBtn.addEventListener('click', () => this.showStudentDetails(r));
            }

            tbody.appendChild(tr);
        });
    }

    showStudentDetails(r) {
        const modal = document.getElementById('studentDetailModal');
        if (!modal) return;

        document.getElementById('modalStudentName').textContent = r.studentName || 'N/A';
        document.getElementById('modalFinalScore').textContent = `${r.totalScore || 0} / 42`;
        document.getElementById('modalPercentage').textContent = `${Math.round(r.percentage || 0)}%`;

        document.getElementById('modalT1Score').textContent = `${r.task1Score || 0} / 10`;
        document.getElementById('modalT1Breakdown').textContent = `Correct: ${r.task1Correct || 0} | Wrong: ${r.task1Wrong || 0} | Unanswered: ${r.task1Unanswered || 0}`;

        document.getElementById('modalT2Score').textContent = `${r.task2Score || 0} / 10`;
        document.getElementById('modalT2Breakdown').textContent = `Correct: ${r.task2Correct || 0} | Wrong: ${r.task2Wrong || 0} | Unanswered: ${r.task2Unanswered || 0}`;

        document.getElementById('modalT3Score').textContent = `${r.task3Score || 0} / 12`;
        document.getElementById('modalT3Breakdown').textContent = `Correct: ${r.task3Correct || 0} | Wrong: ${r.task3Wrong || 0} | Unanswered: ${r.task3Unanswered || 0}`;

        const t4ScoreEl = document.getElementById('modalT4Score');
        if (t4ScoreEl) t4ScoreEl.textContent = `${r.task4Score || 0} / 10`;
        const t4BreakdownEl = document.getElementById('modalT4Breakdown');
        if (t4BreakdownEl) t4BreakdownEl.textContent = `Correct: ${r.task4Correct || 0} | Wrong: ${r.task4Wrong || 0} | Unanswered: ${r.task4Unanswered || 0}`;

        const mins = Math.floor((r.timeUsed || 0) / 60);
        const secs = (r.timeUsed || 0) % 60;
        document.getElementById('modalTimeUsed').textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        document.getElementById('modalDate').textContent = r.completedAt ? new Date(r.completedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A';

        const autoWarn = document.getElementById('modalAutoSubmitWarning');
        if (autoWarn) {
            if (r.autoSubmitted) autoWarn.classList.remove('hidden');
            else autoWarn.classList.add('hidden');
        }

        modal.classList.remove('hidden');
    }

    exportToCSV() {
        if (this.filteredResults.length === 0) {
            alert('No submissions available to export.');
            return;
        }

        const headers = ['Student Name', 'Task 1 (/10)', 'Task 2 (/10)', 'Task 3 (/12)', 'Task 4 (/10)', 'Total Score (/42)', 'Percentage (%)', 'Time Used (seconds)', 'Auto Submitted', 'Date Completed'];

        const rows = this.filteredResults.map(r => [
            `"${(r.studentName || '').replace(/"/g, '""')}"`,
            r.task1Score || 0,
            r.task2Score || 0,
            r.task3Score || 0,
            r.task4Score || 0,
            r.totalScore || 0,
            r.percentage || 0,
            r.timeUsed || 0,
            r.autoSubmitted ? "YES" : "NO",
            `"${r.completedAt || ''}"`
        ]);

        const csv = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csv);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `EnglishQuest_Remediation_Results_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.teacherDashboard = new TeacherDashboard();
});