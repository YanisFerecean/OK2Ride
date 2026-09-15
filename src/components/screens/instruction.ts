import { formatSeconds, h, setText } from '../dom';
import { TEST_INFO } from '../testInfo';
import type { ScreenFactory } from './types';

export const instructionScreen: ScreenFactory = (ctx, state) => {
  const { config, plan } = state;
  const list = h('ol', { class: 'steps' });
  for (const test of plan) {
    const info = TEST_INFO[test];
    list.append(h('li', {}, h('strong', {}, info.name), info.describe(config)));
  }

  const nodes: Node[] = [
    h('h1', {}, plan.length === 1 ? 'One quick test' : `${plan.length} quick tests`),
    h('p', {}, 'Tests are drawn at random for every check. Each one is explained again right before it starts.'),
    list,
    h('p', {}, `Time limit: ${formatSeconds(config.timeLimitMs)}.`),
  ];

  if (plan.includes('spatial') && typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
    const pill = h('span', { class: 'pill' }, ctx.tiltPreferred ? 'On' : 'Off');
    const toggle = h('button', { type: 'button', class: 'toggle', 'data-action': 'tilt-toggle', 'aria-pressed': String(ctx.tiltPreferred) }, h('span', {}, 'Steer by tilting the phone'), pill);
    toggle.addEventListener('click', () => {
      void ctx.toggleTilt().then((on) => {
        toggle.setAttribute('aria-pressed', String(on));
        setText(pill, on ? 'On' : 'Off');
      });
    });
    nodes.push(toggle);
  }

  const ready = h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'ready' }, "I'm ready");
  ready.addEventListener('click', () => ctx.dispatch({ type: 'ACKNOWLEDGE_INSTRUCTIONS' }));
  nodes.push(h('div', { class: 'spacer' }), ready);

  return { nodes, patch() {} };
};
