import { test } from 'node:test';
import assert from 'node:assert/strict';
import { angle, tiltFromVertical, riseAngle } from '../src/geometry.js';

const near = (a, b, tol = 0.5) => assert.ok(Math.abs(a - b) < tol, `${a} !~ ${b}`);

test('angle: right angle and straight line', () => {
  near(angle({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }), 90);
  near(angle({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }), 180);
  near(angle({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 }), 45);
});

test('angle: degenerate points return 0', () => {
  assert.equal(angle({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 }), 0);
});

test('tiltFromVertical is signed and 0 when upright', () => {
  near(tiltFromVertical({ x: 0, y: 0 }, { x: 0, y: 1 }), 0);
  near(tiltFromVertical({ x: 1, y: 0 }, { x: 0, y: 1 }), 45);
  near(tiltFromVertical({ x: -1, y: 0 }, { x: 0, y: 1 }), -45);
});

test('riseAngle positive when second point is higher', () => {
  near(riseAngle({ x: 1, y: 1 }, { x: 0, y: 0 }), 45);
  near(riseAngle({ x: 1, y: 0 }, { x: 0, y: 0 }), 0);
});
