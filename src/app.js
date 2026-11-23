import { EXERCISES, getExercise } from './exercises.js';
import {
  decodeProgram, decodeReport, normalizeProgram, estimateMinutes, sessionsThisWeek, doneToday,
  buildReport, encodeReport, startOfWeek,
} from './program.js';
import { PRESETS } from './presets.js';
import {
  loadSessions, saveSession, clearSessions, loadSettings, saveSettings, streak,
  loadProgram, saveProgram, clearProgram,
} from './storage.js';
import { startSession, isRunning } from './session.js';
import { renderBuilder, renderReport } from './clinician.js';
import { Coach } from './coach.js';
import {
  $, $$, esc, icon, ring, figure, wordmark, shareOrCopy, toast, fmtTime, dateLabel, VIEW_LABEL,
} from './ui.js';

const app = $('#app');
const tabbar = $('#tabbar');
const settings = loadSettings();

const applySettings = () => document.documentElement.classList.toggle('large-text', !!settings.largeText);
applySettings();

// ------------------------------------------------------------------ shell

const TABS = [
  ['today', 'Today', '#/today'],
  ['library', 'Exercises', '#/library'],
  ['progress', 'Progress', '#/progress'],
];

function show(html, { tab = null } = {}) {
  app.hidden = false;
  app.className = tab ? 'with-tabs' : '';
  app.innerHTML = html;
  if (tab) {
    tabbar.hidden = false;
    tabbar.innerHTML = TABS.map(([k, label, href]) =>
      `<a href="${href}" class="${k === tab ? 'on' : ''}" ${k === tab ? 'aria-current="page"' : ''}>${icon(k)}<span>${label}</span></a>`).join('');
  } else {
    tabbar.hidden = true;
  }
  window.scrollTo(0, 0);
}

const header = (title, { back = null, action = '' } = {}) => `
  <header class="bar">
    ${back ? `<a class="circle-btn" href="${back}" aria-label="Back">${icon('back')}</a>` : wordmark()}
    ${title ? `<span class="bar-title">${esc(title)}</span>` : '<span></span>'}
    <span class="bar-action">${action}</span>
  </header>`;

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

// ------------------------------------------------------------------ plan card

function planRows(program) {
  return `<ol class="plan-rows">${program.items.map((it) => {
    const ex = getExercise(it.ex);
    return `<li>
      ${figure(it.ex)}
      <div class="pr-main"><b>${esc(ex.name)}</b><span>${it.sets} × ${it.reps}${it.hold ? ` · hold ${it.hold}s` : ''}${it.sets > 1 ? ` · rest ${it.rest}s` : ''}</span>
      ${it.note ? `<em>${esc(it.note)}</em>` : ''}</div>
    </li>`;
  }).join('')}</ol>`;
}

function planCard(program, { programId, sessions, prescribed }) {
  const week = sessionsThisWeek(sessions.filter((s) => !s.demo), programId);
  const today = doneToday(sessions.filter((s) => !s.demo), programId);
  return `
    <section class="card plan">
      <div class="plan-head">
        <div>
          <div class="eyebrow">${prescribed ? `Prescribed${program.by ? ` by ${esc(program.by)}` : ''}` : 'Routine'}</div>
          <h2>${esc(program.title)}</h2>
          <div class="meta">${program.items.length} exercises · ~${estimateMinutes(program)} min</div>
        </div>
        ${ring(week / program.perWeek, { size: 84, stroke: 8, label: `${week}/${program.perWeek}`, sub: 'this week' })}
      </div>
      ${program.note ? `<p class="pt-note">“${esc(program.note)}”</p>` : ''}
      ${planRows(program)}
      <button class="btn primary big" data-start type="button">${icon('play')} ${today ? 'Go again' : 'Start session'}</button>
      ${today ? `<p class="done-today">${icon('check')} Done today</p>` : ''}
      <button class="btn text" data-demo type="button">Watch a demo first</button>
    </section>`;
}

