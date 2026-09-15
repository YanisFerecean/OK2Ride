/**
 * Contract every test module implements, plus small pure helpers.
 *
 * A task module owns a set of stage types. The core reducer forwards actions
 * for those stages to the module and interprets the returned `TaskReduction`:
 * stay put, move to another stage of the same test, or finish the test with a
 * result. Modules never touch `MachineState`, timers or the DOM.
 */

import type { Action, AssessmentConfig, FailureReason, ReducerEnv, StageType, TestId, TestResult, TestStage, TimerEffect } from '../types';

export type TaskReduction =
  | { readonly kind: 'noop' }
  | { readonly kind: 'stage'; readonly stage: TestStage }
  | { readonly kind: 'done'; readonly result: TestResult; readonly passed: boolean; readonly failureReason: FailureReason | null };

export const NOOP: TaskReduction = { kind: 'noop' };

export function toStage(stage: TestStage): TaskReduction {
  return { kind: 'stage', stage };
}

export function pass(result: TestResult): TaskReduction {
  return { kind: 'done', result, passed: true, failureReason: null };
}

export function fail(result: TestResult, failureReason: FailureReason): TaskReduction {
  return { kind: 'done', result, passed: false, failureReason };
}

export interface TaskModule {
  readonly id: TestId;
  readonly stageTypes: readonly StageType[];
  /** Initial stage when the test begins. */
  start(config: AssessmentConfig, env: ReducerEnv): TestStage;
  /** Handles an action while one of `stageTypes` is active. */
  reduce(stage: TestStage, action: Action, config: AssessmentConfig, env: ReducerEnv): TaskReduction;
  /** Timer the host must arm for the given stage, if any. */
  timerEffect(stage: TestStage, config: AssessmentConfig, now: number): TimerEffect | null;
}

/* --- numeric helpers -------------------------------------------------------- */

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function mean(values: readonly number[]): number | null {
  return values.length ? round2(values.reduce((a, b) => a + b, 0) / values.length) : null;
}

export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const hi = sorted[mid] ?? 0;
  const lo = sorted[mid - 1] ?? hi;
  return round2(sorted.length % 2 === 0 ? (lo + hi) / 2 : hi);
}

export function min(values: readonly number[]): number | null {
  return values.length ? Math.min(...values) : null;
}

export function max(values: readonly number[]): number | null {
  return values.length ? Math.max(...values) : null;
}

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/* --- random helpers --------------------------------------------------------- */

export function range(start: number, endExclusive: number): number[] {
  const out: number[] = [];
  for (let i = start; i < endExclusive; i++) out.push(i);
  return out;
}

/** Fisher–Yates shuffle (from the end), driven by the injected random source. */
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }
  return out;
}

export function randomInt(random: () => number, lo: number, hiInclusive: number): number {
  return lo + Math.floor(random() * (hiInclusive - lo + 1));
}

export function randomDelay(minMs: number, maxMs: number, random: () => number): number {
  return Math.round(minMs + random() * (maxMs - minMs));
}

export function remainingMs(startTime: number, windowMs: number, now: number): number {
  return Math.max(0, startTime + windowMs - now);
}
