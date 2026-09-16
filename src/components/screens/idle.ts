import { h, iconScooter } from '../dom';
import type { ScreenFactory } from './types';

export const idleScreen: ScreenFactory = (ctx) => {
  const { t } = ctx;
  const start = h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'start' }, t.idleStart);
  start.addEventListener('click', () => ctx.dispatch({ type: 'START_ASSESSMENT' }));
  return {
    nodes: [
      h('div', { class: 'hero', 'aria-hidden': 'true' }, iconScooter()),
      h('h1', { class: 'center' }, t.idleTitle),
      h('p', { class: 'center' }, t.idleBody),
      h('div', { class: 'spacer' }),
      start,
    ],
    patch() {},
  };
};
