/**
 * Input evidence collection for the humanity check.
 *
 * Listeners sit on the shadow root in the capture phase, so every input the
 * widget acts on is seen before the screen that handles it, and page code
 * cannot get in front of them: the root is subscribed in the element's
 * constructor, before any host can reach it.
 *
 * Only inputs the widget acts on are sampled. The filters mirror `onActivate`
 * in `dom.ts` (primary button, activation keys), so the evidence lines up
 * one-to-one with the responses the assessment scored. Everything the rider
 * does while idle or on the result screen belongs to the host, not to a run.
 *
 * Scoring lives in `humanity.ts`; this module only observes.
 */

import type { InputKind, InputSample, StageType } from '../types';

/** Keys the widget acts on. Tab and friends are navigation, not answers. */
const ACTIVATION_KEYS: ReadonlySet<string> = new Set(['Enter', ' ', 'Spacebar', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/** A click this soon after a pointer or key input is that input's own click. */
const CLICK_PAIRING_MS = 750;

/** Where the run is, as the element sees it when an event arrives. */
export interface StageSnapshot {
  readonly type: StageType;
  /** Counter identifying this occurrence of the stage type. */
  readonly seq: number;
  /** `performance.now()` when the stage was entered. */
  readonly enteredAt: number;
}

export interface InputMonitorOptions {
  readonly root: EventTarget;
  readonly stage: () => StageSnapshot;
  readonly emit: (sample: InputSample) => void;
}

export interface InputMonitor {
  attach(): void;
  detach(): void;
}

/** True when the browser reports itself as automation-controlled. */
export function automationDetected(): boolean {
  return typeof navigator !== 'undefined' && navigator.webdriver === true;
}

export function createInputMonitor({ root, stage, emit }: InputMonitorOptions): InputMonitor {
  /** Pointer moves since the last sample: a mouse that never moves is telling. */
  let moves = 0;
  /** Last pointer or key input, used to recognise a click that had neither. */
  let lastDirectAt = Number.NEGATIVE_INFINITY;

  function record(time: number, kind: InputKind, event: Event, pointer: PointerEvent | null): void {
    const snapshot = stage();
    if (snapshot.type === 'IDLE' || snapshot.type === 'EVALUATED') return;
    emit({
      time,
      kind,
      // Only an explicit `false` is evidence: environments that do not
      // implement `isTrusted` (some test DOMs) must not read as scripted.
      trusted: event.isTrusted !== false,
      pointerType: pointer?.pointerType ? pointer.pointerType : null,
      x: pointer ? Math.round(pointer.clientX) : null,
      y: pointer ? Math.round(pointer.clientY) : null,
      movesSince: moves,
      stage: snapshot.type,
      stageSeq: snapshot.seq,
      sinceStageMs: Math.max(0, time - snapshot.enteredAt),
    });
    moves = 0;
  }

  const onPointerDown = (event: Event): void => {
    const time = performance.now();
    const pointer = event as PointerEvent;
    if (!pointer.isPrimary || pointer.button !== 0) return;
    lastDirectAt = time;
    record(time, 'pointer', event, pointer);
  };

  const onPointerMove = (): void => {
    moves++;
  };

  const onKeyDown = (event: Event): void => {
    const time = performance.now();
    const key = event as KeyboardEvent;
    if (key.repeat || !ACTIVATION_KEYS.has(key.key)) return;
    lastDirectAt = time;
    record(time, 'key', event, null);
  };

  /** A click with no pointer or key input behind it was dispatched, not performed. */
  const onClick = (event: Event): void => {
    const time = performance.now();
    if (time - lastDirectAt <= CLICK_PAIRING_MS) return;
    record(time, 'click', event, null);
  };

  const listeners: readonly (readonly [string, EventListener, AddEventListenerOptions])[] = [
    ['pointerdown', onPointerDown, { capture: true }],
    ['pointermove', onPointerMove, { capture: true, passive: true }],
    ['keydown', onKeyDown, { capture: true }],
    ['click', onClick, { capture: true }],
  ];

  return {
    attach() {
      for (const [type, listener, options] of listeners) root.addEventListener(type, listener, options);
    },
    detach() {
      for (const [type, listener, options] of listeners) root.removeEventListener(type, listener, options);
    },
  };
}
