// Built-in routines for people without a prescription yet.
import { normalizeProgram } from './program.js';

export const PRESETS = [
  normalizeProgram({
    id: 'preset-steady',
    title: 'Steady Strength',
    note: 'Gentle full-body routine for balance and everyday strength. Keep a sturdy chair nearby.',
    perWeek: 3,
    items: [
      { ex: 'sit-to-stand', sets: 2, reps: 8, rest: 45 },
      { ex: 'march', sets: 2, reps: 16, rest: 30 },
      { ex: 'heel-raise', sets: 2, reps: 10, rest: 30 },
      { ex: 'arm-raise', sets: 2, reps: 10, rest: 30 },
    ],
  }),
  normalizeProgram({
    id: 'preset-hotel',
    title: 'Hotel Room 12',
    note: 'No equipment, small space. Undo the stiffness of flights and long days.',
    perWeek: 4,
    items: [
      { ex: 'squat', sets: 3, reps: 12, rest: 40 },
      { ex: 'bridge', sets: 2, reps: 10, rest: 30 },
      { ex: 'arm-raise', sets: 2, reps: 12, rest: 30 },
      { ex: 'heel-raise', sets: 2, reps: 15, rest: 30 },
    ],
  }),
];
