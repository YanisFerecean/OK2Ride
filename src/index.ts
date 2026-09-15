/**
 * Public entry point. Importing this module registers `<cognitive-captcha>`
 * (once) and re-exports the engine so hosts can type their event handlers,
 * replay assessments, or validate tokens.
 *
 * Browser-only: the element class extends `HTMLElement`, so import it from
 * client-side code (or behind a `typeof window !== 'undefined'` guard).
 */

import { CognitiveCaptcha, TAG_NAME } from './components/CognitiveCaptcha';
import type { CognitiveCaptchaEventMap } from './components/CognitiveCaptcha';

export { CognitiveCaptcha, TAG_NAME };
export type { CognitiveCaptchaEventMap, StageChangeDetail } from './components/CognitiveCaptcha';
export * from './types';
export { BASE_CONFIG, DEFAULT_DIFFICULTY, DIFFICULTY_PRESETS, LIMITS, isDifficulty, parseStagePool, resolveConfig } from './config';
export type { ConfigInput } from './config';
export {
  buildResult,
  classifyReaction,
  collectReactionTimes,
  createInitialState,
  currentTest,
  isInProgress,
  newSessionId,
  pickTargetAngle,
  reduce,
  selectPlan,
  timerEffectFor,
} from './stateMachine';
export { TASKS, taskForStage } from './tasks';
export type { TaskModule, TaskReduction } from './tasks';
export { TEST_INFO, FAILURE_MESSAGES } from './components/testInfo';
export { buildVerificationToken, decodeVerificationToken, fnv1a64, TOKEN_PREFIX } from './token';
export type { TokenClaims } from './token';

/** Registers the element under `tagName` if nothing is registered there yet. */
export function defineCognitiveCaptcha(tagName: string = TAG_NAME): void {
  if (typeof customElements === 'undefined') return;
  if (!customElements.get(tagName)) customElements.define(tagName, CognitiveCaptcha);
}

defineCognitiveCaptcha();

declare global {
  interface HTMLElementTagNameMap {
    'cognitive-captcha': CognitiveCaptcha;
  }
  interface HTMLElementEventMap {
    'capability-passed': CognitiveCaptchaEventMap['capability-passed'];
    'capability-failed': CognitiveCaptchaEventMap['capability-failed'];
    'stage-change': CognitiveCaptchaEventMap['stage-change'];
  }
}
