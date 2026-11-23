// Exercise library. Each exercise describes:
//  - how to set up the phone (camera view) and do the movement,
//  - measure(points): reduces a pose to { ok, value, metrics },
//  - rest / peak: the primary value at the start and target positions,
//  - checks: per-frame form rules with the spoken correction (cue),
//  - optional hold time, tempo limits and per-rep checks.
//
// Thresholds are deliberately forgiving: the goal is safe, encouraging
// coaching for people exercising alone, not elite technique.

import { angle, tiltFromVertical, riseAngle } from './geometry.js';
import {
  LM, pickSide, sidePoints, bothSides, missingJoints, facingDirection,
  midShoulder, midHip,
} from './landmarks.js';

const SIDE_VIEW_MISSING = 'Turn side-on to the camera and step back so I can see you from head to feet.';

/** Common side-view measurements for one side of the body. */
function measureSide(points, required) {
  const side = pickSide(points);
  const j = sidePoints(points, side);
  const missing = missingJoints(j, required);
  if (missing.length) return { ok: false, missing: SIDE_VIEW_MISSING };
  const facing = facingDirection(j, points[LM.NOSE]);
  const m = {
    side,
    facing,
    knee: angle(j.hip, j.knee, j.ankle),
    hip: angle(j.shoulder, j.hip, j.knee),
    // Positive = leaning forward (towards where the person faces).
    trunkLean: tiltFromVertical(j.shoulder, j.hip) * facing,
  };
  if (j.heel && j.toe) m.heelRise = riseAngle(j.toe, j.heel);
  if (j.elbow && j.wrist) m.elbow = angle(j.shoulder, j.elbow, j.wrist);
  return { ok: true, joints: j, metrics: m };
}

