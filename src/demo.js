// Synthetic pose generator. Produces MediaPipe-shaped landmarks for each
// exercise so the app can be tried without a camera (?demo) and so the
// exercise logic can be tested deterministically.

const RAD = Math.PI / 180;
const N = 33;

// Segment lengths as a fraction of frame height.
const L = { trunk: 0.30, thigh: 0.22, shin: 0.22, upperArm: 0.15, forearm: 0.14, head: 0.1, foot: 0.07 };

const dir = (deg, facing) => ({ x: Math.sin(deg * RAD) * facing, y: Math.cos(deg * RAD) });
const add = (p, d, len) => ({ x: p.x + d.x * len, y: p.y + d.y * len });

/**
 * Side-view figure. Segment angles are measured from straight down, positive
 * towards the direction the person faces:
 *  trunk: lean of hip->shoulder from vertical (+ forward, -90 = lying back)
 *  thigh: angle of hip->knee from straight down (90 = horizontal forward)
 *  shin:  angle of knee->ankle from straight down
 *  heel:  heel lift angle in degrees
 *  arm:   angle of shoulder->wrist from straight down
 */
export function sideFigure({
  facing = 1, trunk = 0, thigh = 0, shin = 0, heel = 0, arm = 0,
  thighFar = null, shinFar = null, ground = 0.9, nearSide = 'left',
} = {}) {
  const build = (th, sh) => {
    const hip = { x: 0, y: 0 };
    const shoulder = add(hip, dir(180 - trunk, facing), L.trunk);
    // dir(180 - trunk) points up, leaning toward facing for positive trunk.
    const knee = add(hip, dir(th, facing), L.thigh);
    const ankle = add(knee, dir(sh, facing), L.shin);
    const footDir = { x: Math.cos(heel * RAD) * facing, y: Math.sin(heel * RAD) };
    const heelP = heel > 0 ? { x: ankle.x - footDir.x * 0.02, y: ankle.y + 0.02 } : { x: ankle.x - 0.02 * facing, y: ankle.y + 0.025 };
    const toe = heel > 0 ? add(heelP, footDir, L.foot) : { x: heelP.x + L.foot * facing, y: heelP.y };
    const elbow = add(shoulder, dir(arm, facing), L.upperArm);
    const wrist = add(elbow, dir(arm, facing), L.forearm);
    return { hip, shoulder, knee, ankle, heel: heelP, toe, elbow, wrist };
  };
  const near = build(thigh, shin);
  const far = build(thighFar ?? thigh, shinFar ?? shin);
  const nose = add(near.shoulder, dir(180 - trunk, facing), L.head * 0.8);
  nose.x += 0.03 * facing;

  const pts = new Array(N).fill(null).map(() => ({ x: 0, y: 0, visibility: 0.2 }));
  const nearIdx = nearSide === 'left'
    ? { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27, heel: 29, toe: 31 }
    : { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28, heel: 30, toe: 32 };
  const farIdx = nearSide === 'left'
    ? { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28, heel: 30, toe: 32 }
    : { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27, heel: 29, toe: 31 };
  for (const [k, i] of Object.entries(nearIdx)) pts[i] = { ...near[k], visibility: 0.95 };
  for (const [k, i] of Object.entries(farIdx)) pts[i] = { x: far[k].x + 0.005, y: far[k].y, visibility: 0.6 };
  pts[0] = { ...nose, visibility: 0.95 };
  return placeOnGround(pts, ground);
}

