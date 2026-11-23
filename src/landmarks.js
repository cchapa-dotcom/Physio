// MediaPipe Pose landmark indices and helpers for picking the body side that
// faces the camera.
import { midpoint } from './geometry.js';

export const LM = {
  NOSE: 0,
  L_SHOULDER: 11, R_SHOULDER: 12,
  L_ELBOW: 13, R_ELBOW: 14,
  L_WRIST: 15, R_WRIST: 16,
  L_HIP: 23, R_HIP: 24,
  L_KNEE: 25, R_KNEE: 26,
  L_ANKLE: 27, R_ANKLE: 28,
  L_HEEL: 29, R_HEEL: 30,
  L_TOE: 31, R_TOE: 32,
};

const SIDE_INDEX = {
  left: { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27, heel: 29, toe: 31 },
  right: { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28, heel: 30, toe: 32 },
};

/** Bones drawn for the skeleton overlay, tagged with the joint names they belong to. */
export const BONES = [
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 29], [29, 31], [27, 31], [28, 30], [30, 32], [28, 32],
];

/**
 * Convert normalised MediaPipe landmarks (x, y in 0..1) into points where x
 * and y share a unit, so angles are correct for non-square video.
 */
export function toPoints(landmarks, aspect = 1) {
  return landmarks.map((l) => ({
    x: l.x * aspect,
    y: l.y,
    visibility: l.visibility ?? 1,
  }));
}

/** Choose the side of the body most visible to the camera. */
export function pickSide(points) {
  const score = (side) =>
    ['shoulder', 'hip', 'knee', 'ankle'].reduce(
      (s, k) => s + (points[SIDE_INDEX[side][k]]?.visibility ?? 0), 0);
  return score('left') >= score('right') ? 'left' : 'right';
}

export function sidePoints(points, side) {
  const out = { side };
  for (const [k, i] of Object.entries(SIDE_INDEX[side])) out[k] = points[i];
  return out;
}

export function bothSides(points) {
  return { left: sidePoints(points, 'left'), right: sidePoints(points, 'right') };
}

export function midShoulder(points) {
  return midpoint(points[LM.L_SHOULDER], points[LM.R_SHOULDER]);
}

export function midHip(points) {
  return midpoint(points[LM.L_HIP], points[LM.R_HIP]);
}

/** Returns the names of required joints whose visibility is below threshold. */
export function missingJoints(joints, names, threshold = 0.5) {
  return names.filter((n) => !joints[n] || (joints[n].visibility ?? 1) < threshold);
}

/**
 * Which way a side-on person faces along x: +1 or -1. Uses the foot (toe
 * ahead of heel), falling back to the nose relative to the shoulders.
 */
export function facingDirection(joints, nose) {
  if (joints.toe && joints.heel && Math.abs(joints.toe.x - joints.heel.x) > 0.01) {
    return Math.sign(joints.toe.x - joints.heel.x);
  }
  if (nose && joints.shoulder) return Math.sign(nose.x - joints.shoulder.x) || 1;
  return 1;
}

export { SIDE_INDEX };
