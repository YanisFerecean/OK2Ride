/**
 * `<ok2ride-check>`: a self-contained W3C custom element that runs a
 * randomly drawn set of cognitive tests inside an encapsulated shadow root
 * and reports the outcome through DOM events.
 *
 * Attributes / properties
 *   max-lapses       number   PVT lapses tolerated before failing (default 2)
 *   time-limit-ms    number   overall budget in ms (default 90000)
 *   difficulty       'easy' | 'medium' | 'hard' (default 'medium')
 *   theme            'dark' | 'light' (default 'dark')
 *   stage-count      number   tests drawn per run (default 2)
 *   stage-pool       comma-separated test ids eligible for selection (default: all)
 *   human-check      'strict' | 'lenient' | 'off' humanity gating (default 'strict')
 *   challenge-nonce  optional host-supplied string bound into the token
 *
 * Events (bubbling, composed)
 *   capability-passed   CustomEvent<AssessmentResult>
 *   capability-failed   CustomEvent<AssessmentResult>
 *   stage-change        CustomEvent<{ stage, previous }>
 */

import { parseStagePool, resolveConfig, type ConfigInput } from '../config';
import { createInitialState, currentTest, humanityOf, isInProgress, newSessionId, reduce, timerEffectFor } from '../stateMachine';
import type {
  Action,
  AssessmentConfig,
  AssessmentResult,
  Difficulty,
  HumanCheckMode,
  HumanityReport,
  MachineState,
  TestId,
  TestStage,
  Theme,
  TimerEffect,
} from '../types';
import { h, installStyles, setText } from './dom';
import { automationDetected, createInputMonitor, type InputMonitor } from './input';
import { DEFAULT_STRINGS, resolveStrings, type Strings } from './i18n';
import { SCREEN_FACTORIES, SCREEN_FOR_STAGE, type Screen, type ScreenContext, type ScreenKey } from './screens';
import { STYLES } from './styles';

export const TAG_NAME = 'ok2ride-check';

export interface StageChangeDetail {
  readonly stage: TestStage;
  readonly previous: TestStage;
}

export interface OK2RideEventMap {
  'capability-passed': CustomEvent<AssessmentResult>;
  'capability-failed': CustomEvent<AssessmentResult>;
  'stage-change': CustomEvent<StageChangeDetail>;
}

const OBSERVED_ATTRIBUTES = ['max-lapses', 'time-limit-ms', 'difficulty', 'theme', 'stage-count', 'stage-pool', 'human-check', 'challenge-nonce', 'lang'] as const;

function stageLabel(state: MachineState, t: Strings): string {
  switch (state.stage.type) {
    case 'IDLE':
      return t.stageReady;
    case 'INSTRUCTION':
      return t.stageInstructions;
    case 'EVALUATED':
      return t.stageResult;
    default: {
      const test = currentTest(state);
      return test ? t.stageLabel(state.planIndex + 1, state.plan.length, t.tests[test].name) : '';
    }
  }
}

