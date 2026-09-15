// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CognitiveCaptcha, TAG_NAME } from '../index';
import type { AssessmentResult, TestStage } from '../types';

const FAKE = ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] as const;

function mount(attrs: Record<string, string> = {}): CognitiveCaptcha {
  const el = document.createElement(TAG_NAME);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.append(el);
  return el;
}

function shadow(el: CognitiveCaptcha): ShadowRoot {
  const root = el.shadowRoot;
  if (!root) throw new Error('no shadow root');
  return root;
}

function query<T extends Element = HTMLElement>(el: CognitiveCaptcha, selector: string): T {
  const found = shadow(el).querySelector<T>(selector);
  if (!found) throw new Error(`missing ${selector}`);
  return found;
}

function click(el: CognitiveCaptcha, selector: string): void {
  query(el, selector).dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
}

function activate(target: Element): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

function stage<T extends TestStage['type']>(el: CognitiveCaptcha, type: T): Extract<TestStage, { type: T }> {
  expect(el.stage.type).toBe(type);
  return el.stage as Extract<TestStage, { type: T }>;
}

/** Start → instructions → first intro → Go. */
function launch(el: CognitiveCaptcha): void {
  click(el, '[data-action="start"]');
  stage(el, 'INSTRUCTION');
  click(el, '[data-action="ready"]');
  stage(el, 'TEST_INTRO');
  click(el, '[data-action="begin"]');
}

/** Runs one full PVT trial with the given reaction time, through the result display. */
function pvtTrial(el: CognitiveCaptcha, rtMs: number): void {
  const awaiting = stage(el, 'PVT_AWAITING_STIMULUS');
  vi.advanceTimersByTime(awaiting.delayMs);
  vi.advanceTimersByTime(20); // animation frame that reveals the stimulus
  const active = stage(el, 'PVT_STIMULUS_ACTIVE');
  expect(query(el, '.tap-area').dataset['phase']).toBe('active');
  vi.advanceTimersByTime(rtMs - (performance.now() - active.startTime));
  activate(query(el, '.tap-area'));
  stage(el, 'PVT_RESULT_DISPLAY');
  vi.advanceTimersByTime(el.config.resultDisplayMs);
}

