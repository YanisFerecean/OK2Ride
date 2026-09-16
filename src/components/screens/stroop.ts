import type { MachineState, TestStage } from '../../types';
import { STROOP_COLORS } from '../../types';
import { h, onActivate, setText } from '../dom';
import type { ScreenFactory } from './types';

export const stroopScreen: ScreenFactory = (ctx, state) => {
  const { config } = state;
  const { t } = ctx;

  const counter = h('span');
  const errors = h('span');
  const word = h('div', { class: 'stroop-word', role: 'img', 'aria-label': t.stroopWord });
  const options = h('div', { class: 'stroop-options', role: 'group', 'aria-label': t.stroopOptions });
  for (const color of STROOP_COLORS) {
    const button = h('button', { type: 'button', class: 'stroop-option', 'data-color': color, 'aria-label': t.colors[color] }, h('span', { class: `swatch ${color}`, 'aria-hidden': 'true' }), h('span', {}, t.colors[color]));
    onActivate(button, (tapTime) => ctx.dispatch({ type: 'STROOP_ANSWERED', color, tapTime }, tapTime));
    options.append(button);
  }
  const feedback = h('div', { class: 'feedback', role: 'status', 'aria-live': 'assertive' });

  return {
    nodes: [h('div', { class: 'meta' }, counter, errors), h('h1', { class: 'sm' }, t.stroopTitle), word, options, feedback],
    patch(next: MachineState) {
      const stage: TestStage = next.stage;
      if (stage.type !== 'STROOP_TRIAL' && stage.type !== 'STROOP_RESULT_DISPLAY') return;
      const { progress } = stage;
      const shown = stage.type === 'STROOP_TRIAL' ? progress.trials.length + 1 : progress.trials.length;
      const wrong = progress.trials.filter((tr) => !tr.correct).length;
      setText(counter, t.round(Math.min(shown, config.stroopTrials), config.stroopTrials));
      setText(errors, t.errors(wrong, config.stroopMaxErrors));
      if (stage.type === 'STROOP_TRIAL') {
        setText(word, t.colors[stage.word].toUpperCase());
        word.className = `stroop-word ink-${stage.ink}`;
        word.setAttribute('aria-label', t.stroopAria(t.colors[stage.word], t.colors[stage.ink]));
        setText(feedback, '');
        feedback.className = 'feedback';
        options.removeAttribute('data-locked');
      } else {
        const text = stage.correct ? t.stroopCorrect(stage.rtMs) : stage.rtMs === null ? t.tooSlow : t.stroopWrong;
        setText(feedback, text);
        feedback.className = `feedback ${stage.correct ? 'good' : 'bad'}`;
        options.setAttribute('data-locked', '');
      }
    },
    focus: () => options.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }),
  };
};
