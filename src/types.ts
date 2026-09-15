/**
 * Core type definitions for the OK2Ride assessment engine.
 *
 * Everything in this module is plain data: no DOM, no timers, no side effects.
 * The state machine (`stateMachine.ts`), the task modules (`tasks/*`) and the
 * web component (`components/*`) all build on these definitions.
 */

/* ------------------------------------------------------------------------ */
/* Identifiers                                                               */
/* ------------------------------------------------------------------------ */

export type Difficulty = 'easy' | 'medium' | 'hard';
export type Theme = 'dark' | 'light';

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];
export const THEMES: readonly Theme[] = ['dark', 'light'];

/**
 * The tests that can be drawn into a run.
 *
 * - `pvt`       Psychomotor Vigilance Task: tap as soon as the panel flashes.
 * - `spatial`   Spatial alignment: rotate a handlebar into a target arc.
 * - `go-no-go`  Response inhibition: tap on GO, hold back on STOP.
 * - `trail`     Trail making: tap scattered numbers in ascending order.
 * - `sequence`  Working memory: repeat a lit-tile pattern.
 * - `stroop`    Interference control: name the ink colour, not the word.
 */
export type TestId = 'pvt' | 'spatial' | 'go-no-go' | 'trail' | 'sequence' | 'stroop';

export const TEST_IDS: readonly TestId[] = ['pvt', 'spatial', 'go-no-go', 'trail', 'sequence', 'stroop'];

export function isTestId(value: unknown): value is TestId {
  return typeof value === 'string' && (TEST_IDS as readonly string[]).includes(value);
}

/** Environment injected into every reducer call so transitions stay deterministic. */
export interface ReducerEnv {
  /** High-resolution monotonic clock (`performance.now()`), in ms. */
  readonly now: number;
  /** Wall clock (`Date.now()`), used only for the `issuedAt` timestamp. */
  readonly epochMs: number;
  /** Uniform random source in [0, 1). */
  readonly random: () => number;
}

/* ------------------------------------------------------------------------ */
/* Configuration                                                             */
/* ------------------------------------------------------------------------ */

/**
 * Fully resolved assessment parameters. Produced by `resolveConfig()` from the
 * element's attributes plus the difficulty preset; frozen for one run.
 */
export interface AssessmentConfig {
  readonly difficulty: Difficulty;
  /** Lapses tolerated in the PVT before the run fails (`lapseCount > maxLapses`). */
  readonly maxLapses: number;
  /** Wall-clock budget for the whole run, measured from the instruction acknowledgement. */
  readonly timeLimitMs: number;
  /** Number of tests drawn per run. */
  readonly stageCount: number;
  /** Tests eligible for selection. Empty means every test. */
  readonly stagePool: readonly TestId[];

  /* --- pvt ------------------------------------------------------------------ */
  readonly requiredValidTrials: number;
  readonly minDelayMs: number;
  readonly maxDelayMs: number;
  readonly falseStartThresholdMs: number;
  readonly lapseThresholdMs: number;
  readonly stimulusTimeoutMs: number;
  readonly maxFalseStarts: number;
  readonly resultDisplayMs: number;

  /* --- spatial -------------------------------------------------------------- */
  readonly spatialToleranceDeg: number;
  readonly spatialWindowMs: number;
  readonly spatialTargetMinDeg: number;
  readonly spatialTargetMaxDeg: number;
  readonly spatialMaxAngleDeg: number;

  /* --- go-no-go ------------------------------------------------------------- */
  readonly gngTrials: number;
  readonly gngNoGoCount: number;
  readonly gngMinDelayMs: number;
  readonly gngMaxDelayMs: number;
  /** Time the GO/STOP signal stays up waiting for a response. */
  readonly gngResponseWindowMs: number;
  /** Taps on STOP (plus anticipations) tolerated. */
  readonly gngMaxCommissions: number;
  /** Missed GO signals tolerated. */
  readonly gngMaxOmissions: number;
  readonly gngResultDisplayMs: number;

