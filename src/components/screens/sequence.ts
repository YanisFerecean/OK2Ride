import type { MachineState, TestStage } from '../../types';
import { countdownBar, h, onActivate, runCountdown, setText } from '../dom';
import type { ScreenFactory } from './types';

type SequenceStage = Extract<TestStage, { type: 'SEQUENCE_SHOWING' | 'SEQUENCE_INPUT' }>;

export const sequenceScreen: ScreenFactory = (ctx, state) => {
  const initial = state.stage;
  if (initial.type !== 'SEQUENCE_SHOWING' && initial.type !== 'SEQUENCE_INPUT') return { nodes: [], patch() {} };
  const { config } = state;
  const { t } = ctx;
  const grid = Math.max(2, Math.round(config.sequenceGridSize));
  const length = initial.sequence.length;
  let latest: SequenceStage = initial;

  const tiles: HTMLButtonElement[] = [];
  const board = h('div', { class: 'tiles', part: 'tiles', role: 'group', 'aria-label': t.sequenceBoard, style: `grid-template-columns: repeat(${grid}, minmax(0, 1fr))` });
  for (let i = 0; i < grid * grid; i++) {
    const tile = h('button', { type: 'button', class: 'tile', 'aria-label': t.sequenceTile(i + 1) });
    onActivate(tile, (tapTime) => ctx.dispatch({ type: 'SEQUENCE_TILE_TAPPED', tile: i, tapTime }, tapTime));
    tiles.push(tile);
    board.append(tile);
  }

  const title = h('h1', { class: 'sm' });
  const status = h('span');
  const dots = h('div', { class: 'progress', role: 'img', 'aria-label': t.sequenceEntered });
  for (let i = 0; i < length; i++) dots.append(h('span', { class: 'dot' }));

  const { bar, fill, label } = countdownBar();
  const stopCountdown = runCountdown(fill, label, () => {
    if (latest.type !== 'SEQUENCE_INPUT') return { remaining: config.sequenceInputWindowMs, windowMs: config.sequenceInputWindowMs };
    return { remaining: Math.max(0, config.sequenceInputWindowMs - (performance.now() - latest.inputStartTime)), windowMs: config.sequenceInputWindowMs };
  });

  return {
    nodes: [h('div', { class: 'meta' }, status, h('div', { class: 'progress' }, dots)), title, board, bar, label],
    patch(next: MachineState) {
      const stage = next.stage;
      if (stage.type !== 'SEQUENCE_SHOWING' && stage.type !== 'SEQUENCE_INPUT') return;
      latest = stage;
      if (stage.type === 'SEQUENCE_SHOWING') {
        board.dataset['locked'] = '';
        const litTile = stage.lit ? stage.sequence[stage.step] : undefined;
        tiles.forEach((tile, i) => {
          tile.classList.toggle('lit', i === litTile);
          tile.classList.remove('pressed');
          tile.setAttribute('aria-disabled', 'true');
        });
        setText(title, t.sequenceWatch);
        setText(status, t.sequenceShowing(Math.min(stage.step + 1, length), length));
        for (let i = 0; i < dots.children.length; i++) dots.children[i]?.classList.remove('filled');
      } else {
        delete board.dataset['locked'];
        const last = stage.entered[stage.entered.length - 1];
        tiles.forEach((tile, i) => {
          tile.classList.remove('lit');
          tile.classList.toggle('pressed', i === last);
          tile.removeAttribute('aria-disabled');
        });
        setText(title, t.sequenceYourTurn);
        setText(status, t.sequenceProgress(stage.entered.length, length));
        for (let i = 0; i < dots.children.length; i++) dots.children[i]?.classList.toggle('filled', i < stage.entered.length);
      }
    },
    dispose: stopCountdown,
    focus: () => tiles[0]?.focus({ preventScroll: true }),
  };
};
