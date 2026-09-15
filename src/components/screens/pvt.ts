import type { MachineState, TestStage } from '../../types';
import { pvtCounts } from '../../tasks/pvt';
import { formatMs, h, onActivate, setText } from '../dom';
import type { ScreenFactory } from './types';

type PvtStage = Extract<TestStage, { type: 'PVT_AWAITING_STIMULUS' | 'PVT_STIMULUS_ACTIVE' | 'PVT_RESULT_DISPLAY' }>;

function isPvtStage(stage: TestStage): stage is PvtStage {
  return stage.type === 'PVT_AWAITING_STIMULUS' || stage.type === 'PVT_STIMULUS_ACTIVE' || stage.type === 'PVT_RESULT_DISPLAY';
}

export const pvtScreen: ScreenFactory = (ctx, state) => {
  const { config } = state;

  const trial = h('span');
  const counts = h('span');
  const dots = h('div', { class: 'progress', role: 'img', 'aria-label': 'Clean taps so far' });
  for (let i = 0; i < config.requiredValidTrials; i++) dots.append(h('span', { class: 'dot' }));

  const label = h('span', { class: 'tap-label' });
  const hint = h('span', { class: 'tap-hint' });
  const tap = h('div', { class: 'tap-area', part: 'tap-area', role: 'button', tabindex: '0', 'aria-label': 'Reaction target', 'data-phase': 'waiting' }, label, hint);
  onActivate(tap, (tapTime) => ctx.dispatch({ type: 'TARGET_TAPPED', tapTime }, tapTime));

  const feedback = h('div', { class: 'feedback', role: 'status', 'aria-live': 'assertive' });

  function patch(next: MachineState): void {
    const stage = next.stage;
    if (!isPvtStage(stage)) return;
    const { progress } = stage;
    const c = pvtCounts(progress.trials);
    setText(trial, `Trial ${stage.type === 'PVT_RESULT_DISPLAY' ? progress.trials.length : progress.trials.length + 1}`);
    setText(counts, `Slow ${c.lapses}/${config.maxLapses} · Early ${c.falseStarts}/${config.maxFalseStarts}`);
    const children = dots.children;
    for (let i = 0; i < children.length; i++) children[i]?.classList.toggle('filled', i < progress.consecutiveValid);

    switch (stage.type) {
      case 'PVT_AWAITING_STIMULUS':
        tap.dataset['phase'] = 'waiting';
        delete tap.dataset['outcome'];
        setText(label, 'Wait for yellow…');
        setText(hint, 'Tap the instant the panel lights up');
        setText(feedback, '');
        feedback.className = 'feedback';
        break;
      case 'PVT_STIMULUS_ACTIVE':
        tap.dataset['phase'] = 'active';
        delete tap.dataset['outcome'];
        setText(label, 'TAP!');
        setText(hint, '');
        break;
      case 'PVT_RESULT_DISPLAY': {
        const rt = Math.round(stage.rtMs);
        const last = progress.trials[progress.trials.length - 1];
        let text: string;
        let tone: string;
        if (stage.outcome === 'VALID') {
          text = `Fast! ${formatMs(rt)}`;
          tone = 'good';
        } else if (stage.outcome === 'FALSE_START') {
          text = rt >= 0 ? `Too early! ${formatMs(rt)}` : 'Too early!';
          tone = 'warn';
        } else {
          text = last?.timedOut ? 'Lapse detected · no response' : `Lapse detected · ${formatMs(rt)}`;
          tone = 'bad';
        }
        tap.dataset['phase'] = 'result';
        tap.dataset['outcome'] = stage.outcome;
        setText(label, text);
        setText(hint, stage.outcome === 'VALID' ? 'Keep going' : 'Streak reset');
        setText(feedback, text);
        feedback.className = `feedback ${tone}`;
        break;
      }
    }
  }

  return {
    nodes: [h('div', { class: 'meta' }, trial, counts), h('div', { class: 'progress' }, h('span', { class: 'progress-label' }, 'Clean taps'), dots), tap, feedback],
    patch,
    focus: () => tap.focus({ preventScroll: true }),
  };
};