function bindPlanCard(program, programId) {
  $('[data-start]', app)?.addEventListener('click', () => launch(program, { programId }));
  $('[data-demo]', app)?.addEventListener('click', () => launch(program, { programId, demo: true }));
}

// ------------------------------------------------------------------ views

function viewToday() {
  const sessions = loadSessions();
  const program = loadProgram();
  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const name = program?.client ? `, ${esc(program.client)}` : '';

  show(`
    ${header('', { action: `<a class="circle-btn" href="#/settings" aria-label="Settings">${icon('settings')}</a>` })}
    <div class="hello">
      <div class="eyebrow">${esc(date)}</div>
      <h1>${greeting()}${name}.</h1>
    </div>

    ${program ? planCard(program, { programId: program.id, sessions, prescribed: true }) : `
      <section class="hero">
        <h2>Physio that<br><span class="accent">sees you.</span></h2>
        <p>Your physiotherapist prescribes. Your phone's camera counts every rep and corrects your form — out loud, in real time.</p>
        <div class="hero-points">
          <span>${icon('camera')} Live form coaching</span>
          <span>${icon('lock')} Video stays on your phone</span>
        </div>
        <p class="hint">Got a link from your physio? Open it on this phone to load your plan.</p>
      </section>`}

    <h3 class="section">${program ? 'Extra routines' : 'Start a routine'}</h3>
    <div class="h-scroll">
      ${PRESETS.map((p) => `
        <a class="card routine" href="#/routine/${p.id}">
          <div class="routine-figs">${p.items.slice(0, 3).map((it) => figure(it.ex)).join('')}</div>
          <b>${esc(p.title)}</b>
          <span>${p.items.length} exercises · ~${estimateMinutes(p)} min</span>
        </a>`).join('')}
    </div>

    <a class="card clinician-cta" href="#/pt">
      <span class="cta-icon">${icon('clinic')}</span>
      <span class="cta-text"><b>For physiotherapists</b><span>Prescribe a camera-coached home programme in under a minute.</span></span>
      ${icon('chevron')}
    </a>
  `, { tab: 'today' });
  if (program) bindPlanCard(program, program.id);
}

function viewRoutine(id) {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) return go('#/today', true);
  show(`${header(p.title, { back: '#/today' })}${planCard(p, { programId: p.id, sessions: loadSessions(), prescribed: false })}`);
  bindPlanCard(p, p.id);
}

let libFilter = 'all';
function viewLibrary() {
  const list = EXERCISES.filter((e) => libFilter === 'all' || e.tags.includes(libFilter));
  show(`
    ${header('')}
    <h1 class="page-title">Exercises</h1>
    <nav class="segmented" aria-label="Filter">
      ${[['all', 'All'], ['gentle', 'Gentle'], ['travel', 'On the go']].map(([k, l]) =>
        `<button type="button" data-f="${k}" class="${libFilter === k ? 'on' : ''}" aria-pressed="${libFilter === k}">${l}</button>`).join('')}
    </nav>
    <div class="grid">
      ${list.map((e) => `
        <a class="card tile" href="#/exercise/${e.id}">
          ${figure(e.id, 'lg')}
          <b>${esc(e.name)}</b>
          <span>${VIEW_LABEL[e.view]}${e.holdSeconds ? ` · ${e.holdSeconds}s hold` : ''}</span>
        </a>`).join('')}
    </div>
  `, { tab: 'library' });
  $$('[data-f]', app).forEach((b) => b.addEventListener('click', () => { libFilter = b.dataset.f; viewLibrary(); }));
}

export function stepper(id, value, label) {
  return `<div class="stepper-row"><span>${label}</span>
    <div class="stepper"><button type="button" class="circle-btn" data-dec="${id}" aria-label="Fewer ${label}">${icon('minus')}</button>
    <output id="${id}">${value}</output>
    <button type="button" class="circle-btn" data-inc="${id}" aria-label="More ${label}">${icon('plus')}</button></div></div>`;
}

