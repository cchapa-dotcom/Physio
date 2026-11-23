// End-to-end check of every exercise against the scripted demo workouts:
// synthetic landmarks -> measure() -> RepEngine. Each demo script injects
// known faults on known reps, so we can assert exactly what gets coached.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES, getExercise } from '../src/exercises.js';
import { RepEngine } from '../src/engine.js';
import { DemoPlayer, DEMO_FAULTS, demoPose, toNormalized } from '../src/demo.js';
import { toPoints } from '../src/landmarks.js';

const FPS = 30;
const ASPECT = 9 / 16; // portrait phone video

function run(ex, reps) {
  const player = new DemoPlayer(ex);
  const engine = new RepEngine(ex);
  const repEvents = [];
  const events = [];
  for (let f = 0; repEvents.length < reps && f < FPS * 120; f++) {
    const t = f / FPS;
    const lm = toNormalized(player.frame(t), ASPECT);
    const frame = ex.measure(toPoints(lm, ASPECT));
    for (const e of engine.update(frame, t)) {
      events.push(e);
      if (e.type === 'rep') repEvents.push(e);
    }
  }
  return { engine, repEvents, events };
}

const REP_FAULTS = {
  'sit-to-stand': ['chest-up', 'tempo-return'],
  squat: ['chest-up', 'heels-down'],
  'arm-raise': ['straight-arms', 'even-arms'],
  'knee-extension': ['hold', 'sit-tall'],
  march: ['alternate', 'stand-tall'],
  bridge: ['feet-closer', 'hold'],
  'heel-raise': ['straight-knees', 'stand-tall'],
};

for (const ex of EXERCISES) {
  test(`${ex.id}: rest pose measures near rest, target pose reaches the target`, () => {
    const rest = ex.measure(toPoints(toNormalized(demoPose(ex.id, 0), ASPECT), ASPECT));
    const top = ex.measure(toPoints(toNormalized(demoPose(ex.id, 1), ASPECT), ASPECT));
    assert.ok(rest.ok && top.ok, 'pose should be measurable');
    const prog = (v) => (v - ex.rest) / (ex.peak - ex.rest);
    assert.ok(prog(rest.value) < 0.15, `rest progress ${prog(rest.value)} (value ${rest.value})`);
    assert.ok(prog(top.value) >= 1, `top progress ${prog(top.value)} (value ${top.value})`);
  });

  test(`${ex.id}: demo workout counts reps and coaches the injected faults`, () => {
    const faults = DEMO_FAULTS[ex.id];
    const fullReps = faults.filter((f) => f !== 'partial').length;
    // Run one rep into the next cycle so a trailing partial rep is included.
    const { engine, repEvents, events } = run(ex, fullReps + 1);
    assert.equal(engine.partialReps, faults.filter((f) => f === 'partial').length, 'partial reps cued, not counted');

    // Clean reps should be clean.
    let i = 0;
    for (const f of faults) {
      if (f === 'partial') continue;
      const ev = repEvents[i++];
      if (f === null) assert.equal(ev.good, true, `rep ${ev.count} should be good, got ${JSON.stringify(ev.faults)}`);
      else assert.equal(ev.good, false, `rep ${ev.count} should have fault ${f}`);
    }
    const seen = new Set(engine.summary().faults.map((x) => x.id));
    for (const id of REP_FAULTS[ex.id]) assert.ok(seen.has(id), `expected fault ${id}, saw ${[...seen]}`);
    if (faults.includes('partial')) assert.ok(events.some((e) => e.type === 'partial'));
  });
}

test('measure() reports missing joints when the person is out of frame', () => {
  const lm = toNormalized(demoPose('squat', 0), ASPECT).map((p, i) => (i >= 23 ? { ...p, visibility: 0.1 } : p));
  const r = getExercise('squat').measure(toPoints(lm, ASPECT));
  assert.equal(r.ok, false);
  assert.match(r.missing, /see you/);
});

test('every exercise has the fields the UI needs', () => {
  for (const ex of EXERCISES) {
    for (const k of ['id', 'name', 'summary', 'setup', 'steps', 'safety', 'defaultReps', 'view']) {
      assert.ok(ex[k] !== undefined, `${ex.id} missing ${k}`);
    }
    assert.notEqual(ex.rest, ex.peak);
  }
});
