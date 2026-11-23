import { EXERCISES, getExercise } from './exercises.js';
import { RepEngine } from './engine.js';
import { Coach, praise } from './coach.js';
import { toPoints } from './landmarks.js';
import { drawPose } from './draw.js';
import { DemoPlayer, toNormalized } from './demo.js';
import {
  loadSessions, saveSession, clearSessions, loadSettings, saveSettings, streak, reportText,
} from './storage.js';

const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');
const sessionEl = $('#session');
const params = new URLSearchParams(location.search);

let settings = loadSettings();
let filter = 'all';
let active = null; // running session state

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const exName = (id) => getExercise(id)?.name || id;

function applySettings() {
  document.documentElement.classList.toggle('large-text', !!settings.largeText);
}
applySettings();

function show(html) {
  sessionEl.hidden = true;
  app.hidden = false;
  app.innerHTML = html;
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- Home

const TAG_LABEL = { gentle: 'Gentle · at home', travel: 'On the go' };
const VIEW_LABEL = { side: 'Side-on to camera', front: 'Facing camera' };

function renderHome() {
  if (!settings.accepted) return renderConsent();
  const sessions = loadSessions();
  const days = streak(sessions);
  const todayCount = sessions.filter((s) => new Date(s.date).toDateString() === new Date().toDateString()).length;
  const list = EXERCISES.filter((e) => filter === 'all' || e.tags.includes(filter));

  show(`
    <header class="top">
      <div>
        <h1>Physio Coach</h1>
        <p class="sub">Exercise at home or on the road — I'll watch and guide you.</p>
      </div>
      <button class="icon-btn" id="settingsBtn" type="button" aria-label="Settings">⚙︎</button>
    </header>

    <section class="stats" aria-label="Your progress">
      <div class="stat"><b>${days}</b><span>day streak</span></div>
      <div class="stat"><b>${todayCount}</b><span>sets today</span></div>
      <button class="stat link" id="historyBtn" type="button"><b>${sessions.length}</b><span>history ›</span></button>
    </section>

    <nav class="chips" aria-label="Filter exercises">
      ${[['all', 'All'], ['gentle', 'Gentle · at home'], ['travel', 'On the go']].map(([k, label]) =>
        `<button type="button" class="chip ${filter === k ? 'on' : ''}" data-filter="${k}" aria-pressed="${filter === k}">${label}</button>`).join('')}
    </nav>

    <ul class="cards">
      ${list.map((e) => `
        <li><button type="button" class="card" data-ex="${e.id}">
          <span class="card-title">${esc(e.name)}</span>
          <span class="card-sum">${esc(e.summary)}</span>
          <span class="card-meta">${e.tags.map((t) => `<span class="tag ${t}">${TAG_LABEL[t]}</span>`).join('')}<span class="tag view">${VIEW_LABEL[e.view]}</span></span>
        </button></li>`).join('')}
    </ul>

    <p class="foot">Video is processed on your phone and never uploaded.</p>
  `);

  app.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.filter; renderHome(); }));
  app.querySelectorAll('[data-ex]').forEach((b) => b.addEventListener('click', () => renderSetup(getExercise(b.dataset.ex))));
  $('#historyBtn').addEventListener('click', renderHistory);
  $('#settingsBtn').addEventListener('click', renderSettings);
}

function renderConsent() {
  show(`
    <section class="panel consent">
      <h1>Before you start</h1>
      <p>Physio Coach helps you do your exercises with good form. It is <b>not a replacement</b> for a doctor or physiotherapist.</p>
      <ul class="safety-list">
        <li>Check with your doctor or physio before starting a new exercise programme, especially after surgery, a fall, or if you have a heart condition.</li>
        <li><b>Stop straight away</b> if you feel sharp pain, chest pain, dizziness or shortness of breath.</li>
        <li>Keep a sturdy chair or counter nearby for balance.</li>
        <li>Clear the floor around you of rugs and clutter.</li>
      </ul>
      <label class="check"><input type="checkbox" id="agree"> I understand and want to continue</label>
      <button class="btn primary big" id="agreeBtn" type="button" disabled>Continue</button>
    </section>
  `);
  const box = $('#agree');
  const btn = $('#agreeBtn');
  box.addEventListener('change', () => { btn.disabled = !box.checked; });
  btn.addEventListener('click', () => {
    settings.accepted = true;
    saveSettings(settings);
    renderHome();
  });
}

