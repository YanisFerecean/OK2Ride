/**
 * Humanity check: is the input coming from a person, or from a script?
 *
 * The widget measures how a rider responds, so it already holds the evidence
 * needed to answer that question. Every input event it acts on is reduced to
 * an `InputSample` (see `components/input.ts`) and scored here.
 *
 * Two kinds of evidence are kept apart:
 *
 * - **Decisive.** `Event.isTrusted` is false for anything a script dispatched.
 *   The DOM specification guarantees it, no page code can forge it, so a
 *   single such event settles the question.
 * - **Behavioural.** Latency spread, response speed, pointer geometry and the
 *   automation flag. Each is only suggestive, so each carries a weight and
 *   none can condemn a run on its own. The thresholds below sit far outside
 *   what a hand can produce, which keeps false accusations rare at the cost
 *   of missing a bot that deliberately imitates human jitter. Where a signal
 *   cannot separate a person from a script it is not collected at all: a
 *   mouse resting on a button repeats its coordinates exactly as a bot would,
 *   so coordinates are only judged for touch and pen.
 *
 * Like every client-side check this is evidence, not proof: it runs in the
 * browser it is judging. Treat the report as one input to a server-side
 * decision, alongside the nonce, rate limits and your own fraud signals.
 *
 * Pure: no DOM, no timers, no randomness.
 */

import type { HumanCheckMode, HumanityReport, HumanitySignal, HumanitySignalId, HumanityVerdict, InputSample, StageType } from './types';

/** Samples kept per run. Older ones are dropped, which bounds the payload. */
export const MAX_INPUT_SAMPLES = 256;

/** Suspicion each signal contributes. Decisive evidence weighs a full point. */
export const HUMANITY_WEIGHTS: Readonly<Record<HumanitySignalId, number>> = {
  'synthetic-event': 1,
  'uniform-timing': 0.6,
  'fixed-pointer': 0.6,
  'automation-flag': 0.5,
  'superhuman-latency': 0.5,
  'still-pointer': 0.35,
};

export const HUMANITY_LIMITS = {
  /** Suspicion at or above this reads as `automated`. */
  automated: 0.8,
  /** Suspicion at or above this reads as `suspect`. */
  suspect: 0.3,
  /** Latencies needed before their spread means anything. */
  minLatencies: 6,
  /** Coefficient of variation below which no hand is plausible. */
  uniformCv: 0.02,
  /** A response this fast beats human nerve conduction. */
  superhumanMs: 60,
  /** Superhuman responses tolerated; one can be a lucky anticipation. */
  maxSuperhuman: 1,
  /** Touch taps from one exact coordinate, across distinct stages, before it counts. */
  fixedPointerTaps: 4,
  /** Mouse taps with no movement in between before it counts. */
  stillPointerTaps: 3,
} as const;

/**
 * Stages where the first input answers something that just appeared, so the
 * time since the stage began is a reaction time. Waiting stages and result
 * displays are excluded: an input there is an error, not a response.
 */
const RESPONSE_STAGES: ReadonlySet<StageType> = new Set<StageType>([
  'PVT_STIMULUS_ACTIVE',
  'GNG_STIMULUS_ACTIVE',
  'STROOP_TRIAL',
  'SEARCH_ACTIVE',
  'TRAIL_ACTIVE',
  'SEQUENCE_INPUT',
]);

/** Appends a sample, keeping the most recent `MAX_INPUT_SAMPLES`. */
export function recordInput(samples: readonly InputSample[], sample: InputSample): readonly InputSample[] {
  const next = [...samples, sample];
  return next.length > MAX_INPUT_SAMPLES ? next.slice(next.length - MAX_INPUT_SAMPLES) : next;
}

/**
 * The response latencies a run produced: time from the stage appearing to the
 * first input, then the gap to each further input answering the same stage
 * (the trail and pattern tests take several taps in one stage).
 *
 * Only response stages contribute. Elsewhere an input is an adjustment or a
 * mistake, not an answer, and its timing says nothing about who made it.
 */
export function responseLatencies(samples: readonly InputSample[]): number[] {
  const out: number[] = [];
  let previous: InputSample | null = null;
  for (const sample of samples) {
    if (!RESPONSE_STAGES.has(sample.stage)) {
      previous = sample;
      continue;
    }
    out.push(previous !== null && previous.stageSeq === sample.stageSeq ? sample.time - previous.time : sample.sinceStageMs);
    previous = sample;
  }
  return out.filter((ms) => Number.isFinite(ms) && ms >= 0);
}

