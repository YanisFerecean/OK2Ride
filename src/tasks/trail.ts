/**
 * Number trail (Trail Making Test, part A).
 *
 * Numbers 1..N are scattered over a board; the rider taps them in ascending
 * order within the window. Wrong taps count as errors; taps on numbers
 * already collected are ignored.
 */

import type { AssessmentConfig, ReducerEnv, TestStage, TrailResult, TrailTarget } from '../types';
import { NOOP, clamp, fail, pass, range, round2, shuffle, toStage, type TaskModule } from './shared';

type TrailStage = Extract<TestStage, { type: 'TRAIL_ACTIVE' }>;

/** Places targets on distinct grid cells with a little jitter, as board percentages. */
export function placeTrailTargets(config: AssessmentConfig, random: () => number): TrailTarget[] {
  const grid = Math.max(2, Math.round(config.trailGridSize));
  const count = Math.max(1, Math.min(Math.round(config.trailCount), grid * grid));
  const cells = shuffle(range(0, grid * grid), random).slice(0, count);
  const cellPct = 100 / grid;
  return cells.map((cell, i) => {
    const col = cell % grid;
    const row = Math.floor(cell / grid);
    const jx = (random() - 0.5) * cellPct * 0.4;
    const jy = (random() - 0.5) * cellPct * 0.4;
    return {
      value: i + 1,
      x: round2(clamp((col + 0.5) * cellPct + jx, 10, 90)),
      y: round2(clamp((row + 0.5) * cellPct + jy, 10, 90)),
    };
  });
}

function summarize(stage: TrailStage, config: AssessmentConfig, now: number, reached: number, timedOut: boolean): TrailResult {
  return {
    test: 'trail',
    count: stage.targets.length,
    reached,
    errorCount: stage.errors,
    durationMs: round2(now - stage.startTime),
    windowMs: config.trailWindowMs,
    completed: reached >= stage.targets.length,
    timedOut,
  };
}

export const trailTask: TaskModule = {
  id: 'trail',
  stageTypes: ['TRAIL_ACTIVE'],

  start: (config, env) => ({ type: 'TRAIL_ACTIVE', startTime: env.now, targets: placeTrailTargets(config, env.random), nextValue: 1, errors: 0, lastErrorAt: null }),

  reduce(stage, action, config, env: ReducerEnv) {
    if (stage.type !== 'TRAIL_ACTIVE') return NOOP;
    if (action.type === 'TRAIL_TAPPED') {
      if (action.value < stage.nextValue || action.value > stage.targets.length) return NOOP;
      if (action.value === stage.nextValue) {
        const nextValue = stage.nextValue + 1;
        if (nextValue > stage.targets.length) return pass(summarize(stage, config, env.now, stage.targets.length, false));
        return toStage({ ...stage, nextValue });
      }
      const errors = stage.errors + 1;
      const next: TrailStage = { ...stage, errors, lastErrorAt: env.now };
      if (errors > config.trailMaxErrors) return fail(summarize(next, config, env.now, stage.nextValue - 1, false), 'TRAIL_TOO_MANY_ERRORS');
      return toStage(next);
    }
    if (action.type === 'STAGE_TIMEOUT') {
      return fail(summarize(stage, config, env.now, stage.nextValue - 1, true), 'TRAIL_TIMEOUT');
    }
    return NOOP;
  },

  timerEffect(stage, config, now) {
    if (stage.type !== 'TRAIL_ACTIVE') return null;
    return { action: { type: 'STAGE_TIMEOUT' }, delayMs: Math.max(0, stage.startTime + config.trailWindowMs - now) };
  },
};