describe('<cognitive-captcha>', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: [...FAKE] });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('registers the custom element and renders the idle screen in a shadow root', () => {
    expect(customElements.get(TAG_NAME)).toBe(CognitiveCaptcha);
    const el = mount();
    expect(el.stage.type).toBe('IDLE');
    expect(shadow(el).querySelector('[data-action="start"]')).not.toBeNull();
    expect(el.result).toBeNull();
    expect(el.active).toBe(false);
  });

  it('reflects attributes as properties with validation and defaults', () => {
    const el = mount({ 'max-lapses': '4', 'time-limit-ms': '45000', difficulty: 'hard', theme: 'light', 'stage-count': '3', 'stage-pool': 'stroop,trail,bogus', 'challenge-nonce': 'abc' });
    expect(el.maxLapses).toBe(4);
    expect(el.timeLimitMs).toBe(45_000);
    expect(el.difficulty).toBe('hard');
    expect(el.theme).toBe('light');
    expect(el.stageCount).toBe(3);
    expect(el.stagePool).toEqual(['stroop', 'trail']);
    expect(el.challengeNonce).toBe('abc');
    expect(el.config.spatialToleranceDeg).toBe(3);

    el.difficulty = 'easy';
    el.maxLapses = 99;
    el.stagePool = [];
    el.setAttribute('time-limit-ms', 'not-a-number');
    expect(el.config.difficulty).toBe('easy');
    expect(el.maxLapses).toBe(20); // clamped
    expect(el.timeLimitMs).toBe(90_000); // fallback
    expect(el.stagePool).toHaveLength(6);
    expect(el.hasAttribute('stage-pool')).toBe(false);
  });

  it('lists the drawn tests on the instruction screen and introduces each before it starts', () => {
    const el = mount({ 'stage-pool': 'pvt,spatial' });
    click(el, '[data-action="start"]');
    expect(el.plan).toEqual(['pvt', 'spatial']);
    const steps = shadow(el).querySelectorAll('.steps li');
    expect(steps).toHaveLength(2);
    expect(steps[0]?.textContent).toContain('Reaction');
    expect(steps[1]?.textContent).toContain('Steering');
    click(el, '[data-action="ready"]');
    expect(query(el, 'h1').textContent).toBe('Reaction');
    expect(query(el, '.stage-label').textContent).toBe('Test 1 of 2 · Reaction');
  });

  it('runs a two-test plan end to end and dispatches capability-passed', () => {
    const el = mount({ 'max-lapses': '2', 'stage-pool': 'pvt,spatial', 'challenge-nonce': 'n-1' });
    const stages: string[] = [];
    let passed: AssessmentResult | null = null;
    el.addEventListener('stage-change', (e) => stages.push(e.detail.stage.type));
    el.addEventListener('capability-passed', (e) => (passed = e.detail));
    el.addEventListener('capability-failed', () => {
      throw new Error('should not fail');
    });

    launch(el);
    stage(el, 'PVT_AWAITING_STIMULUS');
    expect(el.active).toBe(true);

    pvtTrial(el, 240);
    pvtTrial(el, 260);
    expect(shadow(el).querySelectorAll('.dot.filled')).toHaveLength(2);
    pvtTrial(el, 280);

    expect(stage(el, 'TEST_INTRO')).toEqual({ type: 'TEST_INTRO', test: 'spatial', index: 1 });
    click(el, '[data-action="begin"]');
    const spatial = stage(el, 'SPATIAL_MATCHING');
    const dial = query(el, '.dial-wrap');
    for (let i = 0; i < Math.abs(spatial.targetAngle); i++) {
      dial.dispatchEvent(new KeyboardEvent('keydown', { key: spatial.targetAngle < 0 ? 'ArrowLeft' : 'ArrowRight', bubbles: true }));
    }
    expect(stage(el, 'SPATIAL_MATCHING').currentAngle).toBe(spatial.targetAngle);
    expect(dial.classList.contains('in-zone')).toBe(true);
    vi.advanceTimersByTime(500);
    dial.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    const evaluated = stage(el, 'EVALUATED');
    expect(evaluated.passed).toBe(true);
    const result = passed as unknown as AssessmentResult;
    expect(result).toBe(el.result);
    expect(result.plan).toEqual(['pvt', 'spatial']);
    expect(result.results.map((r) => r.test)).toEqual(['pvt', 'spatial']);
    expect(result.meanRtMs).toBe(260);
    expect(result.nonce).toBe('n-1');
    expect(result.verificationToken.startsWith('cc1.')).toBe(true);
    expect(stages).toEqual([
      'INSTRUCTION',
      'TEST_INTRO',
      'PVT_AWAITING_STIMULUS',
      'PVT_STIMULUS_ACTIVE',
      'PVT_RESULT_DISPLAY',
      'PVT_AWAITING_STIMULUS',
      'PVT_STIMULUS_ACTIVE',
      'PVT_RESULT_DISPLAY',
      'PVT_AWAITING_STIMULUS',
      'PVT_STIMULUS_ACTIVE',
      'PVT_RESULT_DISPLAY',
      'TEST_INTRO',
      'SPATIAL_MATCHING',
      'EVALUATED',
    ]);
    expect(query(el, 'h1').textContent).toBe('Clear to ride');
    expect(shadow(el).querySelectorAll('.row.pass')).toHaveLength(2);
    expect(el.active).toBe(false);
  });

  it('shows real-time PVT feedback and fails past max-lapses', () => {
    const el = mount({ 'max-lapses': '0', 'stage-pool': 'pvt', 'stage-count': '1' });
    let failed: AssessmentResult | null = null;
    el.addEventListener('capability-failed', (e) => (failed = e.detail));
    launch(el);

    vi.advanceTimersByTime(200);
    activate(query(el, '.tap-area'));
    expect(query(el, '.feedback').textContent).toBe('Too early!');
    expect(query(el, '.tap-area').dataset['outcome']).toBe('FALSE_START');
    vi.advanceTimersByTime(el.config.resultDisplayMs);

    const awaiting = stage(el, 'PVT_AWAITING_STIMULUS');
    vi.advanceTimersByTime(awaiting.delayMs + 20);
    vi.advanceTimersByTime(600);
    activate(query(el, '.tap-area'));
    expect(query(el, '.feedback').textContent).toMatch(/^Lapse detected · \d+ ms$/);
    vi.advanceTimersByTime(el.config.resultDisplayMs);

    const evaluated = stage(el, 'EVALUATED');
    expect(evaluated.details.failureReason).toBe('TOO_MANY_LAPSES');
    expect(failed).not.toBeNull();
    expect(shadow(el).querySelector('.row.fail')).not.toBeNull();
    click(el, '[data-action="reset"]');
    stage(el, 'IDLE');
    expect(el.result).toBeNull();
  });

  it('runs the Go / Stop test: green GO taps, red STOP held', () => {
    const el = mount({ 'stage-pool': 'go-no-go', 'stage-count': '1' });
    launch(el);
    const schedule = stage(el, 'GNG_AWAITING').progress.schedule;
    for (const isGo of schedule) {
      const awaiting = stage(el, 'GNG_AWAITING');
      expect(awaiting.isGo).toBe(isGo);
      vi.advanceTimersByTime(awaiting.delayMs + 20);
      stage(el, 'GNG_STIMULUS_ACTIVE');
      const tap = query(el, '.tap-area');
      expect(tap.dataset['signal']).toBe(isGo ? 'go' : 'stop');
      expect(query(el, '.tap-label').textContent).toBe(isGo ? 'GO' : 'STOP');
      if (isGo) {
        vi.advanceTimersByTime(300);
        activate(tap);
        expect(query(el, '.feedback').textContent).toMatch(/^Hit! \d+ ms$/);
      } else {
        vi.advanceTimersByTime(el.config.gngResponseWindowMs);
        expect(query(el, '.feedback').textContent).toBe('Held back. Good.');
      }
      stage(el, 'GNG_RESULT_DISPLAY');
      vi.advanceTimersByTime(el.config.gngResultDisplayMs);
    }
    const evaluated = stage(el, 'EVALUATED');
    expect(evaluated.passed).toBe(true);
    expect(evaluated.details.results[0]).toMatchObject({ test: 'go-no-go', commissionCount: 0, omissionCount: 0 });
  });

  it('runs the number trail: nodes are laid out and collected in order', () => {
    const el = mount({ 'stage-pool': 'trail', 'stage-count': '1' });
    launch(el);
    const trail = stage(el, 'TRAIL_ACTIVE');
    const nodes = shadow(el).querySelectorAll<HTMLButtonElement>('.trail-node');
    expect(nodes).toHaveLength(trail.targets.length);
    const byValue = new Map([...nodes].map((n) => [Number(n.textContent), n]));
    activate(byValue.get(3) as Element); // wrong order → error flash
    expect(stage(el, 'TRAIL_ACTIVE').errors).toBe(1);
    expect(query(el, '.trail-board').classList.contains('error')).toBe(true);
    for (let v = 1; v <= trail.targets.length; v++) {
      vi.advanceTimersByTime(400);
      activate(byValue.get(v) as Element);
      if (v < trail.targets.length) expect(byValue.get(v)?.classList.contains('done')).toBe(true);
    }
    const evaluated = stage(el, 'EVALUATED');
    expect(evaluated.passed).toBe(true);
    expect(evaluated.details.results[0]).toMatchObject({ test: 'trail', completed: true, errorCount: 1 });
  });

  it('runs pattern memory: tiles light up in turn, then accept the same order', () => {
    const el = mount({ 'stage-pool': 'sequence', 'stage-count': '1' });
    launch(el);
    const showing = stage(el, 'SEQUENCE_SHOWING');
    const tiles = shadow(el).querySelectorAll<HTMLButtonElement>('.tile');
    expect(tiles).toHaveLength(9);
    expect(tiles[showing.sequence[0] ?? 0]?.classList.contains('lit')).toBe(true);
    expect(query(el, '.tiles').hasAttribute('data-locked')).toBe(true);
    vi.advanceTimersByTime((el.config.sequenceStepOnMs + el.config.sequenceStepOffMs) * showing.sequence.length);
    const input = stage(el, 'SEQUENCE_INPUT');
    expect(query(el, '.tiles').hasAttribute('data-locked')).toBe(false);
    for (const tile of input.sequence) {
      vi.advanceTimersByTime(300);
      activate(tiles[tile] as Element);
    }
    const evaluated = stage(el, 'EVALUATED');
    expect(evaluated.passed).toBe(true);
    expect(evaluated.details.results[0]).toMatchObject({ test: 'sequence', correct: true });
  });

  it('runs colour match: the ink button is the right answer', () => {
    const el = mount({ 'stage-pool': 'stroop', 'stage-count': '1' });
    launch(el);
    for (let i = 0; i < el.config.stroopTrials; i++) {
      const trial = stage(el, 'STROOP_TRIAL');
      expect(query(el, '.stroop-word').textContent).toBe(trial.word.toUpperCase());
      expect(query(el, '.stroop-word').classList.contains(`ink-${trial.ink}`)).toBe(true);
      vi.advanceTimersByTime(650);
      activate(query(el, `.stroop-option[data-color="${trial.ink}"]`));
      stage(el, 'STROOP_RESULT_DISPLAY');
      expect(query(el, '.feedback').textContent).toMatch(/^Correct · \d+ ms$/);
      vi.advanceTimersByTime(el.config.stroopResultDisplayMs);
    }
    const evaluated = stage(el, 'EVALUATED');
    expect(evaluated.passed).toBe(true);
    expect(evaluated.details.results[0]).toMatchObject({ test: 'stroop', correctCount: 5, errorCount: 0 });
  });

  it('fails with TIME_LIMIT_EXCEEDED when the deadline passes', () => {
    const el = mount({ 'time-limit-ms': '5000', 'stage-pool': 'trail', 'stage-count': '1' });
    let failed: AssessmentResult | null = null;
    el.addEventListener('capability-failed', (e) => (failed = e.detail));
    el.start();
    click(el, '[data-action="ready"]');
    vi.advanceTimersByTime(5_001);
    expect(stage(el, 'EVALUATED').details.failureReason).toBe('TIME_LIMIT_EXCEEDED');
    expect((failed as unknown as AssessmentResult).completionTimeMs).toBeGreaterThanOrEqual(5_000);
  });

  it('abandons a run when removed from the document and stops its timers', () => {
    const el = mount();
    const onFail = vi.fn();
    el.addEventListener('capability-failed', onFail);
    el.start();
    click(el, '[data-action="ready"]');
    el.remove();
    expect(el.stage.type).toBe('IDLE');
    vi.advanceTimersByTime(120_000);
    expect(onFail).not.toHaveBeenCalled();
  });
});
