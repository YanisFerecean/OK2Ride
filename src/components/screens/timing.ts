import type { MachineState, TestStage } from '../../types';
import { formatMs, formatSeconds, h, onActivate, setText } from '../dom';
import type { ScreenFactory } from './types';

type TimingStage = Extract<TestStage, { type: 'TIMING_RUNNING' | 'TIMING_RESULT_DISPLAY' }>;

function isTimingStage(stage: TestStage): stage is TimingStage {
  return stage.type === 'TIMING_RUNNING' || stage.type === 'TIMING_RESULT_DISPLAY';
}

/** Deliberately shows no clock or countdown: the interval must be judged internally. */
export const timingScreen: ScreenFactory = (ctx, state) => {
  const { config } = state;

  const counter = h('span');
  const misses = h('span');
  const label = h('span', { class: 'tap-label' });
  const hint = h('span', { class: 'tap-hint' });
  const tap = h('div', { class: 'tap-area', part: 'tap-area', role: 'button', tabindex: '0', 'aria-label': 'Interval target', 'data-phase': 'timing' }, label, hint);
  onActivate(tap, (tapTime) => ctx.dispatch({ type: 'TARGET_TAPPED', tapTime }, tapTime));

  const feedback = h('div', { class: 'feedback', role: 'status', 'aria-live': 'assertive' });

  return {
    nodes: [
      h('div', { class: 'meta' }, counter, misses),
      h('h1', { class: 'sm' }, 'Tap when the time is up'),
      tap,
      feedback,
      h('p', { class: 'note center' }, `Within ${formatMs(config.timingToleranceMs)} counts as on target.`),
    ],
    patch(next: MachineState) {
      const stage = next.stage;
      if (!isTimingStage(stage)) return;
      const { rounds } = stage.progress;
      const shown = stage.type === 'TIMING_RUNNING' ? rounds.length + 1 : rounds.length;
      const missed = rounds.filter((r) => !r.withinTolerance).length;
      setText(counter, `Round ${Math.min(shown, config.timingRounds)} / ${config.timingRounds}`);
      setText(misses, `Missed ${missed}/${config.timingMaxMisses}`);

      if (stage.type === 'TIMING_RUNNING') {
        tap.dataset['phase'] = 'timing';
        delete tap.dataset['outcome'];
        setText(label, formatSeconds(stage.targetMs));
        setText(hint, 'Tap when this much time has passed');
        tap.setAttribute('aria-label', `Tap after ${formatSeconds(stage.targetMs)}`);
        setText(feedback, '');
        feedback.className = 'feedback';
      } else {
        const text = stage.timedOut
          ? 'No tap'
          : `${formatMs(Math.abs(stage.errorMs))} ${stage.errorMs > 0 ? 'late' : 'early'}`;
        tap.dataset['phase'] = 'result';
        tap.dataset['outcome'] = stage.withinTolerance ? 'HIT' : 'MISS';
        setText(label, text);
        setText(hint, stage.withinTolerance ? 'On target' : 'Off target');
        setText(feedback, text);
        feedback.className = `feedback ${stage.withinTolerance ? 'good' : 'bad'}`;
      }
    },
    focus: () => tap.focus({ preventScroll: true }),
  };
};
