import { describe, expect, it } from 'vitest';
import { resolveConfig, type ConfigInput } from './config';
import { classifyReaction, createInitialState, humanityOf, isInProgress, reduce, selectPlan, timerEffectFor } from './stateMachine';
import { decodeVerificationToken } from './token';
import type { AssessmentConfig, InputSample, MachineState, ReducerEnv, TestId, TestStage } from './types';
import { TEST_IDS } from './types';

const env = (now: number, random = 0.5): ReducerEnv => ({ now, epochMs: 1_700_000_000_000 + now, random: () => random });

function configFor(pool: readonly TestId[], overrides: ConfigInput = {}): AssessmentConfig {
  return resolveConfig({ maxLapses: 1, timeLimitMs: 30_000, difficulty: 'medium', stagePool: pool, stageCount: pool.length, ...overrides });
}

function initial(config: AssessmentConfig, nonce: string | null = 'nonce-1'): MachineState {
  return createInitialState(config, 'session-1', nonce);
}

function expectStage<T extends TestStage['type']>(state: MachineState, type: T): Extract<TestStage, { type: T }> {
  expect(state.stage.type).toBe(type);
  return state.stage as Extract<TestStage, { type: T }>;
}

/** START → ACKNOWLEDGE (at `now`) → BEGIN_TEST for the first planned test. */
function begin(config: AssessmentConfig, now = 1_000): MachineState {
  let s = reduce(initial(config), { type: 'START_ASSESSMENT' }, env(0));
  expectStage(s, 'INSTRUCTION');
  s = reduce(s, { type: 'ACKNOWLEDGE_INSTRUCTIONS' }, env(now));
  expectStage(s, 'TEST_INTRO');
  return reduce(s, { type: 'BEGIN_TEST' }, env(now));
}

/* ------------------------------------------------------------------------ */
/* Plan selection & lifecycle                                                */
/* ------------------------------------------------------------------------ */

describe('selectPlan', () => {
  it('draws stageCount distinct tests from the pool in random order', () => {
    const config = resolveConfig({ stageCount: 3 });
    for (let i = 0; i < 50; i++) {
      const plan = selectPlan(config, Math.random);
      expect(plan).toHaveLength(3);
      expect(new Set(plan).size).toBe(3);
      for (const id of plan) expect(TEST_IDS).toContain(id);
    }
  });

  it('respects a restricted pool and clamps the count to the pool size', () => {
    const config = resolveConfig({ stagePool: 'stroop, trail', stageCount: 5 });
    expect(config.stagePool).toEqual(['stroop', 'trail']);
    const plan = selectPlan(config, Math.random);
    expect(plan.sort()).toEqual(['stroop', 'trail']);
  });

  it('ignores unknown ids and falls back to the full pool', () => {
    expect(resolveConfig({ stagePool: 'bogus,nope' }).stagePool).toEqual(TEST_IDS);
    expect(resolveConfig({ stagePool: ['PVT', 'sequence', 'sequence'] }).stagePool).toEqual(['pvt', 'sequence']);
  });

  it('is deterministic under an injected random source', () => {
    const config = configFor(['pvt', 'spatial']);
    expect(selectPlan(config, () => 0.5)).toEqual(['pvt', 'spatial']);
  });
});

describe('reduce: lifecycle', () => {
  const config = configFor(['pvt', 'spatial']);

  it('draws the plan on start and walks INSTRUCTION → TEST_INTRO → first test', () => {
    let s = reduce(initial(config), { type: 'START_ASSESSMENT' }, env(0));
    expectStage(s, 'INSTRUCTION');
    expect(s.plan).toEqual(['pvt', 'spatial']);
    s = reduce(s, { type: 'ACKNOWLEDGE_INSTRUCTIONS' }, env(1_000));
    expect(expectStage(s, 'TEST_INTRO')).toEqual({ type: 'TEST_INTRO', test: 'pvt', index: 0 });
    expect(s.assessmentStartTime).toBe(1_000);
    s = reduce(s, { type: 'BEGIN_TEST' }, env(1_200));
    const stage = expectStage(s, 'PVT_AWAITING_STIMULUS');
    expect(stage.delayMs).toBe(3_000); // random = 0.5 → midpoint of 1500..4500
    expect(stage.stimulusTime).toBe(4_200);
  });

  it('samples PVT delays across the full 1500–4500 ms range', () => {
    const intro = reduce(reduce(initial(config), { type: 'START_ASSESSMENT' }, env(0)), { type: 'ACKNOWLEDGE_INSTRUCTIONS' }, env(0));
    const lo = expectStage(reduce(intro, { type: 'BEGIN_TEST' }, env(0, 0)), 'PVT_AWAITING_STIMULUS');
    const hi = expectStage(reduce(intro, { type: 'BEGIN_TEST' }, env(0, 0.999999)), 'PVT_AWAITING_STIMULUS');
    expect(lo.delayMs).toBe(1_500);
    expect(hi.delayMs).toBe(4_500);
  });

  it('returns the same reference for actions that do not apply', () => {
    const s = initial(config);
    expect(reduce(s, { type: 'TRIGGER_STIMULUS' }, env(0))).toBe(s);
    expect(reduce(s, { type: 'BEGIN_TEST' }, env(0))).toBe(s);
    expect(reduce(s, { type: 'TIME_LIMIT_REACHED' }, env(0))).toBe(s);
    const active = reduce(begin(config), { type: 'TRIGGER_STIMULUS' }, env(4_000));
    expect(reduce(active, { type: 'ADVANCE' }, env(4_100))).toBe(active);
    expect(reduce(active, { type: 'TRAIL_TAPPED', value: 1, tapTime: 4_100 }, env(4_100))).toBe(active);
  });

  it('RESET_TEST returns to IDLE with a fresh session and optional new config/nonce', () => {
    const s = begin(config);
    const reset = reduce(s, { type: 'RESET_TEST' }, env(5_000));
    expectStage(reset, 'IDLE');
    expect(reset.sessionId).not.toBe(s.sessionId);
    expect(reset.sessionId).toMatch(/^[0-9a-f]{32}$/);
    expect(reset.nonce).toBe('nonce-1');
    expect(reset.plan).toEqual([]);
    expect(reset.results).toEqual([]);

    const hard = resolveConfig({ difficulty: 'hard' });
    const reconfigured = reduce(s, { type: 'RESET_TEST', config: hard, nonce: null }, env(5_000));
    expect(reconfigured.config).toBe(hard);
    expect(reconfigured.nonce).toBeNull();
  });

  it('isInProgress covers intros and tests only', () => {
    expect(isInProgress({ type: 'IDLE' })).toBe(false);
    expect(isInProgress({ type: 'INSTRUCTION' })).toBe(false);
    expect(isInProgress({ type: 'TEST_INTRO', test: 'pvt', index: 0 })).toBe(true);
    expect(isInProgress(begin(config).stage)).toBe(true);
  });
});