function viewExercise(id) {
  const ex = getExercise(id);
  if (!ex) return go('#/library', true);
  const state = { sets: 2, reps: ex.defaultReps };
  show(`
    ${header('', { back: '#/library' })}
    <div class="ex-hero">${figure(id, 'xl')}</div>
    <div class="eyebrow">${VIEW_LABEL[ex.view]} · ${ex.tags.map((t) => (t === 'gentle' ? 'Gentle' : 'On the go')).join(' · ')}</div>
    <h1 class="page-title">${esc(ex.name)}</h1>
    <p class="lede">${esc(ex.summary)}</p>

    <section class="card">
      <div class="eyebrow">Set up</div>
      <p>${esc(ex.setup)}</p>
    </section>
    <section class="card">
      <div class="eyebrow">How to</div>
      <ol class="steps">${ex.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      ${ex.holdSeconds ? `<p class="meta">Hold ${ex.holdSeconds} second${ex.holdSeconds > 1 ? 's' : ''} at the top.</p>` : ''}
    </section>
    <p class="caution">${esc(ex.safety)}</p>

    <section class="card">
      ${stepper('sets', state.sets, 'Sets')}
      ${stepper('reps', state.reps, 'Reps')}
    </section>
    <button class="btn primary big" id="go" type="button">${icon('play')} Start</button>
    <button class="btn text" id="demo" type="button">Watch a demo</button>
  `);
  const lim = { sets: [1, 6], reps: [1, 50] };
  $$('[data-inc],[data-dec]', app).forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.inc || b.dataset.dec;
    state[k] = Math.max(lim[k][0], Math.min(lim[k][1], state[k] + (b.dataset.inc ? 1 : -1)));
    $(`#${k}`, app).textContent = state[k];
  }));
  const program = () => normalizeProgram({ id: `single-${id}`, title: ex.name, items: [{ ex: id, sets: state.sets, reps: state.reps, rest: 40 }] });
  $('#go', app).addEventListener('click', () => launch(program(), { programId: null }));
  $('#demo', app).addEventListener('click', () => launch(program(), { programId: null, demo: true }));
}

function weekDots(sessions) {
  const start = startOfWeek();
  const days = new Set(sessions.map((s) => new Date(s.date).toDateString()));
  const today = new Date().toDateString();
  return `<div class="week-dots">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => {
    const d = new Date(start); d.setDate(d.getDate() + i);
    const ds = d.toDateString();
    return `<span class="${days.has(ds) ? 'done' : ''} ${ds === today ? 'today' : ''}"><i></i>${l}</span>`;
  }).join('')}</div>`;
}

function viewProgress() {
  const all = loadSessions().filter((s) => !s.demo);
  const program = loadProgram();
  const target = program?.perWeek || 3;
  const week = sessionsThisWeek(all);
  const reps = all.reduce((a, s) => a + (s.reps || 0), 0);
  const formed = all.filter((s) => s.reps);
  const avgForm = formed.length ? Math.round(formed.reduce((a, s) => a + s.formScore, 0) / formed.length) : 0;

  show(`
    ${header('')}
    <h1 class="page-title">Progress</h1>
    <section class="card progress-hero">
      <div class="ph-top">
        ${ring(week / target, { size: 132, stroke: 12, label: `${week}<small>/${target}</small>`, sub: 'this week' })}
        <div class="ph-side">
          <div class="kpi"><b>${streak(all)}</b><span>day streak</span></div>
          <div class="kpi"><b>${avgForm}<small>%</small></b><span>avg form</span></div>
          <div class="kpi"><b>${reps}</b><span>total reps</span></div>
        </div>
      </div>
      ${weekDots(all)}
    </section>

    <h3 class="section">History</h3>
    ${all.length ? `<ul class="list">${all.slice(0, 50).map((s) => `
      <li class="${s.pain ? 'pain' : ''}">
        <div><b>${esc(s.title || getExercise(s.items[0]?.exerciseId)?.name || 'Session')}</b>
        <span>${dateLabel(s.date)} · ${fmtTime(s.durationSec || 0)}${s.pain ? ' · stopped for pain' : ''}</span></div>
        <div class="right"><b>${s.reps}</b><span>${s.formScore}% form</span></div>
      </li>`).join('')}</ul>` : '<p class="empty">Your sessions will show up here.</p>'}

    ${all.length ? `<button class="btn primary" id="report" type="button">${icon('share')} Send report to my physio</button>` : ''}
  `, { tab: 'progress' });
  $('#report', app)?.addEventListener('click', () => sendReport(program));
}

