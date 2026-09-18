// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OK2Ride, TAG_NAME } from '../index';
import { decodeVerificationToken } from '../token';
import type { AssessmentResult, TestStage } from '../types';

const FAKE = ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] as const;

function mount(attrs: Record<string, string> = {}): OK2Ride {
  const el = document.createElement(TAG_NAME);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.append(el);
  return el;
}

function shadow(el: OK2Ride): ShadowRoot {
  const root = el.shadowRoot;
  if (!root) throw new Error('no shadow root');
  return root;
}

function query<T extends Element = HTMLElement>(el: OK2Ride, selector: string): T {
  const found = shadow(el).querySelector<T>(selector);
  if (!found) throw new Error(`missing ${selector}`);
  return found;
}

function click(el: OK2Ride, selector: string): void {
  query(el, selector).dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
}

function activate(target: Element): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

/**
 * An event as a script dispatches it. Browsers set `isTrusted` to false for
 * anything `dispatchEvent` produces; happy-dom leaves it undefined, so the
 * flag is forged here to reproduce what the widget sees in the real thing.
 */
function scripted<E extends Event>(event: E): E {
  Object.defineProperty(event, 'isTrusted', { value: false, configurable: true });
  return event;
}

/** Taps the whole number trail in order, every tap the same distance apart. */
function runTrail(el: OK2Ride, gapMs: number): void {
  const nodes = [...shadow(el).querySelectorAll('.trail-node')];
  const byValue = new Map(nodes.map((node) => [Number(node.textContent), node]));
  for (let value = 1; value <= nodes.length; value++) {
    vi.advanceTimersByTime(gapMs);
    activate(byValue.get(value) as Element);
  }
}

function stage<T extends TestStage['type']>(el: OK2Ride, type: T): Extract<TestStage, { type: T }> {
  expect(el.stage.type).toBe(type);
  return el.stage as Extract<TestStage, { type: T }>;
}

/** Start → instructions → first intro → Go. */
function launch(el: OK2Ride): void {
  click(el, '[data-action="start"]');
  stage(el, 'INSTRUCTION');
  click(el, '[data-action="ready"]');
  stage(el, 'TEST_INTRO');
  click(el, '[data-action="begin"]');
}

