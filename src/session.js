// Guided session: runs a whole programme with the camera on, chaining
// exercise intro -> get in position -> countdown -> set -> rest -> next set...
// and coaching form throughout.

import { getExercise } from './exercises.js';
import { RepEngine } from './engine.js';
import { Coach, praise } from './coach.js';
import { toPoints } from './landmarks.js';
import { drawPose } from './draw.js';
import { DemoPlayer, toNormalized } from './demo.js';
import { buildSteps, summarizeSession, sessionTotals, newId } from './program.js';
import { $, esc, icon, fmtTime } from './ui.js';

const root = $('#session');

let detectorPromise = null;
function getDetector() {
  if (!detectorPromise) {
    detectorPromise = import('./pose.js').then((m) => m.createPoseDetector());
    detectorPromise.catch(() => { detectorPromise = null; });
  }
  return detectorPromise;
}

let active = null;
export const isRunning = () => !!active;

function exerciseFor(item) {
  const base = getExercise(item.ex);
  return item.hold !== undefined ? { ...base, holdSeconds: item.hold } : base;
}

function markup(program) {
  return `
    <div class="stage" id="stage">
      <video id="video" playsinline muted></video>
      <canvas id="overlay"></canvas>
      <div class="s-top">
        <div class="segments" id="segments"></div>
        <div class="s-head">
          <div>
            <div class="s-name" id="sName"></div>
            <div class="s-set" id="sSet"></div>
          </div>
          <button class="circle-btn" id="sClose" type="button" aria-label="End session">${icon('close')}</button>
        </div>
      </div>
      <div class="s-count" aria-label="Repetitions"><b id="sReps">0</b><span id="sTarget">/ 0</span></div>
      <div class="rom" aria-hidden="true"><div class="rom-fill" id="romFill"></div></div>
      <div class="center-msg" id="centerMsg" hidden></div>
      <div class="feedback" id="feedback" role="status"></div>

      <div class="sheet" id="intro" hidden>
        <div class="eyebrow" id="introEyebrow"></div>
        <h2 id="introName"></h2>
        <p class="intro-setup" id="introSetup"></p>
        <ol class="intro-steps" id="introSteps"></ol>
        <p class="pt-note" id="introNote" hidden></p>
        <div class="detect" id="introDetect"><span class="dot"></span><span id="introDetectText">Looking for you…</span></div>
        <button class="btn primary" id="introGo" type="button">I'm ready</button>
      </div>

      <div class="rest" id="rest" hidden>
        <div class="eyebrow">Rest</div>
        <div class="rest-ring" id="restRing"></div>
        <div class="rest-next" id="restNext"></div>
        <div class="row">
          <button class="btn secondary" id="restMore" type="button">+15 s</button>
          <button class="btn primary" id="restSkip" type="button">Skip rest</button>
        </div>
      </div>
    </div>
    <div class="controls">
      <button class="circle-btn lg" id="sPause" type="button" aria-label="Pause">${icon('pause')}</button>
      <button class="btn danger pill" id="sPain" type="button">Stop · it hurts</button>
      <button class="circle-btn lg" id="sSkip" type="button" aria-label="Skip">${icon('skip')}</button>
    </div>`;
}

/**
 * Start a guided session.
 * @param program normalised programme
 * @param opts { demo, voice, onExit(result) } — result is null if abandoned
 *   with nothing done, else the session record (with .pain if stopped for pain).
 */
export async function startSession(program, { demo = false, voice = true, programId = null, onExit }) {
  if (active) return;
  root.innerHTML = markup(program);
  root.hidden = false;
  document.body.classList.add('in-session');
  $('#app').hidden = true;
  $('#tabbar')?.setAttribute('hidden', '');

  const video = $('#video', root);
  const canvas = $('#overlay', root);
  const els = {
    video, canvas, ctx: canvas.getContext('2d'),
    feedback: $('#feedback', root), center: $('#centerMsg', root),
    reps: $('#sReps', root), target: $('#sTarget', root), rom: $('#romFill', root),
    name: $('#sName', root), set: $('#sSet', root), segments: $('#segments', root),
    intro: $('#intro', root), rest: $('#rest', root),
  };

  const s = {
    program, demo, programId, onExit, els,
    steps: buildSteps(program),
    idx: -1,
    phase: 'loading',
    paused: false,
    coach: new Coach({ voice, onMessage: (t, tone) => setFeedback(els, t, tone) }),
    setResults: [],
    t0: performance.now(),
    lastVideoTime: -1,
    stream: null, detector: null, wakeLock: null, raf: 0, timers: [],
  };
  active = s;
  s.setSteps = s.steps.filter((x) => x.type === 'set');
  els.segments.innerHTML = s.setSteps.map(() => '<span><i></i></span>').join('');
  bindControls(s);

  try { s.wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* unsupported */ }

  if (demo) {
    video.hidden = true;
    canvas.width = 540; canvas.height = 960;
  } else {
    setCenter(els, 'Starting camera…');
    try {
      const [stream, detector] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } } }),
        getDetector(),
      ]);
      if (active !== s) { stream.getTracks().forEach((t) => t.stop()); return; }
      s.stream = stream; s.detector = detector;
      video.srcObject = stream;
      await video.play();
      const facing = stream.getVideoTracks()[0]?.getSettings?.().facingMode;
      $('#stage', root).classList.toggle('mirror', facing !== 'environment');
    } catch (err) {
      console.error(err);
      teardown(s);
      active = null;
      onExit({ error: err });
      return;
    }
  }
  setCenter(els, '');
  nextStep(s);
  s.raf = requestAnimationFrame(() => loop(s));
}