/** Front-view figure for arm work. Abduction is arm angle away from the body. */
export function frontFigure({ leftAbd = 10, rightAbd = 10, leftElbow = 180, rightElbow = 180, sideLean = 0, ground = 0.9 } = {}) {
  const hipW = 0.07, shW = 0.1;
  const pts = new Array(N).fill(null).map(() => ({ x: 0, y: 0, visibility: 0.2 }));
  const lean = sideLean * RAD;
  const midHip = { x: 0, y: 0 };
  const midSh = { x: Math.sin(lean) * L.trunk, y: -Math.cos(lean) * L.trunk };
  // Person faces camera: their left appears on image right (+x).
  const lSh = { x: midSh.x + shW, y: midSh.y }, rSh = { x: midSh.x - shW, y: midSh.y };
  const lHip = { x: hipW, y: 0 }, rHip = { x: -hipW, y: 0 };
  const arm = (sh, abd, elbowAng, side) => {
    const a = abd * RAD;
    const e = { x: sh.x + side * Math.sin(a) * L.upperArm, y: sh.y + Math.cos(a) * L.upperArm };
    const bend = (180 - elbowAng) * RAD; // forearm rotates inward/up
    const fa = a + bend;
    const w = { x: e.x + side * Math.sin(fa) * L.forearm, y: e.y + Math.cos(fa) * L.forearm };
    return [e, w];
  };
  const [lE, lW] = arm(lSh, leftAbd, leftElbow, 1);
  const [rE, rW] = arm(rSh, rightAbd, rightElbow, -1);
  const leg = (hip) => {
    const knee = { x: hip.x, y: hip.y + L.thigh };
    const ankle = { x: hip.x, y: knee.y + L.shin };
    return [knee, ankle, { x: ankle.x, y: ankle.y + 0.02 }, { x: ankle.x + 0.01, y: ankle.y + 0.03 }];
  };
  const [lK, lA, lHe, lT] = leg(lHip);
  const [rK, rA, rHe, rT] = leg(rHip);
  const set = (i, p) => { pts[i] = { ...p, visibility: 0.95 }; };
  set(0, { x: midSh.x, y: midSh.y - L.head });
  set(11, lSh); set(12, rSh); set(13, lE); set(14, rE); set(15, lW); set(16, rW);
  set(23, lHip); set(24, rHip); set(25, lK); set(26, rK); set(27, lA); set(28, rA);
  set(29, lHe); set(30, rHe); set(31, lT); set(32, rT);
  return placeOnGround(pts, ground);
}

function placeOnGround(pts, ground) {
  const real = pts.filter((p) => p.visibility > 0.3);
  const maxY = Math.max(...real.map((p) => p.y));
  const xs = real.map((p) => p.x);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  return pts.map((p) => ({ x: p.x - cx + 0.5, y: p.y - maxY + ground, visibility: p.visibility }));
}

/** Convert point-space figure (square units) into normalised image landmarks. */
export function toNormalized(points, aspect = 1) {
  return points.map((p) => ({ x: (p.x - 0.5) / aspect + 0.5, y: p.y, z: 0, visibility: p.visibility }));
}

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Pose for exercise `id` at movement phase t (0 = rest, 1 = target).
 * `fault` injects a typical mistake so the demo shows corrections.
 */
