/**
 * Psychomotor Vigilance Task (PVT-B).
 *
 * After a random foreperiod the panel flashes; the rider taps as fast as
 * possible. <100 ms is an anticipation (false start), >450 ms a lapse. The
 * test passes after `requiredValidTrials` consecutive valid taps and fails
 * once lapses or false starts exceed their allowances.
 */

import type { AssessmentConfig, PvtProgress, PvtResult, PvtTrial, ReducerEnv, TestStage, TrialOutcome } from '../types';
import { NOOP, fail, max, mean, median, min, pass, randomDelay, round2, toStage, type TaskModule, type TaskReduction } from './shared';

/** PVT-B classification of a reaction time measured from stimulus onset. */
export function classifyReaction(rtMs: number, config: AssessmentConfig): TrialOutcome {
  if (rtMs < config.falseStartThresholdMs) return 'FALSE_START';
  if (rtMs > config.lapseThresholdMs) return 'LAPSE';
  return 'VALID';
}

export function pvtCounts(trials: readonly PvtTrial[]): { valid: number; lapses: number; falseStarts: number } {
  let valid = 0;
  let lapses = 0;
  let falseStarts = 0;
  for (const t of trials) {
    if (t.outcome === 'VALID') valid++;
    else if (t.outcome === 'LAPSE') lapses++;
    else falseStarts++;
  }
  return { valid, lapses, falseStarts };
}

/** RTs that carry information: responded trials, excluding anticipations and timeouts. */
export function pvtReactionTimes(trials: readonly PvtTrial[]): number[] {
  return trials.filter((t) => t.outcome !== 'FALSE_START' && !t.timedOut).map((t) => t.rtMs);
}

export function summarizePvt(progress: PvtProgress, now: number): PvtResult {
  const rts = pvtReactionTimes(progress.trials);
  const counts = pvtCounts(progress.trials);
  return {
    test: 'pvt',
    trials: progress.trials,
    validTrialCount: counts.valid,
    lapseCount: counts.lapses,
    falseStartCount: counts.falseStarts,
    meanRtMs: mean(rts),
    medianRtMs: median(rts),
    fastestRtMs: min(rts),
    slowestRtMs: max(rts),
    durationMs: round2(now - progress.startTime),
  };
}

function schedule(progress: PvtProgress, config: AssessmentConfig, env: ReducerEnv): TestStage {
  const delayMs = randomDelay(config.minDelayMs, config.maxDelayMs, env.random);
  return { type: 'PVT_AWAITING_STIMULUS', stimulusTime: env.now + delayMs, delayMs, progress };
}

function record(progress: PvtProgress, delayMs: number, rtMs: number, outcome: TrialOutcome, timedOut: boolean): TaskReduction {
  const trial: PvtTrial = { index: progress.trials.length + 1, delayMs, rtMs: round2(rtMs), outcome, timedOut };
  const next: PvtProgress = {
    ...progress,
    trials: [...progress.trials, trial],
    consecutiveValid: outcome === 'VALID' ? progress.consecutiveValid + 1 : 0,
  };
  return toStage({ type: 'PVT_RESULT_DISPLAY', rtMs: trial.rtMs, isLapse: outcome === 'LAPSE', outcome, progress: next });
}

function advance(progress: PvtProgress, config: AssessmentConfig, env: ReducerEnv): TaskReduction {
  const counts = pvtCounts(progress.trials);
  if (counts.lapses > config.maxLapses) return fail(summarizePvt(progress, env.now), 'TOO_MANY_LAPSES');
  if (counts.falseStarts > config.maxFalseStarts) return fail(summarizePvt(progress, env.now), 'TOO_MANY_FALSE_STARTS');
  if (progress.consecutiveValid >= config.requiredValidTrials) return pass(summarizePvt(progress, env.now));
  return toStage(schedule(progress, config, env));
}

export const pvtTask: TaskModule = {
  id: 'pvt',
  stageTypes: ['PVT_AWAITING_STIMULUS', 'PVT_STIMULUS_ACTIVE', 'PVT_RESULT_DISPLAY'],

  start: (config, env) => schedule({ trials: [], consecutiveValid: 0, startTime: env.now }, config, env),

  reduce(stage, action, config, env) {
    switch (stage.type) {
      case 'PVT_AWAITING_STIMULUS':
        if (action.type === 'TRIGGER_STIMULUS') {
          return toStage({ type: 'PVT_STIMULUS_ACTIVE', startTime: env.now, delayMs: stage.delayMs, progress: stage.progress });
        }
        if (action.type === 'TARGET_TAPPED') {
          return record(stage.progress, stage.delayMs, action.tapTime - stage.stimulusTime, 'FALSE_START', false);
        }
        return NOOP;
      case 'PVT_STIMULUS_ACTIVE':
        if (action.type === 'TARGET_TAPPED') {
          const rtMs = action.tapTime - stage.startTime;
          return record(stage.progress, stage.delayMs, rtMs, classifyReaction(rtMs, config), false);
        }
        if (action.type === 'STIMULUS_TIMEOUT') {
          return record(stage.progress, stage.delayMs, config.stimulusTimeoutMs, 'LAPSE', true);
        }
        return NOOP;
      case 'PVT_RESULT_DISPLAY':
        return action.type === 'ADVANCE' ? advance(stage.progress, config, env) : NOOP;
      default:
        return NOOP;
    }
  },

  timerEffect(stage, config, now) {
    switch (stage.type) {
      case 'PVT_AWAITING_STIMULUS':
        return { action: { type: 'TRIGGER_STIMULUS' }, delayMs: Math.max(0, stage.stimulusTime - now) };
      case 'PVT_STIMULUS_ACTIVE':
        return { action: { type: 'STIMULUS_TIMEOUT' }, delayMs: Math.max(0, stage.startTime + config.stimulusTimeoutMs - now) };
      case 'PVT_RESULT_DISPLAY':
        return { action: { type: 'ADVANCE' }, delayMs: config.resultDisplayMs };
      default:
        return null;
    }
  },
};
