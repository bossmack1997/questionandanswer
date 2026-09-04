/**
 * TEACHER AUTHENTICATION CONTROLLER
 * Supports Firebase Authentication (Email/Password), session validation,
 * password reset requests, and offline demonstration accounts.
 */

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('teacherLoginForm');
    const resetForm = document.getElementById('resetPasswordForm');
    const showResetBtn = document.getElementById('showResetBtn');
    const backToLoginBtn = document.getElementById('backToLoginBtn');
    const authErrorAlert = document.getElementById('authErrorAlert');
    const authSuccessAlert = document.getElementById('authSuccessAlert');

    window.firebaseService.onAuthStateChanged((user) => {
        if (user && window.location.pathname.endsWith('teacher-login.html')) {
            window.location.replace('teacher-dashboard.html');
        }
    });

    if (showResetBtn) {
        showResetBtn.addEventListener('click', (e) => {
            e.preventDefault();
            loginForm.classList.add('hidden');
            resetForm.classList.remove('hidden');
            hideAlerts();
        });
    }

    if (backToLoginBtn) {
        backToLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            resetForm.classList.add('hidden');
            loginForm.classList.remove('hidden');
            hideAlerts();
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideAlerts();

            const email = document.getElementById('teacherEmail').value.trim();
            const password = document.getElementById('teacherPassword').value;
            const submitBtn = document.getElementById('loginSubmitBtn');

            if (!email || !password) {
                showError('Please provide both email and password.');
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Signing In...';

            try {
                await window.firebaseService.teacherSignIn(email, password);
                window.location.replace('teacher-dashboard.html');
            } catch (err) {
                showError(err.message || 'Failed to sign in. Please verify your credentials.');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Sign In to Dashboard';
            }
        });
    }

    if (resetForm) {
        resetForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideAlerts();

            const email = document.getElementById('resetEmail').value.trim();
            const submitBtn = document.getElementById('resetSubmitBtn');

            if (!email) {
                showError('Please enter your registered teacher email.');
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending link...';

            try {
                await window.firebaseService.sendPasswordReset(email);
                showSuccess('Password reset email sent! Check your inbox.');
            } catch (err) {
                showError(err.message || 'Error sending reset email.');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Send Password Reset Link';
            }
        });
    }

    function showError(msg) {
        if (authErrorAlert) {
            authErrorAlert.textContent = msg;
            authErrorAlert.classList.remove('hidden');
        }
    }

    function showSuccess(msg) {
        if (authSuccessAlert) {
            authSuccessAlert.textContent = msg;
            authSuccessAlert.classList.remove('hidden');
        }
    }

    function hideAlerts() {
        if (authErrorAlert) authErrorAlert.classList.add('hidden');
        if (authSuccessAlert) authSuccessAlert.classList.add('hidden');
    }
});