/* ------------------------------------------------------------------------ */
/* PVT                                                                       */
/* ------------------------------------------------------------------------ */

/** Runs one PVT trial with the given RT, ending after ADVANCE. */
function pvtTrial(state: MachineState, rtMs: number, advanceAt = 0): MachineState {
  const awaiting = expectStage(state, 'PVT_AWAITING_STIMULUS');
  const onset = awaiting.stimulusTime;
  let s = reduce(state, { type: 'TRIGGER_STIMULUS' }, env(onset));
  expectStage(s, 'PVT_STIMULUS_ACTIVE');
  s = reduce(s, { type: 'TARGET_TAPPED', tapTime: onset + rtMs }, env(onset + rtMs));
  expectStage(s, 'PVT_RESULT_DISPLAY');
  return reduce(s, { type: 'ADVANCE' }, env(Math.max(advanceAt, onset + rtMs + state.config.resultDisplayMs)));
}

describe('classifyReaction', () => {
  it('follows the PVT-B thresholds', () => {
    const config = resolveConfig();
    expect(classifyReaction(99.99, config)).toBe('FALSE_START');
    expect(classifyReaction(100, config)).toBe('VALID');
    expect(classifyReaction(450, config)).toBe('VALID');
    expect(classifyReaction(450.01, config)).toBe('LAPSE');
  });
});

describe('reduce: pvt', () => {
  const config = configFor(['pvt', 'spatial']);

  it('classifies a valid tap and records the trial', () => {
    const s0 = begin(config);
    const onset = expectStage(s0, 'PVT_AWAITING_STIMULUS').stimulusTime;
    const s1 = reduce(s0, { type: 'TRIGGER_STIMULUS' }, env(onset + 2));
    const active = expectStage(s1, 'PVT_STIMULUS_ACTIVE');
    expect(active.startTime).toBe(onset + 2); // onset is the actual, not the scheduled, time
    const s2 = reduce(s1, { type: 'TARGET_TAPPED', tapTime: active.startTime + 287.456 }, env(active.startTime + 287.456));
    const result = expectStage(s2, 'PVT_RESULT_DISPLAY');
    expect(result).toMatchObject({ rtMs: 287.46, isLapse: false, outcome: 'VALID' });
    expect(result.progress.trials).toHaveLength(1);
    expect(result.progress.trials[0]).toMatchObject({ index: 1, delayMs: 3_000, rtMs: 287.46, outcome: 'VALID', timedOut: false });
    expect(result.progress.consecutiveValid).toBe(1);
  });

  it('treats a tap before the stimulus as a false start with negative RT', () => {
    const s1 = reduce(begin(config), { type: 'TARGET_TAPPED', tapTime: 3_500 }, env(3_500));
    const result = expectStage(s1, 'PVT_RESULT_DISPLAY');
    expect(result.outcome).toBe('FALSE_START');
    expect(result.rtMs).toBe(-500);
    expect(result.progress.consecutiveValid).toBe(0);
  });

  it('treats a tap under 100 ms after onset as a false start', () => {
    const s = pvtTrial(begin(config), 60);
    expect(expectStage(s, 'PVT_AWAITING_STIMULUS').progress.trials[0]?.outcome).toBe('FALSE_START');
  });

  it('flags responses over 450 ms as lapses', () => {
    const s = pvtTrial(begin(config), 612);
    const stage = expectStage(s, 'PVT_AWAITING_STIMULUS'); // one lapse is within max-lapses=1
    expect(stage.progress.trials[0]).toMatchObject({ outcome: 'LAPSE', rtMs: 612, timedOut: false });
  });

  it('records a timed-out stimulus as a lapse', () => {
    const s1 = reduce(begin(config), { type: 'TRIGGER_STIMULUS' }, env(4_000));
    const s2 = reduce(s1, { type: 'STIMULUS_TIMEOUT' }, env(6_000));
    const result = expectStage(s2, 'PVT_RESULT_DISPLAY');
    expect(result.isLapse).toBe(true);
    expect(result.progress.trials[0]).toMatchObject({ outcome: 'LAPSE', rtMs: config.stimulusTimeoutMs, timedOut: true });
  });

  it('resets the valid streak on any invalid trial', () => {
    let s = pvtTrial(pvtTrial(begin(config), 250), 260);
    expect(expectStage(s, 'PVT_AWAITING_STIMULUS').progress.consecutiveValid).toBe(2);
    s = pvtTrial(s, 700);
    expect(expectStage(s, 'PVT_AWAITING_STIMULUS').progress.consecutiveValid).toBe(0);
  });

  it('fails the run once lapses exceed max-lapses', () => {
    const s = pvtTrial(pvtTrial(begin(config), 500), 500);
    const evaluated = expectStage(s, 'EVALUATED');
    expect(evaluated.passed).toBe(false);
    expect(evaluated.details).toMatchObject({ failureReason: 'TOO_MANY_LAPSES', failedTest: 'pvt', lapseCount: 2 });
    expect(evaluated.details.results).toHaveLength(1);
  });

  it('fails the run once false starts exceed the allowance', () => {
    let s = begin(config);
    for (let i = 0; i <= config.maxFalseStarts; i++) s = pvtTrial(s, 10);
    expect(expectStage(s, 'EVALUATED').details.failureReason).toBe('TOO_MANY_FALSE_STARTS');
  });

  it('passes after three consecutive valid trials and introduces the next test', () => {
    const s = pvtTrial(pvtTrial(pvtTrial(begin(config), 300), 310), 320);
    expect(expectStage(s, 'TEST_INTRO')).toEqual({ type: 'TEST_INTRO', test: 'spatial', index: 1 });
    expect(s.planIndex).toBe(1);
    expect(s.results[0]).toMatchObject({ test: 'pvt', validTrialCount: 3, meanRtMs: 310, medianRtMs: 310, fastestRtMs: 300, slowestRtMs: 320, lapseCount: 0 });
  });
});

