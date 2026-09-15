import type { MachineState, TestStage } from '../../types';
import { countdownBar, h, onActivate, runCountdown, setText } from '../dom';
import type { ScreenFactory } from './types';

type TrailStage = Extract<TestStage, { type: 'TRAIL_ACTIVE' }>;

export const trailScreen: ScreenFactory = (ctx, state) => {
  const initial = state.stage;
  if (initial.type !== 'TRAIL_ACTIVE') return { nodes: [], patch() {} };
  const { config } = state;
  let latest: TrailStage = initial;
  let flashedAt: number | null = null;

  const board = h('div', { class: 'trail-board', part: 'trail-board', role: 'group', 'aria-label': 'Number trail' });
  const nodesByValue = new Map<number, HTMLButtonElement>();
  for (const target of initial.targets) {
    const node = h('button', { type: 'button', class: 'trail-node', 'aria-label': `Number ${target.value}`, style: `left:${target.x}%;top:${target.y}%` }, String(target.value));
    onActivate(node, (tapTime) => ctx.dispatch({ type: 'TRAIL_TAPPED', value: target.value, tapTime }, tapTime));
    nodesByValue.set(target.value, node);
    board.append(node);
  }

  const progress = h('span');
  const errors = h('span');
  const { bar, fill, label } = countdownBar();
  const stopCountdown = runCountdown(fill, label, () => ({
    remaining: Math.max(0, config.trailWindowMs - (performance.now() - latest.startTime)),
    windowMs: config.trailWindowMs,
  }));

  return {
    nodes: [
      h('div', { class: 'meta' }, progress, errors),
      h('h1', { class: 'sm' }, `Tap 1 to ${initial.targets.length} in order`),
      board,
      bar,
      label,
    ],
    patch(next: MachineState) {
      const stage = next.stage;
      if (stage.type !== 'TRAIL_ACTIVE') return;
      latest = stage;
      setText(progress, `Next: ${stage.nextValue}`);
      setText(errors, `Errors ${stage.errors}/${config.trailMaxErrors}`);
      for (const [value, node] of nodesByValue) {
        const done = value < stage.nextValue;
        node.classList.toggle('done', done);
        node.setAttribute('aria-pressed', String(done));
      }
      if (stage.lastErrorAt !== null && stage.lastErrorAt !== flashedAt) {
        flashedAt = stage.lastErrorAt;
        board.classList.remove('error');
        void board.offsetWidth; // restart the animation
        board.classList.add('error');
      }
    },
    dispose: stopCountdown,
    focus: () => nodesByValue.get(1)?.focus({ preventScroll: true }),
  };
};
