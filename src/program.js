// Prescriptions ("programmes") and progress reports.
//
// There is no server: a clinician's programme travels to the client inside a
// link (#rx=...), and the client's results travel back inside another link
// (#report=...). Both are compact JSON encoded as base64url.

import { getExercise } from './exercises.js';

// ------------------------------------------------------------ encoding

export function encodePayload(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodePayload(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

const int = (v, lo, hi, d) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
};
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

export const newId = () => Math.random().toString(36).slice(2, 10);

/** Validate and normalise a programme, dropping anything unknown. */
export function normalizeProgram(p) {
  if (!p || typeof p !== 'object') throw new Error('Not a programme');
  const items = (Array.isArray(p.items) ? p.items : [])
    .filter((it) => it && getExercise(it.ex))
    .slice(0, 20)
    .map((it) => {
      const ex = getExercise(it.ex);
      const item = {
        ex: it.ex,
        sets: int(it.sets, 1, 10, 2),
        reps: int(it.reps, 1, 50, ex.defaultReps),
        rest: int(it.rest, 0, 300, 45),
      };
      if (ex.holdSeconds || it.hold) item.hold = int(it.hold ?? ex.holdSeconds, 0, 30, ex.holdSeconds || 0);
      const note = str(it.note, 200);
      if (note) item.note = note;
      return item;
    });
  if (!items.length) throw new Error('Programme has no exercises');
  return {
    v: 1,
    id: str(p.id, 16) || newId(),
    title: str(p.title, 60) || 'Home programme',
    client: str(p.client, 40),
    by: str(p.by, 60),
    note: str(p.note, 400),
    perWeek: int(p.perWeek, 1, 14, 3),
    created: str(p.created, 30) || new Date().toISOString(),
    items,
  };
}

export const encodeProgram = (p) => encodePayload(normalizeProgram(p));
export const decodeProgram = (s) => normalizeProgram(decodePayload(s));

export function programLink(p, base) {
  return `${base.split('#')[0]}#rx=${encodeProgram(p)}`;
}

/** Total estimated minutes for a programme. */
export function estimateMinutes(p) {
  let sec = 0;
  for (const it of p.items) {
    const perRep = 3.5 + (it.hold || 0);
    sec += it.sets * it.reps * perRep + (it.sets - 1) * it.rest + 30;
  }
  return Math.max(1, Math.round(sec / 60));
}

// ------------------------------------------------------------ session plan

/**
 * Flatten a programme into the ordered steps of a guided session:
 * each set is a step, with timed rests between sets of the same exercise.
 */
export function buildSteps(program) {
  const steps = [];
  program.items.forEach((it, i) => {
    for (let s = 1; s <= it.sets; s++) {
      steps.push({ type: 'set', item: i, set: s, sets: it.sets, reps: it.reps, first: s === 1 });
      if (s < it.sets && it.rest > 0) steps.push({ type: 'rest', item: i, seconds: it.rest, nextSet: s + 1 });
    }
  });
  return steps;
}

/** Merge per-set engine summaries into one record per programme item. */
export function summarizeSession(program, setResults) {
  const items = program.items.map((it) => ({
    exerciseId: it.ex, setsPlanned: it.sets, setsDone: 0, repsPlanned: it.sets * it.reps,
    reps: 0, goodReps: 0, faults: {},
  }));
  for (const r of setResults) {
    const agg = items[r.item];
    if (!agg) continue;
    agg.setsDone++;
    agg.reps += r.summary.reps;
    agg.goodReps += r.summary.goodReps;
    for (const f of r.summary.faults) {
      const e = agg.faults[f.id] || (agg.faults[f.id] = { id: f.id, cue: f.cue, count: 0 });
      e.count += f.count;
    }
  }
  return items.map((a) => ({
    ...a,
    formScore: a.reps ? Math.round((a.goodReps / a.reps) * 100) : 0,
    faults: Object.values(a.faults).sort((x, y) => y.count - x.count),
  }));
}

export function sessionTotals(items) {
  const reps = items.reduce((s, i) => s + i.reps, 0);
  const good = items.reduce((s, i) => s + i.goodReps, 0);
  const planned = items.reduce((s, i) => s + i.repsPlanned, 0);
  return {
    reps,
    goodReps: good,
    formScore: reps ? Math.round((good / reps) * 100) : 0,
    completion: planned ? Math.min(100, Math.round((reps / planned) * 100)) : 0,
  };
}

// ------------------------------------------------------------ adherence

const DAY = 86400000;

export function startOfWeek(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday
  return x;
}

/** Sessions done this calendar week (Mon–Sun), optionally for one programme. */
export function sessionsThisWeek(sessions, programId = null, now = new Date()) {
  const from = startOfWeek(now).getTime();
  return sessions.filter((s) => new Date(s.date).getTime() >= from && (!programId || s.programId === programId)).length;
}

export function doneToday(sessions, programId, now = new Date()) {
  return sessions.some((s) => s.programId === programId && new Date(s.date).toDateString() === now.toDateString());
}

// ------------------------------------------------------------ reports

/** Compact report of a client's sessions for their clinician. */
export function buildReport(program, sessions, { days = 28, now = new Date() } = {}) {
  const since = now.getTime() - days * DAY;
  const mine = sessions
    .filter((s) => (!program || s.programId === program.id) && !s.demo && new Date(s.date).getTime() >= since)
    .slice(0, 40);
  return {
    v: 1,
    pid: program?.id || '',
    t: program?.title || 'Exercise log',
    c: program?.client || '',
    pw: program?.perWeek || 0,
    days,
    at: now.toISOString(),
    s: mine.map((s) => ({
      d: s.date,
      p: s.pain ? 1 : 0,
      m: Math.round((s.durationSec || 0) / 60),
      i: s.items.map((it) => [it.exerciseId, it.reps, it.repsPlanned, it.formScore, it.faults.slice(0, 2).map((f) => f.id)]),
    })),
  };
}

export const encodeReport = (r) => encodePayload(r);

export function decodeReport(s) {
  const r = decodePayload(s);
  if (!r || !Array.isArray(r.s)) throw new Error('Not a report');
  return r;
}

/** Turn a decoded report into numbers for the clinician's view. */
export function analyzeReport(r) {
  const sessions = [...r.s].sort((a, b) => new Date(b.d) - new Date(a.d)).map((s) => {
    const reps = s.i.reduce((a, x) => a + x[1], 0);
    const planned = s.i.reduce((a, x) => a + x[2], 0);
    const good = s.i.reduce((a, x) => a + (x[1] * x[3]) / 100, 0);
    return {
      date: new Date(s.d), pain: !!s.p, minutes: s.m, reps, planned,
      completion: planned ? Math.min(100, Math.round((reps / planned) * 100)) : 0,
      formScore: reps ? Math.round((good / reps) * 100) : 0,
      items: s.i.map(([ex, reps2, planned2, form, faults]) => ({ ex, reps: reps2, planned: planned2, form, faults })),
    };
  });
  const weeks = Math.max(1, r.days / 7);
  const expected = r.pw ? Math.round(r.pw * weeks) : 0;
  const faultCounts = {};
  for (const s of sessions) for (const it of s.items) for (const f of it.faults) {
    const key = `${it.ex}:${f}`;
    faultCounts[key] = (faultCounts[key] || 0) + 1;
  }
  const allReps = sessions.reduce((a, s) => a + s.reps, 0);
  return {
    sessions,
    expected,
    adherence: expected ? Math.min(100, Math.round((sessions.length / expected) * 100)) : null,
    avgForm: allReps ? Math.round(sessions.reduce((a, s) => a + s.formScore * s.reps, 0) / allReps) : 0,
    avgCompletion: sessions.length ? Math.round(sessions.reduce((a, s) => a + s.completion, 0) / sessions.length) : 0,
    painReports: sessions.filter((s) => s.pain).length,
    topFaults: Object.entries(faultCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([k, n]) => { const [ex, id] = k.split(':'); return { ex, id, n }; }),
  };
}
