// Generic rep-counting and form-checking engine.
//
// Every exercise reduces each video frame to one "primary" value (usually a
// joint angle) plus a bag of metrics. The engine maps the primary value onto
// progress p, where p = 0 at the rest position and p = 1 at the target
// position, and runs a small state machine:
//
//   rest --(p > START)--> moving --(p ~ 1)--> peak --(p < LEAVE_PEAK)--> returning --(p < END)--> rest
//                           |                                                         (rep counted)
//                           +--(p < END, never reached peak)--> rest (partial rep cue)
//
// Form checks run on every frame while the person is moving. A fault only
// counts once it has persisted for a few frames, which filters out tracking
// jitter.

import { clamp } from './geometry.js';

const START = 0.2;
const END = 0.12;
const ENTER_PEAK = 0.97;
const LEAVE_PEAK = 0.85;
const PARTIAL_MIN = 0.4;
const SMOOTHING = 0.45;
const FAULT_PERSIST_FRAMES = 5;
const LOST_FRAMES_BEFORE_WARNING = 12;

export class RepEngine {
  constructor(exercise) {
    this.ex = exercise;
    this.reset();
  }

  reset() {
    this.state = 'rest';
    this.smoothed = null;
    this.reps = 0;
    this.goodReps = 0;
    this.partialReps = 0;
    this.faultCounts = {};
    this.repLog = [];
    this.persist = {};
    this.activeFaults = new Set();
    this.lostFrames = 0;
    this.lastPeakMetrics = null;
    this.startTime = null;
    this.lastTime = null;
    this.progress = 0;
    this._newRep(0);
  }

  _newRep(t) {
    this.rep = {
      faults: new Map(),
      maxP: 0,
      maxPTime: t,
      lastNearMax: t,
      moveStart: t,
      peakStart: null,
      peakTime: 0,
      peakMetrics: null,
      max: {},
      min: {},
      lastHoldSecond: null,
    };
  }

  /**
   * Feed one measured frame. `frame` is the result of exercise.measure():
   * { ok, missing?, value, metrics }. `t` is time in seconds.
   * Returns a list of events for the UI / voice coach.
   */
  update(frame, t) {
    const events = [];
    if (this.startTime === null) this.startTime = t;
    this.lastTime = t;

    if (!frame || !frame.ok) {
      this.lostFrames++;
      if (this.lostFrames === LOST_FRAMES_BEFORE_WARNING) {
        events.push({ type: 'visibility', message: frame?.missing || 'I can\'t see you clearly. Please step into view.' });
      }
      this.activeFaults.clear();
      return events;
    }
    if (this.lostFrames >= LOST_FRAMES_BEFORE_WARNING) events.push({ type: 'visible' });
    this.lostFrames = 0;

    const { rest, peak } = this.ex;
    this.smoothed = this.smoothed === null
      ? frame.value
      : this.smoothed + SMOOTHING * (frame.value - this.smoothed);
    const p = clamp((this.smoothed - rest) / (peak - rest), -0.5, 1.5);
    this.progress = clamp(p, 0, 1);
    const metrics = frame.metrics || {};

    this._runChecks(metrics, events);
    if (this.state !== 'rest') {
      this._trackExtremes(metrics);
      // Tempo is timed to the furthest point of the movement (e.g. the bottom
      // of a deep squat), not just to the target threshold.
      if (p > this.rep.maxP + 0.02) { this.rep.maxP = p; this.rep.maxPTime = t; }
      if (p >= this.rep.maxP - 0.08) this.rep.lastNearMax = t;
    }

    switch (this.state) {
      case 'rest':
        if (p > START) {
          this.state = 'moving';
          this._newRep(t);
          this.rep.maxP = p;
          this.rep.peakMetrics = metrics;
        }
        break;

      case 'moving':
        if (p >= this.rep.maxP) this.rep.peakMetrics = metrics;
        if (p >= ENTER_PEAK) {
          this.state = 'peak';
          this.rep.peakStart = t;
          this.rep.peakMetrics = metrics;
          if (this.ex.holdSeconds) events.push({ type: 'hold', remaining: this.ex.holdSeconds });
        } else if (p < END) {
          if (this.rep.maxP >= PARTIAL_MIN) {
            this.partialReps++;
            events.push({ type: 'partial', message: this.ex.partialCue || 'Try to go a little further.' });
          }
          this.state = 'rest';
        }
        break;

      case 'peak': {
        const held = t - this.rep.peakStart;
        if (this.ex.holdSeconds) {
          const remaining = Math.ceil(this.ex.holdSeconds - held);
          if (remaining > 0 && remaining !== this.rep.lastHoldSecond) {
            this.rep.lastHoldSecond = remaining;
            if (remaining < this.ex.holdSeconds) events.push({ type: 'hold', remaining });
          }
          if (remaining <= 0 && this.rep.lastHoldSecond !== 0) {
            this.rep.lastHoldSecond = 0;
            events.push({ type: 'holdDone' });
          }
        }
        if (p < LEAVE_PEAK) {
          this.rep.peakTime += held;
          this.state = 'returning';
        }
        break;
      }

      case 'returning':
        if (p >= ENTER_PEAK) {
          // Went back up to the target; resume the hold.
          this.state = 'peak';
          this.rep.peakStart = t;
        } else if (p < END) {
          this._completeRep(t, events);
          this.state = 'rest';
        }
        break;
    }

    return events;
  }

