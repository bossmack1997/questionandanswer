# Interactive English 10 Remediation Quiz (Tasks 1–3)

A fully responsive, gamified, child-friendly interactive assessment web application designed for Grade 10 English students. Built strictly from the authoritative curriculum document: `English10_Term1_Objective_Remediation_Tasks_1-3.docx`.

---

## 🎯 Features

- **Strict Source Alignment**: All 32 official questions from Tasks 1–3 imported with 100% fidelity.
- **Reading Passages**:
  - **Task 1**: Complete literary passage of Mara, Leo, and the tomato plant.
  - **Task 2**: Complete community & generations core maxim statement.
  - **Task 3**: Complete 12 questions on diction, style, cohesion, and Filipino cultural identity.
- **Unbiased Fisher-Yates Randomization**:
  - Questions are randomized _within_ each task (Task boundaries remain intact).
  - Answer choices are randomized _within_ each question while preserving the stable correct answer identifier.
- **Countdown Timer**: 60 seconds per question (configured centrally in `js/config.js`). Auto-advances upon timeout and prevents timer resets on refresh.
- **Engaging Gamification**:
  - Live Score (⭐) and Streak (🔥) multipliers.
  - Dynamic progress bar.
  - Procedural Web Audio API sound effects (correct chime, wrong chime, timer ticks, victory fanfare) with audio mute toggle.
  - Supportive, child-friendly feedback toasts ("🎉 Great job!", "⭐ Excellent!", "💪 Keep going!").
  - Confetti victory celebration on completion.
- **Anti-Cheating Deterrence**:
  - Real-time tab-switching and window blur detection.
  - Warning modal with violation counter (max 3 tab switches).
  - Auto-submission upon exceeding violation threshold.
  - Context menu and text copying disabled during quiz.
- **Teacher Portal & Analytics**:
  - Firebase Authentication for teacher access (no hardcoded insecure credentials).
  - Cloud Firestore results collection (`quiz_results`).
  - Key Performance Indicators (Total Attempts, Average Score %, Highest Score %, Proficiency Rate ≥75%).
  - Live search by student name or student ID.
  - Multi-filtering by section, score performance level, and date.
  - Column sorting for all metrics.
  - Student drill-down modal with task-by-task breakdowns.
  - One-click CSV report export.

---

## 📁 Project Structure

```
english10-quiz/
│
├── index.html                # Welcome page & Student Registration
├── quiz.html                 # Core interactive quiz engine (Tasks 1–3)
├── result.html               # Final result breakdown & printable certificate
├── teacher-login.html        # Secure Teacher Authentication Portal
├── teacher-dashboard.html    # Teacher Analytics, Search, Filters & CSV Export
│
├── css/
│   ├── style.css             # Design system, typography, buttons, glassmorphism
│   ├── quiz.css              # Game HUD, reading drawer, choice cards, feedback toasts
│   └── teacher.css           # KPI cards, data table, sort indicators, filter toolbar
│
├── js/
│   ├── questions.js          # 32 authoritative questions + reading passages + verification routine
│   ├── config.js             # Central configuration (timers, anti-cheat limits, messages)
│   ├── firebase.js           # Firebase Auth & Firestore client service + offline fallback
│   ├── audio.js              # Web Audio API procedural sound synthesizer (zero external dependencies)
│   ├── quiz.js               # Quiz state machine, Fisher-Yates shuffling, anti-cheat
│   ├── result.js             # Score calculation, confetti effect, PDF/print generator
│   ├── teacher-auth.js       # Teacher login & password reset controller
│   └── teacher-dashboard.js  # Dashboard analytics, multi-filtering, sorting, CSV export
│
└── README.md
```

---

## 🚀 Quick Start (Local Testing)

1. Clone or copy the `english10-quiz` directory.
2. Open `index.html` directly in any modern browser (Chrome, Edge, Firefox, Safari).
3. To test with a local HTTP server:

   ```bash
   # Using Python 3:
   python -m http.server 8000

   # Or using Node.js npx serve:
   npx serve .
   ```

4. Navigate to `http://localhost:8000` in your browser.

---

## 🔥 Firebase Setup Guide (Production)

### 1. Create a Firebase Project

1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project** and name it (e.g., `english10-remediation`).
3. Disable or enable Google Analytics according to your preference and create the project.

### 2. Enable Firebase Authentication

1. In the Firebase console sidebar, navigate to **Build** > **Authentication**.
2. Click **Get Started** and select the **Email/Password** sign-in method.
3. Enable **Email/Password** and click **Save**.
4. Click the **Users** tab and click **Add user** to create your teacher account (e.g., `teacher@school.edu` with your secure password).

### 3. Create Cloud Firestore Database

1. In the sidebar, navigate to **Build** > **Firestore Database**.
2. Click **Create database** and choose a location close to your region (e.g., `asia-east1` or `us-central1`).
3. Choose **Start in production mode** and click **Create**.

### 4. Configure Firestore Security Rules

Go to the **Rules** tab in Cloud Firestore and paste the following production rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Quiz Results Collection
    match /quiz_results/{resultId} {
      // Students can create their own quiz results
      allow create: if request.resource.data.totalScore is number
                    && request.resource.data.studentName is string;

      // Only authenticated teachers can read, update, or delete student submissions
      allow read, update, delete: if request.auth != null;
    }
  }
}
```

Click **Publish**.

### 5. Add Firebase Configuration to the Project

1. In your Firebase Project Overview, click the **Web icon** (`</>`) to register a web app.
2. Copy your `firebaseConfig` object and paste it into `js/firebase.js`:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef",
};
```

---

## 🌐 GitHub Pages Deployment

1. Initialize a git repository and push to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of English 10 Remediation Quiz"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/english10-quiz.git
   git push -u origin main
   ```
2. Go to your GitHub repository **Settings** > **Pages**.
3. Under **Build and deployment** > **Source**, select `Deploy from a branch`.
4. Choose branch `main` and folder `/(root)`, then click **Save**.
5. Your live site will be available at: `https://YOUR_USERNAME.github.io/english10-quiz/`

---

## 🛡️ Content & Answer Key Verification

Run the built-in automated test suite to verify question bank integrity:

```bash
node -e "const { verifyQuestionBank } = require('./js/questions.js'); console.log(verifyQuestionBank());"
```

Expected Output:

```json
{
  "task1": { "expected": 10, "imported": 10, "status": "PASS" },
  "task2": { "expected": 10, "imported": 10, "status": "PASS" },
  "task3": { "expected": 12, "imported": 12, "status": "PASS" },
  "total": { "expected": 32, "imported": 32, "status": "PASS" },
  "answerKey": {
    "task1": "VERIFIED",
    "task2": "VERIFIED",
    "task3": "VERIFIED"
  }
}
```
