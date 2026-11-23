import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeProgram, decodeProgram, normalizeProgram, buildSteps, summarizeSession, sessionTotals,
  sessionsThisWeek, buildReport, encodeReport, decodeReport, analyzeReport, programLink, estimateMinutes,
} from '../src/program.js';

const rx = {
  title: 'Knee rehab — week 1', client: 'Maria', by: 'Sam Lee, PT', note: 'Go gently. Ice afterwards.', perWeek: 4,
  items: [
    { ex: 'sit-to-stand', sets: 3, reps: 8, rest: 45, note: 'Use the armrests' },
    { ex: 'knee-extension', sets: 2, reps: 10, rest: 30, hold: 3 },
    { ex: 'not-a-real-exercise', sets: 2, reps: 5 },
  ],
};

test('programme round-trips through a link, including unicode', () => {
  const link = programLink(rx, 'https://x.test/app/#/today');
  assert.match(link, /^https:\/\/x\.test\/app\/#rx=[\w-]+$/);
  const back = decodeProgram(link.split('#rx=')[1]);
  assert.equal(back.title, 'Knee rehab — week 1');
  assert.equal(back.items.length, 2, 'unknown exercises dropped');
  assert.equal(back.items[1].hold, 3);
  assert.equal(back.items[0].note, 'Use the armrests');
  assert.ok(link.length < 1200, `link is ${link.length} chars`);
});

test('normalizeProgram clamps silly values and rejects empty plans', () => {
  const p = normalizeProgram({ items: [{ ex: 'squat', sets: 99, reps: -4, rest: 9999 }] });
  assert.deepEqual([p.items[0].sets, p.items[0].reps, p.items[0].rest], [10, 1, 300]);
  assert.throws(() => normalizeProgram({ items: [] }));
  assert.throws(() => decodeProgram('garbage!!'));
});

test('buildSteps chains sets with rests between sets only', () => {
  const steps = buildSteps(normalizeProgram(rx));
  assert.deepEqual(steps.map((s) => s.type), ['set', 'rest', 'set', 'rest', 'set', 'set', 'rest', 'set']);
  assert.equal(steps[0].first, true);
  assert.equal(steps[2].first, false);
  assert.equal(steps[5].first, true);
  assert.equal(steps[1].seconds, 45);
});

test('summarizeSession merges sets per exercise', () => {
  const p = normalizeProgram(rx);
  const sum = (reps, good, faults = []) => ({ reps, goodReps: good, faults });
  const items = summarizeSession(p, [
    { item: 0, summary: sum(8, 6, [{ id: 'chest-up', cue: 'Chest up', count: 2 }]) },
    { item: 0, summary: sum(8, 8) },
    { item: 1, summary: sum(10, 5, [{ id: 'hold', cue: 'Hold', count: 5 }]) },
  ]);
  assert.equal(items[0].reps, 16);
  assert.equal(items[0].formScore, 88);
  assert.equal(items[0].setsDone, 2);
  assert.equal(items[1].faults[0].id, 'hold');
  const tot = sessionTotals(items);
  assert.equal(tot.reps, 26);
  assert.equal(tot.completion, Math.round((26 / 44) * 100));
  assert.ok(estimateMinutes(p) > 3);
});

test('sessionsThisWeek counts from Monday', () => {
  const now = new Date(2026, 10, 26, 12); // Thursday
  const s = (d) => ({ date: new Date(2026, 10, d, 9).toISOString(), programId: 'a' });
  assert.equal(sessionsThisWeek([s(23), s(24), s(22), s(26)], 'a', now), 3); // 22nd is Sunday before
});

test('report round-trips and analyses adherence, form and pain', () => {
  const p = normalizeProgram({ ...rx, id: 'abc' });
  const now = new Date(2026, 10, 26, 12);
  const mk = (d, reps, form, pain = false) => ({
    date: new Date(2026, 10, d, 9).toISOString(), programId: 'abc', pain, durationSec: 600,
    items: [{ exerciseId: 'sit-to-stand', reps, repsPlanned: 24, formScore: form, faults: [{ id: 'chest-up' }] }],
  });
  const sessions = [mk(25, 24, 90), mk(20, 12, 50, true), mk(1, 24, 100), { ...mk(24, 24, 100), demo: true }];
  const r = decodeReport(encodeReport(buildReport(p, sessions, { days: 14, now })));
  assert.equal(r.s.length, 2, 'old and demo sessions excluded');
  const a = analyzeReport(r);
  assert.equal(a.expected, 8);
  assert.equal(a.adherence, 25);
  assert.equal(a.painReports, 1);
  assert.equal(a.avgForm, Math.round((24 * 90 + 12 * 50) / 36));
  assert.equal(a.topFaults[0].id, 'chest-up');
});