export const EXERCISES = [
  {
    id: 'sit-to-stand',
    name: 'Sit to Stand',
    summary: 'Builds leg strength for getting out of chairs, cars and bed.',
    tags: ['gentle', 'travel'],
    view: 'side',
    setup: 'Place a sturdy chair side-on to the phone. Prop the phone at about hip height, 2–3 metres away, so your whole body fits on screen.',
    steps: [
      'Sit near the front of the chair, feet flat and hip-width apart.',
      'Cross your arms over your chest, or use the armrests if you need to.',
      'Lean forward slightly and stand all the way up.',
      'Sit back down slowly and with control.',
    ],
    safety: 'Use a chair that will not slide. Use the armrests if you feel unsteady.',
    defaultReps: 8,
    rest: 95,
    peak: 162,
    minReturnSeconds: 1.0,
    tempoReturnCue: 'Sit down slowly — don\'t drop into the chair.',
    partialCue: 'Push all the way up until you are standing tall.',
    measure(points) {
      const r = measureSide(points, ['shoulder', 'hip', 'knee', 'ankle']);
      if (!r.ok) return r;
      return { ok: true, value: r.metrics.knee, metrics: r.metrics };
    },
    checks: [
      {
        id: 'chest-up', phase: 'moving', joints: ['shoulder', 'hip'],
        cue: 'Keep your chest a little more upright.',
        test: (m) => m.trunkLean > 58,
      },
    ],
    repChecks: [
      {
        // Judged on the best hip extension reached during the rep, because
        // the knees straighten a moment before the hips do.
        id: 'stand-tall',
        cue: 'Stand up fully — squeeze your bottom and bring your hips forward.',
        test: (r) => r.max.hip < 155,
      },
    ],
  },

  {
    id: 'squat',
    name: 'Bodyweight Squat',
    summary: 'Strengthens thighs and hips. Perfect for a hotel room.',
    tags: ['travel'],
    view: 'side',
    setup: 'Stand side-on to the phone, 2–3 metres away, with the phone at hip height.',
    steps: [
      'Stand with feet shoulder-width apart, toes slightly out.',
      'Push your hips back and bend your knees as if sitting into a chair.',
      'Keep your chest up and heels on the floor.',
      'Go as low as is comfortable, then drive back up to standing.',
    ],
    safety: 'Only go as low as is pain-free. Stand next to a wall or chair for balance if needed.',
    defaultReps: 12,
    rest: 168,
    peak: 105,
    minMoveSeconds: 0.8,
    tempoMoveCue: 'Lower down more slowly — take about two seconds.',
    partialCue: 'Try to go a little lower, as far as is comfortable.',
    measure(points) {
      const r = measureSide(points, ['shoulder', 'hip', 'knee', 'ankle']);
      if (!r.ok) return r;
      return { ok: true, value: r.metrics.knee, metrics: r.metrics };
    },
    checks: [
      {
        id: 'chest-up', phase: 'moving', joints: ['shoulder', 'hip'],
        cue: 'Keep your chest up — don\'t fold forward.',
        test: (m) => m.trunkLean > 48,
      },
      {
        id: 'heels-down', phase: 'moving', joints: ['ankle'],
        cue: 'Keep your heels on the floor and sit back into your hips.',
        test: (m) => m.heelRise !== undefined && m.heelRise > 14,
      },
    ],
  },

  {
    id: 'arm-raise',
    name: 'Side Arm Raises',
    summary: 'Keeps shoulders mobile — great for reaching shelves and dressing.',
    tags: ['gentle', 'travel'],
    view: 'front',
    setup: 'Face the phone, 2 metres away, with the phone at chest height. You can stand or sit.',
    steps: [
      'Start with your arms by your sides, thumbs pointing forward.',
      'Keeping your elbows straight, raise both arms out to the side.',
      'Stop at shoulder height.',
      'Lower slowly back down.',
    ],
    safety: 'Stop below shoulder height if you have shoulder pain. Sit down if you feel dizzy.',
    defaultReps: 10,
    rest: 18,
    peak: 82,
    minReturnSeconds: 0.8,
    tempoReturnCue: 'Lower your arms slowly.',
    partialCue: 'Lift your arms a little higher — up to shoulder height.',
    measure(points) {
      const { left, right } = bothSides(points);
      const need = ['shoulder', 'elbow', 'wrist', 'hip'];
      if (missingJoints(left, need).length || missingJoints(right, need).length) {
        return { ok: false, missing: 'Face the camera and step back so I can see your arms and hips.' };
      }
      const lAbd = angle(left.hip, left.shoulder, left.elbow);
      const rAbd = angle(right.hip, right.shoulder, right.elbow);
      const metrics = {
        leftAbduction: lAbd,
        rightAbduction: rAbd,
        asymmetry: Math.abs(lAbd - rAbd),
        leftElbow: angle(left.shoulder, left.elbow, left.wrist),
        rightElbow: angle(right.shoulder, right.elbow, right.wrist),
        sideLean: Math.abs(tiltFromVertical(midShoulder(points), midHip(points))),
      };
      metrics.avgAbduction = (lAbd + rAbd) / 2;
      return { ok: true, value: metrics.avgAbduction, metrics };
    },
    checks: [
      {
        id: 'straight-arms', phase: 'moving', joints: ['elbow'],
        cue: 'Keep your elbows straight.',
        test: (m) => Math.min(m.leftElbow, m.rightElbow) < 145,
      },
      {
        id: 'even-arms', phase: 'moving', joints: ['shoulder', 'elbow'],
        cue: 'Raise both arms evenly, together.',
        test: (m) => m.asymmetry > 22,
      },
      {
        id: 'upright', phase: 'moving', joints: ['shoulder', 'hip'],
        cue: 'Keep your body upright — don\'t lean to the side.',
        test: (m) => m.sideLean > 9,
      },
      {
        id: 'shoulder-height', phase: 'peak', joints: ['shoulder', 'elbow'],
        cue: 'Only go up to shoulder height.',
        test: (m) => m.avgAbduction > 118,
      },
    ],
  },

  {
    id: 'knee-extension',
    name: 'Seated Knee Extension',
    summary: 'Strengthens the front of the thigh. Easy on the joints.',
    tags: ['gentle'],
    view: 'side',
    setup: 'Sit on a chair side-on to the phone, 2 metres away, phone at seat height.',
    steps: [
      'Sit tall at the back of the chair, feet flat on the floor.',
      'Straighten the leg nearest the camera until it is level.',
      'Hold for 2 seconds, squeezing the front of your thigh.',
      'Lower it back down slowly. Switch legs after the set.',
    ],
    safety: 'Keep the movement smooth. Stop if you feel sharp knee pain.',
    defaultReps: 10,
    rest: 95,
    peak: 158,
    holdSeconds: 2,
    minReturnSeconds: 0.8,
    tempoReturnCue: 'Lower your leg slowly.',
    partialCue: 'Straighten your knee a little more.',
    measure(points) {
      const r = measureSide(points, ['shoulder', 'hip', 'knee', 'ankle']);
      if (!r.ok) return r;
      return { ok: true, value: r.metrics.knee, metrics: r.metrics };
    },
    checks: [
      {
        id: 'sit-tall', phase: 'moving', joints: ['shoulder', 'hip'],
        cue: 'Sit up tall — don\'t lean back.',
        test: (m) => m.trunkLean < -18,
      },
    ],
  },

  {
    id: 'march',
    name: 'Standing March',
    summary: 'Improves balance and hip strength to help prevent falls.',
    tags: ['gentle', 'travel'],
    view: 'side',
    setup: 'Stand side-on to the phone, 2–3 metres away, next to a counter or chair you can hold.',
    steps: [
      'Stand tall, holding a support lightly if you need it.',
      'Lift one knee up towards hip height.',
      'Lower it with control, then lift the other knee.',
      'Keep alternating at a steady pace.',
    ],
    safety: 'Always have something sturdy within reach to hold for balance.',
    defaultReps: 16,
    rest: 8,
    peak: 55,
    partialCue: 'Lift your knee a little higher.',
    measure(points) {
      const { left, right } = bothSides(points);
      const need = ['shoulder', 'hip', 'knee'];
      const side = pickSide(points);
      const near = side === 'left' ? left : right;
      if (missingJoints(near, [...need, 'ankle']).length) return { ok: false, missing: SIDE_VIEW_MISSING };
      const flex = (j) => 180 - angle(j.shoulder, j.hip, j.knee);
      const lFlex = flex(left), rFlex = flex(right);
      const facing = facingDirection(near, points[LM.NOSE]);
      const metrics = {
        leftFlexion: lFlex,
        rightFlexion: rFlex,
        leg: lFlex >= rFlex ? 'left' : 'right',
        trunkLean: tiltFromVertical(near.shoulder, near.hip) * facing,
      };
      return { ok: true, value: Math.max(lFlex, rFlex), metrics };
    },
    checks: [
      {
        id: 'stand-tall', phase: 'moving', joints: ['shoulder', 'hip'],
        cue: 'Stand tall — keep your back straight as you lift.',
        test: (m) => m.trunkLean < -12 || m.trunkLean > 22,
      },
    ],
    repChecks: [
      {
        id: 'alternate', cue: 'Remember to switch legs each time.',
        test: (r) => r.previousPeakMetrics && r.previousPeakMetrics.leg === r.peakMetrics.leg,
      },
    ],
  },

  {
    id: 'bridge',
    name: 'Glute Bridge',
    summary: 'Strengthens hips and lower back. Done lying down.',
    tags: ['gentle', 'travel'],
    view: 'side',
    setup: 'Lie on your back on a mat or bed. Put the phone on the floor, side-on, about 2 metres away.',
    steps: [
      'Lie on your back with knees bent and feet flat, close to your bottom.',
      'Squeeze your bottom and lift your hips until your body forms a straight line from shoulders to knees.',
      'Hold for 2 seconds.',
      'Lower slowly back down.',
    ],
    safety: 'Don\'t push up into your neck. Keep your shoulders on the floor.',
    defaultReps: 10,
    rest: 128,
    peak: 163,
    holdSeconds: 2,
    minReturnSeconds: 0.8,
    tempoReturnCue: 'Lower your hips slowly.',
    partialCue: 'Lift your hips a little higher — squeeze your bottom.',
    measure(points) {
      const r = measureSide(points, ['shoulder', 'hip', 'knee', 'ankle']);
      if (!r.ok) return { ok: false, missing: 'Lie side-on to the camera so I can see your shoulders, hips and feet.' };
      return { ok: true, value: r.metrics.hip, metrics: r.metrics };
    },
    checks: [
      {
        id: 'feet-closer', phase: 'peak', joints: ['knee'],
        cue: 'Walk your feet a little closer to your bottom.',
        test: (m) => m.knee > 125,
      },
    ],
  },

  {
    id: 'heel-raise',
    name: 'Heel Raises',
    summary: 'Strengthens calves and ankles for steadier walking.',
    tags: ['gentle', 'travel'],
    view: 'side',
    setup: 'Stand side-on to the phone, 2 metres away, phone near the floor or at knee height so your feet are clear.',
    steps: [
      'Stand tall holding the back of a chair or a counter.',
      'Rise up onto the balls of your feet.',
      'Hold for 1 second at the top.',
      'Lower your heels slowly to the floor.',
    ],
    safety: 'Hold on to something sturdy. Stop if you feel calf cramping.',
    defaultReps: 12,
    rest: 2,
    peak: 16,
    holdSeconds: 1,
    minReturnSeconds: 0.6,
    tempoReturnCue: 'Lower your heels slowly.',
    partialCue: 'Rise a little higher onto your toes.',
    measure(points) {
      const r = measureSide(points, ['shoulder', 'hip', 'knee', 'ankle', 'heel', 'toe']);
      if (!r.ok) return { ok: false, missing: 'Stand side-on and make sure your feet are in view.' };
      return { ok: true, value: r.metrics.heelRise, metrics: r.metrics };
    },
    checks: [
      {
        id: 'straight-knees', phase: 'moving', joints: ['knee'],
        cue: 'Keep your knees straight as you rise.',
        test: (m) => m.knee < 155,
      },
      {
        id: 'stand-tall', phase: 'moving', joints: ['shoulder', 'hip'],
        cue: 'Stand tall — don\'t lean forward.',
        test: (m) => m.trunkLean > 15,
      },
    ],
  },
];

export const getExercise = (id) => EXERCISES.find((e) => e.id === id);
