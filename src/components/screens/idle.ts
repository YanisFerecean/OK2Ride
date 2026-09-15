import { h, iconScooter } from '../dom';
import type { ScreenFactory } from './types';

export const idleScreen: ScreenFactory = (ctx) => {
  const start = h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'start' }, 'Start check');
  start.addEventListener('click', () => ctx.dispatch({ type: 'START_ASSESSMENT' }));
  return {
    nodes: [
      h('div', { class: 'hero', 'aria-hidden': 'true' }, iconScooter()),
      h('h1', { class: 'center' }, 'Ride-readiness check'),
      h('p', { class: 'center' }, 'A short set of quick reaction and coordination tests confirms you are alert and in control before the vehicle unlocks.'),
      h('div', { class: 'spacer' }),
      start,
    ],
    patch() {},
  };
};
