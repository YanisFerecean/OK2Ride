import type { MachineState, StroopColor, TestStage } from '../../types';
import { STROOP_COLORS } from '../../types';
import { formatMs, h, onActivate, setText } from '../dom';
import type { ScreenFactory } from './types';

const COLOR_LABELS: Record<StroopColor, string> = { red: 'Red', green: 'Green', blue: 'Blue', yellow: 'Yellow' };

export const stroopScreen: ScreenFactory = (ctx, state) => {
  const { config } = state;

  const counter = h('span');
  const errors = h('span');
  const word = h('div', { class: 'stroop-word', role: 'img', 'aria-label': 'Colour word' });
  const options = h('div', { class: 'stroop-options', role: 'group', 'aria-label': 'Ink colour' });
  for (const color of STROOP_COLORS) {
    const button = h('button', { type: 'button', class: 'stroop-option', 'data-color': color, 'aria-label': COLOR_LABELS[color] }, h('span', { class: `swatch ${color}`, 'aria-hidden': 'true' }), h('span', {}, COLOR_LABELS[color]));
    onActivate(button, (tapTime) => ctx.dispatch({ type: 'STROOP_ANSWERED', color, tapTime }, tapTime));
    options.append(button);
  }
  const feedback = h('div', { class: 'feedback', role: 'status', 'aria-live': 'assertive' });

  return {
    nodes: [h('div', { class: 'meta' }, counter, errors), h('h1', { class: 'sm' }, 'Tap the colour of the ink, not the word'), word, options, feedback],
    patch(next: MachineState) {
      const stage: TestStage = next.stage;
      if (stage.type !== 'STROOP_TRIAL' && stage.type !== 'STROOP_RESULT_DISPLAY') return;
      const { progress } = stage;
      const shown = stage.type === 'STROOP_TRIAL' ? progress.trials.length + 1 : progress.trials.length;
      const wrong = progress.trials.filter((t) => !t.correct).length;
      setText(counter, `Round ${Math.min(shown, config.stroopTrials)} / ${config.stroopTrials}`);
      setText(errors, `Errors ${wrong}/${config.stroopMaxErrors}`);
      if (stage.type === 'STROOP_TRIAL') {
        setText(word, COLOR_LABELS[stage.word].toUpperCase());
        word.className = `stroop-word ink-${stage.ink}`;
        word.setAttribute('aria-label', `The word ${stage.word} written in ${stage.ink} ink`);
        setText(feedback, '');
        feedback.className = 'feedback';
        options.removeAttribute('data-locked');
      } else {
        const text = stage.correct ? `Correct · ${stage.rtMs === null ? '' : formatMs(stage.rtMs)}`.trim() : stage.rtMs === null ? 'Too slow' : 'Wrong colour';
        setText(feedback, text);
        feedback.className = `feedback ${stage.correct ? 'good' : 'bad'}`;
        options.setAttribute('data-locked', '');
      }
    },
    focus: () => options.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }),
  };
};