function sendReport(program) {
  const r = buildReport(program, loadSessions());
  const url = `${location.href.split('#')[0]}#report=${encodeReport(r)}`;
  shareOrCopy({
    title: 'My kine. progress report',
    text: `My home exercise progress${program?.client ? ` (${program.client})` : ''}:`,
    url,
  });
}

function viewSettings() {
  const program = loadProgram();
  show(`
    ${header('Settings', { back: '#/today' })}
    <section class="card list-card">
      <label class="switch"><span>Voice coaching</span><input type="checkbox" id="voice" ${settings.voice ? 'checked' : ''}><i></i></label>
      <label class="switch"><span>Extra-large text</span><input type="checkbox" id="large" ${settings.largeText ? 'checked' : ''}><i></i></label>
      <button class="row-btn" id="testVoice" type="button"><span>Test voice</span>${icon('chevron')}</button>
    </section>
    ${program ? `<section class="card list-card">
      <div class="row-static"><span>Current plan</span><b>${esc(program.title)}</b></div>
      <button class="row-btn danger" id="removePlan" type="button"><span>Remove plan</span></button>
    </section>` : ''}
    <section class="card list-card">
      <a class="row-btn" href="#/pt"><span>Clinician mode</span>${icon('chevron')}</a>
      <button class="row-btn danger" id="clear" type="button"><span>Clear exercise history</span></button>
    </section>
    <p class="fine">${icon('lock')} Pose tracking runs entirely on this device. Video is never recorded or uploaded. Your history is stored only in this browser.</p>
    <p class="fine">kine. supports — and does not replace — advice from a qualified healthcare professional.</p>
  `);
  $('#voice', app).addEventListener('change', (e) => { settings.voice = e.target.checked; saveSettings(settings); });
  $('#large', app).addEventListener('change', (e) => { settings.largeText = e.target.checked; saveSettings(settings); applySettings(); });
  $('#testVoice', app).addEventListener('click', () => new Coach({ voice: true }).say('Hi! I\'ll coach you through every rep.', { show: false }));
  $('#removePlan', app)?.addEventListener('click', () => {
    if (confirm('Remove your current plan from this phone?')) { clearProgram(); toast('Plan removed'); viewSettings(); }
  });
  $('#clear', app).addEventListener('click', () => {
    if (confirm('Delete all saved sessions from this phone?')) { clearSessions(); toast('History cleared'); }
  });
}

// ------------------------------------------------------------------ consent & prescription

const SAFETY = `
  <ul class="safety">
    <li>Check with your doctor or physio before starting, especially after surgery, a fall, or with a heart condition.</li>
    <li><b>Stop straight away</b> if you feel sharp pain, chest pain, dizziness or shortness of breath.</li>
    <li>Keep a sturdy chair or counter nearby, and clear the floor of rugs and clutter.</li>
  </ul>`;

const CHECK = `<label class="check"><input type="checkbox" id="agree"><i>${icon('check')}</i><span>I understand and want to continue</span></label>`;

function viewConsent(onAccept) {
  show(`
    <div class="onboard">
      ${wordmark('xl')}
      <h1>Before you start.</h1>
      <p class="lede">kine. coaches your form. It doesn't replace your doctor or physiotherapist.</p>
      ${SAFETY}
      ${CHECK}
      <button class="btn primary big" id="ok" type="button" disabled>Continue</button>
    </div>
  `);
  $('#agree', app).addEventListener('change', (e) => { $('#ok', app).disabled = !e.target.checked; });
  $('#ok', app).addEventListener('click', () => {
    settings.accepted = true; saveSettings(settings); onAccept();
  });
}

