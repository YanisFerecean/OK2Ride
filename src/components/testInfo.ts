import type { AssessmentConfig, FailureReason, TestId } from '../types';
import { formatSeconds } from './dom';

export interface TestInfo {
  readonly name: string;
  readonly tagline: string;
  describe(config: AssessmentConfig): string;
}

export const TEST_INFO: Readonly<Record<TestId, TestInfo>> = {
  pvt: {
    name: 'Reaction',
    tagline: 'Tap the instant the panel flashes',
    describe: (c) =>
      `Wait for the panel to flash yellow, then tap it as fast as you can. Tapping early does not count. You need ${c.requiredValidTrials} clean taps in a row.`,
  },
  spatial: {
    name: 'Steering',
    tagline: 'Turn the handlebar into the zone',
    describe: (c) => `Turn the handlebar into the green zone and let go within ${formatSeconds(c.spatialWindowMs)}.`,
  },
  'go-no-go': {
    name: 'Go / Stop',
    tagline: 'Tap on GO, hold back on STOP',
    describe: (c) => `The panel will light up ${c.gngTrials} times. Tap as fast as you can when it shows green GO. Do not tap when it shows red STOP.`,
  },
  trail: {
    name: 'Number trail',
    tagline: 'Tap the numbers in order',
    describe: (c) => `Tap the numbers 1 to ${c.trailCount} in order as fast as you can. You have ${formatSeconds(c.trailWindowMs)}.`,
  },
  sequence: {
    name: 'Pattern memory',
    tagline: 'Repeat the pattern',
    describe: (c) => `Watch ${c.sequenceLength} tiles light up one after another, then tap the same tiles in the same order.`,
  },
  stroop: {
    name: 'Colour match',
    tagline: 'Tap the ink colour, not the word',
    describe: (c) => `A colour word appears written in a different colour. Tap the button matching the colour it is written in, not the word. ${c.stroopTrials} rounds.`,
  },
  timing: {
    name: 'Time sense',
    tagline: 'Tap when the interval has passed',
    describe: (c) =>
      `A target time appears, but nothing counts it down. Tap when you judge that much time has passed — within ${formatSeconds(c.timingToleranceMs)} either way. ${c.timingRounds} rounds.`,
  },
  search: {
    name: 'Odd one out',
    tagline: 'Find the symbol that differs',
    describe: (c) => `One symbol in the field is different from all the others. Find it and tap it before the round runs out. ${c.searchRounds} rounds.`,
  },
};

export const FAILURE_MESSAGES: Readonly<Record<FailureReason, string>> = {
  TOO_MANY_LAPSES: 'Too many slow reactions were detected.',
  TOO_MANY_FALSE_STARTS: 'Too many early taps were detected.',
  TIME_LIMIT_EXCEEDED: 'The check was not completed within the time limit.',
  SPATIAL_OUT_OF_TOLERANCE: 'The handlebar was released outside the target zone.',
  SPATIAL_TIMEOUT: 'The handlebar was not aligned before time ran out.',
  GO_NO_GO_COMMISSIONS: 'Too many taps on STOP signals.',
  GO_NO_GO_OMISSIONS: 'Too many GO signals were missed.',
  TRAIL_TOO_MANY_ERRORS: 'Too many numbers were tapped out of order.',
  TRAIL_TIMEOUT: 'The number trail was not finished in time.',
  SEQUENCE_INCORRECT: 'The pattern was not repeated correctly.',
  SEQUENCE_TIMEOUT: 'The pattern was not repeated in time.',
  STROOP_TOO_MANY_ERRORS: 'Too many colours were matched incorrectly.',
  TIMING_OFF_TARGET: 'Too many intervals were misjudged.',
  SEARCH_TOO_MANY_ERRORS: 'Too many wrong symbols were tapped.',
};
