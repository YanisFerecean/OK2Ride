import type { StageType } from '../../types';
import { evaluatedScreen } from './evaluated';
import { goNoGoScreen } from './goNoGo';
import { idleScreen } from './idle';
import { instructionScreen } from './instruction';
import { introScreen } from './intro';
import { pvtScreen } from './pvt';
import { searchScreen } from './search';
import { sequenceScreen } from './sequence';
import { spatialScreen } from './spatial';
import { stroopScreen } from './stroop';
import { timingScreen } from './timing';
import { trailScreen } from './trail';
import type { ScreenFactory } from './types';

export type { Screen, ScreenContext, ScreenFactory } from './types';

export type ScreenKey = 'idle' | 'instruction' | 'intro' | 'pvt' | 'spatial' | 'gng' | 'trail' | 'sequence' | 'stroop' | 'timing' | 'search' | 'evaluated';

export const SCREEN_FOR_STAGE: Readonly<Record<StageType, ScreenKey>> = {
  IDLE: 'idle',
  INSTRUCTION: 'instruction',
  TEST_INTRO: 'intro',
  PVT_AWAITING_STIMULUS: 'pvt',
  PVT_STIMULUS_ACTIVE: 'pvt',
  PVT_RESULT_DISPLAY: 'pvt',
  SPATIAL_MATCHING: 'spatial',
  GNG_AWAITING: 'gng',
  GNG_STIMULUS_ACTIVE: 'gng',
  GNG_RESULT_DISPLAY: 'gng',
  TRAIL_ACTIVE: 'trail',
  SEQUENCE_SHOWING: 'sequence',
  SEQUENCE_INPUT: 'sequence',
  STROOP_TRIAL: 'stroop',
  STROOP_RESULT_DISPLAY: 'stroop',
  TIMING_RUNNING: 'timing',
  TIMING_RESULT_DISPLAY: 'timing',
  SEARCH_ACTIVE: 'search',
  SEARCH_RESULT_DISPLAY: 'search',
  EVALUATED: 'evaluated',
};

export const SCREEN_FACTORIES: Readonly<Record<ScreenKey, ScreenFactory>> = {
  idle: idleScreen,
  instruction: instructionScreen,
  intro: introScreen,
  pvt: pvtScreen,
  spatial: spatialScreen,
  gng: goNoGoScreen,
  trail: trailScreen,
  sequence: sequenceScreen,
  stroop: stroopScreen,
  timing: timingScreen,
  search: searchScreen,
  evaluated: evaluatedScreen,
};