function viewPrescription(program) {
  const existing = loadProgram();
  const replacing = existing && existing.id !== program.id;
  show(`
    <div class="onboard">
      ${wordmark('xl')}
      <div class="eyebrow">New plan${program.by ? ` from ${esc(program.by)}` : ''}</div>
      <h1>${program.client ? `${esc(program.client)}, your` : 'Your'} plan is ready.</h1>
      <section class="card plan">
        <h2>${esc(program.title)}</h2>
        <div class="meta">${program.items.length} exercises · ~${estimateMinutes(program)} min · ${program.perWeek}× a week</div>
        ${program.note ? `<p class="pt-note">“${esc(program.note)}”</p>` : ''}
        ${planRows(program)}
      </section>
      ${settings.accepted ? '' : `<h3 class="section">Safety first</h3>${SAFETY}${CHECK}`}
      ${replacing ? `<p class="caution">This replaces your current plan “${esc(existing.title)}”.</p>` : ''}
      <button class="btn primary big" id="accept" type="button" ${settings.accepted ? '' : 'disabled'}>Add to my phone</button>
    </div>
  `);
  $('#agree', app)?.addEventListener('change', (e) => { $('#accept', app).disabled = !e.target.checked; });
  $('#accept', app).addEventListener('click', () => {
    settings.accepted = true; saveSettings(settings);
    saveProgram(program);
    toast('Plan added');
    go('#/today', true);
  });
}

// ------------------------------------------------------------------ session

function launch(program, { programId = null, demo = false } = {}) {
  if (isRunning()) return;
  if (!settings.accepted) return viewConsent(() => launch(program, { programId, demo }));
  startSession(program, {
    demo, programId, voice: settings.voice,
    onExit: (r) => {
      if (r?.error) return viewError(r.error, () => launch(program, { programId, demo }), () => launch(program, { programId, demo: true }));
      const did = r.reps > 0 || r.pain;
      if (did && !demo) saveSession(r);
      if (r.pain) return viewPain(r, program);
      if (!did) return route();
      if (settings.voice) {
        new Coach({ voice: true }).say(r.formScore >= 80 ? `Session complete. ${r.reps} reps, great form.` : `Session complete. ${r.reps} reps. Nice work.`, { show: false });
      }
      viewSummary(r, program);
    },
  });
}

function viewSummary(r, program) {
  const faults = r.items.flatMap((it) => it.faults.map((f) => ({ ...f, ex: it.exerciseId }))).sort((a, b) => b.count - a.count).slice(0, 3);
  const prescribed = loadProgram()?.id === r.programId;
  show(`
    <div class="summary">
      <div class="eyebrow">${r.demo ? 'Demo · ' : ''}${r.early ? 'Session ended' : 'Session complete'}</div>
      <h1>${r.formScore >= 80 ? 'Strong work.' : r.completion >= 80 ? 'Nicely done.' : 'Every rep counts.'}</h1>
      <div class="ring-pair">
        ${ring(r.completion / 100, { size: 132, stroke: 11, label: `${r.completion}<small>%</small>`, sub: 'completed' })}
        ${ring(r.formScore / 100, { size: 132, stroke: 11, label: `${r.formScore}<small>%</small>`, sub: 'good form', cls: 'white' })}
      </div>
      <div class="kpis">
        <div class="kpi"><b>${r.reps}</b><span>reps</span></div>
        <div class="kpi"><b>${fmtTime(r.durationSec)}</b><span>time</span></div>
        <div class="kpi"><b>${r.items.filter((i) => i.setsDone).length}/${r.items.length}</b><span>exercises</span></div>
      </div>

      <ul class="list">${r.items.map((it) => `
        <li>${figure(it.exerciseId)}
          <div><b>${esc(getExercise(it.exerciseId).name)}</b><span>${it.setsDone ? (it.faults[0] ? esc(it.faults[0].cue) : 'Clean reps') : 'Skipped'}</span></div>
          <div class="right"><b>${it.reps}<small>/${it.repsPlanned}</small></b><span>${it.reps ? `${it.formScore}% form` : '—'}</span></div>
        </li>`).join('')}</ul>

      ${faults.length ? `<h3 class="section">Focus next time</h3>
        <ul class="focus">${faults.map((f) => `<li><span>${esc(f.cue)}</span><b>${f.count}×</b></li>`).join('')}</ul>` : ''}

      ${prescribed && !r.demo ? `<button class="btn secondary" id="report" type="button">${icon('share')} Send to my physio</button>` : ''}
      <button class="btn primary big" id="done" type="button">Done</button>
    </div>
  `);
  $('#report', app)?.addEventListener('click', () => sendReport(program));
  $('#done', app).addEventListener('click', () => go('#/today', true));
}

