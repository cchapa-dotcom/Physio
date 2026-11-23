// Clinician mode: build a home programme and send it as a link / QR code,
// and read progress reports that clients send back.
import { EXERCISES, getExercise } from './exercises.js';
import { normalizeProgram, programLink, estimateMinutes, analyzeReport, newId } from './program.js';
import { loadDraft, saveDraft } from './storage.js';
import { $, $$, esc, icon, ring, figure, shareOrCopy, toast, dateLabel, cueFor, VIEW_LABEL } from './ui.js';
import qrcode from './lib/qrcode.mjs';

const emptyDraft = () => ({ id: newId(), title: 'Home programme', client: '', by: '', note: '', perWeek: 3, items: [] });

function qrSvg(text) {
  const qr = qrcode(0, 'L');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c},${r}h1v1h-1z`;
  return `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" class="qr" role="img" aria-label="QR code for the plan link"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

export function renderBuilder(app, { show, header, stepper }) {
  const draft = loadDraft() || emptyDraft();
  const persist = () => saveDraft(draft);
  let output = null;

  const itemRow = (it, i) => {
    const ex = getExercise(it.ex);
    return `
      <li class="card rx-item" data-i="${i}">
        <div class="rx-top">
          ${figure(it.ex)}
          <div class="rx-name"><b>${esc(ex.name)}</b><span>${VIEW_LABEL[ex.view]}</span></div>
          <div class="rx-move">
            <button type="button" class="circle-btn sm" data-act="up" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button>
            <button type="button" class="circle-btn sm" data-act="down" aria-label="Move down" ${i === draft.items.length - 1 ? 'disabled' : ''}>${icon('down')}</button>
            <button type="button" class="circle-btn sm" data-act="remove" aria-label="Remove">${icon('trash')}</button>
          </div>
        </div>
        <div class="rx-params">
          ${param('sets', it.sets, 'Sets')}
          ${param('reps', it.reps, 'Reps')}
          ${param('rest', it.rest, 'Rest', 's')}
          ${ex.holdSeconds ? param('hold', it.hold ?? ex.holdSeconds, 'Hold', 's') : ''}
        </div>
        <input class="field" data-act="note" placeholder="Note for this exercise (optional)" maxlength="200" value="${esc(it.note || '')}">
      </li>`;
  };
  const param = (k, v, label, unit = '') => `
    <div class="param"><span>${label}</span>
      <div class="mini-stepper">
        <button type="button" data-act="dec" data-k="${k}" aria-label="Less ${label}">${icon('minus')}</button>
        <b>${v}${unit}</b>
        <button type="button" data-act="inc" data-k="${k}" aria-label="More ${label}">${icon('plus')}</button>
      </div></div>`;

  const LIMITS = { sets: [1, 10, 1], reps: [1, 50, 1], rest: [0, 300, 15], hold: [0, 30, 1] };

  function render() {
    const valid = draft.items.length > 0;
    show(`
      ${header('Clinician', { back: '#/today' })}
      <h1 class="page-title">Prescribe.</h1>
      <p class="lede">Build a home programme. Your patient's phone camera will guide and correct every rep.</p>

      <section class="card form">
        <label><span>Patient first name</span><input class="field" id="client" maxlength="40" placeholder="e.g. Maria" value="${esc(draft.client)}"></label>
        <label><span>Plan name</span><input class="field" id="title" maxlength="60" value="${esc(draft.title)}"></label>
        <label><span>Your name / clinic</span><input class="field" id="by" maxlength="60" placeholder="e.g. Sam Lee, PT" value="${esc(draft.by)}"></label>
        ${stepper('perWeek', draft.perWeek, 'Sessions per week')}
        <label><span>Message to patient</span><textarea class="field" id="note" maxlength="400" rows="3" placeholder="e.g. Go gently this week — mild ache is OK, sharp pain is not.">${esc(draft.note)}</textarea></label>
      </section>

      <h3 class="section">Exercises <span class="count">${draft.items.length}</span></h3>
      ${draft.items.length ? `<ol class="rx-list">${draft.items.map(itemRow).join('')}</ol>` : '<p class="empty">Add exercises from the library below.</p>'}

      <h3 class="section">Library</h3>
      <ul class="add-list">${EXERCISES.map((e) => `
        <li><button type="button" class="add-row" data-add="${e.id}">
          ${figure(e.id)}<span><b>${esc(e.name)}</b><span>${esc(e.summary)}</span></span><span class="plus">${icon('plus')}</span>
        </button></li>`).join('')}
      </ul>

      <div class="sticky-cta">
        <div class="cta-meta">${valid ? `${draft.items.length} exercises · ~${estimateMinutes(normalizeProgram(draft))} min` : 'Add at least one exercise'}</div>
        <button class="btn primary big" id="create" type="button" ${valid ? '' : 'disabled'}>Create patient link</button>
      </div>

      <div id="output"></div>

      <section class="card list-card">
        <button class="row-btn" id="openReport" type="button"><span>Open a patient report link</span>${icon('chevron')}</button>
        <button class="row-btn danger" id="reset" type="button"><span>Start a new plan</span></button>
      </section>
    `);
    bind();
    if (output) renderOutput();
  }

  function renderOutput() {
    const link = programLink(draft, location.href);
    $('#output', app).innerHTML = `
      <section class="card share-card" id="shareCard">
        <div class="eyebrow">Ready to send</div>
        <h2>${draft.client ? `${esc(draft.client)}'s` : 'Patient'} plan</h2>
        <div class="qr-wrap">${qrSvg(link)}</div>
        <p class="meta center">Ask your patient to scan this with their phone camera, or send the link by text or email.</p>
        <button class="btn primary" id="share" type="button">${icon('share')} Send link</button>
        <button class="btn secondary" id="copy" type="button">${icon('copy')} Copy link</button>
        <a class="btn text" href="${esc(link)}" target="_blank" rel="noopener">Preview as patient</a>
      </section>`;
    $('#share', app).addEventListener('click', () => shareOrCopy({
      title: draft.title,
      text: `Hi${draft.client ? ` ${draft.client}` : ''}, here's your home exercise plan. Open this link on your phone — the camera will guide you through each exercise:`,
      url: link,
    }));
    $('#copy', app).addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch { prompt('Copy this link:', link); }
    });
  }

  function bind() {
    for (const k of ['client', 'title', 'by', 'note']) {
      $(`#${k}`, app).addEventListener('input', (e) => { draft[k] = e.target.value; persist(); output = null; $('#output', app).innerHTML = ''; });
    }
    $$('[data-inc="perWeek"],[data-dec="perWeek"]', app).forEach((b) => b.addEventListener('click', () => {
      draft.perWeek = Math.max(1, Math.min(14, draft.perWeek + (b.dataset.inc ? 1 : -1)));
      $('#perWeek', app).textContent = draft.perWeek;
      persist();
    }));
    $$('[data-add]', app).forEach((b) => b.addEventListener('click', () => {
      const ex = getExercise(b.dataset.add);
      const it = { ex: ex.id, sets: 2, reps: ex.defaultReps, rest: 45 };
      if (ex.holdSeconds) it.hold = ex.holdSeconds;
      draft.items.push(it);
      persist(); output = null;
      render();
      toast(`${ex.name} added`);
    }));
    $$('.rx-item', app).forEach((li) => {
      const i = Number(li.dataset.i);
      const it = draft.items[i];
      li.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const act = btn.dataset.act;
        if (act === 'inc' || act === 'dec') {
          const [lo, hi, step] = LIMITS[btn.dataset.k];
          const cur = it[btn.dataset.k] ?? getExercise(it.ex).holdSeconds;
          it[btn.dataset.k] = Math.max(lo, Math.min(hi, cur + (act === 'inc' ? step : -step)));
        } else if (act === 'up' && i > 0) {
          [draft.items[i - 1], draft.items[i]] = [draft.items[i], draft.items[i - 1]];
        } else if (act === 'down' && i < draft.items.length - 1) {
          [draft.items[i + 1], draft.items[i]] = [draft.items[i], draft.items[i + 1]];
        } else if (act === 'remove') {
          draft.items.splice(i, 1);
        }
        persist(); output = null;
        const y = window.scrollY;
        render();
        window.scrollTo(0, y);
      });
      $('[data-act="note"]', li).addEventListener('input', (e) => { it.note = e.target.value; persist(); });
    });
    $('#create', app).addEventListener('click', () => {
      output = true;
      renderOutput();
      $('#shareCard', app).scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('#reset', app).addEventListener('click', () => {
      if (!draft.items.length || confirm('Clear this plan and start a new one?')) {
        Object.assign(draft, emptyDraft());
        persist(); output = null; render();
      }
    });
    $('#openReport', app).addEventListener('click', () => {
      const link = prompt('Paste the report link your patient sent you:');
      const m = link && link.match(/#report=([\w-]+)/);
      if (m) location.hash = `report=${m[1]}`;
      else if (link) toast('That doesn\'t look like a kine. report link');
    });
  }

  render();
}

export function renderReport(app, report, { show, header }) {
  const a = analyzeReport(report);
  const pct = (v) => (v === null ? '—' : `${v}<small>%</small>`);
  show(`
    ${header('Report', { back: '#/pt' })}
    <div class="eyebrow">Progress report · last ${report.days} days</div>
    <h1 class="page-title">${esc(report.c || 'Patient')}</h1>
    <p class="lede">${esc(report.t)}${report.pw ? ` · ${report.pw}× per week prescribed` : ''}<br><span class="meta">Sent ${dateLabel(report.at)}</span></p>

    ${a.painReports ? `<div class="alert">${a.painReports} session${a.painReports > 1 ? 's' : ''} stopped because of pain. Check in with your patient.</div>` : ''}

    <section class="card ring-trio">
      ${ring((a.adherence ?? 0) / 100, { size: 96, stroke: 9, label: pct(a.adherence), sub: 'adherence' })}
      ${ring(a.avgCompletion / 100, { size: 96, stroke: 9, label: pct(a.avgCompletion), sub: 'completion', cls: 'white' })}
      ${ring(a.avgForm / 100, { size: 96, stroke: 9, label: pct(a.avgForm), sub: 'good form', cls: 'blue' })}
    </section>
    <p class="meta center">${a.sessions.length} session${a.sessions.length === 1 ? '' : 's'} done${a.expected ? ` of ${a.expected} expected` : ''}</p>

    ${a.topFaults.length ? `<h3 class="section">Most frequent corrections</h3>
      <ul class="focus">${a.topFaults.map((f) => `<li><span><b>${esc(getExercise(f.ex)?.name || f.ex)}</b> — ${esc(cueFor(f.ex, f.id))}</span><b>${f.n}×</b></li>`).join('')}</ul>` : ''}

    <h3 class="section">Sessions</h3>
    ${a.sessions.length ? `<ul class="list">${a.sessions.map((s) => `
      <li class="${s.pain ? 'pain' : ''}">
        <div><b>${dateLabel(s.date)}</b><span>${s.items.map((it) => `${esc(getExercise(it.ex)?.name || it.ex)} ${it.reps}/${it.planned}`).join(' · ')}${s.pain ? ' · <em>stopped: pain</em>' : ''}</span></div>
        <div class="right"><b>${s.completion}<small>%</small></b><span>${s.formScore}% form</span></div>
      </li>`).join('')}</ul>` : '<p class="empty">No sessions in this period.</p>'}

    <p class="fine">Form scores come from automated camera analysis and are a guide only.</p>
  `);
}
