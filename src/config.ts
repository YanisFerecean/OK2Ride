import type { AssessmentConfig, Difficulty, TestId } from './types';
import { DIFFICULTIES, TEST_IDS, isTestId } from './types';

type PresetKeys =
  | 'spatialToleranceDeg'
  | 'spatialWindowMs'
  | 'gngMaxCommissions'
  | 'trailCount'
  | 'trailWindowMs'
  | 'trailMaxErrors'
  | 'sequenceLength'
  | 'stroopMaxErrors'
  | 'timingToleranceMs'
  | 'timingMaxMisses'
  | 'searchItemCount'
  | 'searchMaxErrors';

/**
 * Parameters shared by every difficulty level. The PVT thresholds follow the
 * standard PVT-B protocol: <100 ms = anticipation, >450 ms = lapse.
 */
export const BASE_CONFIG: Omit<AssessmentConfig, 'difficulty' | PresetKeys> = {
  maxLapses: 2,
  timeLimitMs: 90_000,
  stageCount: 2,
  stagePool: TEST_IDS,

  requiredValidTrials: 3,
  minDelayMs: 1_500,
  maxDelayMs: 4_500,
  falseStartThresholdMs: 100,
  lapseThresholdMs: 450,
  stimulusTimeoutMs: 2_000,
  maxFalseStarts: 3,
  resultDisplayMs: 900,

  spatialTargetMinDeg: 25,
  spatialTargetMaxDeg: 65,
  spatialMaxAngleDeg: 90,

  gngTrials: 6,
  gngNoGoCount: 2,
  gngMinDelayMs: 700,
  gngMaxDelayMs: 1_600,
  gngResponseWindowMs: 900,
  gngMaxOmissions: 1,
  gngResultDisplayMs: 500,

  trailGridSize: 4,

  sequenceGridSize: 3,
  sequenceStepOnMs: 600,
  sequenceStepOffMs: 250,
  sequenceInputWindowMs: 8_000,

  stroopTrials: 5,
  stroopTrialTimeoutMs: 3_000,
  stroopResultDisplayMs: 450,

  timingRounds: 2,
  timingMinTargetMs: 2_500,
  timingMaxTargetMs: 4_500,
  timingGraceMs: 3_000,
  timingResultDisplayMs: 900,

  searchRounds: 3,
  searchGridSize: 4,
  searchRoundTimeoutMs: 6_000,
  searchResultDisplayMs: 500,
};

/**
 * Difficulty tunes how precise, how long and how forgiving each motor /
 * cognitive test is. The PVT thresholds are fixed by protocol and never change.
 */
export const DIFFICULTY_PRESETS: Record<Difficulty, Pick<AssessmentConfig, PresetKeys>> = {
  easy: {
    spatialToleranceDeg: 8,
    spatialWindowMs: 4_000,
    gngMaxCommissions: 1,
    trailCount: 6,
    trailWindowMs: 15_000,
    trailMaxErrors: 3,
    sequenceLength: 3,
    stroopMaxErrors: 2,
    timingToleranceMs: 700,
    timingMaxMisses: 1,
    searchItemCount: 9,
    searchMaxErrors: 2,
  },
  medium: {
    spatialToleranceDeg: 5,
    spatialWindowMs: 3_000,
    gngMaxCommissions: 1,
    trailCount: 8,
    trailWindowMs: 12_000,
    trailMaxErrors: 2,
    sequenceLength: 4,
    stroopMaxErrors: 1,
    timingToleranceMs: 500,
    timingMaxMisses: 1,
    searchItemCount: 12,
    searchMaxErrors: 1,
  },
  hard: {
    spatialToleranceDeg: 3,
    spatialWindowMs: 2_500,
    gngMaxCommissions: 0,
    trailCount: 10,
    trailWindowMs: 11_000,
    trailMaxErrors: 1,
    sequenceLength: 5,
    stroopMaxErrors: 0,
    timingToleranceMs: 350,
    timingMaxMisses: 0,
    searchItemCount: 16,
    searchMaxErrors: 0,
  },
};

export const DEFAULT_DIFFICULTY: Difficulty = 'medium';

export const LIMITS = {
  maxLapses: { min: 0, max: 20 },
  timeLimitMs: { min: 5_000, max: 600_000 },
  stageCount: { min: 1, max: TEST_IDS.length },
} as const;

/** Raw, unvalidated values as they arrive from attributes or properties. */
export interface ConfigInput {
  readonly maxLapses?: number | string | null | undefined;
  readonly timeLimitMs?: number | string | null | undefined;
  readonly difficulty?: string | null | undefined;
  readonly stageCount?: number | string | null | undefined;
  /** Comma-separated string or array of test ids. Unknown ids are ignored. */
  readonly stagePool?: string | readonly string[] | null | undefined;
}

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && (DIFFICULTIES as readonly string[]).includes(value);
}

function clampInt(raw: number | string | null | undefined, min: number, max: number, fallback: number): number {
  if (raw === null || raw === undefined || raw === '') return fallback;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Parses a pool specification into distinct, valid test ids (in given order). */
export function parseStagePool(raw: string | readonly string[] | null | undefined): TestId[] {
  if (raw === null || raw === undefined) return [];
  const parts = typeof raw === 'string' ? raw.split(/[\s,]+/) : raw;
  const out: TestId[] = [];
  for (const part of parts) {
    const id = part.trim().toLowerCase();
    if (isTestId(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Builds a fully resolved, validated configuration from loose inputs. */
export function resolveConfig(input: ConfigInput = {}): AssessmentConfig {
  const difficulty = isDifficulty(input.difficulty) ? input.difficulty : DEFAULT_DIFFICULTY;
  const pool = parseStagePool(input.stagePool);
  return {
    ...BASE_CONFIG,
    ...DIFFICULTY_PRESETS[difficulty],
    difficulty,
    maxLapses: clampInt(input.maxLapses, LIMITS.maxLapses.min, LIMITS.maxLapses.max, BASE_CONFIG.maxLapses),
    timeLimitMs: clampInt(input.timeLimitMs, LIMITS.timeLimitMs.min, LIMITS.timeLimitMs.max, BASE_CONFIG.timeLimitMs),
    stageCount: clampInt(input.stageCount, LIMITS.stageCount.min, LIMITS.stageCount.max, BASE_CONFIG.stageCount),
    stagePool: pool.length ? pool : TEST_IDS,
  };
}
