import { h } from '../dom';
import { TEST_INFO } from '../testInfo';
import type { ScreenFactory } from './types';

export const introScreen: ScreenFactory = (ctx, state) => {
  const stage = state.stage;
  if (stage.type !== 'TEST_INTRO') return { nodes: [], patch() {} };
  const info = TEST_INFO[stage.test];
  const go = h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'begin' }, 'Go');
  go.addEventListener('click', () => ctx.dispatch({ type: 'BEGIN_TEST' }));
  return {
    nodes: [
      h('div', { class: 'meta' }, h('span', {}, `Test ${stage.index + 1} of ${state.plan.length}`), h('span', {}, info.tagline)),
      h('h1', {}, info.name),
      h('p', {}, info.describe(state.config)),
      h('p', { class: 'note' }, 'The timer starts as soon as you press Go.'),
      h('div', { class: 'spacer' }),
      go,
    ],
    patch() {},
    focus: () => go.focus({ preventScroll: true }),
  };
};
