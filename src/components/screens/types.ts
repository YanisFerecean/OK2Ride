import type { Action, MachineState } from '../../types';

/** What a screen may ask of the host element. */
export interface ScreenContext {
  dispatch(action: Action, now?: number): void;
  reset(): void;
  readonly tiltPreferred: boolean;
  /** Flips the tilt preference, requesting sensor permission when needed. Resolves to the new value. */
  toggleTilt(): Promise<boolean>;
}

/**
 * A mounted screen. `nodes` are inserted once; `patch()` is called after
 * every state change while the screen stays mounted; `dispose()` runs when
 * the screen is replaced or the element is disconnected.
 */
export interface Screen {
  readonly nodes: readonly Node[];
  patch(state: MachineState): void;
  dispose?(): void;
  focus?(): void;
}

export type ScreenFactory = (ctx: ScreenContext, state: MachineState) => Screen;
