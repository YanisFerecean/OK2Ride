/**
 * Go / No-Go response inhibition.
 *
 * A series of signals appears after short random foreperiods. GO must be
 * tapped quickly; STOP must be left alone. Taps on STOP and anticipations are
 * commission errors, missed GOs are omissions. The first signal is always GO.
 */

import type { AssessmentConfig, GoNoGoOutcome, GoNoGoProgress, GoNoGoResult, GoNoGoTrial, ReducerEnv, TestStage } from '../types';
import { NOOP, fail, mean, pass, randomDelay, range, round2, shuffle, toStage, type TaskModule, type TaskReduction } from './shared';

export function makeGoNoGoSchedule(config: AssessmentConfig, random: () => number): boolean[] {
  const n = Math.max(1, Math.round(config.gngTrials));
  const k = Math.max(0, Math.min(Math.round(config.gngNoGoCount), n - 1));
  const stopIndices = new Set(shuffle(range(1, n), random).slice(0, k));
  return range(0, n).map((i) => !stopIndices.has(i));
}

export function summarizeGoNoGo(progress: GoNoGoProgress, now: number): GoNoGoResult {
  const hits = progress.trials.filter((t) => t.outcome === 'HIT');
  const count = (outcome: GoNoGoOutcome): number => progress.trials.filter((t) => t.outcome === outcome).length;
  return {
    test: 'go-no-go',
    trials: progress.trials,
    hitCount: hits.length,
    commissionCount: count('COMMISSION') + count('FALSE_START'),
    omissionCount: count('OMISSION'),
    meanRtMs: mean(hits.map((t) => t.rtMs ?? 0)),
    durationMs: round2(now - progress.startTime),
  };
}

function schedule(progress: GoNoGoProgress, config: AssessmentConfig, env: ReducerEnv): TestStage {
  const trialIndex = progress.trials.length;
  const delayMs = randomDelay(config.gngMinDelayMs, config.gngMaxDelayMs, env.random);
  return { type: 'GNG_AWAITING', trialIndex, isGo: progress.schedule[trialIndex] ?? true, stimulusTime: env.now + delayMs, delayMs, progress };
}

function record(progress: GoNoGoProgress, isGo: boolean, outcome: GoNoGoOutcome, rtMs: number | null): TaskReduction {
  const trial: GoNoGoTrial = { index: progress.trials.length + 1, isGo, outcome, rtMs: rtMs === null ? null : round2(rtMs) };
  return toStage({ type: 'GNG_RESULT_DISPLAY', outcome, rtMs: trial.rtMs, progress: { ...progress, trials: [...progress.trials, trial] } });
}

function advance(progress: GoNoGoProgress, config: AssessmentConfig, env: ReducerEnv): TaskReduction {
  if (progress.trials.length < progress.schedule.length) return toStage(schedule(progress, config, env));
  const result = summarizeGoNoGo(progress, env.now);
  if (result.commissionCount > config.gngMaxCommissions) return fail(result, 'GO_NO_GO_COMMISSIONS');
  if (result.omissionCount > config.gngMaxOmissions) return fail(result, 'GO_NO_GO_OMISSIONS');
  return pass(result);
}

export const goNoGoTask: TaskModule = {
  id: 'go-no-go',
  stageTypes: ['GNG_AWAITING', 'GNG_STIMULUS_ACTIVE', 'GNG_RESULT_DISPLAY'],

  start: (config, env) => schedule({ trials: [], schedule: makeGoNoGoSchedule(config, env.random), startTime: env.now }, config, env),

  reduce(stage, action, config, env) {
    switch (stage.type) {
      case 'GNG_AWAITING':
        if (action.type === 'TRIGGER_STIMULUS') {
          return toStage({ type: 'GNG_STIMULUS_ACTIVE', trialIndex: stage.trialIndex, isGo: stage.isGo, startTime: env.now, progress: stage.progress });
        }
        if (action.type === 'TARGET_TAPPED') {
          return record(stage.progress, stage.isGo, 'FALSE_START', action.tapTime - stage.stimulusTime);
        }
        return NOOP;
      case 'GNG_STIMULUS_ACTIVE':
        if (action.type === 'TARGET_TAPPED') {
          const rtMs = action.tapTime - stage.startTime;
          if (rtMs < config.falseStartThresholdMs) return record(stage.progress, stage.isGo, 'FALSE_START', rtMs);
          return record(stage.progress, stage.isGo, stage.isGo ? 'HIT' : 'COMMISSION', rtMs);
        }
        if (action.type === 'STIMULUS_TIMEOUT') {
          return record(stage.progress, stage.isGo, stage.isGo ? 'OMISSION' : 'CORRECT_REJECTION', null);
        }
        return NOOP;
      case 'GNG_RESULT_DISPLAY':
        return action.type === 'ADVANCE' ? advance(stage.progress, config, env) : NOOP;
      default:
        return NOOP;
    }
  },

  timerEffect(stage, config, now) {
    switch (stage.type) {
      case 'GNG_AWAITING':
        return { action: { type: 'TRIGGER_STIMULUS' }, delayMs: Math.max(0, stage.stimulusTime - now) };
      case 'GNG_STIMULUS_ACTIVE':
        return { action: { type: 'STIMULUS_TIMEOUT' }, delayMs: Math.max(0, stage.startTime + config.gngResponseWindowMs - now) };
      case 'GNG_RESULT_DISPLAY':
        return { action: { type: 'ADVANCE' }, delayMs: config.gngResultDisplayMs };
      default:
        return null;
    }
  },
};