function now(s) { return (performance.now() - s.t0) / 1000; }

function setFeedback(els, text, tone = 'info') {
  els.feedback.textContent = text;
  els.feedback.dataset.tone = tone;
}

function setCenter(els, text) {
  els.center.hidden = !text;
  els.center.textContent = text || '';
  els.center.dataset.big = /^\d+$/.test(text || '');
}

function current(s) { return s.steps[s.idx]; }

function setIndex(s) {
  // Index of the current (or next, during rest) set among set steps.
  let n = -1;
  for (let i = 0; i <= s.idx && i < s.steps.length; i++) if (s.steps[i].type === 'set') n++;
  return n;
}

function updateSegments(s, progress) {
  const cur = setIndex(s);
  [...s.els.segments.children].forEach((seg, i) => {
    const fill = i < cur ? 1 : i === cur && current(s)?.type === 'set' ? progress : 0;
    seg.firstChild.style.width = `${Math.round(fill * 100)}%`;
  });
}

function nextStep(s) {
  s.idx++;
  s.timers.forEach(clearTimeout);
  s.timers = [];
  const step = current(s);
  s.els.intro.hidden = true;
  s.els.rest.hidden = true;
  setCenter(s.els, '');
  if (!step) return finish(s, { pain: false });

  const item = s.program.items[step.item];
  s.ex = exerciseFor(item);
  s.item = item;
  s.els.name.textContent = s.ex.name;

  if (step.type === 'rest') {
    s.phase = 'rest';
    s.restEnd = now(s) + step.seconds;
    s.restTotal = step.seconds;
    s.lastRestSpoken = null;
    s.els.rest.hidden = false;
    s.els.set.textContent = `Set ${step.nextSet - 1} of ${item.sets} done`;
    $('#restNext', root).innerHTML = `Up next <b>Set ${step.nextSet} of ${item.sets}</b> · ${esc(s.ex.name)}`;
    s.coach.say(step.seconds >= 20 ? `Rest. ${step.seconds} seconds.` : 'Rest.', { tone: 'good' });
    updateSegments(s, 0);
    return;
  }

  s.engine = new RepEngine(s.ex);
  s.player = s.demo ? new DemoPlayer(s.ex) : null;
  s.seen = 0;
  s.els.set.textContent = `Set ${step.set} of ${step.sets}`;
  s.els.reps.textContent = '0';
  s.els.target.textContent = `/ ${step.reps}`;
  s.els.rom.style.height = '0%';
  updateSegments(s, 0);

  if (step.first) {
    s.phase = 'intro';
    s.introAt = now(s);
    const exIdx = step.item + 1;
    $('#introEyebrow', root).textContent = `Exercise ${exIdx} of ${s.program.items.length} · ${step.sets} × ${step.reps}${s.ex.holdSeconds ? ` · hold ${s.ex.holdSeconds}s` : ''}`;
    $('#introName', root).textContent = s.ex.name;
    $('#introSetup', root).textContent = s.ex.setup;
    $('#introSteps', root).innerHTML = s.ex.steps.map((x) => `<li>${esc(x)}</li>`).join('');
    const note = $('#introNote', root);
    note.hidden = !item.note;
    note.textContent = item.note ? `“${item.note}”` : '';
    s.els.intro.hidden = false;
    const lead = step.item === 0 ? `Let's start with ${s.ex.name}.` : `Next up, ${s.ex.name}.`;
    s.coach.say(`${lead} ${s.ex.setup}${item.note ? ` Your physio says: ${item.note}` : ''}`, { show: false });
    setFeedback(s.els, '');
  } else {
    s.phase = 'positioning';
  }
}

function startCountdown(s) {
  s.phase = 'countdown';
  s.els.intro.hidden = true;
  s.coach.say('Great. Get ready.', { tone: 'good' });
  let n = 3;
  const tick = () => {
    if (active !== s || s.phase !== 'countdown') return;
    if (s.paused) { s.timers.push(setTimeout(tick, 300)); return; }
    if (n > 0) {
      setCenter(s.els, String(n));
      if (n < 3) s.coach.say(String(n), { show: false });
      n--;
      s.timers.push(setTimeout(tick, 1000));
    } else {
      beginSet(s);
    }
  };
  s.timers.push(setTimeout(tick, 1100));
}

