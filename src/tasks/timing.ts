/**
 * Time estimation (interval production).
 *
 * A target interval is named, then nothing on screen marks it passing: the
 * rider taps when they judge that much time has gone by, timing it
 * internally. Rounds whose error exceeds the tolerance count as misses, and
 * the test fails once misses exceed the allowance.
 */

import type { AssessmentConfig, ReducerEnv, TestStage, TimingProgress, TimingResult, TimingRound } from '../types';
import { NOOP, fail, mean, pass, randomDelay, round2, toStage, type TaskModule, type TaskReduction } from './shared';

type RunningStage = Extract<TestStage, { type: 'TIMING_RUNNING' }>;

export function summarizeTiming(progress: TimingProgress, config: AssessmentConfig, now: number): TimingResult {
  const answered = progress.rounds.filter((r) => !r.timedOut);
  return {
    test: 'timing',
    rounds: progress.rounds,
    missCount: progress.rounds.filter((r) => !r.withinTolerance).length,
    toleranceMs: config.timingToleranceMs,
    meanErrorMs: mean(answered.map((r) => Math.abs(r.errorMs))),
    durationMs: round2(now - progress.startTime),
  };
}

function roundStage(progress: TimingProgress, config: AssessmentConfig, env: ReducerEnv): TestStage {
  return {
    type: 'TIMING_RUNNING',
    roundIndex: progress.rounds.length,
    targetMs: randomDelay(config.timingMinTargetMs, config.timingMaxTargetMs, env.random),
    startTime: env.now,
    progress,
  };
}

/** Records a round. `elapsedMs` is null when the round ran out with no tap. */
function record(stage: RunningStage, elapsedMs: number | null, config: AssessmentConfig): TaskReduction {
  const timedOut = elapsedMs === null;
  const errorMs = round2((elapsedMs ?? stage.targetMs + config.timingGraceMs) - stage.targetMs);
  const withinTolerance = !timedOut && Math.abs(errorMs) <= config.timingToleranceMs;
  const round: TimingRound = {
    index: stage.progress.rounds.length + 1,
    targetMs: stage.targetMs,
    elapsedMs: elapsedMs === null ? null : round2(elapsedMs),
    errorMs,
    withinTolerance,
    timedOut,
  };
  return toStage({
    type: 'TIMING_RESULT_DISPLAY',
    errorMs,
    withinTolerance,
    timedOut,
    progress: { ...stage.progress, rounds: [...stage.progress.rounds, round] },
  });
}

export const timingTask: TaskModule = {
  id: 'timing',
  stageTypes: ['TIMING_RUNNING', 'TIMING_RESULT_DISPLAY'],

  start: (config, env) => roundStage({ rounds: [], startTime: env.now }, config, env),

  reduce(stage, action, config: AssessmentConfig, env) {
    if (stage.type === 'TIMING_RUNNING') {
      if (action.type === 'TARGET_TAPPED') return record(stage, action.tapTime - stage.startTime, config);
      if (action.type === 'STAGE_TIMEOUT') return record(stage, null, config);
      return NOOP;
    }
    if (stage.type === 'TIMING_RESULT_DISPLAY') {
      if (action.type !== 'ADVANCE') return NOOP;
      if (stage.progress.rounds.length < config.timingRounds) return toStage(roundStage(stage.progress, config, env));
      const result = summarizeTiming(stage.progress, config, env.now);
      return result.missCount > config.timingMaxMisses ? fail(result, 'TIMING_OFF_TARGET') : pass(result);
    }
    return NOOP;
  },

  timerEffect(stage, config, now) {
    if (stage.type === 'TIMING_RUNNING') {
      return { action: { type: 'STAGE_TIMEOUT' }, delayMs: Math.max(0, stage.startTime + stage.targetMs + config.timingGraceMs - now) };
    }
    if (stage.type === 'TIMING_RESULT_DISPLAY') {
      return { action: { type: 'ADVANCE' }, delayMs: config.timingResultDisplayMs };
    }
    return null;
  },
};