/* ------------------------------------------------------------------------ */
/* Spatial                                                                   */
/* ------------------------------------------------------------------------ */

function reachSpatial(config = configFor(['pvt', 'spatial'])): MachineState {
  const intro = pvtTrial(pvtTrial(pvtTrial(begin(config), 300), 310), 320);
  expectStage(intro, 'TEST_INTRO');
  const s = reduce(intro, { type: 'BEGIN_TEST' }, env(20_000));
  expectStage(s, 'SPATIAL_MATCHING');
  return s;
}

describe('reduce: spatial', () => {
  it('starts with a random target inside the configured magnitude range', () => {
    const config = configFor(['pvt', 'spatial']);
    const stage = expectStage(reachSpatial(config), 'SPATIAL_MATCHING');
    expect(stage.currentAngle).toBe(0);
    expect(stage.startTime).toBe(20_000);
    expect(stage.targetAngle).toBe(45); // random = 0.5 → magnitude 45, positive sign
  });

  it('updates and clamps the current angle', () => {
    const s0 = reachSpatial();
    const s1 = reduce(s0, { type: 'UPDATE_SPATIAL_ANGLE', angle: 44 }, env(20_100));
    expect(expectStage(s1, 'SPATIAL_MATCHING').currentAngle).toBe(44);
    const s2 = reduce(s1, { type: 'UPDATE_SPATIAL_ANGLE', angle: 400 }, env(20_100));
    expect(expectStage(s2, 'SPATIAL_MATCHING').currentAngle).toBe(s0.config.spatialMaxAngleDeg);
    expect(reduce(s2, { type: 'UPDATE_SPATIAL_ANGLE', angle: 400 }, env(20_100))).toBe(s2);
  });

  it('passes the whole run when released within tolerance', () => {
    const s0 = reachSpatial();
    const s1 = reduce(s0, { type: 'UPDATE_SPATIAL_ANGLE', angle: 48.5 }, env(21_000));
    const evaluated = expectStage(reduce(s1, { type: 'COMPLETE_SPATIAL_STAGE' }, env(21_500)), 'EVALUATED');
    expect(evaluated.passed).toBe(true);
    const { details } = evaluated;
    expect(details.failureReason).toBeNull();
    expect(details.failedTest).toBeNull();
    expect(details.plan).toEqual(['pvt', 'spatial']);
    expect(details.results.map((r) => r.test)).toEqual(['pvt', 'spatial']);
    expect(details.spatial).toMatchObject({ targetAngle: 45, finalAngle: 48.5, errorDeg: 3.5, withinTolerance: true, timedOut: false, durationMs: 1_500 });
    expect(details.meanRtMs).toBe(310);
    expect(details.validTrialCount).toBe(3);
    expect(details.trials).toHaveLength(3);
    expect(details.completionTimeMs).toBe(21_500 - 1_000);
  });

  it('fails when released outside tolerance', () => {
    const s1 = reduce(reachSpatial(), { type: 'UPDATE_SPATIAL_ANGLE', angle: 30 }, env(20_500));
    const evaluated = expectStage(reduce(s1, { type: 'COMPLETE_SPATIAL_STAGE' }, env(20_800)), 'EVALUATED');
    expect(evaluated.passed).toBe(false);
    expect(evaluated.details).toMatchObject({ failureReason: 'SPATIAL_OUT_OF_TOLERANCE', failedTest: 'spatial' });
  });

  it('fails with SPATIAL_TIMEOUT when the window expires off-target', () => {
    const s0 = reachSpatial();
    const evaluated = expectStage(reduce(s0, { type: 'COMPLETE_SPATIAL_STAGE' }, env(20_000 + s0.config.spatialWindowMs + 4)), 'EVALUATED');
    expect(evaluated.details.failureReason).toBe('SPATIAL_TIMEOUT');
    expect(evaluated.details.spatial?.timedOut).toBe(true);
  });

  it('still passes if the handlebar is in the zone when the window expires', () => {
    const s1 = reduce(reachSpatial(), { type: 'UPDATE_SPATIAL_ANGLE', angle: 45 }, env(22_900));
    expect(expectStage(reduce(s1, { type: 'COMPLETE_SPATIAL_STAGE' }, env(23_002)), 'EVALUATED').passed).toBe(true);
  });
});

/* ------------------------------------------------------------------------ */
/* Go / No-Go                                                                */
/* ------------------------------------------------------------------------ */

/** Runs one GNG trial: tap after `rtMs` when `tap` is true, otherwise hold until the window ends. */
function gngTrial(state: MachineState, tap: boolean, rtMs = 350): MachineState {
  const awaiting = expectStage(state, 'GNG_AWAITING');
  const onset = awaiting.stimulusTime;
  let s = reduce(state, { type: 'TRIGGER_STIMULUS' }, env(onset));
  expectStage(s, 'GNG_STIMULUS_ACTIVE');
  s = tap
    ? reduce(s, { type: 'TARGET_TAPPED', tapTime: onset + rtMs }, env(onset + rtMs))
    : reduce(s, { type: 'STIMULUS_TIMEOUT' }, env(onset + state.config.gngResponseWindowMs));
  expectStage(s, 'GNG_RESULT_DISPLAY');
  return reduce(s, { type: 'ADVANCE' }, env(onset + 1_500));
}

