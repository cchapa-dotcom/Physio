// Pure 2D geometry helpers. Points are {x, y} in a space where x and y use
// the same unit (see toPoints in landmarks.js) and y grows downward.

const DEG = 180 / Math.PI;

/** Interior angle ABC at vertex b, in degrees (0..180). */
export function angle(a, b, c) {
  const abx = a.x - b.x, aby = a.y - b.y;
  const cbx = c.x - b.x, cby = c.y - b.y;
  const dot = abx * cbx + aby * cby;
  const mag = Math.hypot(abx, aby) * Math.hypot(cbx, cby);
  if (mag === 0) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / mag))) * DEG;
}

/**
 * Signed tilt of the segment bottom->top away from straight up, in degrees.
 * Positive means `top` is to the +x side of `bottom`.
 */
export function tiltFromVertical(top, bottom) {
  return Math.atan2(top.x - bottom.x, bottom.y - top.y) * DEG;
}

/** Signed angle of segment a->b above the horizontal (positive = b higher). */
export function riseAngle(a, b) {
  return Math.atan2(a.y - b.y, Math.abs(b.x - a.x)) * DEG;
}

export function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    visibility: Math.min(a.visibility ?? 1, b.visibility ?? 1),
  };
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