function renderSettings() {
  show(`
    <header class="top"><button class="back" id="backBtn" type="button">‹ Back</button></header>
    <section class="panel">
      <h1>Settings</h1>
      <label class="toggle"><input type="checkbox" id="voice" ${settings.voice ? 'checked' : ''}> <span>Spoken coaching</span></label>
      <label class="toggle"><input type="checkbox" id="large" ${settings.largeText ? 'checked' : ''}> <span>Extra-large text</span></label>
      <button class="btn ghost" id="testVoice" type="button">Test voice</button>
    </section>
  `);
  $('#backBtn').addEventListener('click', renderHome);
  $('#voice').addEventListener('change', (e) => { settings.voice = e.target.checked; saveSettings(settings); });
  $('#large').addEventListener('change', (e) => { settings.largeText = e.target.checked; saveSettings(settings); applySettings(); });
  $('#testVoice').addEventListener('click', () => new Coach({ voice: true }).say('Hello! I\'ll guide you through your exercises.', { show: false }));
}

// ---------------------------------------------------------------- Setup

function renderSetup(ex) {
  let reps = ex.defaultReps;
  show(`
    <header class="top"><button class="back" id="backBtn" type="button">‹ Exercises</button></header>
    <section class="panel">
      <h1>${esc(ex.name)}</h1>
      <p class="sub">${esc(ex.summary)}</p>

      <h2>Set up your phone</h2>
      <div class="setup-box">
        <div class="setup-illus ${ex.view}" aria-hidden="true">
          <span class="phone">📱</span><span class="dots"></span><span class="person">${ex.view === 'side' ? '🧍‍➡️' : '🧍'}</span>
        </div>
        <p>${esc(ex.setup)}</p>
      </div>

      <h2>How to do it</h2>
      <ol class="steps">${ex.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      ${ex.holdSeconds ? `<p class="note">Hold for <b>${ex.holdSeconds} second${ex.holdSeconds > 1 ? 's' : ''}</b> at the top of each repetition.</p>` : ''}
      <p class="note warn">⚠︎ ${esc(ex.safety)}</p>

      <h2>Repetitions</h2>
      <div class="stepper">
        <button class="btn round" id="minus" type="button" aria-label="Fewer repetitions">−</button>
        <output id="reps" aria-live="polite">${reps}</output>
        <button class="btn round" id="plus" type="button" aria-label="More repetitions">+</button>
      </div>

      <button class="btn primary big" id="startBtn" type="button">Start with camera</button>
      <button class="btn ghost" id="demoBtn" type="button">Watch a demo (no camera)</button>
    </section>
  `);
  const out = $('#reps');
  $('#minus').addEventListener('click', () => { reps = Math.max(1, reps - 1); out.textContent = reps; });
  $('#plus').addEventListener('click', () => { reps = Math.min(50, reps + 1); out.textContent = reps; });
  $('#backBtn').addEventListener('click', renderHome);
  $('#startBtn').addEventListener('click', () => startSession(ex, reps, { demo: params.has('demo') }));
  $('#demoBtn').addEventListener('click', () => startSession(ex, reps, { demo: true }));
}

// ---------------------------------------------------------------- Session

const video = $('#video');
const canvas = $('#overlay');
const ctx = canvas.getContext('2d');
const feedbackEl = $('#feedback');
const centerMsg = $('#centerMsg');

let detectorPromise = null;
async function getDetector() {
  if (!detectorPromise) {
    detectorPromise = import('./pose.js').then((m) => m.createPoseDetector());
    detectorPromise.catch(() => { detectorPromise = null; });
  }
  return detectorPromise;
}

function setFeedback(text, tone = 'info') {
  feedbackEl.textContent = text;
  feedbackEl.dataset.tone = tone;
}

function setCenter(text) {
  centerMsg.hidden = !text;
  centerMsg.textContent = text || '';
  centerMsg.dataset.big = /^\d$/.test(text || '');
}