describe('reduce: go-no-go', () => {
  const config = configFor(['go-no-go']);

  it('schedules the configured number of signals with GO first', () => {
    const stage = expectStage(begin(config), 'GNG_AWAITING');
    expect(stage.trialIndex).toBe(0);
    expect(stage.isGo).toBe(true);
    expect(stage.progress.schedule).toHaveLength(config.gngTrials);
    expect(stage.progress.schedule.filter((go) => !go)).toHaveLength(config.gngNoGoCount);
    expect(stage.delayMs).toBeGreaterThanOrEqual(config.gngMinDelayMs);
    expect(stage.delayMs).toBeLessThanOrEqual(config.gngMaxDelayMs);
  });

  it('passes a perfect run: tap on GO, hold on STOP', () => {
    let s = begin(config);
    const schedule = expectStage(s, 'GNG_AWAITING').progress.schedule;
    for (const isGo of schedule) {
      expect(expectStage(s, 'GNG_AWAITING').isGo).toBe(isGo);
      s = gngTrial(s, isGo);
    }
    const evaluated = expectStage(s, 'EVALUATED');
    expect(evaluated.passed).toBe(true);
    expect(evaluated.details.results[0]).toMatchObject({ test: 'go-no-go', hitCount: schedule.filter(Boolean).length, commissionCount: 0, omissionCount: 0, meanRtMs: 350 });
    expect(evaluated.details.meanRtMs).toBe(350);
  });

  it('fails once taps on STOP exceed the allowance', () => {
    let s = begin(config);
    const schedule = expectStage(s, 'GNG_AWAITING').progress.schedule;
    for (let i = 0; i < schedule.length; i++) s = gngTrial(s, true); // tap on everything
    const evaluated = expectStage(s, 'EVALUATED');
    expect(evaluated.passed).toBe(false);
    expect(evaluated.details).toMatchObject({ failureReason: 'GO_NO_GO_COMMISSIONS', failedTest: 'go-no-go' });
    expect(evaluated.details.results[0]).toMatchObject({ commissionCount: schedule.filter((go) => !go).length });
  });

  it('fails once missed GO signals exceed the allowance', () => {
    let s = begin(config);
    const schedule = expectStage(s, 'GNG_AWAITING').progress.schedule;
    for (let i = 0; i < schedule.length; i++) s = gngTrial(s, false); // never tap
    expect(expectStage(s, 'EVALUATED').details.failureReason).toBe('GO_NO_GO_OMISSIONS');
  });

  it('counts anticipations as commission errors', () => {
    const s0 = begin(config);
    const s1 = reduce(s0, { type: 'TARGET_TAPPED', tapTime: 1_100 }, env(1_100));
    const result = expectStage(s1, 'GNG_RESULT_DISPLAY');
    expect(result.outcome).toBe('FALSE_START');
    expect(result.progress.trials[0]?.rtMs).toBeLessThan(0);
  });

  it('describes its timers', () => {
    const awaiting = begin(config);
    const at = expectStage(awaiting, 'GNG_AWAITING').stimulusTime;
    expect(timerEffectFor(awaiting, at - 100)).toEqual({ action: { type: 'TRIGGER_STIMULUS' }, delayMs: 100 });
    const active = reduce(awaiting, { type: 'TRIGGER_STIMULUS' }, env(at));
    expect(timerEffectFor(active, at)).toEqual({ action: { type: 'STIMULUS_TIMEOUT' }, delayMs: config.gngResponseWindowMs });
    const shown = reduce(active, { type: 'STIMULUS_TIMEOUT' }, env(at + 900));
    expect(timerEffectFor(shown, at + 900)).toEqual({ action: { type: 'ADVANCE' }, delayMs: config.gngResultDisplayMs });
  });
});

/* ------------------------------------------------------------------------ */
/* Trail                                                                     */
/* ------------------------------------------------------------------------ */

