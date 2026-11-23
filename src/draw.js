// Draws the skeleton over the camera image. Joints involved in a current
// form fault are drawn in amber so the person can see what to fix.
import { BONES, SIDE_INDEX, LM } from './landmarks.js';

const OK = '#d4ff3d';
const BAD = '#ffb340';

function faultIndices(joints) {
  const set = new Set();
  for (const name of joints) {
    for (const side of ['left', 'right']) {
      const i = SIDE_INDEX[side][name];
      if (i !== undefined) set.add(i);
    }
  }
  return set;
}

export function drawPose(ctx, landmarks, { faultJoints = [], clear = true } = {}) {
  const { width: w, height: h } = ctx.canvas;
  if (clear) ctx.clearRect(0, 0, w, h);
  if (!landmarks) return;
  const bad = faultIndices(faultJoints);
  const vis = (i) => (landmarks[i]?.visibility ?? 1) > 0.4;
  const px = (i) => [landmarks[i].x * w, landmarks[i].y * h];
  const lw = Math.max(4, w / 90);

  ctx.lineCap = 'round';
  for (const [a, b] of BONES) {
    if (!vis(a) || !vis(b)) continue;
    ctx.strokeStyle = bad.has(a) && bad.has(b) ? BAD : OK;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(...px(a));
    ctx.lineTo(...px(b));
    ctx.stroke();
  }
  for (let i = 11; i < landmarks.length; i++) {
    if (!vis(i)) continue;
    const isBad = bad.has(i);
    ctx.fillStyle = isBad ? BAD : '#ffffff';
    ctx.beginPath();
    ctx.arc(...px(i), isBad ? lw * 1.6 : lw, 0, Math.PI * 2);
    ctx.fill();
  }
  if (vis(LM.NOSE)) {
    ctx.strokeStyle = OK;
    ctx.lineWidth = lw * 0.8;
    ctx.beginPath();
    ctx.arc(...px(LM.NOSE), w / 30, 0, Math.PI * 2);
    ctx.stroke();
  }
}
