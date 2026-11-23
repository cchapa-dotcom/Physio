// Voice + on-screen coach. Decides which messages are worth saying so the
// person isn't bombarded: the same correction is not repeated within a
// cool-down, and important messages (rep counts, safety) jump the queue.

export class CueThrottle {
  constructor({ repeatAfter = 6, minGap = 1.8 } = {}) {
    this.repeatAfter = repeatAfter;
    this.minGap = minGap;
    this.lastByKey = new Map();
    this.lastAny = -Infinity;
  }

  /** Should a message with this key be delivered at time t (seconds)? */
  allow(key, t, { urgent = false } = {}) {
    const last = this.lastByKey.get(key) ?? -Infinity;
    if (t - last < this.repeatAfter) return false;
    if (!urgent && t - this.lastAny < this.minGap) return false;
    this.lastByKey.set(key, t);
    this.lastAny = t;
    return true;
  }
}

export class Coach {
  constructor({ voice = true, rate = 0.95, onMessage = () => {} } = {}) {
    this.voice = voice;
    this.rate = rate;
    this.onMessage = onMessage;
    this.throttle = new CueThrottle();
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  }

  now() { return performance.now() / 1000; }

  /** Speak immediately, cancelling anything in progress. */
  say(text, { tone = 'info', show = true } = {}) {
    if (show) this.onMessage(text, tone);
    if (!this.voice || !this.synth) return;
    this.synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = this.rate;
    u.lang = 'en-GB';
    this.synth.speak(u);
  }

  /** Say a correction, respecting the cool-downs. */
  cue(key, text, { tone = 'warn', urgent = false } = {}) {
    if (!this.throttle.allow(key, this.now(), { urgent })) return false;
    this.say(text, { tone });
    return true;
  }

  stop() { this.synth?.cancel(); }
}

const PRAISE = ['Good.', 'Nice.', 'Great form.', 'Well done.', 'Lovely.', 'That\'s it.'];
export const praise = (n) => PRAISE[n % PRAISE.length];
