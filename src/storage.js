// Everything is stored on this device only.
const SESSIONS = 'kine.sessions.v2';
const LEGACY_SESSIONS = 'physio.sessions.v1';
const SETTINGS = 'kine.settings.v1';
const LEGACY_SETTINGS = 'physio.settings.v1';
const PROGRAM = 'kine.program.v1';
const DRAFT = 'kine.pt-draft.v1';

const read = (k, fallback) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; }
};
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or blocked */ } };

/** Convert a v1 single-exercise record into the v2 multi-exercise shape. */
export function upgradeSession(s) {
  if (s.items) return s;
  return {
    id: s.date,
    date: s.date,
    programId: null,
    title: null,
    pain: !!s.pain,
    demo: !!s.demo,
    durationSec: s.durationSec || 0,
    reps: s.reps,
    goodReps: s.goodReps,
    formScore: s.formScore,
    items: [{
      exerciseId: s.exerciseId,
      setsPlanned: 1, setsDone: 1,
      repsPlanned: s.target || s.reps,
      reps: s.reps, goodReps: s.goodReps, formScore: s.formScore,
      faults: s.faults || [],
    }],
  };
}

export function loadSessions() {
  let all = read(SESSIONS, null);
  if (!all) {
    all = read(LEGACY_SESSIONS, []).map(upgradeSession);
    if (all.length) write(SESSIONS, all);
  }
  return all;
}
export function saveSession(s) {
  const all = loadSessions();
  all.unshift(s);
  write(SESSIONS, all.slice(0, 300));
}
export const clearSessions = () => write(SESSIONS, []);

export const loadSettings = () => ({ voice: true, largeText: false, accepted: false, ...read(LEGACY_SETTINGS, {}), ...read(SETTINGS, {}) });
export const saveSettings = (s) => write(SETTINGS, s);

export const loadProgram = () => read(PROGRAM, null);
export const saveProgram = (p) => write(PROGRAM, p);
export const clearProgram = () => { try { localStorage.removeItem(PROGRAM); } catch { /* ignore */ } };

export const loadDraft = () => read(DRAFT, null);
export const saveDraft = (d) => write(DRAFT, d);

/** Days in a row (ending today or yesterday) with at least one session. */
export function streak(sessions, today = new Date()) {
  const days = new Set(sessions.filter((s) => !s.demo).map((s) => new Date(s.date).toDateString()));
  let n = 0;
  const d = new Date(today);
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  while (days.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
