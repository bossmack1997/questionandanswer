/**
 * WEB AUDIO API SYNTHESIZER
 * Zero-dependency procedural audio for sound effects.
 * Guaranteed to work offline, on GitHub Pages, and across all modern browsers.
 */

class SoundSystem {
    constructor() {
        this.ctx = null;
        this.muted = localStorage.getItem('english10_quiz_muted') === 'true';
    }

    init() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                this.ctx = new AudioCtx();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    toggleMute() {
        this.muted = !this.muted;
        localStorage.setItem('english10_quiz_muted', this.muted);
        return this.muted;
    }

    isMuted() {
        return this.muted;
    }

    playTone(frequency, type, duration, delay = 0, gainLevel = 0.15) {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;

        setTimeout(() => {
            try {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();

                osc.type = type;
                osc.frequency.setValueAtTime(frequency, this.ctx.currentTime);

                gain.gain.setValueAtTime(gainLevel, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

                osc.connect(gain);
                gain.connect(this.ctx.destination);

                osc.start();
                osc.stop(this.ctx.currentTime + duration);
            } catch (e) {
                console.debug("Audio playback ignored:", e);
            }
        }, delay * 1000);
    }

    playCorrect() {
        // Joyful ascending major chord: C5 -> E5 -> G5 -> C6
        this.playTone(523.25, 'sine', 0.15, 0.00, 0.15);
        this.playTone(659.25, 'sine', 0.15, 0.08, 0.15);
        this.playTone(783.99, 'sine', 0.18, 0.16, 0.18);
        this.playTone(1046.50, 'triangle', 0.35, 0.24, 0.22);
    }

    playWrong() {
        // Gentle low supportive chime: A3 -> F3
        this.playTone(220.00, 'sine', 0.22, 0.00, 0.15);
        this.playTone(174.61, 'sine', 0.30, 0.12, 0.12);
    }

    playTick() {
        // Soft wooden countdown click
        this.playTone(800, 'triangle', 0.04, 0.00, 0.08);
    }

    playStreak() {
        // Sparkle sweep for high streaks
        this.playTone(587.33, 'sine', 0.1, 0.00, 0.12);
        this.playTone(880.00, 'sine', 0.1, 0.06, 0.15);
        this.playTone(1174.66, 'sine', 0.25, 0.12, 0.20);
    }

    playTaskComplete() {
        // Triumph fanfare
        this.playTone(440.00, 'triangle', 0.2, 0.00, 0.18);
        this.playTone(554.37, 'triangle', 0.2, 0.12, 0.18);
        this.playTone(659.25, 'triangle', 0.2, 0.24, 0.20);
        this.playTone(880.00, 'sine', 0.6, 0.36, 0.25);
    }

    playQuizComplete() {
        // Victory crescendo
        const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
        notes.forEach((freq, idx) => {
            this.playTone(freq, 'sine', 0.3, idx * 0.1, 0.2);
        });
    }
}

window.soundSystem = new SoundSystem();