function beginSet(s) {
  setCenter(s.els, '');
  s.phase = 'active';
  s.activeAt = now(s);
  const step = current(s);
  s.coach.say(step.first ? 'Begin.' : `Set ${step.set}. Go.`, { tone: 'good' });
}

function completeSet(s, { skipped = false } = {}) {
  const step = current(s);
  const summary = s.engine.summary();
  if (summary.reps > 0 || !skipped) s.setResults.push({ item: step.item, set: step.set, summary });
  const isLastStep = s.idx >= s.steps.length - 1;
  const nextIsNewExercise = s.steps[s.idx + 1]?.type === 'set';
  if (!skipped && !isLastStep && nextIsNewExercise) {
    s.coach.say(summary.formScore >= 80 ? 'Exercise complete. Great form.' : 'Exercise complete.', { tone: 'good' });
  }
  nextStep(s);
}

function loop(s) {
  if (active !== s) return;
  s.raf = requestAnimationFrame(() => loop(s));
  if (s.paused) return;
  const { els } = s;
  const t = now(s);
  const step = current(s);
  if (!step) return;

  // Rest timer runs without needing the camera.
  if (s.phase === 'rest') {
    const left = Math.max(0, s.restEnd - t);
    $('#restRing', root).innerHTML = restRing(left / s.restTotal, Math.ceil(left));
    const whole = Math.ceil(left);
    if (whole <= 3 && whole > 0 && whole !== s.lastRestSpoken) {
      s.lastRestSpoken = whole;
      s.coach.say(String(whole), { show: false });
    }
    if (left <= 0) nextStep(s);
  }

  let landmarks = null;
  let aspect;
  if (s.demo) {
    aspect = els.canvas.width / els.canvas.height;
    const at = s.phase === 'active' ? t - s.activeAt : 0;
    landmarks = toNormalized((s.player || new DemoPlayer(s.ex)).frame(at), aspect).map((p) => ({ ...p, y: 0.1 + p.y * 0.68 }));
  } else {
    const v = els.video;
    if (v.readyState < 2 || v.currentTime === s.lastVideoTime) return;
    s.lastVideoTime = v.currentTime;
    if (els.canvas.width !== v.videoWidth) { els.canvas.width = v.videoWidth; els.canvas.height = v.videoHeight; }
    aspect = v.videoWidth / v.videoHeight;
    try { landmarks = s.detector.detect(v, performance.now()); } catch (e) { console.warn(e); }
  }

  const frame = landmarks
    ? s.ex.measure(toPoints(landmarks, aspect))
    : { ok: false, missing: s.ex.view === 'side' ? 'Step into view, side-on to the camera.' : 'Step into view, facing the camera.' };

  if (s.phase === 'intro') {
    s.seen = frame.ok ? s.seen + 1 : 0;
    const ok = s.seen > 15;
    $('#introDetect', root).classList.toggle('ok', ok);
    $('#introDetectText', root).textContent = ok ? 'Got you — hold still' : (frame.missing || 'Looking for you…');
    const minRead = s.demo ? 3.5 : 6;
    if (s.seen > 30 && t - s.introAt > minRead) startCountdown(s);
  } else if (s.phase === 'positioning') {
    s.seen = frame.ok ? s.seen + 1 : 0;
    setCenter(els, frame.ok ? '' : frame.missing);
    if (s.seen > 8) beginSet(s);
  } else if (s.phase === 'active') {
    for (const e of s.engine.update(frame, t)) handleEvent(s, e);
    const st = s.engine.status();
    els.reps.textContent = st.reps;
    els.rom.style.height = `${Math.round(st.progress * 100)}%`;
    updateSegments(s, Math.min(1, st.reps / step.reps));
    if (st.reps >= step.reps && st.state === 'rest') completeSet(s);
  }

  const faultJoints = s.phase === 'active'
    ? s.engine.status().activeFaults.flatMap((id) => s.ex.checks?.find((c) => c.id === id)?.joints || [])
    : [];
  if (s.demo) {
    const { ctx, canvas } = els;
    ctx.fillStyle = '#0b0b0c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#161618';
    ctx.fillRect(0, canvas.height * 0.712, canvas.width, canvas.height);
    drawPose(ctx, landmarks, { faultJoints, clear: false });
  } else {
    drawPose(els.ctx, landmarks, { faultJoints });
  }
}

