/**
 * Deterministic finite state machine for the cognitive assessment.
 *
 * `reduce()` is a pure function: given the current state, an action and an
 * environment (`now`, `epochMs`, `random`) it returns the next state. It never
 * touches timers or the DOM. Timing side effects are described by
 * `timerEffectFor()` so the host can arm exactly one timer per stage.
 *
 * The core handles the run lifecycle (idle → instructions → per-test intro →
 * test → … → evaluated) and delegates test-specific transitions to the task
 * modules in `tasks/`. Unhandled (stage, action) pairs return the *same* state
 * reference, which lets hosts cheaply ignore stale timer callbacks.
 */

import type {
  Action,
  AssessmentConfig,
  AssessmentResult,
  FailureReason,
  MachineState,
  PvtResult,
  ReducerEnv,
  SpatialResult,
  TestId,
  TestResult,
  TestStage,
  TimerEffect,
} from './types';
import { TEST_IDS } from './types';
import { TASKS, taskForStage } from './tasks';
import { max, mean, median, min, round2, shuffle } from './tasks/shared';
import { pvtReactionTimes } from './tasks/pvt';
import { buildVerificationToken } from './token';

export type { ReducerEnv } from './types';
export { classifyReaction } from './tasks/pvt';
export { pickTargetAngle } from './tasks/spatial';

/* ------------------------------------------------------------------------ */
/* Construction                                                              */
/* ------------------------------------------------------------------------ */

/** 128-bit hex session identifier drawn from the supplied random source. */
export function newSessionId(random: () => number): string {
  let id = '';
  for (let i = 0; i < 16; i++) {
    id += Math.floor(random() * 256)
      .toString(16)
      .padStart(2, '0');
  }
  return id;
}

export function createInitialState(config: AssessmentConfig, sessionId: string, nonce: string | null = null): MachineState {
  return {
    stage: { type: 'IDLE' },
    config,
    sessionId,
    nonce,
    assessmentStartTime: null,
    plan: [],
    planIndex: 0,
    results: [],
  };
}

/** Draws `stageCount` distinct tests from the pool, in random order. */
export function selectPlan(config: AssessmentConfig, random: () => number): TestId[] {
  const pool = config.stagePool.length ? config.stagePool : TEST_IDS;
  const count = Math.max(1, Math.min(config.stageCount, pool.length));
  return shuffle(pool, random).slice(0, count);
}

/* ------------------------------------------------------------------------ */
/* Queries                                                                   */
/* ------------------------------------------------------------------------ */

/** True while a run is underway (between instructions and evaluation). */
export function isInProgress(stage: TestStage): boolean {
  return stage.type !== 'IDLE' && stage.type !== 'INSTRUCTION' && stage.type !== 'EVALUATED';
}

/** The test currently being introduced or run, if any. */
export function currentTest(state: MachineState): TestId | null {
  if (state.stage.type === 'TEST_INTRO') return state.stage.test;
  return taskForStage(state.stage)?.id ?? null;
}

/**
 * Describes the single timer the host must arm for the current stage, with
 * the remaining delay computed relative to `now`. `null` for stages that
 * wait on the user alone.
 */
export function timerEffectFor(state: MachineState, now: number): TimerEffect | null {
  return taskForStage(state.stage)?.timerEffect(state.stage, state.config, now) ?? null;
}

/* ------------------------------------------------------------------------ */
/* Reducer                                                                   */
/* ------------------------------------------------------------------------ */

export function reduce(state: MachineState, action: Action, env: ReducerEnv): MachineState {
  if (action.type === 'RESET_TEST') {
    return createInitialState(action.config ?? state.config, newSessionId(env.random), action.nonce === undefined ? state.nonce : action.nonce);
  }
  if (action.type === 'TIME_LIMIT_REACHED') {
    return isInProgress(state.stage) ? evaluate(state, env, false, 'TIME_LIMIT_EXCEEDED', currentTest(state)) : state;
  }

  const { stage } = state;
  switch (stage.type) {
    case 'IDLE':
      if (action.type !== 'START_ASSESSMENT') return state;
      return { ...state, plan: selectPlan(state.config, env.random), planIndex: 0, results: [], stage: { type: 'INSTRUCTION' } };

    case 'INSTRUCTION': {
      if (action.type !== 'ACKNOWLEDGE_INSTRUCTIONS') return state;
      const first = state.plan[0];
      if (first === undefined) return state;
      return { ...state, assessmentStartTime: env.now, planIndex: 0, stage: { type: 'TEST_INTRO', test: first, index: 0 } };
    }

    case 'TEST_INTRO':
      if (action.type !== 'BEGIN_TEST') return state;
      return { ...state, stage: TASKS[stage.test].start(state.config, env) };

    case 'EVALUATED':
      return state;

    default: {
      const task = taskForStage(stage);
      if (!task) return state;
      const reduction = task.reduce(stage, action, state.config, env);
      switch (reduction.kind) {
        case 'noop':
          return state;
        case 'stage':
          return exceededTimeLimit(state, env.now)
            ? evaluate(state, env, false, 'TIME_LIMIT_EXCEEDED', task.id)
            : { ...state, stage: reduction.stage };
        case 'done':
          return finishTest(state, env, task.id, reduction.result, reduction.passed, reduction.failureReason);
      }
    }
  }
}

