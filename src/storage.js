// Session history and settings, stored only on this device.
const KEY = 'physio.sessions.v1';
const SETTINGS = 'physio.settings.v1';

const read = (k, fallback) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; }
};
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };

export const loadSessions = () => read(KEY, []);
export function saveSession(s) {
  const all = loadSessions();
  all.unshift(s);
  write(KEY, all.slice(0, 200));
}
export const clearSessions = () => write(KEY, []);

export const loadSettings = () => ({ voice: true, largeText: false, accepted: false, ...read(SETTINGS, {}) });
export const saveSettings = (s) => write(SETTINGS, s);

/** Days in a row (ending today or yesterday) with at least one session. */
export function streak(sessions, today = new Date()) {
  const days = new Set(sessions.map((s) => new Date(s.date).toDateString()));
  let n = 0;
  const d = new Date(today);
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  while (days.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/** Plain-text report a person can send to their physiotherapist. */
export function reportText(sessions, exerciseName) {
  const lines = ['Home exercise log', ''];
  for (const s of sessions.slice(0, 30)) {
    const d = new Date(s.date);
    lines.push(`${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — ${exerciseName(s.exerciseId)}: ${s.reps} reps, ${s.formScore}% good form${s.pain ? ' — STOPPED: reported pain' : ''}`);
    if (s.faults?.length) lines.push(`   Corrections: ${s.faults.slice(0, 3).map((f) => `${f.cue} (x${f.count})`).join('; ')}`);
  }
  return lines.join('\n');
}
