import type { StageType } from '../../types';
import { evaluatedScreen } from './evaluated';
import { goNoGoScreen } from './goNoGo';
import { idleScreen } from './idle';
import { instructionScreen } from './instruction';
import { introScreen } from './intro';
import { pvtScreen } from './pvt';
import { sequenceScreen } from './sequence';
import { spatialScreen } from './spatial';
import { stroopScreen } from './stroop';
import { trailScreen } from './trail';
import type { ScreenFactory } from './types';

export type { Screen, ScreenContext, ScreenFactory } from './types';

export type ScreenKey = 'idle' | 'instruction' | 'intro' | 'pvt' | 'spatial' | 'gng' | 'trail' | 'sequence' | 'stroop' | 'evaluated';

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
  evaluated: evaluatedScreen,
};