  /* --- trail ---------------------------------------------------------------- */
  readonly trailCount: number;
  readonly trailGridSize: number;
  readonly trailWindowMs: number;
  readonly trailMaxErrors: number;

  /* --- sequence ------------------------------------------------------------- */
  readonly sequenceLength: number;
  readonly sequenceGridSize: number;
  readonly sequenceStepOnMs: number;
  readonly sequenceStepOffMs: number;
  readonly sequenceInputWindowMs: number;

  /* --- stroop --------------------------------------------------------------- */
  readonly stroopTrials: number;
  readonly stroopMaxErrors: number;
  readonly stroopTrialTimeoutMs: number;
  readonly stroopResultDisplayMs: number;
}

/* ------------------------------------------------------------------------ */
/* Per-test progress & results                                               */
/* ------------------------------------------------------------------------ */

/* pvt */

export type TrialOutcome = 'VALID' | 'FALSE_START' | 'LAPSE';

export interface PvtTrial {
  readonly index: number;
  readonly delayMs: number;
  /** RT from stimulus onset; negative when the tap preceded the stimulus. */
  readonly rtMs: number;
  readonly outcome: TrialOutcome;
  readonly timedOut: boolean;
}

export interface PvtProgress {
  readonly trials: readonly PvtTrial[];
  readonly consecutiveValid: number;
  readonly startTime: number;
}

export interface PvtResult {
  readonly test: 'pvt';
  readonly trials: readonly PvtTrial[];
  readonly validTrialCount: number;
  readonly lapseCount: number;
  readonly falseStartCount: number;
  readonly meanRtMs: number | null;
  readonly medianRtMs: number | null;
  readonly fastestRtMs: number | null;
  readonly slowestRtMs: number | null;
  readonly durationMs: number;
}

/* spatial */

export interface SpatialResult {
  readonly test: 'spatial';
  readonly targetAngle: number;
  readonly finalAngle: number;
  readonly errorDeg: number;
  readonly toleranceDeg: number;
  readonly durationMs: number;
  readonly windowMs: number;
  readonly withinTolerance: boolean;
  readonly timedOut: boolean;
}

/* go-no-go */

export type GoNoGoOutcome = 'HIT' | 'CORRECT_REJECTION' | 'COMMISSION' | 'OMISSION' | 'FALSE_START';

export interface GoNoGoTrial {
  readonly index: number;
  readonly isGo: boolean;
  readonly outcome: GoNoGoOutcome;
  readonly rtMs: number | null;
}

export interface GoNoGoProgress {
  readonly trials: readonly GoNoGoTrial[];
  /** `true` = GO signal, `false` = STOP signal, per trial. */
  readonly schedule: readonly boolean[];
  readonly startTime: number;
}

export interface GoNoGoResult {
  readonly test: 'go-no-go';
  readonly trials: readonly GoNoGoTrial[];
  readonly hitCount: number;
  /** Taps on STOP plus anticipations. */
  readonly commissionCount: number;
  readonly omissionCount: number;
  readonly meanRtMs: number | null;
  readonly durationMs: number;
}

/* trail */

export interface TrailTarget {
  readonly value: number;
  /** Horizontal position as a percentage of the board width. */
  readonly x: number;
  /** Vertical position as a percentage of the board height. */
  readonly y: number;
}

export interface TrailResult {
  readonly test: 'trail';
  readonly count: number;
  /** Highest number reached in order. */
  readonly reached: number;
  readonly errorCount: number;
  readonly durationMs: number;
  readonly windowMs: number;
  readonly completed: boolean;
  readonly timedOut: boolean;
}

/* sequence */

export interface SequenceResult {
  readonly test: 'sequence';
  readonly length: number;
  readonly sequence: readonly number[];
  readonly entered: readonly number[];
  readonly correct: boolean;
  /** Time from the start of the input phase to completion. */
  readonly durationMs: number;
  readonly windowMs: number;
  readonly timedOut: boolean;
}

