/**
 * Colour match (Stroop interference).
 *
 * A colour word is shown in a (usually different) ink colour. The rider taps
 * the button matching the ink, ignoring the word. Passes when errors stay
 * within the allowance; an unanswered trial counts as an error.
 */

import type { AssessmentConfig, ReducerEnv, StroopColor, StroopProgress, StroopResult, StroopTrial, TestStage } from '../types';
import { STROOP_COLORS } from '../types';
import { NOOP, fail, mean, pass, randomInt, round2, toStage, type TaskModule, type TaskReduction } from './shared';

const CONGRUENT_SHARE = 0.2;

export function makeStroopTrial(random: () => number): { word: StroopColor; ink: StroopColor; congruent: boolean } {
  const word = STROOP_COLORS[randomInt(random, 0, STROOP_COLORS.length - 1)] ?? 'red';
  if (random() < CONGRUENT_SHARE) return { word, ink: word, congruent: true };
  const others = STROOP_COLORS.filter((c) => c !== word);
  const ink = others[randomInt(random, 0, others.length - 1)] ?? word;
  return { word, ink, congruent: false };
}

export function summarizeStroop(progress: StroopProgress, now: number): StroopResult {
  const answered = progress.trials.filter((t) => t.rtMs !== null && t.correct);
  const correctCount = progress.trials.filter((t) => t.correct).length;
  return {
    test: 'stroop',
    trials: progress.trials,
    correctCount,
    errorCount: progress.trials.length - correctCount,
    meanRtMs: mean(answered.map((t) => t.rtMs ?? 0)),
    durationMs: round2(now - progress.startTime),
  };
}

function trialStage(progress: StroopProgress, env: ReducerEnv): TestStage {
  const { word, ink, congruent } = makeStroopTrial(env.random);
  return { type: 'STROOP_TRIAL', trialIndex: progress.trials.length, word, ink, congruent, startTime: env.now, progress };
}

function record(stage: Extract<TestStage, { type: 'STROOP_TRIAL' }>, answer: StroopColor | null, rtMs: number | null): TaskReduction {
  const correct = answer !== null && answer === stage.ink;
  const trial: StroopTrial = {
    index: stage.progress.trials.length + 1,
    word: stage.word,
    ink: stage.ink,
    congruent: stage.congruent,
    answer,
    correct,
    rtMs: rtMs === null ? null : round2(rtMs),
  };
  return toStage({ type: 'STROOP_RESULT_DISPLAY', correct, rtMs: trial.rtMs, progress: { ...stage.progress, trials: [...stage.progress.trials, trial] } });
}

export const stroopTask: TaskModule = {
  id: 'stroop',
  stageTypes: ['STROOP_TRIAL', 'STROOP_RESULT_DISPLAY'],

  start: (_config, env) => trialStage({ trials: [], startTime: env.now }, env),

  reduce(stage, action, config: AssessmentConfig, env) {
    if (stage.type === 'STROOP_TRIAL') {
      if (action.type === 'STROOP_ANSWERED') return record(stage, action.color, action.tapTime - stage.startTime);
      if (action.type === 'STAGE_TIMEOUT') return record(stage, null, null);
      return NOOP;
    }
    if (stage.type === 'STROOP_RESULT_DISPLAY') {
      if (action.type !== 'ADVANCE') return NOOP;
      if (stage.progress.trials.length < config.stroopTrials) return toStage(trialStage(stage.progress, env));
      const result = summarizeStroop(stage.progress, env.now);
      return result.errorCount > config.stroopMaxErrors ? fail(result, 'STROOP_TOO_MANY_ERRORS') : pass(result);
    }
    return NOOP;
  },

  timerEffect(stage, config, now) {
    if (stage.type === 'STROOP_TRIAL') {
      return { action: { type: 'STAGE_TIMEOUT' }, delayMs: Math.max(0, stage.startTime + config.stroopTrialTimeoutMs - now) };
    }
    if (stage.type === 'STROOP_RESULT_DISPLAY') {
      return { action: { type: 'ADVANCE' }, delayMs: config.stroopResultDisplayMs };
    }
    return null;
  },
};
