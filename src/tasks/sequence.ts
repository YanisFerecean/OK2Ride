/**
 * Pattern memory (spatial span).
 *
 * Tiles light up one after another; once the pattern has played the rider
 * taps the same tiles in the same order. One wrong tile fails the test.
 */

import type { AssessmentConfig, ReducerEnv, SequenceResult, TestStage } from '../types';
import { NOOP, fail, pass, randomInt, round2, toStage, type TaskModule } from './shared';

type InputStage = Extract<TestStage, { type: 'SEQUENCE_INPUT' }>;

export function makeSequence(config: AssessmentConfig, random: () => number): number[] {
  const cells = Math.max(2, Math.round(config.sequenceGridSize)) ** 2;
  const length = Math.max(1, Math.round(config.sequenceLength));
  const out: number[] = [];
  let previous = -1;
  for (let i = 0; i < length; i++) {
    let tile = randomInt(random, 0, cells - 1);
    if (tile === previous) tile = (tile + 1) % cells;
    out.push(tile);
    previous = tile;
  }
  return out;
}

function summarize(stage: InputStage, config: AssessmentConfig, now: number, entered: readonly number[], correct: boolean, timedOut: boolean): SequenceResult {
  return {
    test: 'sequence',
    length: stage.sequence.length,
    sequence: stage.sequence,
    entered,
    correct,
    durationMs: round2(now - stage.inputStartTime),
    windowMs: config.sequenceInputWindowMs,
    timedOut,
  };
}

export const sequenceTask: TaskModule = {
  id: 'sequence',
  stageTypes: ['SEQUENCE_SHOWING', 'SEQUENCE_INPUT'],

  start: (config, env) => ({ type: 'SEQUENCE_SHOWING', sequence: makeSequence(config, env.random), step: 0, lit: true, startTime: env.now }),

  reduce(stage, action, config, env: ReducerEnv) {
    if (stage.type === 'SEQUENCE_SHOWING') {
      if (action.type !== 'ADVANCE') return NOOP;
      if (stage.lit) return toStage({ ...stage, lit: false });
      if (stage.step + 1 < stage.sequence.length) return toStage({ ...stage, step: stage.step + 1, lit: true });
      return toStage({ type: 'SEQUENCE_INPUT', sequence: stage.sequence, entered: [], startTime: stage.startTime, inputStartTime: env.now });
    }
    if (stage.type === 'SEQUENCE_INPUT') {
      if (action.type === 'SEQUENCE_TILE_TAPPED') {
        const expected = stage.sequence[stage.entered.length];
        const entered = [...stage.entered, action.tile];
        if (action.tile !== expected) return fail(summarize(stage, config, env.now, entered, false, false), 'SEQUENCE_INCORRECT');
        if (entered.length >= stage.sequence.length) return pass(summarize(stage, config, env.now, entered, true, false));
        return toStage({ ...stage, entered });
      }
      if (action.type === 'STAGE_TIMEOUT') {
        return fail(summarize(stage, config, env.now, stage.entered, false, true), 'SEQUENCE_TIMEOUT');
      }
    }
    return NOOP;
  },

  timerEffect(stage, config, now) {
    if (stage.type === 'SEQUENCE_SHOWING') {
      return { action: { type: 'ADVANCE' }, delayMs: stage.lit ? config.sequenceStepOnMs : config.sequenceStepOffMs };
    }
    if (stage.type === 'SEQUENCE_INPUT') {
      return { action: { type: 'STAGE_TIMEOUT' }, delayMs: Math.max(0, stage.inputStartTime + config.sequenceInputWindowMs - now) };
    }
    return null;
  },
};