  _trackExtremes(metrics) {
    const { max, min } = this.rep;
    for (const [k, v] of Object.entries(metrics)) {
      if (typeof v !== 'number') continue;
      if (!(k in max) || v > max[k]) max[k] = v;
      if (!(k in min) || v < min[k]) min[k] = v;
    }
  }

  _runChecks(metrics, events) {
    const moving = this.state !== 'rest';
    const atPeak = this.state === 'peak';
    this.activeFaults.clear();
    for (const check of this.ex.checks || []) {
      const phase = check.phase || 'moving';
      const applies = phase === 'always' || (phase === 'moving' && moving) || (phase === 'peak' && atPeak);
      let faulty = false;
      if (applies) {
        try { faulty = !!check.test(metrics); } catch { faulty = false; }
      }
      this.persist[check.id] = faulty ? (this.persist[check.id] || 0) + 1 : 0;
      if (this.persist[check.id] >= FAULT_PERSIST_FRAMES) {
        this.activeFaults.add(check.id);
        if (moving && !this.rep.faults.has(check.id)) this.rep.faults.set(check.id, check.cue);
        if (this.persist[check.id] === FAULT_PERSIST_FRAMES) {
          events.push({ type: 'fault', id: check.id, message: check.cue, joints: check.joints || [] });
        }
      }
    }
  }

  _completeRep(t, events) {
    const ex = this.ex;
    const rep = this.rep;
    const repCtx = {
      moveDuration: rep.maxPTime - rep.moveStart,
      returnDuration: t - rep.lastNearMax,
      heldFor: rep.peakTime,
      peakMetrics: rep.peakMetrics || {},
      max: rep.max,
      min: rep.min,
      previousPeakMetrics: this.lastPeakMetrics,
    };

    const repFaults = new Map(rep.faults);
    if (ex.holdSeconds && repCtx.heldFor < ex.holdSeconds - 0.25) {
      repFaults.set('hold', `Hold at the top for ${ex.holdSeconds} second${ex.holdSeconds > 1 ? 's' : ''}.`);
    }
    if (ex.minMoveSeconds && repCtx.moveDuration < ex.minMoveSeconds) {
      repFaults.set('tempo-move', ex.tempoMoveCue || 'Slow down — move with control.');
    }
    if (ex.minReturnSeconds && repCtx.returnDuration < ex.minReturnSeconds) {
      repFaults.set('tempo-return', ex.tempoReturnCue || 'Slow down on the way back.');
    }
    for (const rc of ex.repChecks || []) {
      const result = rc.test(repCtx);
      if (result) repFaults.set(rc.id, typeof result === 'string' ? result : rc.cue);
    }

    this.reps++;
    const good = repFaults.size === 0;
    if (good) this.goodReps++;
    for (const [id, cue] of repFaults) {
      const entry = this.faultCounts[id] || (this.faultCounts[id] = { cue, count: 0 });
      entry.count++;
    }
    this.lastPeakMetrics = repCtx.peakMetrics;
    this.repLog.push({ n: this.reps, good, faults: [...repFaults.keys()], t: +(t - this.startTime).toFixed(1) });

    events.push({
      type: 'rep',
      count: this.reps,
      good,
      faults: [...repFaults.entries()].map(([id, message]) => ({ id, message })),
    });
  }

  /** Snapshot for the UI on every frame. */
  status() {
    return {
      state: this.state,
      progress: this.progress,
      reps: this.reps,
      goodReps: this.goodReps,
      activeFaults: [...this.activeFaults],
    };
  }

  summary() {
    const faults = Object.entries(this.faultCounts)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.count - a.count);
    return {
      exerciseId: this.ex.id,
      reps: this.reps,
      goodReps: this.goodReps,
      partialReps: this.partialReps,
      formScore: this.reps ? Math.round((this.goodReps / this.reps) * 100) : 0,
      faults,
      repLog: this.repLog,
      durationSec: this.startTime === null ? 0 : Math.round(this.lastTime - this.startTime),
    };
  }
}
