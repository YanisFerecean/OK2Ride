import { describe, expect, it } from 'vitest';
import { HUMANITY_LIMITS, MAX_INPUT_SAMPLES, assessHumanity, humanCheckFailed, recordInput, responseLatencies } from './humanity';
import type { HumanitySignalId, InputSample } from './types';

function sample(overrides: Partial<InputSample> = {}): InputSample {
  return {
    time: 1_000,
    kind: 'pointer',
    trusted: true,
    pointerType: 'touch',
    x: 120,
    y: 240,
    movesSince: 3,
    stage: 'PVT_STIMULUS_ACTIVE',
    stageSeq: 1,
    sinceStageMs: 300,
    ...overrides,
  };
}

/**
 * One tap per stage occurrence, each answering after the given latency. Real
 * taps never land on exactly the same pixel, so the coordinates drift.
 */
function responses(latencies: readonly number[], overrides: Partial<InputSample> = {}): InputSample[] {
  let time = 0;
  return latencies.map((ms, index) => {
    time += 2_000 + ms;
    return sample({ stageSeq: index + 1, sinceStageMs: ms, time, x: 120 + index * 3, y: 240 - index, ...overrides });
  });
}

const ids = (samples: readonly InputSample[], automation = false): HumanitySignalId[] =>
  assessHumanity(samples, { automation }).signals.map((s) => s.id);

/** Human-looking reaction times: fast, but never twice the same. */
const HUMAN_LATENCIES = [284, 331, 266, 352, 297, 318, 275, 340];

describe('assessHumanity', () => {
  it('clears input that looks like a person', () => {
    const report = assessHumanity(responses(HUMAN_LATENCIES));
    expect(report.verdict).toBe('human');
    expect(report.score).toBe(1);
    expect(report.signals).toEqual([]);
    expect(report.sampleCount).toBe(HUMAN_LATENCIES.length);
    expect(report.latencyCv).toBeGreaterThan(HUMANITY_LIMITS.uniformCv);
  });

  it('settles the question on one scripted event, whatever else looks fine', () => {
    const samples = responses(HUMAN_LATENCIES);
    samples[3] = sample({ ...samples[3], trusted: false } as Partial<InputSample>);
    const report = assessHumanity(samples);
    expect(report.verdict).toBe('automated');
    expect(report.score).toBe(0);
    expect(report.signals[0]).toMatchObject({ id: 'synthetic-event', decisive: true });
    expect(report.signals[0]?.detail).toContain('1 of 8');
    // Decisive evidence is rejected in every mode that is switched on.
    expect(humanCheckFailed(report, 'strict')).toBe(true);
    expect(humanCheckFailed(report, 'lenient')).toBe(true);
    expect(humanCheckFailed(report, 'off')).toBe(false);
  });

  it('flags latencies too uniform for a hand, but not on their own', () => {
    const report = assessHumanity(responses([300, 300, 300, 300, 300, 300]));
    expect(report.signals.map((s) => s.id)).toEqual(['uniform-timing']);
    expect(report.latencyCv).toBe(0);
    expect(report.verdict).toBe('suspect');
    expect(humanCheckFailed(report, 'strict')).toBe(false);

    // One more independent signal is what makes it conclusive.
    const withFlag = assessHumanity(responses([300, 300, 300, 300, 300, 300]), { automation: true });
    expect(withFlag.signals.map((s) => s.id)).toEqual(['uniform-timing', 'automation-flag']);
    expect(withFlag.verdict).toBe('automated');
    expect(humanCheckFailed(withFlag, 'strict')).toBe(true);
    // Behaviour is evidence, not proof, so a lenient run still stands.
    expect(humanCheckFailed(withFlag, 'lenient')).toBe(false);
  });

  it('needs enough responses before judging their spread', () => {
    const few = assessHumanity(responses([300, 300, 300, 300, 300]));
    expect(few.latencyCv).toBeNull();
    expect(few.signals).toEqual([]);
    expect(HUMANITY_LIMITS.minLatencies).toBe(6);
  });

  it('flags repeated responses faster than nerve conduction', () => {
    expect(ids(responses([12, 8, 290, 315, 274, 330]))).toContain('superhuman-latency');
    // A single anticipation is a rider jumping the gun, not a machine.
    expect(ids(responses([12, 290, 315, 274, 330, 288]))).not.toContain('superhuman-latency');
  });

  it('flags touch taps on different stages from one exact coordinate', () => {
    const fixed = responses(HUMAN_LATENCIES, { x: 50, y: 60, pointerType: 'touch', movesSince: 4 });
    expect(ids(fixed)).toContain('fixed-pointer');
    const moved = fixed.map((s, i) => sample({ ...s, x: 50 + i * 7 } as Partial<InputSample>));
    expect(ids(moved)).not.toContain('fixed-pointer');
    // A mouse left resting on a button repeats its coordinates exactly as a
    // script would, so coordinates say nothing about it.
    expect(ids(responses(HUMAN_LATENCIES, { x: 50, y: 60, pointerType: 'mouse', movesSince: 4 }))).not.toContain('fixed-pointer');
  });

  it('flags a mouse that clicks without ever moving, and spares touch', () => {
    const still = responses(HUMAN_LATENCIES, { pointerType: 'mouse', movesSince: 0, x: 10, y: 10 });
    expect(ids(still)).toContain('still-pointer');
    const moving = responses(HUMAN_LATENCIES, { pointerType: 'mouse', movesSince: 6, x: 10, y: 10 });
    expect(ids(moving)).not.toContain('still-pointer');
    // A finger produces no moves before it lands, so touch proves nothing here.
    const touch = responses(HUMAN_LATENCIES, { pointerType: 'touch', movesSince: 0, x: 10, y: 10 });
    expect(ids(touch)).not.toContain('still-pointer');
  });

  it('reads the automation flag as corroboration, never as a verdict', () => {
    const report = assessHumanity(responses(HUMAN_LATENCIES), { automation: true });
    expect(report.signals.map((s) => s.id)).toEqual(['automation-flag']);
    expect(report.verdict).toBe('suspect');
    expect(report.score).toBe(0.5);
    expect(humanCheckFailed(report, 'strict')).toBe(false);
  });

  it('reports a human verdict when there is nothing to judge', () => {
    expect(assessHumanity([])).toMatchObject({ verdict: 'human', score: 1, sampleCount: 0, latencyCv: null });
    expect(humanCheckFailed(null, 'strict')).toBe(false);
  });
});