/* ------------------------------------------------------------------------ */
/* Transition helpers                                                        */
/* ------------------------------------------------------------------------ */

function finishTest(state: MachineState, env: ReducerEnv, test: TestId, result: TestResult, passed: boolean, failureReason: FailureReason | null): MachineState {
  const withResult: MachineState = { ...state, results: [...state.results, result] };
  if (!passed) return evaluate(withResult, env, false, failureReason, test);
  if (exceededTimeLimit(withResult, env.now)) return evaluate(withResult, env, false, 'TIME_LIMIT_EXCEEDED', test);
  const nextIndex = state.planIndex + 1;
  const next = state.plan[nextIndex];
  if (next === undefined) return evaluate(withResult, env, true, null, null);
  return { ...withResult, planIndex: nextIndex, stage: { type: 'TEST_INTRO', test: next, index: nextIndex } };
}

function evaluate(state: MachineState, env: ReducerEnv, passed: boolean, failureReason: FailureReason | null, failedTest: TestId | null): MachineState {
  const details = buildResult(state, env, passed, failureReason, failedTest);
  return { ...state, stage: { type: 'EVALUATED', passed, details } };
}

function exceededTimeLimit(state: MachineState, now: number): boolean {
  return state.assessmentStartTime !== null && now - state.assessmentStartTime > state.config.timeLimitMs;
}

/* ------------------------------------------------------------------------ */
/* Scoring                                                                   */
/* ------------------------------------------------------------------------ */

function findResult<T extends TestResult['test']>(results: readonly TestResult[], test: T): Extract<TestResult, { test: T }> | null {
  for (const r of results) if (r.test === test) return r as Extract<TestResult, { test: T }>;
  return null;
}

/** Every informative reaction time recorded across the reaction-type tests. */
export function collectReactionTimes(results: readonly TestResult[]): number[] {
  const rts: number[] = [];
  for (const r of results) {
    if (r.test === 'pvt') {
      rts.push(...pvtReactionTimes(r.trials));
    } else if (r.test === 'go-no-go') {
      for (const t of r.trials) if (t.outcome === 'HIT' && t.rtMs !== null) rts.push(t.rtMs);
    } else if (r.test === 'stroop') {
      for (const t of r.trials) if (t.correct && t.rtMs !== null) rts.push(t.rtMs);
    } else if (r.test === 'search') {
      for (const round of r.rounds) if (round.correct && round.rtMs !== null) rts.push(round.rtMs);
    }
  }
  return rts;
}

export function buildResult(
  state: MachineState,
  env: ReducerEnv,
  passed: boolean,
  failureReason: FailureReason | null,
  failedTest: TestId | null,
): AssessmentResult {
  const pvt: PvtResult | null = findResult(state.results, 'pvt');
  const spatial: SpatialResult | null = findResult(state.results, 'spatial');
  const rts = collectReactionTimes(state.results);
  const completionTimeMs = state.assessmentStartTime === null ? 0 : round2(env.now - state.assessmentStartTime);
  const issuedAt = new Date(env.epochMs).toISOString();
  const meanRtMs = mean(rts);
  const lapseCount = pvt?.lapseCount ?? 0;
  const falseStartCount = pvt?.falseStartCount ?? 0;

  const verificationToken = buildVerificationToken({
    v: 1,
    sid: state.sessionId,
    nonce: state.nonce,
    ok: passed,
    iat: issuedAt,
    ct: completionTimeMs,
    rt: meanRtMs,
    lp: lapseCount,
    fs: falseStartCount,
    se: spatial ? spatial.errorDeg : null,
    pl: state.plan.join(','),
  });

  return {
    passed,
    failureReason,
    failedTest,
    difficulty: state.config.difficulty,
    sessionId: state.sessionId,
    nonce: state.nonce,
    issuedAt,
    completionTimeMs,
    plan: state.plan,
    results: state.results,
    meanRtMs,
    medianRtMs: median(rts),
    fastestRtMs: min(rts),
    slowestRtMs: max(rts),
    validTrialCount: pvt?.validTrialCount ?? 0,
    lapseCount,
    falseStartCount,
    trials: pvt?.trials ?? [],
    spatial,
    verificationToken,
  };
}
