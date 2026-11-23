import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RepEngine } from '../src/engine.js';

const FPS = 30;

// A minimal fake exercise: value goes 0 -> 100.
const fake = (extra = {}) => ({
  id: 'fake', rest: 0, peak: 100, partialCue: 'further', checks: [], ...extra,
});

/** Drive the engine through a list of [value, seconds] linear segments. */
function drive(engine, segments, metricsFn = () => ({})) {
  const events = [];
  let t = 0;
  let v = segments[0][0];
  for (const [target, secs] of segments) {
    const frames = Math.max(1, Math.round(secs * FPS));
    const start = v;
    for (let i = 1; i <= frames; i++) {
      v = start + (target - start) * (i / frames);
      t += 1 / FPS;
      events.push(...engine.update({ ok: true, value: v, metrics: metricsFn(v) }, t));
    }
  }
  return events;
}

const rep = (peakHold = 0.3) => [[0, 0.5], [100, 1.2], [100, peakHold], [0, 1.5], [0, 0.5]];

test('counts full reps', () => {
  const e = new RepEngine(fake());
  const ev = drive(e, [...rep(), ...rep(), ...rep()]);
  assert.equal(e.reps, 3);
  assert.equal(e.goodReps, 3);
  assert.equal(ev.filter((x) => x.type === 'rep').length, 3);
});

test('partial reps are not counted but are cued', () => {
  const e = new RepEngine(fake());
  const ev = drive(e, [[0, 0.5], [60, 1], [0, 1], [0, 0.5]]);
  assert.equal(e.reps, 0);
  assert.equal(e.partialReps, 1);
  assert.ok(ev.some((x) => x.type === 'partial' && x.message === 'further'));
});

test('small wobbles near rest do nothing', () => {
  const e = new RepEngine(fake());
  const ev = drive(e, [[0, 0.5], [15, 0.5], [0, 0.5], [18, 0.5], [0, 0.5]]);
  assert.equal(e.reps, 0);
  assert.equal(ev.length, 0);
});

test('works when peak value is lower than rest (e.g. squat knee angle)', () => {
  const e = new RepEngine(fake({ rest: 170, peak: 100 }));
  drive(e, [[170, 0.5], [95, 1.2], [95, 0.3], [170, 1.5], [170, 0.5]]);
  assert.equal(e.reps, 1);
});

test('persistent faults are reported and mark the rep as not good', () => {
  const ex = fake({ checks: [{ id: 'lean', cue: 'chest up', test: (m) => m.lean > 30 }] });
  const e = new RepEngine(ex);
  const ev = drive(e, rep(), (v) => ({ lean: v > 50 ? 40 : 0 }));
  assert.equal(e.reps, 1);
  assert.equal(e.goodReps, 0);
  assert.ok(ev.some((x) => x.type === 'fault' && x.id === 'lean'));
  assert.deepEqual(e.summary().faults.map((f) => f.id), ['lean']);
});

test('single-frame glitches do not trigger faults', () => {
  let n = 0;
  const ex = fake({ checks: [{ id: 'lean', cue: 'x', test: () => (n++ % 10 === 0) }] });
  const e = new RepEngine(ex);
  drive(e, rep());
  assert.equal(e.goodReps, 1);
});

test('hold requirement: short hold is flagged, long hold is fine', () => {
  const ex = fake({ holdSeconds: 2 });
  const e1 = new RepEngine(ex);
  drive(e1, rep(0.5));
  assert.equal(e1.reps, 1);
  assert.equal(e1.goodReps, 0);
  assert.equal(e1.summary().faults[0].id, 'hold');

  const e2 = new RepEngine(ex);
  const ev = drive(e2, rep(2.5));
  assert.equal(e2.goodReps, 1);
  assert.ok(ev.some((x) => x.type === 'holdDone'));
});

test('tempo: rushing the return is flagged', () => {
  const ex = fake({ minReturnSeconds: 1 });
  const e = new RepEngine(ex);
  drive(e, [[0, 0.5], [100, 1.2], [100, 0.3], [0, 0.3], [0, 0.5]]);
  assert.equal(e.summary().faults[0].id, 'tempo-return');
});

test('losing sight of the person warns once, then recovers', () => {
  const e = new RepEngine(fake());
  const events = [];
  for (let i = 0; i < 40; i++) events.push(...e.update({ ok: false, missing: 'step back' }, i / FPS));
  const vis = events.filter((x) => x.type === 'visibility');
  assert.equal(vis.length, 1);
  assert.equal(vis[0].message, 'step back');
  const back = e.update({ ok: true, value: 0 }, 2);
  assert.ok(back.some((x) => x.type === 'visible'));
});

test('summary computes form score', () => {
  const ex = fake({ minReturnSeconds: 1 });
  const e = new RepEngine(ex);
  drive(e, [...rep(), [0, 0.5], [100, 1.2], [100, 0.3], [0, 0.3], [0, 0.5]]);
  const s = e.summary();
  assert.equal(s.reps, 2);
  assert.equal(s.goodReps, 1);
  assert.equal(s.formScore, 50);
});

import { CueThrottle } from '../src/coach.js';
import { streak } from '../src/storage.js';

test('cue throttle: no repeats inside cool-down, urgent skips the gap', () => {
  const c = new CueThrottle({ repeatAfter: 5, minGap: 2 });
  assert.equal(c.allow('a', 0), true);
  assert.equal(c.allow('a', 3), false);
  assert.equal(c.allow('b', 1), false);
  assert.equal(c.allow('b', 1, { urgent: true }), true);
  assert.equal(c.allow('a', 6), true);
});

test('streak counts consecutive days', () => {
  const day = (n) => ({ date: new Date(2026, 0, 10 - n, 9).toISOString() });
  const today = new Date(2026, 0, 10, 18);
  assert.equal(streak([day(0), day(1), day(2), day(4)], today), 3);
  assert.equal(streak([day(1), day(2)], today), 2);
  assert.equal(streak([day(3)], today), 0);
});

test('tempo is timed to the deepest point, so slow deep reps are not flagged', () => {
  const ex = fake({ minMoveSeconds: 1 });
  const e = new RepEngine(ex);
  // Passes the target (100) quickly but keeps going slowly to 150.
  drive(e, [[0, 0.5], [150, 1.6], [150, 0.3], [0, 1.5], [0, 0.5]]);
  assert.equal(e.reps, 1);
  assert.equal(e.goodReps, 1);
  const e2 = new RepEngine(ex);
  drive(e2, [[0, 0.5], [150, 0.5], [150, 0.3], [0, 1.5], [0, 0.5]]);
  assert.equal(e2.summary().faults[0]?.id, 'tempo-move');
});