async function requestOrientationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return false;
  const ctor = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
  if (typeof ctor.requestPermission !== 'function') return true;
  try {
    return (await ctor.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

export class OK2Ride extends HTMLElement {
  static get observedAttributes(): readonly string[] {
    return OBSERVED_ATTRIBUTES;
  }

  readonly #root: ShadowRoot;
  readonly #screenHost: HTMLDivElement;
  readonly #stageLabel: HTMLSpanElement;
  readonly #ctx: ScreenContext;
  readonly #inputs: InputMonitor;

  #state: MachineState;
  #strings: Strings = DEFAULT_STRINGS;
  #screen: Screen | null = null;
  #screenKey: ScreenKey | null = null;
  #connected = false;

  #stageTimer: number | null = null;
  #stimulusFrame: number | null = null;
  #deadlineTimer: number | null = null;
  #tiltPreferred = false;

  /** Identifies the current stage occurrence, and when it began, for input evidence. */
  #stageSeq = 0;
  #stageEnteredAt = 0;
  /** Stage occurrence the mounted screen was built for. */
  #screenSeq = -1;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    installStyles(this.#root, STYLES);

    this.#stageLabel = h('span', { class: 'stage-label', part: 'stage-label', 'aria-live': 'polite' });
    this.#screenHost = h('div', { class: 'screen', part: 'screen' });
    this.#root.append(
      h(
        'div',
        { class: 'modal', part: 'modal', role: 'group', 'aria-label': 'Ride readiness check' },
        h('div', { class: 'header', part: 'header' }, h('span', { class: 'brand' }, 'OK2Ride'), this.#stageLabel),
        this.#screenHost,
      ),
    );

    const self = this;
    this.#ctx = {
      dispatch: (action, now) => this.#dispatch(action, now),
      reset: () => this.reset(),
      get t() {
        return self.#strings;
      },
      get tiltPreferred() {
        return self.#tiltPreferred;
      },
      toggleTilt: () => this.#toggleTilt(),
    };

    // Subscribed before any host script can reach the shadow root, so nothing
    // can register a capture listener in front of the evidence collector.
    this.#inputs = createInputMonitor({
      root: this.#root,
      stage: () => ({ type: self.#state.stage.type, seq: self.#stageSeq, enteredAt: self.#stageEnteredAt }),
      emit: (sample) => this.#dispatch({ type: 'RECORD_INPUT', sample }, sample.time),
    });

    // Attributes are not reliably available in the constructor; the state is
    // re-created from them in connectedCallback / attributeChangedCallback.
    this.#state = createInitialState(resolveConfig(), newSessionId(Math.random), null);
  }

  /* --- Lifecycle ----------------------------------------------------------- */

  connectedCallback(): void {
    this.#connected = true;
    this.#inputs.attach();
    this.#stageEnteredAt = performance.now();
    this.#strings = this.#resolveStrings();
    if (this.#state.stage.type === 'IDLE') this.#state = this.#freshState();
    this.#screenKey = null;
    this.#render();
  }

  disconnectedCallback(): void {
    this.#connected = false;
    this.#inputs.detach();
    this.#clearStageTimer();
    this.#clearDeadline();
    this.#unmountScreen();
    // A run cannot continue without a visible UI: abandon it silently.
    if (isInProgress(this.#state.stage)) this.#state = this.#freshState();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue || name === 'theme') return;
    // Language is not configuration: it may change mid-run and applies at once.
    // Screens bake their text in when mounted, so the current one is rebuilt.
    if (name === 'lang') {
      this.#strings = this.#resolveStrings();
      if (this.#connected) {
        this.#screenKey = null;
        this.#render();
      }
      return;
    }
    // Configuration is frozen during a run; new attribute values apply on the next reset.
    if (this.#state.stage.type === 'IDLE') {
      this.#state = this.#freshState();
      if (this.#connected) this.#render();
    }
  }

  /* --- Public API ---------------------------------------------------------- */

  get maxLapses(): number {
    return resolveConfig(this.#attributeConfig()).maxLapses;
  }
  set maxLapses(value: number) {
    this.setAttribute('max-lapses', String(value));
  }

  get timeLimitMs(): number {
    return resolveConfig(this.#attributeConfig()).timeLimitMs;
  }
  set timeLimitMs(value: number) {
    this.setAttribute('time-limit-ms', String(value));
  }

  get difficulty(): Difficulty {
    return resolveConfig(this.#attributeConfig()).difficulty;
  }
  set difficulty(value: Difficulty) {
    this.setAttribute('difficulty', value);
  }

  get theme(): Theme {
    return this.getAttribute('theme') === 'light' ? 'light' : 'dark';
  }
  set theme(value: Theme) {
    this.setAttribute('theme', value);
  }

  /** Number of tests drawn per run. */
  get stageCount(): number {
    return resolveConfig(this.#attributeConfig()).stageCount;
  }
  set stageCount(value: number) {
    this.setAttribute('stage-count', String(value));
  }

  /** Tests eligible for selection. Setting an empty array restores the full pool. */
  get stagePool(): readonly TestId[] {
    return resolveConfig(this.#attributeConfig()).stagePool;
  }
  set stagePool(value: readonly string[] | string) {
    const ids = parseStagePool(value);
    if (ids.length) this.setAttribute('stage-pool', ids.join(','));
    else this.removeAttribute('stage-pool');
  }

  /** How strictly scripted or bot-like input is rejected. */
  get humanCheck(): HumanCheckMode {
    return resolveConfig(this.#attributeConfig()).humanCheck;
  }
  set humanCheck(value: HumanCheckMode) {
    this.setAttribute('human-check', value);
  }

  get challengeNonce(): string | null {
    return this.getAttribute('challenge-nonce');
  }
  set challengeNonce(value: string | null) {
    if (value === null) this.removeAttribute('challenge-nonce');
    else this.setAttribute('challenge-nonce', value);
  }

  /** Current finite-state-machine stage (immutable snapshot). */
  get stage(): TestStage {
    return this.#state.stage;
  }

  /** Configuration in force for the current / most recent run. */
  get config(): AssessmentConfig {
    return this.#state.config;
  }

  /** Tests drawn for the current / most recent run, in presentation order. */
  get plan(): readonly TestId[] {
    return this.#state.plan;
  }

  /**
   * Humanity check over the input seen so far, live during a run. `null` when
   * `human-check` is `off`.
   */
  get humanity(): HumanityReport | null {
    return humanityOf(this.#state, { automation: automationDetected() });
  }

  /** Result of the most recent run, or `null` until evaluated. */
  get result(): AssessmentResult | null {
    const stage = this.#state.stage;
    return stage.type === 'EVALUATED' ? stage.details : null;
  }

  /** True while a run is underway. */
  get active(): boolean {
    return isInProgress(this.#state.stage);
  }

  /** Begins a run (draws the tests and shows the instruction screen). Re-arms after a completed run. */
  start(): void {
    if (this.#state.stage.type === 'EVALUATED') this.reset();
    this.#dispatch({ type: 'START_ASSESSMENT' });
  }

  /** Aborts any run in progress and returns to the idle screen with fresh configuration. */
  reset(): void {
    this.#dispatch({ type: 'RESET_TEST', config: resolveConfig(this.#attributeConfig()), nonce: this.getAttribute('challenge-nonce') });
  }

  /* --- State ---------------------------------------------------------------- */

  #attributeConfig(): ConfigInput {
    return {
      maxLapses: this.getAttribute('max-lapses'),
      timeLimitMs: this.getAttribute('time-limit-ms'),
      difficulty: this.getAttribute('difficulty'),
      stageCount: this.getAttribute('stage-count'),
      stagePool: this.getAttribute('stage-pool'),
      humanCheck: this.getAttribute('human-check'),
    };
  }

  /** Own `lang` wins; otherwise inherit the document's, then fall back to English. */
  #resolveStrings(): Strings {
    const own = this.getAttribute('lang');
    if (own) return resolveStrings(own);
    return resolveStrings(typeof document === 'undefined' ? null : document.documentElement.lang);
  }

  #freshState(): MachineState {
    return createInitialState(resolveConfig(this.#attributeConfig()), newSessionId(Math.random), this.getAttribute('challenge-nonce'));
  }

  #dispatch(action: Action, now: number = performance.now()): void {
    const previous = this.#state;
    const next = reduce(previous, action, { now, epochMs: Date.now(), random: Math.random, automation: automationDetected() });
    if (next === previous) return;
    this.#state = next;
    this.#afterTransition(previous, next, now);
  }

  #afterTransition(previous: MachineState, next: MachineState, now: number): void {
    // Stamp the new stage before rendering it, so input that answers it is
    // timed against the moment it appeared.
    if (previous.stage.type !== next.stage.type) {
      this.#stageSeq++;
      this.#stageEnteredAt = now;
    }
    this.#clearStageTimer();
    if (previous.assessmentStartTime === null && next.assessmentStartTime !== null) {
      this.#armDeadline(next.config.timeLimitMs);
    }
    if (!isInProgress(next.stage)) this.#clearDeadline();

    if (this.#connected) this.#render();

    const effect = timerEffectFor(next, performance.now());
    if (effect) this.#armStageTimer(effect);

    if (previous.stage.type !== next.stage.type) {
      this.#emit('stage-change', { stage: next.stage, previous: previous.stage });
    }
    if (next.stage.type === 'EVALUATED') {
      this.#emit(next.stage.passed ? 'capability-passed' : 'capability-failed', next.stage.details);
    }
  }

  #emit<K extends keyof OK2RideEventMap>(type: K, detail: OK2RideEventMap[K]['detail']): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  /* --- Timers --------------------------------------------------------------- */

  #armStageTimer(effect: TimerEffect): void {
    const { action } = effect;
    if (action.type === 'TRIGGER_STIMULUS') {
      // Reveal the stimulus on an animation frame so its onset time is
      // sampled immediately before the paint that makes it visible.
      this.#stageTimer = window.setTimeout(() => {
        this.#stageTimer = null;
        this.#stimulusFrame = requestAnimationFrame(() => {
          this.#stimulusFrame = null;
          this.#dispatch({ type: 'TRIGGER_STIMULUS' }, performance.now());
        });
      }, effect.delayMs);
      return;
    }
    this.#stageTimer = window.setTimeout(() => {
      this.#stageTimer = null;
      this.#dispatch(action);
    }, effect.delayMs);
  }

  #clearStageTimer(): void {
    if (this.#stageTimer !== null) {
      clearTimeout(this.#stageTimer);
      this.#stageTimer = null;
    }
    if (this.#stimulusFrame !== null) {
      cancelAnimationFrame(this.#stimulusFrame);
      this.#stimulusFrame = null;
    }
  }

  #armDeadline(ms: number): void {
    this.#clearDeadline();
    this.#deadlineTimer = window.setTimeout(() => {
      this.#deadlineTimer = null;
      this.#dispatch({ type: 'TIME_LIMIT_REACHED' });
    }, ms);
  }

  #clearDeadline(): void {
    if (this.#deadlineTimer !== null) {
      clearTimeout(this.#deadlineTimer);
      this.#deadlineTimer = null;
    }
  }

  /* --- Rendering ------------------------------------------------------------ */

  #render(): void {
    const state = this.#state;
    setText(this.#stageLabel, stageLabel(state, this.#strings));
    const key = SCREEN_FOR_STAGE[state.stage.type];
    // Consecutive intros (one per test) must remount even though the key
    // repeats, so they are told apart by the stage counter. Remounting on
    // every render instead would pull the screen out from under a press:
    // input evidence re-renders, and a button removed between `pointerdown`
    // and `pointerup` never receives a click.
    const remount = key !== this.#screenKey || (key === 'intro' && this.#stageSeq !== this.#screenSeq);
    if (remount) {
      this.#unmountScreen();
      const screen = SCREEN_FACTORIES[key](this.#ctx, state);
      this.#screen = screen;
      this.#screenKey = key;
      this.#screenSeq = this.#stageSeq;
      this.#screenHost.replaceChildren(...screen.nodes);
      screen.focus?.();
    }
    this.#screen?.patch(state);
  }

  #unmountScreen(): void {
    this.#screen?.dispose?.();
    this.#screen = null;
    this.#screenKey = null;
  }

  async #toggleTilt(): Promise<boolean> {
    this.#tiltPreferred = this.#tiltPreferred ? false : await requestOrientationPermission();
    return this.#tiltPreferred;
  }
}
