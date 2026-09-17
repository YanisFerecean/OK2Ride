/**
 * Public entry point. Importing this module registers `<ok2ride-check>`
 * (once) and re-exports the engine so hosts can type their event handlers,
 * replay assessments, or validate tokens.
 *
 * Browser-only: the element class extends `HTMLElement`, so import it from
 * client-side code (or behind a `typeof window !== 'undefined'` guard).
 */

import { OK2Ride, TAG_NAME } from './components/OK2Ride';
import type { OK2RideEventMap } from './components/OK2Ride';

export { OK2Ride, TAG_NAME };
export type { OK2RideEventMap, StageChangeDetail } from './components/OK2Ride';
export * from './types';
export { BASE_CONFIG, DEFAULT_DIFFICULTY, DEFAULT_HUMAN_CHECK, DIFFICULTY_PRESETS, LIMITS, isDifficulty, isHumanCheckMode, parseStagePool, resolveConfig } from './config';
export type { ConfigInput } from './config';
export {
  buildResult,
  classifyReaction,
  collectReactionTimes,
  createInitialState,
  currentTest,
  humanityOf,
  isInProgress,
  newSessionId,
  pickTargetAngle,
  reduce,
  selectPlan,
  timerEffectFor,
} from './stateMachine';
export { HUMANITY_LIMITS, HUMANITY_WEIGHTS, MAX_INPUT_SAMPLES, assessHumanity, humanCheckFailed, recordInput, responseLatencies } from './humanity';
export { TASKS, taskForStage } from './tasks';
export type { TaskModule, TaskReduction } from './tasks';
export { TEST_INFO, FAILURE_MESSAGES, testInfoFor, failureMessagesFor } from './components/testInfo';
export type { TestInfo } from './components/testInfo';
export { EN, DE, LOCALES, DEFAULT_STRINGS, resolveStrings } from './components/i18n';
export type { Strings, TestStrings } from './components/i18n';
export { automationDetected } from './components/input';
export type { InputMonitor, InputMonitorOptions, StageSnapshot } from './components/input';
export { buildVerificationToken, decodeVerificationToken, fnv1a64, TOKEN_PREFIX } from './token';
export type { TokenClaims } from './token';

/** Registers the element under `tagName` if nothing is registered there yet. */
export function defineOK2Ride(tagName: string = TAG_NAME): void {
  if (typeof customElements === 'undefined') return;
  if (!customElements.get(tagName)) customElements.define(tagName, OK2Ride);
}

defineOK2Ride();

declare global {
  interface HTMLElementTagNameMap {
    'ok2ride-check': OK2Ride;
  }
  interface HTMLElementEventMap {
    'capability-passed': OK2RideEventMap['capability-passed'];
    'capability-failed': OK2RideEventMap['capability-failed'];
    'stage-change': OK2RideEventMap['stage-change'];
  }
}
