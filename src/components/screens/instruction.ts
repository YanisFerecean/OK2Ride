import { h, setText } from '../dom';
import type { ScreenFactory } from './types';

export const instructionScreen: ScreenFactory = (ctx, state) => {
  const { config, plan } = state;
  const { t } = ctx;
  const list = h('ol', { class: 'steps' });
  for (const test of plan) {
    const info = t.tests[test];
    list.append(h('li', {}, h('strong', {}, info.name), info.describe(config)));
  }

  const nodes: Node[] = [
    h('h1', {}, t.instructionTitle(plan.length)),
    h('p', {}, t.instructionBody),
    list,
    h('p', {}, t.instructionTimeLimit(config.timeLimitMs)),
  ];

  if (plan.includes('spatial') && typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
    const pill = h('span', { class: 'pill' }, ctx.tiltPreferred ? t.on : t.off);
    const toggle = h('button', { type: 'button', class: 'toggle', 'data-action': 'tilt-toggle', 'aria-pressed': String(ctx.tiltPreferred) }, h('span', {}, t.tiltToggle), pill);
    toggle.addEventListener('click', () => {
      void ctx.toggleTilt().then((on) => {
        toggle.setAttribute('aria-pressed', String(on));
        setText(pill, on ? t.on : t.off);
      });
    });
    nodes.push(toggle);
  }

  const ready = h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'ready' }, t.ready);
  ready.addEventListener('click', () => ctx.dispatch({ type: 'ACKNOWLEDGE_INSTRUCTIONS' }));
  nodes.push(h('div', { class: 'spacer' }), ready);

  return { nodes, patch() {} };
};