/* stroop */

export type StroopColor = 'red' | 'green' | 'blue' | 'yellow';
export const STROOP_COLORS: readonly StroopColor[] = ['red', 'green', 'blue', 'yellow'];

export interface StroopTrial {
  readonly index: number;
  readonly word: StroopColor;
  readonly ink: StroopColor;
  readonly congruent: boolean;
  readonly answer: StroopColor | null;
  readonly correct: boolean;
  readonly rtMs: number | null;
}

export interface StroopProgress {
  readonly trials: readonly StroopTrial[];
  readonly startTime: number;
}

export interface StroopResult {
  readonly test: 'stroop';
  readonly trials: readonly StroopTrial[];
  readonly correctCount: number;
  readonly errorCount: number;
  readonly meanRtMs: number | null;
  readonly durationMs: number;
}

export type TestResult = PvtResult | SpatialResult | GoNoGoResult | TrailResult | SequenceResult | StroopResult;

export type FailureReason =
  | 'TOO_MANY_LAPSES'
  | 'TOO_MANY_FALSE_STARTS'
  | 'TIME_LIMIT_EXCEEDED'
  | 'SPATIAL_OUT_OF_TOLERANCE'
  | 'SPATIAL_TIMEOUT'
  | 'GO_NO_GO_COMMISSIONS'
  | 'GO_NO_GO_OMISSIONS'
  | 'TRAIL_TOO_MANY_ERRORS'
  | 'TRAIL_TIMEOUT'
  | 'SEQUENCE_INCORRECT'
  | 'SEQUENCE_TIMEOUT'
  | 'STROOP_TOO_MANY_ERRORS';

/* ------------------------------------------------------------------------ */
/* Result payload (dispatched with `capability-passed` / `capability-failed`) */
/* ------------------------------------------------------------------------ */

export interface AssessmentResult {
  readonly passed: boolean;
  readonly failureReason: FailureReason | null;
  /** The test that ended the run, when it failed inside a test. */
  readonly failedTest: TestId | null;
  readonly difficulty: Difficulty;
  readonly sessionId: string;
  /** Host-supplied nonce (from the `challenge-nonce` attribute). */
  readonly nonce: string | null;
  /** ISO-8601 timestamp of evaluation. */
  readonly issuedAt: string;
  /** Total time from the instruction acknowledgement to evaluation. */
  readonly completionTimeMs: number;
  /** Tests selected for this run, in the order they were presented. */
  readonly plan: readonly TestId[];
  /** Per-test results, in presentation order (only tests that ran). */
  readonly results: readonly TestResult[];
  /** Mean of every reaction time recorded (PVT responses, GO hits, Stroop answers). */
  readonly meanRtMs: number | null;
  readonly medianRtMs: number | null;
  readonly fastestRtMs: number | null;
  readonly slowestRtMs: number | null;
  readonly validTrialCount: number;
  readonly lapseCount: number;
  readonly falseStartCount: number;
  /** PVT trials (empty when the PVT was not selected). */
  readonly trials: readonly PvtTrial[];
  readonly spatial: SpatialResult | null;
  /**
   * Integrity-checked token encoding the outcome. Client-generated, so it is
   * tamper-evident but not unforgeable: backends must validate it against
   * their own session/nonce records before unlocking anything.
   */
  readonly verificationToken: string;
}

/* ------------------------------------------------------------------------ */
/* Finite state machine                                                      */
/* ------------------------------------------------------------------------ */

/**
 * Discriminated union of every stage the assessment can be in.
 * All timestamps are `performance.now()` values.
 */