describe('responseLatencies', () => {
  it('measures from the stage appearing, then between taps answering it', () => {
    const samples: InputSample[] = [
      sample({ stage: 'TRAIL_ACTIVE', stageSeq: 4, sinceStageMs: 420, time: 1_000 }),
      sample({ stage: 'TRAIL_ACTIVE', stageSeq: 4, sinceStageMs: 690, time: 1_270 }),
      sample({ stage: 'TRAIL_ACTIVE', stageSeq: 4, sinceStageMs: 1_010, time: 1_590 }),
    ];
    expect(responseLatencies(samples)).toEqual([420, 270, 320]);
  });

  it('ignores stages where an input is an adjustment or a mistake, not an answer', () => {
    const samples: InputSample[] = [
      sample({ stage: 'PVT_AWAITING_STIMULUS', stageSeq: 1, sinceStageMs: 80 }),
      sample({ stage: 'SPATIAL_MATCHING', stageSeq: 2, sinceStageMs: 5, time: 2_000 }),
      sample({ stage: 'SPATIAL_MATCHING', stageSeq: 2, sinceStageMs: 6, time: 2_001 }),
      sample({ stage: 'STROOP_TRIAL', stageSeq: 3, sinceStageMs: 640, time: 3_000 }),
    ];
    expect(responseLatencies(samples)).toEqual([640]);
  });
});

describe('recordInput', () => {
  it('keeps the most recent samples and leaves the input untouched', () => {
    const original: readonly InputSample[] = [];
    let samples = original;
    for (let i = 0; i < MAX_INPUT_SAMPLES + 10; i++) samples = recordInput(samples, sample({ time: i }));
    expect(original).toEqual([]);
    expect(samples).toHaveLength(MAX_INPUT_SAMPLES);
    expect(samples[0]?.time).toBe(10);
    expect(samples[samples.length - 1]?.time).toBe(MAX_INPUT_SAMPLES + 9);
  });
});