async function startSession(ex, target, { demo = false } = {}) {
  app.hidden = true;
  sessionEl.hidden = false;
  $('#sessionName').textContent = ex.name;
  $('#repTarget').textContent = target;
  $('#repCount').textContent = '0';
  $('#romFill').style.height = '0%';
  $('#pauseBtn').textContent = 'Pause';
  setFeedback('');

  const coach = new Coach({ voice: settings.voice, onMessage: setFeedback });
  active = {
    ex, target, demo, coach,
    engine: new RepEngine(ex),
    phase: 'loading', // loading -> positioning -> countdown -> active
    paused: false,
    seenFrames: 0,
    stream: null,
    detector: null,
    player: demo ? new DemoPlayer(ex) : null,
    t0: performance.now(),
    lastVideoTime: -1,
    raf: 0,
    wakeLock: null,
  };
  const s = active;

  try { s.wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* not supported */ }

  if (demo) {
    $('#stage').classList.remove('mirror');
    video.hidden = true;
    canvas.width = 540; canvas.height = 960;
    s.phase = 'positioning';
  } else {
    video.hidden = false;
    setCenter('Starting camera…');
    try {
      const [stream, detector] = await Promise.all([
        navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } },
        }),
        getDetector(),
      ]);
      if (active !== s) { stream.getTracks().forEach((t) => t.stop()); return; }
      s.stream = stream;
      s.detector = detector;
      video.srcObject = stream;
      await video.play();
      const facing = stream.getVideoTracks()[0]?.getSettings?.().facingMode;
      $('#stage').classList.toggle('mirror', facing !== 'environment');
      s.phase = 'positioning';
    } catch (err) {
      console.error(err);
      stopMedia(s);
      active = null;
      return renderError(ex, target, err);
    }
  }

  setCenter('');
  coach.say(ex.view === 'side'
    ? 'Stand side-on to the camera so I can see your whole body.'
    : 'Face the camera so I can see your whole body.');
  s.raf = requestAnimationFrame(loop);
}

function loop() {
  const s = active;
  if (!s) return;
  s.raf = requestAnimationFrame(loop);
  if (s.paused) return;

  const now = performance.now();
  const t = (now - s.t0) / 1000;
  let landmarks = null;
  let aspect;

  if (s.demo) {
    aspect = canvas.width / canvas.height;
    // Lift the figure so its feet stay clear of the feedback banner.
    landmarks = toNormalized(s.player.frame(s.phase === 'active' ? t - s.activeAt : 0), aspect)
      .map((p) => ({ ...p, y: p.y * 0.85 }));
  } else {
    if (video.readyState < 2 || video.currentTime === s.lastVideoTime) return;
    s.lastVideoTime = video.currentTime;
    if (canvas.width !== video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    aspect = video.videoWidth / video.videoHeight;
    try { landmarks = s.detector.detect(video, now); } catch (e) { console.warn(e); }
  }

  const frame = landmarks ? s.ex.measure(toPoints(landmarks, aspect)) : { ok: false, missing: s.ex.view === 'side' ? 'Step into view, side-on to the camera.' : 'Step into view, facing the camera.' };

  if (s.phase === 'positioning') {
    s.seenFrames = frame.ok ? s.seenFrames + 1 : 0;
    if (!frame.ok) setCenter(frame.missing);
    else setCenter('Hold still…');
    if (s.seenFrames > 20) startCountdown(s);
  } else if (s.phase === 'active') {
    const events = s.engine.update(frame, t);
    for (const e of events) handleEvent(s, e);
    const st = s.engine.status();
    $('#repCount').textContent = st.reps;
    $('#romFill').style.height = `${Math.round(st.progress * 100)}%`;
    if (s.engine.reps >= s.target && st.state === 'rest') return finishSession(false);
  }

  const faultJoints = s.phase === 'active'
    ? s.engine.status().activeFaults.flatMap((id) => s.ex.checks?.find((c) => c.id === id)?.joints || [])
    : [];
  if (s.demo) {
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#374151';
    ctx.fillRect(0, canvas.height * 0.77, canvas.width, canvas.height);
    drawPose(ctx, landmarks, { faultJoints, clear: false });
  } else {
    drawPose(ctx, landmarks, { faultJoints });
  }
}

function startCountdown(s) {
  s.phase = 'countdown';
  s.coach.say('Great, I can see you. Get ready.', { tone: 'good' });
  let n = 3;
  const tick = () => {
    if (active !== s) return;
    if (n > 0) {
      setCenter(String(n));
      if (n < 3) s.coach.say(String(n), { show: false });
      n--;
      s.countdownTimer = setTimeout(tick, 1000);
    } else {
      setCenter('');
      s.coach.say('Begin.', { tone: 'good' });
      s.phase = 'active';
      s.activeAt = (performance.now() - s.t0) / 1000;
    }
  };
  s.countdownTimer = setTimeout(tick, 1200);
}

function handleEvent(s, e) {
  const { coach } = s;
  switch (e.type) {
    case 'rep': {
      const fault = e.faults[0];
      if (e.good) {
        coach.say(`${e.count}. ${s.engine.goodReps % 3 === 0 ? praise(e.count) : ''}`.trim(), { tone: 'good' });
      } else if (fault && coach.throttle.allow(`rep:${fault.id}`, coach.now(), { urgent: true })) {
        coach.say(`${e.count}. ${fault.message}`, { tone: 'warn' });
      } else {
        coach.say(String(e.count), { tone: 'info' });
      }
      if (e.count === s.target - 1) setTimeout(() => active === s && coach.cue('last', 'Last one!', { tone: 'good', urgent: true }), 900);
      break;
    }
    case 'fault':
      coach.cue(e.id, e.message, { tone: 'warn' });
      break;
    case 'partial':
      coach.cue('partial', e.message, { tone: 'warn', urgent: true });
      break;
    case 'hold':
      if (e.remaining === s.ex.holdSeconds) coach.say('Hold.', { tone: 'info' });
      setCenter(String(e.remaining));
      break;
    case 'holdDone':
      setCenter('');
      coach.say('And down, slowly.', { tone: 'good' });
      break;
    case 'visibility':
      coach.cue('visibility', e.message, { tone: 'warn', urgent: true });
      break;
    case 'visible':
      setFeedback('Got you again.', 'good');
      break;
  }
  if (e.type !== 'hold' && s.engine.state !== 'peak' && centerMsg.textContent.match(/^\d$/) && s.phase === 'active') setCenter('');
}

function stopMedia(s) {
  if (!s) return;
  cancelAnimationFrame(s.raf);
  clearTimeout(s.countdownTimer);
  s.stream?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
  s.wakeLock?.release?.().catch(() => {});
  s.coach.stop();
}

function finishSession(pain) {
  const s = active;
  if (!s) return;
  active = null;
  stopMedia(s);
  setCenter('');
  const summary = s.engine.summary();
  const record = { ...summary, date: new Date().toISOString(), target: s.target, pain, demo: s.demo };
  if (!s.demo && (summary.reps > 0 || pain)) saveSession(record);
  if (pain) return renderPain(s.ex);
  if (settings.voice && summary.reps > 0) {
    new Coach({ voice: true }).say(summary.formScore >= 80
      ? `Well done! ${summary.reps} reps with great form.`
      : `Good work. You did ${summary.reps} reps.`, { show: false });
  }
  renderSummary(s.ex, record);
}

$('#doneBtn').addEventListener('click', () => finishSession(false));
$('#painBtn').addEventListener('click', () => finishSession(true));
$('#pauseBtn').addEventListener('click', () => {
  if (!active) return;
  active.paused = !active.paused;
  $('#pauseBtn').textContent = active.paused ? 'Resume' : 'Pause';
  setCenter(active.paused ? 'Paused' : '');
  if (active.paused) active.coach.stop();
  else active.engine.smoothed = null;
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && active && !active.paused) $('#pauseBtn').click();
});