/** Runs one full PVT trial with the given reaction time, through the result display. */
function pvtTrial(el: OK2Ride, rtMs: number): void {
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

describe('<ok2ride-check>', () => {
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
    expect(customElements.get(TAG_NAME)).toBe(OK2Ride);
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
    expect(el.stagePool).toHaveLength(8);
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

  it('keeps the intro mounted under a press, and builds a fresh one for the next test', () => {
    const el = mount({ 'stage-pool': 'pvt,spatial' });
    click(el, '[data-action="start"]');
    click(el, '[data-action="ready"]');
    const go = query(el, '[data-action="begin"]');

    // A real press is sampled as evidence on `pointerdown`, before the click
    // that follows it. Re-rendering there would detach the button mid-press
    // and the browser would never dispatch its click.
    go.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true, isPrimary: true, button: 0 }));
    expect(go.isConnected).toBe(true);
    expect(query(el, '[data-action="begin"]')).toBe(go);

    go.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    stage(el, 'PVT_AWAITING_STIMULUS');

    pvtTrial(el, 240);
    pvtTrial(el, 260);
    pvtTrial(el, 280);

    // The second intro shares the first one's screen, so it must be rebuilt.
    stage(el, 'TEST_INTRO');
    expect(query(el, 'h1').textContent).toBe('Steering');
    expect(query(el, '[data-action="begin"]')).not.toBe(go);
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
    expect(result.verificationToken.startsWith('ok2r1.')).toBe(true);
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

  it('runs time sense: the interval is judged with nothing counting it down', () => {
    const el = mount({ 'stage-pool': 'timing', 'stage-count': '1' });
    launch(el);
    expect(shadow(el).querySelector('.countdown')).toBeNull(); // no clock to read off
    for (let round = 0; round < el.config.timingRounds; round++) {
      const running = stage(el, 'TIMING_RUNNING');
      expect(query(el, '.tap-area').dataset['phase']).toBe('timing');
      vi.advanceTimersByTime(running.targetMs - (performance.now() - running.startTime) - 100);
      activate(query(el, '.tap-area'));
      const shown = stage(el, 'TIMING_RESULT_DISPLAY');
      expect(shown.withinTolerance).toBe(true);
      expect(query(el, '.tap-area').dataset['outcome']).toBe('HIT');
      expect(query(el, '.feedback').textContent).toMatch(/^\d+ ms (early|late)$/);
      vi.advanceTimersByTime(el.config.timingResultDisplayMs);
    }
    const evaluated = stage(el, 'EVALUATED');
    expect(evaluated.passed).toBe(true);
    expect(evaluated.details.results[0]).toMatchObject({ test: 'timing', missCount: 0 });
  });

  it('runs odd one out: a fresh field each round, the different symbol is the answer', () => {
    const el = mount({ 'stage-pool': 'search', 'stage-count': '1' });
    launch(el);
    for (let round = 0; round < el.config.searchRounds; round++) {
      const active = stage(el, 'SEARCH_ACTIVE');
      const items = shadow(el).querySelectorAll<HTMLButtonElement>('.search-item');
      expect(items).toHaveLength(el.config.searchItemCount);
      expect(new Set([...items].map((n) => n.textContent)).size).toBe(2); // distractors plus the odd one
      const target = active.items.find((i) => i.isTarget);
      vi.advanceTimersByTime(700);
      activate(items[target?.index ?? 0] as Element);
      stage(el, 'SEARCH_RESULT_DISPLAY');
      expect(query(el, '.feedback').textContent).toMatch(/^Found · \d+ ms$/);
      expect(query(el, '.search-board').hasAttribute('data-locked')).toBe(true);
      vi.advanceTimersByTime(el.config.searchResultDisplayMs);
    }
    const evaluated = stage(el, 'EVALUATED');
    expect(evaluated.passed).toBe(true);
    expect(evaluated.details.results[0]).toMatchObject({ test: 'search', correctCount: 3, errorCount: 0 });
  });

  it('renders German for lang="de", matches regional tags and falls back for unknown ones', () => {
    expect(query(mount({ lang: 'de' }), 'h1').textContent).toBe('Fahrtauglichkeits-Check');
    expect(query(mount({ lang: 'de-AT' }), 'h1').textContent).toBe('Fahrtauglichkeits-Check');
    expect(query(mount({ lang: 'fr' }), 'h1').textContent).toBe('Ride-readiness check');
    expect(query(mount(), 'h1').textContent).toBe('Ride-readiness check');
  });

  it('switches language live, rebuilding the mounted screen', () => {
    const el = mount();
    expect(query(el, '[data-action="start"]').textContent).toBe('Start check');
    el.setAttribute('lang', 'de');
    expect(query(el, '[data-action="start"]').textContent).toBe('Check starten');
    el.setAttribute('lang', 'en');
    expect(query(el, '[data-action="start"]').textContent).toBe('Start check');
  });

  it('inherits the document language when the element sets none', () => {
    document.documentElement.lang = 'de';
    try {
      expect(query(mount(), 'h1').textContent).toBe('Fahrtauglichkeits-Check');
      // An explicit attribute still wins over the document.
      expect(query(mount({ lang: 'en' }), 'h1').textContent).toBe('Ride-readiness check');
    } finally {
      document.documentElement.lang = '';
    }
  });

  it('carries the language through instructions, a running test and its feedback', () => {
    const el = mount({ lang: 'de', 'stage-pool': 'pvt', 'stage-count': '1', 'max-lapses': '0' });
    click(el, '[data-action="start"]');
    expect(query(el, 'h1').textContent).toBe('Ein kurzer Test');
    expect(shadow(el).querySelector('.steps li')?.textContent).toContain('Reaktion');
    click(el, '[data-action="ready"]');
    expect(query(el, '.stage-label').textContent).toBe('Test 1 von 1 · Reaktion');
    click(el, '[data-action="begin"]');
    expect(query(el, '.tap-label').textContent).toBe('Warte auf Gelb…');

    vi.advanceTimersByTime(200);
    activate(query(el, '.tap-area'));
    expect(query(el, '.feedback').textContent).toBe('Zu früh!');
    vi.advanceTimersByTime(el.config.resultDisplayMs);
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

  /* --- humanity check ------------------------------------------------------- */

  it('ends the run when an input event was dispatched by a script', () => {
    const el = mount({ 'stage-pool': 'pvt', 'stage-count': '1' });
    let failed: AssessmentResult | null = null;
    el.addEventListener('capability-failed', (e) => (failed = e.detail));
    launch(el);
    stage(el, 'PVT_AWAITING_STIMULUS');

    query(el, '.tap-area').dispatchEvent(scripted(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));

    const evaluated = stage(el, 'EVALUATED');
    expect(evaluated.passed).toBe(false);
    expect(evaluated.details.failureReason).toBe('HUMAN_CHECK_FAILED');
    expect(evaluated.details.humanity).toMatchObject({ verdict: 'automated', score: 0 });
    expect(evaluated.details.humanity?.signals[0]?.id).toBe('synthetic-event');
    expect(decodeVerificationToken(evaluated.details.verificationToken)).toMatchObject({ ok: false, hv: 'automated' });
    expect((failed as unknown as AssessmentResult).failureReason).toBe('HUMAN_CHECK_FAILED');
    expect(query(el, 'p[role="status"]').textContent).toBe('The responses did not look like they came from a person.');
  });

  it('leaves the idle screen to the host, which may well start a run from code', () => {
    const el = mount({ 'stage-pool': 'pvt', 'stage-count': '1' });
    query(el, '[data-action="start"]').dispatchEvent(scripted(new MouseEvent('click', { bubbles: true })));
    stage(el, 'INSTRUCTION');
    expect(el.humanity).toMatchObject({ verdict: 'suspect', sampleCount: 0 });
  });

  it('strict mode ends a run whose timing no hand could produce; lenient only reports it', () => {
    const strict = mount({ 'stage-pool': 'trail', 'stage-count': '1' });
    launch(strict);
    runTrail(strict, 400);
    const evaluated = stage(strict, 'EVALUATED');
    expect(evaluated.details.failureReason).toBe('HUMAN_CHECK_FAILED');
    expect(evaluated.details.humanity?.signals.map((s) => s.id)).toEqual(['uniform-timing', 'automation-flag']);
    expect(evaluated.details.humanity?.latencyCv).toBe(0);

    const lenient = mount({ 'stage-pool': 'trail', 'stage-count': '1', 'human-check': 'lenient' });
    launch(lenient);
    runTrail(lenient, 400);
    const reported = stage(lenient, 'EVALUATED');
    expect(reported.passed).toBe(true);
    expect(reported.details.results[0]).toMatchObject({ test: 'trail', completed: true });
    expect(reported.details.humanity?.verdict).toBe('automated');
    expect(decodeVerificationToken(reported.details.verificationToken)).toMatchObject({ ok: true, hv: 'automated' });
  });

  it('off collects nothing at all, so a test harness can drive the widget', () => {
    const el = mount({ 'stage-pool': 'trail', 'stage-count': '1', 'human-check': 'off' });
    expect(el.humanCheck).toBe('off');
    expect(el.humanity).toBeNull();
    launch(el);
    query(el, '.trail-node').dispatchEvent(scripted(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    stage(el, 'TRAIL_ACTIVE');
    runTrail(el, 400);
    const evaluated = stage(el, 'EVALUATED');
    expect(evaluated.passed).toBe(true);
    expect(evaluated.details.humanity).toBeNull();
    expect(decodeVerificationToken(evaluated.details.verificationToken)).toMatchObject({ hv: null, hs: null });
  });

  it('reflects the mode, falls back on nonsense and reports live during a run', () => {
    const el = mount({ 'stage-pool': 'pvt', 'stage-count': '1' });
    expect(el.humanCheck).toBe('strict');
    el.setAttribute('human-check', 'sloppy');
    expect(el.humanCheck).toBe('strict');
    el.humanCheck = 'lenient';
    expect(el.getAttribute('human-check')).toBe('lenient');
    expect(el.config.humanCheck).toBe('lenient');

    launch(el);
    pvtTrial(el, 240);
    const live = el.humanity;
    expect(live?.sampleCount).toBeGreaterThan(0);
    // happy-dom reports navigator.webdriver, exactly as a real automated browser does.
    expect(live?.signals.map((s) => s.id)).toEqual(['automation-flag']);
    expect(live?.verdict).toBe('suspect');
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
