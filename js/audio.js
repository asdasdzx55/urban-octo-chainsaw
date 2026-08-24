/**
 * Audio and Haptic Feedback System for Barcode Scanner
 * Uses Web Audio API for zero-latency, cross-browser scanner beep.
 */

class SoundController {
  constructor() {
    this.audioCtx = null;
    this.soundEnabled = true;
    this.vibrateEnabled = true;
  }

  initAudio() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  /**
   * Play standard retail scanner confirmation beep (High-pitched dual tone)
   */
  playSuccessBeep() {
    if (!this.soundEnabled) return;
    try {
      this.initAudio();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      // Crisp 2400Hz scanner beep frequency
      osc.frequency.setValueAtTime(2400, now);
      osc.frequency.exponentialRampToValueAtTime(2800, now + 0.08);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.12);
    } catch (e) {
      console.warn('Audio playback not permitted or supported', e);
    }

    this.vibrateSuccess();
  }

  /**
   * Play error / warning buzz
   */
  playErrorTone() {
    if (!this.soundEnabled) return;
    try {
      this.initAudio();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.setValueAtTime(180, now + 0.1);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch (e) {
      console.warn('Audio error', e);
    }

    this.vibrateError();
  }

  /**
   * Trigger haptic vibration on mobile devices
   */
  vibrateSuccess() {
    if (this.vibrateEnabled && 'vibrate' in navigator) {
      try {
        navigator.vibrate([60]);
      } catch (e) {
        // ignore
      }
    }
  }

  vibrateError() {
    if (this.vibrateEnabled && 'vibrate' in navigator) {
      try {
        navigator.vibrate([100, 50, 100]);
      } catch (e) {
        // ignore
      }
    }
  }

  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    return this.soundEnabled;
  }

  toggleVibrate() {
    this.vibrateEnabled = !this.vibrateEnabled;
    return this.vibrateEnabled;
  }
}

window.soundController = new SoundController();
