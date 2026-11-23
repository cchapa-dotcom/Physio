// Small UI helpers shared by all views: escaping, icons, progress rings and
// line-art exercise figures.
import { demoPose } from './demo.js';
import { BONES } from './landmarks.js';
import { getExercise } from './exercises.js';

export const BRAND = 'kine';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const wordmark = (cls = '') => `<span class="wordmark ${cls}">${BRAND}<i>.</i></span>`;

const P = {
  today: '<path d="M12 3a9 9 0 1 0 9 9"/><path d="M12 7v5l3 2"/><path d="M17 3h4v4"/>',
  library: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  progress: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
  skip: '<path d="M5 5l9 7-9 7zM18 5v14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  camera: '<path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="4"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  clinic: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
};

export const icon = (name, cls = '') =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;

/** Circular progress ring (0..1) with centre content. */
export function ring(value, { size = 120, stroke = 10, label = '', sub = '', cls = '' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value || 0));
  return `
    <div class="ring ${cls}" style="--size:${size}px">
      <svg viewBox="0 0 ${size} ${size}" aria-hidden="true">
        <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/>
        <circle class="ring-fill" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"
          stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
      </svg>
      <div class="ring-center"><b>${label}</b>${sub ? `<span>${sub}</span>` : ''}</div>
    </div>`;
}

const figureCache = new Map();
/** Line-art SVG of an exercise at its target position, drawn from the demo skeleton. */
export function figure(exId, cls = '') {
  if (!figureCache.has(exId)) {
    const ex = getExercise(exId);
    const pts = demoPose(exId, ex?.view === 'front' ? 0.85 : 0.75);
    const used = pts.filter((_, i) => i === 0 || i >= 11);
    const xs = used.map((p) => p.x), ys = used.map((p) => p.y);
    const pad = 0.06;
    const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad - 0.04, maxY = Math.max(...ys) + pad;
    const w = maxX - minX, h = maxY - minY;
    const side = Math.max(w, h);
    const ox = minX - (side - w) / 2, oy = minY - (side - h) / 2;
    const f = (n) => (n * 100).toFixed(1);
    // Draw the far side first, dimmer.
    const far = new Set([12, 14, 16, 24, 26, 28, 30, 32]);
    const line = ([a, b], cls) => `<line x1="${f(pts[a].x - ox)}" y1="${f(pts[a].y - oy)}" x2="${f(pts[b].x - ox)}" y2="${f(pts[b].y - oy)}" class="${cls}"/>`;
    const isFar = ([a, b]) => ex?.view !== 'front' && (far.has(a) || far.has(b));
    const lines = BONES.filter(isFar).map((b) => line(b, 'far')).join('')
      + BONES.filter((b) => !isFar(b)).map((b) => line(b, '')).join('');
    const head = `<circle cx="${f(pts[0].x - ox)}" cy="${f(pts[0].y - oy)}" r="${f(0.045)}"/>`;
    figureCache.set(exId, `<svg class="figure" viewBox="0 0 ${f(side)} ${f(side)}" aria-hidden="true">${lines}${head}</svg>`);
  }
  return `<span class="fig ${cls}">${figureCache.get(exId)}</span>`;
}

/** Brief bottom toast. */
export function toast(text) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2600);
}

export async function shareOrCopy({ title, text, url }) {
  try {
    if (navigator.share) { await navigator.share({ title, text, url }); return 'shared'; }
  } catch (e) {
    if (e?.name === 'AbortError') return 'cancelled';
  }
  try {
    await navigator.clipboard.writeText(url ? `${text ? `${text}\n` : ''}${url}` : text);
    toast('Copied to clipboard');
    return 'copied';
  } catch {
    prompt('Copy this:', url || text);
    return 'prompted';
  }
}

export const fmtTime = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

export const dateLabel = (d) => new Date(d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/** Human-readable correction for a fault id recorded against an exercise. */
export function cueFor(exId, faultId) {
  const ex = getExercise(exId);
  const c = ex?.checks?.find((x) => x.id === faultId) || ex?.repChecks?.find((x) => x.id === faultId);
  if (c) return c.cue;
  return {
    hold: 'Not holding at the top',
    'tempo-move': ex?.tempoMoveCue || 'Moving too fast',
    'tempo-return': ex?.tempoReturnCue || 'Lowering too fast',
  }[faultId] || faultId;
}

export const VIEW_LABEL = { side: 'Side-on', front: 'Facing camera' };