function restRing(v, secs) {
  const size = 220, stroke = 12, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return `<svg viewBox="0 0 ${size} ${size}"><circle class="ring-track" cx="110" cy="110" r="${r}" stroke-width="${stroke}"/>
    <circle class="ring-fill" cx="110" cy="110" r="${r}" stroke-width="${stroke}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v)}" transform="rotate(-90 110 110)"/></svg>
    <b>${fmtTime(secs)}</b>`;
}

function handleEvent(s, e) {
  const { coach } = s;
  const step = current(s);
  switch (e.type) {
    case 'rep': {
      const fault = e.faults[0];
      if (e.good) coach.say(`${e.count}. ${s.engine.goodReps % 3 === 0 ? praise(e.count) : ''}`.trim(), { tone: 'good' });
      else if (fault && coach.throttle.allow(`rep:${fault.id}`, coach.now(), { urgent: true })) coach.say(`${e.count}. ${fault.message}`, { tone: 'warn' });
      else coach.say(String(e.count));
      if (e.count === step.reps - 1 && step.reps > 2) {
        s.timers.push(setTimeout(() => active === s && s.phase === 'active' && coach.cue('last', 'Last one!', { tone: 'good', urgent: true }), 900));
      }
      break;
    }
    case 'fault': coach.cue(e.id, e.message, { tone: 'warn' }); break;
    case 'partial': coach.cue('partial', e.message, { tone: 'warn', urgent: true }); break;
    case 'hold':
      if (e.remaining === s.ex.holdSeconds) coach.say('Hold.');
      setCenter(s.els, String(e.remaining));
      break;
    case 'holdDone':
      setCenter(s.els, '');
      coach.say('And down, slowly.', { tone: 'good' });
      break;
    case 'visibility': coach.cue('visibility', e.message, { tone: 'warn', urgent: true }); break;
    case 'visible': setFeedback(s.els, 'Got you again.', 'good'); break;
  }
  if (e.type !== 'hold' && s.engine.state !== 'peak' && /^\d+$/.test(s.els.center.textContent)) setCenter(s.els, '');
}

function bindControls(s) {
  $('#introGo', root).addEventListener('click', () => s.phase === 'intro' && startCountdown(s));
  $('#restMore', root).addEventListener('click', () => { s.restEnd += 15; s.restTotal += 15; });
  $('#restSkip', root).addEventListener('click', () => s.phase === 'rest' && nextStep(s));
  $('#sSkip', root).addEventListener('click', () => {
    if (s.phase === 'rest') return nextStep(s);
    if (current(s)?.type === 'set') { s.coach.stop(); completeSet(s, { skipped: true }); }
  });
  $('#sPause', root).addEventListener('click', () => togglePause(s));
  $('#sPain', root).addEventListener('click', () => finish(s, { pain: true }));
  $('#sClose', root).addEventListener('click', () => {
    const done = s.setResults.length;
    if (!done || confirm('End this session now? Your progress so far will be saved.')) finish(s, { pain: false, early: true });
  });
  s.onVis = () => { if (document.hidden && !s.paused) togglePause(s); };
  document.addEventListener('visibilitychange', s.onVis);
}

function togglePause(s) {
  s.paused = !s.paused;
  $('#sPause', root).innerHTML = icon(s.paused ? 'play' : 'pause');
  $('#sPause', root).setAttribute('aria-label', s.paused ? 'Resume' : 'Pause');
  if (s.paused) {
    s.pausedAt = now(s);
    s.coach.stop();
    setCenter(s.els, 'Paused');
  } else {
    const gap = now(s) - s.pausedAt;
    if (s.phase === 'rest') s.restEnd += gap;
    if (s.engine) s.engine.smoothed = null;
    setCenter(s.els, '');
  }
}

function teardown(s) {
  cancelAnimationFrame(s.raf);
  s.timers.forEach(clearTimeout);
  s.stream?.getTracks().forEach((t) => t.stop());
  s.els.video.srcObject = null;
  s.wakeLock?.release?.().catch(() => {});
  s.coach.stop();
  document.removeEventListener('visibilitychange', s.onVis);
  root.hidden = true;
  root.innerHTML = '';
  document.body.classList.remove('in-session');
}

function finish(s, { pain = false, early = false }) {
  if (active !== s) return;
  active = null;
  // Count an in-progress set if it has reps.
  const step = current(s);
  if (step?.type === 'set' && s.phase === 'active' && s.engine?.reps > 0) {
    s.setResults.push({ item: step.item, set: step.set, summary: s.engine.summary() });
  }
  teardown(s);
  const items = summarizeSession(s.program, s.setResults);
  const totals = sessionTotals(items);
  const record = {
    id: newId(),
    date: new Date().toISOString(),
    programId: s.programId,
    title: s.program.title,
    pain,
    early,
    demo: s.demo,
    durationSec: Math.round(now(s)),
    ...totals,
    items,
  };
  s.onExit(record);
}