export type TestStage =
  | { type: 'IDLE' }
  | { type: 'INSTRUCTION' }
  | { type: 'TEST_INTRO'; test: TestId; index: number }
  | { type: 'PVT_AWAITING_STIMULUS'; stimulusTime: number; delayMs: number; progress: PvtProgress }
  | { type: 'PVT_STIMULUS_ACTIVE'; startTime: number; delayMs: number; progress: PvtProgress }
  | { type: 'PVT_RESULT_DISPLAY'; rtMs: number; isLapse: boolean; outcome: TrialOutcome; progress: PvtProgress }
  | { type: 'SPATIAL_MATCHING'; targetAngle: number; currentAngle: number; startTime: number }
  | { type: 'GNG_AWAITING'; trialIndex: number; isGo: boolean; stimulusTime: number; delayMs: number; progress: GoNoGoProgress }
  | { type: 'GNG_STIMULUS_ACTIVE'; trialIndex: number; isGo: boolean; startTime: number; progress: GoNoGoProgress }
  | { type: 'GNG_RESULT_DISPLAY'; outcome: GoNoGoOutcome; rtMs: number | null; progress: GoNoGoProgress }
  | { type: 'TRAIL_ACTIVE'; startTime: number; targets: readonly TrailTarget[]; nextValue: number; errors: number; lastErrorAt: number | null }
  | { type: 'SEQUENCE_SHOWING'; sequence: readonly number[]; step: number; lit: boolean; startTime: number }
  | { type: 'SEQUENCE_INPUT'; sequence: readonly number[]; entered: readonly number[]; startTime: number; inputStartTime: number }
  | { type: 'STROOP_TRIAL'; trialIndex: number; word: StroopColor; ink: StroopColor; congruent: boolean; startTime: number; progress: StroopProgress }
  | { type: 'STROOP_RESULT_DISPLAY'; correct: boolean; rtMs: number | null; progress: StroopProgress }
  | { type: 'EVALUATED'; passed: boolean; details: AssessmentResult };

export type StageType = TestStage['type'];

/**
 * Every input the reducer understands. Timed inputs carry a `tapTime`
 * sampled with `performance.now()` at the very top of the input handler.
 */
export type Action =
  | { type: 'START_ASSESSMENT' }
  | { type: 'ACKNOWLEDGE_INSTRUCTIONS' }
  | { type: 'BEGIN_TEST' }
  | { type: 'TRIGGER_STIMULUS' }
  | { type: 'TARGET_TAPPED'; tapTime: number }
  | { type: 'STIMULUS_TIMEOUT' }
  | { type: 'ADVANCE' }
  | { type: 'UPDATE_SPATIAL_ANGLE'; angle: number }
  | { type: 'COMPLETE_SPATIAL_STAGE' }
  | { type: 'TRAIL_TAPPED'; value: number; tapTime: number }
  | { type: 'SEQUENCE_TILE_TAPPED'; tile: number; tapTime: number }
  | { type: 'STROOP_ANSWERED'; color: StroopColor; tapTime: number }
  | { type: 'STAGE_TIMEOUT' }
  | { type: 'TIME_LIMIT_REACHED' }
  | {
      type: 'RESET_TEST';
      /** Optional replacement configuration for the next run. */
      config?: AssessmentConfig;
      /** Optional replacement nonce for the next run. */
      nonce?: string | null;
    };

export type ActionType = Action['type'];

/** Complete, immutable machine state: the current stage plus run bookkeeping. */
export interface MachineState {
  readonly stage: TestStage;
  readonly config: AssessmentConfig;
  readonly sessionId: string;
  readonly nonce: string | null;
  /** `performance.now()` when instructions were acknowledged; null until then. */
  readonly assessmentStartTime: number | null;
  /** Tests drawn for this run, in presentation order. */
  readonly plan: readonly TestId[];
  /** Index into `plan` of the current test. */
  readonly planIndex: number;
  /** Results of the tests completed so far. */
  readonly results: readonly TestResult[];
}

/** A timer the host should arm after entering the current stage. */
export interface TimerEffect {
  readonly action: Action;
  readonly delayMs: number;
}
