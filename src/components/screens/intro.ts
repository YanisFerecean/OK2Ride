import { h } from '../dom';
import type { ScreenFactory } from './types';

export const introScreen: ScreenFactory = (ctx, state) => {
  const stage = state.stage;
  if (stage.type !== 'TEST_INTRO') return { nodes: [], patch() {} };
  const { t } = ctx;
  const info = t.tests[stage.test];
  const go = h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'begin' }, t.go);
  go.addEventListener('click', () => ctx.dispatch({ type: 'BEGIN_TEST' }));
  return {
    nodes: [
      h('div', { class: 'meta' }, h('span', {}, t.introCounter(stage.index + 1, state.plan.length)), h('span', {}, info.tagline)),
      h('h1', {}, info.name),
      h('p', {}, info.describe(state.config)),
      h('p', { class: 'note' }, t.introTimerNote),
      h('div', { class: 'spacer' }),
      go,
    ],
    patch() {},
    focus: () => go.focus({ preventScroll: true }),
  };
};