/** Spread of the latencies relative to their mean; null below the sample minimum. */
function coefficientOfVariation(values: readonly number[]): number | null {
  if (values.length < HUMANITY_LIMITS.minLatencies) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  // Every response instantaneous: no spread at all, and no mean to divide by.
  if (mean <= 0) return 0;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/**
 * Most touch taps that share one exact coordinate while answering different
 * stages. Contact centroids are noisy, so a finger does not land on the same
 * pixel four times; a mouse resting on a button does, which is why this looks
 * at touch and pen only.
 */
function fixedPointerTaps(pointers: readonly InputSample[]): number {
  const byPoint = new Map<string, Set<number>>();
  let most = 0;
  for (const sample of pointers) {
    if (sample.pointerType === 'mouse') continue;
    const key = `${sample.x},${sample.y}`;
    const stages = byPoint.get(key) ?? new Set<number>();
    stages.add(sample.stageSeq);
    byPoint.set(key, stages);
    most = Math.max(most, stages.size);
  }
  return most;
}

function signal(id: HumanitySignalId, decisive: boolean, detail: string): HumanitySignal {
  return { id, weight: HUMANITY_WEIGHTS[id], decisive, detail };
}

function verdictFor(suspicion: number, signals: readonly HumanitySignal[]): HumanityVerdict {
  if (signals.some((s) => s.decisive) || suspicion >= HUMANITY_LIMITS.automated) return 'automated';
  return suspicion >= HUMANITY_LIMITS.suspect ? 'suspect' : 'human';
}

/**
 * Scores the evidence gathered during a run.
 *
 * `automation` is the browser's own `navigator.webdriver` flag, passed in so
 * this module stays free of globals.
 */
export function assessHumanity(samples: readonly InputSample[], options: { readonly automation?: boolean } = {}): HumanityReport {
  const signals: HumanitySignal[] = [];

  const scripted = samples.filter((s) => !s.trusted).length;
  if (scripted > 0) signals.push(signal('synthetic-event', true, `${scripted} of ${samples.length} inputs were dispatched by a script`));

  if (options.automation === true) signals.push(signal('automation-flag', false, 'the browser reports navigator.webdriver'));

  const latencies = responseLatencies(samples);
  const cv = coefficientOfVariation(latencies);
  if (cv !== null && cv < HUMANITY_LIMITS.uniformCv) {
    signals.push(signal('uniform-timing', false, `${latencies.length} responses varied by only ${(cv * 100).toFixed(2)}%`));
  }

  const superhuman = latencies.filter((ms) => ms <= HUMANITY_LIMITS.superhumanMs).length;
  if (superhuman > HUMANITY_LIMITS.maxSuperhuman) {
    signals.push(signal('superhuman-latency', false, `${superhuman} responses came in under ${HUMANITY_LIMITS.superhumanMs} ms`));
  }

  const pointers = samples.filter((s) => s.kind === 'pointer' && s.pointerType !== null && s.x !== null && s.y !== null);
  const fixed = fixedPointerTaps(pointers);
  if (fixed >= HUMANITY_LIMITS.fixedPointerTaps) {
    signals.push(signal('fixed-pointer', false, `${fixed} touch taps on different stages came from one exact coordinate`));
  }

  const mouse = pointers.filter((s) => s.pointerType === 'mouse');
  if (mouse.length >= HUMANITY_LIMITS.stillPointerTaps && mouse.every((s) => s.movesSince === 0)) {
    signals.push(signal('still-pointer', false, `${mouse.length} mouse taps with the pointer never moving`));
  }

  signals.sort((a, b) => b.weight - a.weight);
  const suspicion = Math.min(1, signals.reduce((sum, s) => sum + s.weight, 0));

  return {
    verdict: verdictFor(suspicion, signals),
    score: Number((1 - suspicion).toFixed(2)),
    signals,
    sampleCount: samples.length,
    latencyCv: cv === null ? null : Number(cv.toFixed(4)),
  };
}

/** Whether this report should end the run, under the configured mode. */
export function humanCheckFailed(report: HumanityReport | null, mode: HumanCheckMode): boolean {
  if (report === null || mode === 'off') return false;
  if (mode === 'lenient') return report.signals.some((s) => s.decisive);
  return report.verdict === 'automated';
}