// ---------------------------------------------------------------- Results

function renderSummary(ex, r) {
  const great = r.formScore >= 80;
  show(`
    <section class="panel summary">
      <p class="eyebrow">${esc(ex.name)}${r.demo ? ' · demo' : ''}</p>
      <h1>${r.reps === 0 ? 'No reps counted' : great ? 'Great work! 🎉' : 'Nice effort! 💪'}</h1>
      <div class="score-row">
        <div class="score"><b>${r.reps}</b><span>reps</span></div>
        <div class="score"><b>${r.formScore}%</b><span>good form</span></div>
        <div class="score"><b>${Math.floor(r.durationSec / 60)}:${String(r.durationSec % 60).padStart(2, '0')}</b><span>time</span></div>
      </div>
      ${r.faults.length ? `
        <h2>Things to work on</h2>
        <ul class="tips">${r.faults.slice(0, 4).map((f) => `<li><span>${esc(f.cue)}</span><span class="count">${f.count}×</span></li>`).join('')}</ul>
      ` : r.reps ? '<p class="note good">Every rep looked good. Keep it up!</p>' : '<p class="note">Make sure your whole body is in view, then move through the full range.</p>'}
      ${r.partialReps ? `<p class="note">${r.partialReps} movement${r.partialReps > 1 ? 's' : ''} didn't go far enough to count — that's fine, work up to it gradually.</p>` : ''}
      <button class="btn primary big" id="againBtn" type="button">Do another set</button>
      <button class="btn ghost" id="shareBtn" type="button">Send to my physio</button>
      <button class="btn ghost" id="homeBtn" type="button">Back to exercises</button>
    </section>
  `);
  $('#againBtn').addEventListener('click', () => startSession(ex, r.target, { demo: r.demo }));
  $('#homeBtn').addEventListener('click', renderHome);
  $('#shareBtn').addEventListener('click', () => share(reportText([r], exName)));
}

