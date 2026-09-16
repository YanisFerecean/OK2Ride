/**
 * Odd one out (visual search).
 *
 * A field of identical symbols hides a single different one; the rider finds
 * it and taps it before the round runs out. A wrong tap or an expired round
 * counts as an error, and the test fails once errors exceed the allowance.
 */

import type { AssessmentConfig, ReducerEnv, SearchItem, SearchProgress, SearchResult, SearchRound, TestStage } from '../types';
import { NOOP, clamp, fail, mean, pass, randomInt, range, round2, shuffle, toStage, type TaskModule, type TaskReduction } from './shared';

type ActiveStage = Extract<TestStage, { type: 'SEARCH_ACTIVE' }>;

/** Confusable letter pairs: one member fills the field, the other hides in it. */
export const SEARCH_PAIRS: readonly (readonly [string, string])[] = [
  ['T', 'L'],
  ['O', 'Q'],
  ['M', 'W'],
  ['E', 'F'],
  ['N', 'Z'],
];

export interface SearchField {
  readonly items: readonly SearchItem[];
  readonly targetGlyph: string;
  readonly distractorGlyph: string;
}

/** Scatters one target among distractors over distinct grid cells, with jitter. */
export function makeSearchField(config: AssessmentConfig, random: () => number): SearchField {
  const pair = SEARCH_PAIRS[randomInt(random, 0, SEARCH_PAIRS.length - 1)] ?? (['T', 'L'] as const);
  const flip = random() < 0.5;
  const distractorGlyph = flip ? pair[1] : pair[0];
  const targetGlyph = flip ? pair[0] : pair[1];

  const grid = Math.max(2, Math.round(config.searchGridSize));
  const count = Math.max(2, Math.min(Math.round(config.searchItemCount), grid * grid));
  const cells = shuffle(range(0, grid * grid), random).slice(0, count);
  const targetSlot = randomInt(random, 0, count - 1);
  const cellPct = 100 / grid;

  const items = cells.map((cell, i): SearchItem => {
    const col = cell % grid;
    const row = Math.floor(cell / grid);
    const jx = (random() - 0.5) * cellPct * 0.35;
    const jy = (random() - 0.5) * cellPct * 0.35;
    const isTarget = i === targetSlot;
    return {
      index: i,
      glyph: isTarget ? targetGlyph : distractorGlyph,
      x: round2(clamp((col + 0.5) * cellPct + jx, 10, 90)),
      y: round2(clamp((row + 0.5) * cellPct + jy, 10, 90)),
      isTarget,
    };
  });

  return { items, targetGlyph, distractorGlyph };
}

export function summarizeSearch(progress: SearchProgress, now: number): SearchResult {
  const found = progress.rounds.filter((r) => r.correct && r.rtMs !== null);
  const correctCount = progress.rounds.filter((r) => r.correct).length;
  return {
    test: 'search',
    rounds: progress.rounds,
    correctCount,
    errorCount: progress.rounds.length - correctCount,
    meanRtMs: mean(found.map((r) => r.rtMs ?? 0)),
    durationMs: round2(now - progress.startTime),
  };
}

function roundStage(progress: SearchProgress, config: AssessmentConfig, env: ReducerEnv): TestStage {
  const field = makeSearchField(config, env.random);
  return {
    type: 'SEARCH_ACTIVE',
    roundIndex: progress.rounds.length,
    items: field.items,
    targetGlyph: field.targetGlyph,
    distractorGlyph: field.distractorGlyph,
    startTime: env.now,
    progress,
  };
}

function record(stage: ActiveStage, correct: boolean, rtMs: number | null, timedOut: boolean): TaskReduction {
  const round: SearchRound = { index: stage.progress.rounds.length + 1, rtMs: rtMs === null ? null : round2(rtMs), correct, timedOut };
  return toStage({
    type: 'SEARCH_RESULT_DISPLAY',
    correct,
    rtMs: round.rtMs,
    timedOut,
    progress: { ...stage.progress, rounds: [...stage.progress.rounds, round] },
  });
}

export const searchTask: TaskModule = {
  id: 'search',
  stageTypes: ['SEARCH_ACTIVE', 'SEARCH_RESULT_DISPLAY'],

  start: (config, env) => roundStage({ rounds: [], startTime: env.now }, config, env),

  reduce(stage, action, config: AssessmentConfig, env) {
    if (stage.type === 'SEARCH_ACTIVE') {
      if (action.type === 'SEARCH_TAPPED') {
        const item = stage.items[action.index];
        if (!item) return NOOP;
        return record(stage, item.isTarget, action.tapTime - stage.startTime, false);
      }
      if (action.type === 'STAGE_TIMEOUT') return record(stage, false, null, true);
      return NOOP;
    }
    if (stage.type === 'SEARCH_RESULT_DISPLAY') {
      if (action.type !== 'ADVANCE') return NOOP;
      if (stage.progress.rounds.length < config.searchRounds) return toStage(roundStage(stage.progress, config, env));
      const result = summarizeSearch(stage.progress, env.now);
      return result.errorCount > config.searchMaxErrors ? fail(result, 'SEARCH_TOO_MANY_ERRORS') : pass(result);
    }
    return NOOP;
  },

  timerEffect(stage, config, now) {
    if (stage.type === 'SEARCH_ACTIVE') {
      return { action: { type: 'STAGE_TIMEOUT' }, delayMs: Math.max(0, stage.startTime + config.searchRoundTimeoutMs - now) };
    }
    if (stage.type === 'SEARCH_RESULT_DISPLAY') {
      return { action: { type: 'ADVANCE' }, delayMs: config.searchResultDisplayMs };
    }
    return null;
  },
};