describe('reduce: trail', () => {
  const config = configFor(['trail']);

  it('places the configured number of targets on distinct spots inside the board', () => {
    const stage = expectStage(begin(config), 'TRAIL_ACTIVE');
    expect(stage.targets).toHaveLength(config.trailCount);
    expect(stage.targets.map((t) => t.value)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const spots = new Set(stage.targets.map((t) => `${t.x},${t.y}`));
    expect(spots.size).toBe(config.trailCount);
    for (const t of stage.targets) {
      expect(t.x).toBeGreaterThanOrEqual(10);
      expect(t.x).toBeLessThanOrEqual(90);
      expect(t.y).toBeGreaterThanOrEqual(10);
      expect(t.y).toBeLessThanOrEqual(90);
    }
    expect(timerEffectFor(begin(config), 1_000)).toEqual({ action: { type: 'STAGE_TIMEOUT' }, delayMs: config.trailWindowMs });
  });

  it('passes when every number is tapped in order', () => {
    let s = begin(config);
    for (let v = 1; v <= config.trailCount; v++) {
      s = reduce(s, { type: 'TRAIL_TAPPED', value: v, tapTime: 1_000 + v * 500 }, env(1_000 + v * 500));
    }
    const evaluated = expectStage(s, 'EVALUATED');
    expect(evaluated.passed).toBe(true);
    expect(evaluated.details.results[0]).toMatchObject({ test: 'trail', count: 8, reached: 8, errorCount: 0, completed: true, timedOut: false, durationMs: 4_000 });
  });

  it('counts out-of-order taps as errors, ignores already-collected numbers, and fails past the allowance', () => {
    let s = reduce(begin(config), { type: 'TRAIL_TAPPED', value: 1, tapTime: 1_100 }, env(1_100));
    expect(reduce(s, { type: 'TRAIL_TAPPED', value: 1, tapTime: 1_200 }, env(1_200))).toBe(s);
    s = reduce(s, { type: 'TRAIL_TAPPED', value: 5, tapTime: 1_300 }, env(1_300));
    expect(expectStage(s, 'TRAIL_ACTIVE')).toMatchObject({ nextValue: 2, errors: 1, lastErrorAt: 1_300 });
    s = reduce(s, { type: 'TRAIL_TAPPED', value: 7, tapTime: 1_400 }, env(1_400));
    s = reduce(s, { type: 'TRAIL_TAPPED', value: 3, tapTime: 1_500 }, env(1_500));
    const evaluated = expectStage(s, 'EVALUATED');
    expect(evaluated.details).toMatchObject({ failureReason: 'TRAIL_TOO_MANY_ERRORS', failedTest: 'trail' });
    expect(evaluated.details.results[0]).toMatchObject({ reached: 1, errorCount: 3, completed: false });
  });

  it('fails with TRAIL_TIMEOUT when the window expires', () => {
    const s = reduce(begin(config), { type: 'STAGE_TIMEOUT' }, env(1_000 + config.trailWindowMs));
    expect(expectStage(s, 'EVALUATED').details.results[0]).toMatchObject({ test: 'trail', timedOut: true, reached: 0 });
  });
});

/* ------------------------------------------------------------------------ */
/* Sequence                                                                  */
/* ------------------------------------------------------------------------ */

function playPattern(state: MachineState): MachineState {
  let s = state;
  const length = expectStage(s, 'SEQUENCE_SHOWING').sequence.length;
  for (let i = 0; i < length * 2; i++) s = reduce(s, { type: 'ADVANCE' }, env(2_000 + i * 400));
  return s;
}

describe('reduce: sequence', () => {
  const config = configFor(['sequence']);

  it('plays the pattern tile by tile with on/off timers, then opens input', () => {
    let s = begin(config);
    const showing = expectStage(s, 'SEQUENCE_SHOWING');
    expect(showing.sequence).toHaveLength(config.sequenceLength);
    expect(showing).toMatchObject({ step: 0, lit: true });
    expect(timerEffectFor(s, 1_000)).toEqual({ action: { type: 'ADVANCE' }, delayMs: config.sequenceStepOnMs });
    expect(reduce(s, { type: 'SEQUENCE_TILE_TAPPED', tile: 0, tapTime: 1_100 }, env(1_100))).toBe(s); // taps ignored while showing
    s = reduce(s, { type: 'ADVANCE' }, env(1_600));
    expect(expectStage(s, 'SEQUENCE_SHOWING')).toMatchObject({ step: 0, lit: false });
    expect(timerEffectFor(s, 1_600)).toEqual({ action: { type: 'ADVANCE' }, delayMs: config.sequenceStepOffMs });
    s = reduce(s, { type: 'ADVANCE' }, env(1_850));
    expect(expectStage(s, 'SEQUENCE_SHOWING')).toMatchObject({ step: 1, lit: true });
    s = playPattern(begin(config));
    const input = expectStage(s, 'SEQUENCE_INPUT');
    expect(input.entered).toEqual([]);
    expect(timerEffectFor(s, input.inputStartTime)).toEqual({ action: { type: 'STAGE_TIMEOUT' }, delayMs: config.sequenceInputWindowMs });
  });

  it('passes when the pattern is repeated exactly', () => {
    let s = playPattern(begin(config));
    const input = expectStage(s, 'SEQUENCE_INPUT');
    input.sequence.forEach((tile, i) => {
      s = reduce(s, { type: 'SEQUENCE_TILE_TAPPED', tile, tapTime: input.inputStartTime + (i + 1) * 300 }, env(input.inputStartTime + (i + 1) * 300));
    });
    const evaluated = expectStage(s, 'EVALUATED');
    expect(evaluated.passed).toBe(true);
    expect(evaluated.details.results[0]).toMatchObject({ test: 'sequence', correct: true, entered: input.sequence, length: config.sequenceLength, timedOut: false });
  });

  it('fails immediately on a wrong tile', () => {
    let s = playPattern(begin(config));
    const input = expectStage(s, 'SEQUENCE_INPUT');
    const first = input.sequence[0] ?? 0;
    const wrong = (first + 1) % (config.sequenceGridSize ** 2);
    s = reduce(s, { type: 'SEQUENCE_TILE_TAPPED', tile: first, tapTime: 5_000 }, env(5_000));
    expect(expectStage(s, 'SEQUENCE_INPUT').entered).toEqual([first]);
    s = reduce(s, { type: 'SEQUENCE_TILE_TAPPED', tile: input.sequence[1] === wrong ? (wrong + 1) % 9 : wrong, tapTime: 5_300 }, env(5_300));
    const evaluated = expectStage(s, 'EVALUATED');
    expect(evaluated.details).toMatchObject({ failureReason: 'SEQUENCE_INCORRECT', failedTest: 'sequence' });
    expect(evaluated.details.results[0]).toMatchObject({ correct: false, timedOut: false });
  });

  it('fails with SEQUENCE_TIMEOUT when input runs out of time', () => {
    const s = reduce(playPattern(begin(config)), { type: 'STAGE_TIMEOUT' }, env(30_000));
    expect(expectStage(s, 'EVALUATED').details.failureReason).toBe('SEQUENCE_TIMEOUT');
  });
});

/* ------------------------------------------------------------------------ */
/* Stroop                                                                    */
/* ------------------------------------------------------------------------ */

function stroopRound(state: MachineState, correct: boolean, rtMs = 800): MachineState {
  const trial = expectStage(state, 'STROOP_TRIAL');
  const answer = correct ? trial.ink : trial.word === trial.ink ? (trial.ink === 'red' ? 'blue' : 'red') : trial.word;
  let s = reduce(state, { type: 'STROOP_ANSWERED', color: answer, tapTime: trial.startTime + rtMs }, env(trial.startTime + rtMs));
  expect(expectStage(s, 'STROOP_RESULT_DISPLAY').correct).toBe(correct);
  return reduce(s, { type: 'ADVANCE' }, env(trial.startTime + rtMs + state.config.stroopResultDisplayMs));
}

describe('reduce: stroop', () => {
  const config = configFor(['stroop']);

  it('presents colour words in a different ink most of the time', () => {
    const trial = expectStage(begin(config), 'STROOP_TRIAL');
    expect(trial.trialIndex).toBe(0);
    expect(trial.word).toBe('blue'); // random = 0.5
    expect(trial.ink).toBe('green');
    expect(trial.congruent).toBe(false);
    expect(timerEffectFor(begin(config), 1_000)).toEqual({ action: { type: 'STAGE_TIMEOUT' }, delayMs: config.stroopTrialTimeoutMs });
  });

  it('passes when every ink colour is identified', () => {
    let s = begin(config);
    for (let i = 0; i < config.stroopTrials; i++) s = stroopRound(s, true, 700 + i * 10);
    const evaluated = expectStage(s, 'EVALUATED');
    expect(evaluated.passed).toBe(true);
    expect(evaluated.details.results[0]).toMatchObject({ test: 'stroop', correctCount: 5, errorCount: 0, meanRtMs: 720 });
    expect(evaluated.details.medianRtMs).toBe(720);
  });

  it('tolerates one error on medium and fails on the second', () => {
    let s = stroopRound(stroopRound(begin(config), false), true);
    for (let i = 0; i < config.stroopTrials - 3; i++) s = stroopRound(s, true);
    expect(expectStage(stroopRound(s, true), 'EVALUATED').passed).toBe(true);

    let t = stroopRound(stroopRound(begin(config), false), false);
    for (let i = 0; i < config.stroopTrials - 2; i++) t = stroopRound(t, true);
    const evaluated = expectStage(t, 'EVALUATED');
    expect(evaluated.passed).toBe(false);
    expect(evaluated.details).toMatchObject({ failureReason: 'STROOP_TOO_MANY_ERRORS', failedTest: 'stroop' });
  });

  it('counts an unanswered round as an error with no RT', () => {
    const s = reduce(begin(config), { type: 'STAGE_TIMEOUT' }, env(4_000));
    const shown = expectStage(s, 'STROOP_RESULT_DISPLAY');
    expect(shown).toMatchObject({ correct: false, rtMs: null });
    expect(shown.progress.trials[0]).toMatchObject({ answer: null, correct: false, rtMs: null });
  });
});

/* ------------------------------------------------------------------------ */
/* Timing                                                                    */
/* ------------------------------------------------------------------------ */

/** Runs one timing round, tapping `offsetMs` away from the target (negative = early). */
function timingRound(state: MachineState, offsetMs: number): MachineState {
  const running = expectStage(state, 'TIMING_RUNNING');
  const tapTime = running.startTime + running.targetMs + offsetMs;
  const s = reduce(state, { type: 'TARGET_TAPPED', tapTime }, env(tapTime));
  expectStage(s, 'TIMING_RESULT_DISPLAY');
  return reduce(s, { type: 'ADVANCE' }, env(tapTime + state.config.timingResultDisplayMs));
}

describe('reduce: timing', () => {
  const config = configFor(['timing']);

  it('names a target inside the configured range and waits for the tap alone', () => {
    const s = begin(config);
    const running = expectStage(s, 'TIMING_RUNNING');
    expect(running.roundIndex).toBe(0);
    expect(running.targetMs).toBe(3_500); // random = 0.5 → midpoint of 2500..4500
    expect(running.targetMs).toBeGreaterThanOrEqual(config.timingMinTargetMs);
    expect(running.targetMs).toBeLessThanOrEqual(config.timingMaxTargetMs);
    // The only timer is the abandon deadline, well past the target.
    expect(timerEffectFor(s, 1_000)).toEqual({ action: { type: 'STAGE_TIMEOUT' }, delayMs: 3_500 + config.timingGraceMs });
  });

  it('scores the signed error and passes when every round is within tolerance', () => {
    const early = timingRound(begin(config), -100);
    const shown = expectStage(reduce(begin(config), { type: 'TARGET_TAPPED', tapTime: 1_000 + 3_500 - 100 }, env(1_000 + 3_400)), 'TIMING_RESULT_DISPLAY');
    expect(shown).toMatchObject({ errorMs: -100, withinTolerance: true, timedOut: false });

    const evaluated = expectStage(timingRound(early, 120), 'EVALUATED');
    expect(evaluated.passed).toBe(true);
    expect(evaluated.details.results[0]).toMatchObject({ test: 'timing', missCount: 0, toleranceMs: config.timingToleranceMs, meanErrorMs: 110 });
    // Interval judgements are not reaction times, so they stay out of the RT aggregate.
    expect(evaluated.details.meanRtMs).toBeNull();
  });

  it('counts a round outside the tolerance as a miss and fails past the allowance', () => {
    const one = timingRound(begin(config), 900);
    expect(expectStage(one, 'TIMING_RUNNING').progress.rounds[0]).toMatchObject({ errorMs: 900, withinTolerance: false });
    const evaluated = expectStage(timingRound(one, 900), 'EVALUATED');
    expect(evaluated.passed).toBe(false);
    expect(evaluated.details).toMatchObject({ failureReason: 'TIMING_OFF_TARGET', failedTest: 'timing' });
    expect(evaluated.details.results[0]).toMatchObject({ missCount: 2 });
  });

  it('records an untapped round as a timed-out miss', () => {
    const s = reduce(begin(config), { type: 'STAGE_TIMEOUT' }, env(1_000 + 3_500 + config.timingGraceMs));
    const shown = expectStage(s, 'TIMING_RESULT_DISPLAY');
    expect(shown).toMatchObject({ timedOut: true, withinTolerance: false, errorMs: config.timingGraceMs });
    expect(shown.progress.rounds[0]).toMatchObject({ elapsedMs: null, timedOut: true });
  });
});

/* ------------------------------------------------------------------------ */
/* Search                                                                    */
/* ------------------------------------------------------------------------ */

/** Runs one search round, tapping either the odd symbol or a distractor. */
function searchRound(state: MachineState, correct: boolean, rtMs = 900): MachineState {
  const active = expectStage(state, 'SEARCH_ACTIVE');
  const picked = active.items.find((item) => item.isTarget === correct);
  const s = reduce(state, { type: 'SEARCH_TAPPED', index: picked?.index ?? 0, tapTime: active.startTime + rtMs }, env(active.startTime + rtMs));
  expect(expectStage(s, 'SEARCH_RESULT_DISPLAY').correct).toBe(correct);
  return reduce(s, { type: 'ADVANCE' }, env(active.startTime + rtMs + state.config.searchResultDisplayMs));
}

describe('reduce: search', () => {
  const config = configFor(['search']);

  it('hides exactly one odd symbol in a field of identical ones', () => {
    const s = begin(config);
    const active = expectStage(s, 'SEARCH_ACTIVE');
    expect(active.items).toHaveLength(config.searchItemCount);
    expect(active.targetGlyph).not.toBe(active.distractorGlyph);
    expect(active.items.filter((i) => i.isTarget)).toHaveLength(1);
    for (const item of active.items) {
      expect(item.glyph).toBe(item.isTarget ? active.targetGlyph : active.distractorGlyph);
      expect(item.x).toBeGreaterThanOrEqual(10);
      expect(item.x).toBeLessThanOrEqual(90);
      expect(item.y).toBeGreaterThanOrEqual(10);
      expect(item.y).toBeLessThanOrEqual(90);
    }
    expect(new Set(active.items.map((i) => `${i.x},${i.y}`)).size).toBe(config.searchItemCount);
    expect(timerEffectFor(s, 1_000)).toEqual({ action: { type: 'STAGE_TIMEOUT' }, delayMs: config.searchRoundTimeoutMs });
    expect(reduce(s, { type: 'SEARCH_TAPPED', index: 99, tapTime: 1_100 }, env(1_100))).toBe(s); // unknown symbol
  });

  it('passes when the odd symbol is found every round, and counts those finds as reaction times', () => {
    let s = begin(config);
    for (let i = 0; i < config.searchRounds; i++) s = searchRound(s, true, 800 + i * 100);
    const evaluated = expectStage(s, 'EVALUATED');
    expect(evaluated.passed).toBe(true);
    expect(evaluated.details.results[0]).toMatchObject({ test: 'search', correctCount: config.searchRounds, errorCount: 0, meanRtMs: 900 });
    expect(evaluated.details.meanRtMs).toBe(900);
  });

  it('tolerates one wrong tap on medium and fails on the second', () => {
    let s = searchRound(begin(config), false);
    for (let i = 0; i < config.searchRounds - 1; i++) s = searchRound(s, true);
    expect(expectStage(s, 'EVALUATED')).toMatchObject({ passed: true });

    let t = searchRound(searchRound(begin(config), false), false);
    for (let i = 0; i < config.searchRounds - 2; i++) t = searchRound(t, true);
    const evaluated = expectStage(t, 'EVALUATED');
    expect(evaluated.passed).toBe(false);
    expect(evaluated.details).toMatchObject({ failureReason: 'SEARCH_TOO_MANY_ERRORS', failedTest: 'search' });
    expect(evaluated.details.results[0]).toMatchObject({ errorCount: 2 });
  });

  it('counts an unfound round as an error with no RT', () => {
    const s = reduce(begin(config), { type: 'STAGE_TIMEOUT' }, env(1_000 + config.searchRoundTimeoutMs));
    const shown = expectStage(s, 'SEARCH_RESULT_DISPLAY');
    expect(shown).toMatchObject({ correct: false, rtMs: null, timedOut: true });
  });
});

/* ------------------------------------------------------------------------ */
/* Time limit, multi-test flow, token                                        */
/* ------------------------------------------------------------------------ */

describe('reduce: time limit', () => {
  it('TIME_LIMIT_REACHED fails any in-progress stage, naming the current test', () => {
    const config = configFor(['trail', 'pvt']);
    const intro = reduce(reduce(initial(config), { type: 'START_ASSESSMENT' }, env(0)), { type: 'ACKNOWLEDGE_INSTRUCTIONS' }, env(1_000));
    const evaluated = expectStage(reduce(intro, { type: 'TIME_LIMIT_REACHED' }, env(31_000)), 'EVALUATED');
    expect(evaluated.passed).toBe(false);
    expect(evaluated.details).toMatchObject({ failureReason: 'TIME_LIMIT_EXCEEDED', failedTest: 'trail', results: [] });
  });

  it('a transition after the budget is exhausted also fails', () => {
    const s = pvtTrial(begin(configFor(['pvt', 'spatial'])), 300, 40_000);
    expect(expectStage(s, 'EVALUATED').details.failureReason).toBe('TIME_LIMIT_EXCEEDED');
  });
});

describe('multi-test runs', () => {
  it('stops at the first failed test and records only the tests that ran', () => {
    const config = configFor(['trail', 'stroop']);
    const s = reduce(begin(config), { type: 'STAGE_TIMEOUT' }, env(20_000));
    const evaluated = expectStage(s, 'EVALUATED');
    expect(evaluated.details.plan).toEqual(['trail', 'stroop']);
    expect(evaluated.details.results.map((r) => r.test)).toEqual(['trail']);
    expect(evaluated.details.failedTest).toBe('trail');
  });

  it('runs three tests back to back and aggregates reaction times across them', () => {
    const config = configFor(['stroop', 'trail', 'pvt'], { timeLimitMs: 120_000 });
    let s = begin(config);
    expect(s.plan).toEqual(['stroop', 'pvt', 'trail']); // shuffle order under random = 0.5
    for (let i = 0; i < config.stroopTrials; i++) s = stroopRound(s, true, 600);
    expect(expectStage(s, 'TEST_INTRO')).toEqual({ type: 'TEST_INTRO', test: 'pvt', index: 1 });
    s = reduce(s, { type: 'BEGIN_TEST' }, env(10_000));
    s = pvtTrial(pvtTrial(pvtTrial(s, 300), 300), 300);
    expect(expectStage(s, 'TEST_INTRO')).toEqual({ type: 'TEST_INTRO', test: 'trail', index: 2 });
    s = reduce(s, { type: 'BEGIN_TEST' }, env(30_000));
    for (let v = 1; v <= config.trailCount; v++) s = reduce(s, { type: 'TRAIL_TAPPED', value: v, tapTime: 30_000 + v * 300 }, env(30_000 + v * 300));
    const evaluated = expectStage(s, 'EVALUATED');
    expect(evaluated.passed).toBe(true);
    expect(evaluated.details.results.map((r) => r.test)).toEqual(['stroop', 'pvt', 'trail']);
    expect(evaluated.details.meanRtMs).toBe((600 * 5 + 300 * 3) / 8);
    expect(evaluated.details.validTrialCount).toBe(3);
  });
});

describe('verification token', () => {
  it('round-trips the outcome and binds the nonce and plan', () => {
    const s1 = reduce(reachSpatial(), { type: 'UPDATE_SPATIAL_ANGLE', angle: 45 }, env(20_100));
    const { details } = expectStage(reduce(s1, { type: 'COMPLETE_SPATIAL_STAGE' }, env(20_200)), 'EVALUATED');
    expect(details.verificationToken).toMatch(/^ok2r1\.[A-Za-z0-9_-]+\.[0-9a-f]{16}$/);
    expect(decodeVerificationToken(details.verificationToken)).toEqual({
      v: 2,
      sid: 'session-1',
      nonce: 'nonce-1',
      ok: true,
      iat: details.issuedAt,
      ct: details.completionTimeMs,
      rt: 310,
      lp: 0,
      fs: 0,
      se: 0,
      pl: 'pvt,spatial',
      hv: 'human',
      hs: 1,
    });
  });

  it('rejects tampered tokens', () => {
    const { details } = expectStage(reduce(begin(configFor(['pvt'])), { type: 'TIME_LIMIT_REACHED' }, env(31_000)), 'EVALUATED');
    const [prefix, payload, sig] = details.verificationToken.split('.');
    expect(decodeVerificationToken(`${prefix}.${payload}x.${sig}`)).toBeNull();
    expect(decodeVerificationToken('garbage')).toBeNull();
  });
});

/* ------------------------------------------------------------------------ */
/* Humanity check                                                            */
/* ------------------------------------------------------------------------ */

/** The same environment, in a browser that admits to being automated. */
const botEnv = (now: number): ReducerEnv => ({ ...env(now), automation: true });

function inputSample(overrides: Partial<InputSample> = {}): InputSample {
  return {
    time: 2_000,
    kind: 'pointer',
    trusted: true,
    pointerType: 'touch',
    x: 140,
    y: 260,
    movesSince: 2,
    stage: 'PVT_STIMULUS_ACTIVE',
    stageSeq: 1,
    sinceStageMs: 300,
    ...overrides,
  };
}

/** Feeds taps whose latency repeats to the millisecond, as a script's would. */
function uniformInputs(state: MachineState, count: number, envFor: (now: number) => ReducerEnv = env): MachineState {
  let s = state;
  for (let i = 0; i < count; i++) {
    const time = 2_000 + i * 1_000;
    s = reduce(s, { type: 'RECORD_INPUT', sample: inputSample({ time, stageSeq: i + 1, x: 140 + i, y: 260 - i }) }, envFor(time));
  }
  return s;
}

describe('reduce: humanity check', () => {
  const config = configFor(['pvt']);

  it('collects evidence only while a run is underway, and drops it on reset', () => {
    const idle = initial(config);
    expect(reduce(idle, { type: 'RECORD_INPUT', sample: inputSample() }, env(0))).toBe(idle);

    const running = reduce(begin(config), { type: 'RECORD_INPUT', sample: inputSample() }, env(2_000));
    expect(running.inputs).toHaveLength(1);
    expect(reduce(running, { type: 'RESET_TEST' }, env(3_000)).inputs).toEqual([]);

    const evaluated = reduce(running, { type: 'TIME_LIMIT_REACHED' }, env(40_000));
    expectStage(evaluated, 'EVALUATED');
    expect(reduce(evaluated, { type: 'RECORD_INPUT', sample: inputSample() }, env(41_000))).toBe(evaluated);
  });

  it('ends the run as soon as one input proves scripted, and says so in the token', () => {
    const s = reduce(begin(config), { type: 'RECORD_INPUT', sample: inputSample({ trusted: false }) }, env(2_000));
    const evaluated = expectStage(s, 'EVALUATED');
    expect(evaluated.passed).toBe(false);
    expect(evaluated.details.failureReason).toBe('HUMAN_CHECK_FAILED');
    expect(evaluated.details.failedTest).toBe('pvt');
    expect(evaluated.details.humanity).toMatchObject({ verdict: 'automated', score: 0 });
    expect(decodeVerificationToken(evaluated.details.verificationToken)).toMatchObject({ ok: false, hv: 'automated', hs: 0 });
  });

  it('weighs behaviour: uniform timing is suspect on its own, damning with the automation flag', () => {
    const suspect = uniformInputs(begin(config), 6);
    expectStage(suspect, 'PVT_AWAITING_STIMULUS');
    expect(humanityOf(suspect)).toMatchObject({ verdict: 'suspect', latencyCv: 0 });

    const caught = uniformInputs(begin(config), 6, botEnv);
    expect(expectStage(caught, 'EVALUATED').details.failureReason).toBe('HUMAN_CHECK_FAILED');
  });

  it('lenient mode reports behaviour but only ends the run on scripted input', () => {
    const lenient = configFor(['pvt'], { humanCheck: 'lenient' });
    const s = uniformInputs(begin(lenient), 6, botEnv);
    expectStage(s, 'PVT_AWAITING_STIMULUS');
    expect(humanityOf(s, { automation: true })).toMatchObject({ verdict: 'automated' });

    const scripted = reduce(s, { type: 'RECORD_INPUT', sample: inputSample({ trusted: false, time: 9_000 }) }, botEnv(9_000));
    expect(expectStage(scripted, 'EVALUATED').details.failureReason).toBe('HUMAN_CHECK_FAILED');
  });

  it('never lets a passing result carry an automated verdict', () => {
    // Evidence gathered before the browser owned up to being automated.
    let s = pvtTrial(pvtTrial(uniformInputs(begin(config), 6), 300), 310);
    const onset = expectStage(s, 'PVT_AWAITING_STIMULUS').stimulusTime;
    s = reduce(s, { type: 'TRIGGER_STIMULUS' }, env(onset));
    s = reduce(s, { type: 'TARGET_TAPPED', tapTime: onset + 320 }, env(onset + 320));
    // Three clean taps in a row: the reaction test itself passed.
    const evaluated = expectStage(reduce(s, { type: 'ADVANCE' }, botEnv(onset + 2_000)), 'EVALUATED');
    expect(evaluated.details.results).toMatchObject([{ test: 'pvt', validTrialCount: 3, lapseCount: 0 }]);
    expect(evaluated.passed).toBe(false);
    expect(evaluated.details.failureReason).toBe('HUMAN_CHECK_FAILED');
    expect(evaluated.details.humanity?.verdict).toBe('automated');
  });

  it('off keeps no evidence and reports none', () => {
    const off = configFor(['pvt'], { humanCheck: 'off' });
    const s = reduce(begin(off), { type: 'RECORD_INPUT', sample: inputSample({ trusted: false }) }, botEnv(2_000));
    expectStage(s, 'PVT_AWAITING_STIMULUS');
    expect(s.inputs).toEqual([]);
    expect(humanityOf(s, { automation: true })).toBeNull();

    const evaluated = expectStage(reduce(s, { type: 'TIME_LIMIT_REACHED' }, botEnv(40_000)), 'EVALUATED');
    expect(evaluated.details.humanity).toBeNull();
    expect(decodeVerificationToken(evaluated.details.verificationToken)).toMatchObject({ hv: null, hs: null });
  });
});