function renderPain(ex) {
  show(`
    <section class="panel pain">
      <h1>Exercise stopped</h1>
      <p>You did the right thing. Sit down somewhere safe and rest.</p>
      <ul class="safety-list">
        <li>Gentle ache that fades within a few minutes is usually OK — try fewer reps or a smaller movement next time.</li>
        <li>If the pain is <b>sharp, getting worse, or still there tomorrow</b>, skip this exercise and speak to your physio or doctor.</li>
        <li class="urgent">If you have <b>chest pain, trouble breathing, feel faint</b>, or have fallen and can't get up, call emergency services now.</li>
      </ul>
      <button class="btn ghost" id="shareBtn" type="button">Tell my physio</button>
      <button class="btn primary big" id="homeBtn" type="button">Back to exercises</button>
    </section>
  `);
  $('#homeBtn').addEventListener('click', renderHome);
  $('#shareBtn').addEventListener('click', () => share(`I stopped "${ex.name}" today because it hurt.\n\n${reportText(loadSessions(), exName)}`));
}

function renderError(ex, target, err) {
  const denied = err?.name === 'NotAllowedError';
  const noCam = err?.name === 'NotFoundError';
  show(`
    <section class="panel">
      <h1>${denied ? 'Camera permission needed' : noCam ? 'No camera found' : 'Couldn\'t start the coach'}</h1>
      <p>${denied
        ? 'Physio Coach needs your camera to see your movement. Video stays on your phone. Allow camera access in your browser settings, then try again.'
        : noCam ? 'This device doesn\'t seem to have a camera available.'
        : 'Check your internet connection the first time you use the app, so the movement model can download.'}</p>
      <button class="btn primary big" id="retryBtn" type="button">Try again</button>
      <button class="btn ghost" id="demoBtn" type="button">Watch a demo instead</button>
      <button class="btn ghost" id="homeBtn" type="button">Back</button>
    </section>
  `);
  $('#retryBtn').addEventListener('click', () => startSession(ex, target));
  $('#demoBtn').addEventListener('click', () => startSession(ex, target, { demo: true }));
  $('#homeBtn').addEventListener('click', renderHome);
}

function renderHistory() {
  const sessions = loadSessions();
  show(`
    <header class="top"><button class="back" id="backBtn" type="button">‹ Back</button></header>
    <section class="panel">
      <h1>Your history</h1>
      <p class="sub">${streak(sessions)} day streak · ${sessions.length} sets recorded</p>
      ${sessions.length ? `<ul class="history">${sessions.slice(0, 60).map((s) => {
        const d = new Date(s.date);
        return `<li class="${s.pain ? 'pain' : ''}">
          <div><b>${esc(exName(s.exerciseId))}</b><span>${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
          <div class="right"><b>${s.reps}</b><span>${s.pain ? 'stopped: pain' : `${s.formScore}% form`}</span></div>
        </li>`;
      }).join('')}</ul>
      <button class="btn primary" id="shareBtn" type="button">Send log to my physio</button>
      <button class="btn ghost" id="clearBtn" type="button">Clear history</button>` : '<p class="note">No sessions yet. Pick an exercise to get started.</p>'}
    </section>
  `);
  $('#backBtn').addEventListener('click', renderHome);
  $('#shareBtn')?.addEventListener('click', () => share(reportText(sessions, exName)));
  $('#clearBtn')?.addEventListener('click', () => {
    if (confirm('Delete all saved sessions from this phone?')) { clearSessions(); renderHistory(); }
  });
}

async function share(text) {
  try {
    if (navigator.share) return await navigator.share({ title: 'My exercise log', text });
  } catch (e) {
    if (e?.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(text);
    alert('Copied to clipboard — paste it into an email or message to your physio.');
  } catch {
    prompt('Copy this and send it to your physio:', text);
  }
}

// ---------------------------------------------------------------- Boot

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

const deep = params.get('exercise') && getExercise(params.get('exercise'));
if (deep && settings.accepted) renderSetup(deep); else renderHome();