export function demoPose(id, t, { fault = null, rep = 0, leg = null } = {}) {
  switch (id) {
    case 'sit-to-stand': {
      // Seated: thigh horizontal, shin vertical. Standing: all vertical.
      const thigh = lerp(88, 0, t);
      const trunk = fault === 'chest-up'
        ? (t < 0.6 ? 70 : lerp(70, 10, (t - 0.6) / 0.4))
        : Math.sin(t * Math.PI) * 35 + lerp(10, 0, t);
      const hipBend = fault === 'stand-tall' && t > 0.9 ? 30 : 0;
      return sideFigure({ thigh: thigh + hipBend * 0.2, shin: 0, trunk: trunk + hipBend, arm: 20 });
    }
    case 'squat': {
      const depth = fault === 'partial' ? t * 0.5 : t;
      const thigh = lerp(5, 80, depth);
      const shin = lerp(-2, -32, depth);
      const trunk = fault === 'chest-up' ? lerp(10, 60, depth) : lerp(5, 35, depth);
      const heel = fault === 'heels-down' ? lerp(0, 22, depth) : 0;
      return sideFigure({ thigh, shin, trunk, heel, arm: lerp(10, 80, depth) });
    }
    case 'arm-raise': {
      const top = fault === 'partial' ? 50 : fault === 'even-arms' ? 100 : 88;
      const abd = lerp(12, top, t);
      const lag = fault === 'even-arms' ? 30 * t : 0;
      const elbow = fault === 'straight-arms' ? lerp(175, 125, t) : 178;
      return frontFigure({ leftAbd: abd, rightAbd: abd - lag, leftElbow: elbow, rightElbow: elbow, sideLean: fault === 'upright' ? 14 * t : 0 });
    }
    case 'knee-extension': {
      const trunk = fault === 'sit-tall' ? lerp(0, -28, t) : 0;
      return sideFigure({ thigh: 88, shin: lerp(2, 75, t), shinFar: 2, trunk, arm: 10 });
    }
    case 'march': {
      const leftLeg = (leg ?? (rep % 2 === 0 ? 'left' : 'right')) === 'left';
      const lift = lerp(0, 75, t);
      const knee = lerp(0, 75, t);
      const trunk = fault === 'stand-tall' ? lerp(0, -20, t) : 0;
      return leftLeg
        ? sideFigure({ thigh: lift, shin: lift - knee, thighFar: 0, shinFar: 0, trunk })
        : sideFigure({ thigh: 0, shin: 0, thighFar: lift, shinFar: lift - knee, trunk });
    }
    case 'bridge': {
      // Lying on back: trunk goes back towards the floor, knees bent up.
      const lift = lerp(0, 32, t);
      const trunk = -(90 + lerp(-2, 20, t));
      return sideFigure({ trunk, thigh: 140 - lift, shin: fault === 'feet-closer' ? 85 : 20, arm: -90 });
    }
    case 'heel-raise': {
      const heel = lerp(0, 24, t);
      const shinBend = fault === 'straight-knees' ? lerp(0, 30, t) : 0;
      return sideFigure({ heel, thigh: shinBend, shin: -shinBend * 0.4, trunk: fault === 'stand-tall' ? lerp(0, 25, t) : 0, arm: 10 });
    }
    default:
      return sideFigure({});
  }
}

/** Which faults the live demo injects, cycling through reps. */
export const DEMO_FAULTS = {
  'sit-to-stand': [null, null, 'chest-up', null, 'fast'],
  squat: [null, 'chest-up', null, 'heels-down', 'partial'],
  'arm-raise': [null, 'straight-arms', null, 'even-arms', 'partial'],
  'knee-extension': [null, 'nohold', null, 'sit-tall'],
  march: [null, null, null, 'alternate', null, 'stand-tall'],
  bridge: [null, null, 'feet-closer', 'nohold'],
  'heel-raise': [null, 'straight-knees', null, 'stand-tall'],
};

/**
 * Plays a looping, scripted workout for an exercise: rest, move, hold,
 * return — injecting the faults listed in DEMO_FAULTS.
 */
export class DemoPlayer {
  constructor(exercise) {
    this.ex = exercise;
    this.faults = DEMO_FAULTS[exercise.id] || [null];
    this.rep = 0;
    this.repStart = 0;
    this.leg = 'left';
    this.plan = this._plan(0);
  }

  _plan(rep) {
    const fault = this.faults[rep % this.faults.length];
    const hold = this.ex.holdSeconds ? (fault === 'nohold' ? 0.2 : this.ex.holdSeconds + 0.5) : 0.3;
    return {
      fault,
      rest: 1.0,
      move: 1.7,
      hold,
      ret: fault === 'fast' ? 0.4 : 1.9,
    };
  }

  /** Landmarks at time t (seconds since start). */
  frame(t) {
    let local = t - this.repStart;
    let pl = this.plan;
    const total = pl.rest + pl.move + pl.hold + pl.ret;
    if (local >= total) {
      this.rep++;
      this.repStart += total;
      this.plan = pl = this._plan(this.rep);
      // Alternate legs (for marching) unless this rep's fault is forgetting to.
      if (pl.fault !== 'alternate') this.leg = this.leg === 'left' ? 'right' : 'left';
      local = t - this.repStart;
    }
    let phase;
    if (local < pl.rest) phase = 0;
    else if (local < pl.rest + pl.move) phase = (local - pl.rest) / pl.move;
    else if (local < pl.rest + pl.move + pl.hold) phase = 1;
    else phase = 1 - (local - pl.rest - pl.move - pl.hold) / pl.ret;
    phase = Math.max(0, Math.min(1, phase));
    return demoPose(this.ex.id, phase, { fault: pl.fault, rep: this.rep, leg: this.leg });
  }
}