function viewPain(r, program) {
  const prescribed = loadProgram()?.id === r.programId;
  show(`
    <div class="onboard pain">
      <div class="eyebrow danger">Session stopped</div>
      <h1>You did the right thing.</h1>
      <p class="lede">Sit down somewhere safe and rest.</p>
      <ul class="safety">
        <li>A mild ache that fades within a few minutes is usually OK. Try fewer reps or a smaller movement next time.</li>
        <li>If the pain is <b>sharp, getting worse, or still there tomorrow</b>, skip this exercise and talk to your physio or doctor.</li>
        <li class="urgent">If you have <b>chest pain, trouble breathing or feel faint</b>, or you've fallen and can't get up, call emergency services now.</li>
      </ul>
      ${prescribed ? `<button class="btn secondary" id="report" type="button">${icon('share')} Let my physio know</button>` : ''}
      <button class="btn primary big" id="done" type="button">Back to today</button>
    </div>
  `);
  $('#report', app)?.addEventListener('click', () => sendReport(program));
  $('#done', app).addEventListener('click', () => go('#/today', true));
}

function viewError(err, retry, demo) {
  const denied = err?.name === 'NotAllowedError';
  const noCam = err?.name === 'NotFoundError';
  show(`
    <div class="onboard">
      <div class="eyebrow">Camera</div>
      <h1>${denied ? 'Camera access needed.' : noCam ? 'No camera found.' : 'Couldn\'t start coaching.'}</h1>
      <p class="lede">${denied
        ? 'kine. needs your camera to see your movement. Video never leaves your phone. Allow camera access in your browser settings, then try again.'
        : noCam ? 'This device doesn\'t seem to have a camera available.'
        : 'The first time, you need an internet connection so the movement model can download.'}</p>
      <button class="btn primary big" id="retry" type="button">Try again</button>
      <button class="btn secondary" id="demo" type="button">Watch a demo instead</button>
      <button class="btn text" id="back" type="button">Back</button>
    </div>
  `);
  $('#retry', app).addEventListener('click', retry);
  $('#demo', app).addEventListener('click', demo);
  $('#back', app).addEventListener('click', () => route());
}

// ------------------------------------------------------------------ router

function go(hash, replace = false) {
  if (replace) history.replaceState(null, '', hash);
  else history.pushState(null, '', hash);
  route();
}

function route() {
  if (isRunning()) return;
  const h = location.hash;
  if (h.startsWith('#rx=')) {
    try { return viewPrescription(decodeProgram(h.slice(4))); } catch (e) {
      console.warn(e);
      toast('That plan link looks broken. Ask your physio to resend it.');
      return go('#/today', true);
    }
  }
  if (h.startsWith('#report=')) {
    try { return renderReport(app, decodeReport(h.slice(8)), { show, header }); } catch (e) {
      console.warn(e);
      toast('That report link looks broken.');
      return go('#/pt', true);
    }
  }
  const [, page, arg] = h.match(/^#\/([\w-]+)(?:\/([\w-]+))?/) || [];
  if (page !== 'pt' && !settings.accepted) return viewConsent(() => route());
  switch (page) {
    case 'library': return viewLibrary();
    case 'exercise': return viewExercise(arg);
    case 'routine': return viewRoutine(arg);
    case 'progress': return viewProgress();
    case 'settings': return viewSettings();
    case 'pt': return renderBuilder(app, { show, header, stepper });
    default: return viewToday();
  }
}

window.addEventListener('hashchange', route);
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
route();
