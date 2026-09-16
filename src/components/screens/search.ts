import type { MachineState, TestStage } from '../../types';
import { countdownBar, h, onActivate, runCountdown, setText } from '../dom';
import type { ScreenFactory } from './types';

type ActiveStage = Extract<TestStage, { type: 'SEARCH_ACTIVE' }>;

export const searchScreen: ScreenFactory = (ctx, state) => {
  const initial = state.stage;
  if (initial.type !== 'SEARCH_ACTIVE') return { nodes: [], patch() {} };
  const { config } = state;
  const { t } = ctx;
  let latestActive: ActiveStage = initial;
  let renderedRound = -1;

  const counter = h('span');
  const errors = h('span');
  const board = h('div', { class: 'search-board', part: 'search-board', role: 'group', 'aria-label': t.searchBoard });
  const feedback = h('div', { class: 'feedback', role: 'status', 'aria-live': 'assertive' });

  const { bar, fill, label } = countdownBar();
  const stopCountdown = runCountdown(fill, label, () => ({
    remaining: Math.max(0, config.searchRoundTimeoutMs - (performance.now() - latestActive.startTime)),
    windowMs: config.searchRoundTimeoutMs,
  }));

  let itemNodes: HTMLButtonElement[] = [];

  // Every round draws a fresh field, and the screen stays mounted across
  // rounds, so the board is rebuilt whenever the round index moves on.
  function build(stage: ActiveStage): void {
    itemNodes = stage.items.map((item) => {
      const node = h(
        'button',
        { type: 'button', class: 'search-item', 'data-index': item.index, 'aria-label': t.searchSymbol(item.glyph), style: `left:${item.x}%;top:${item.y}%` },
        item.glyph,
      );
      onActivate(node, (tapTime) => ctx.dispatch({ type: 'SEARCH_TAPPED', index: item.index, tapTime }, tapTime));
      return node;
    });
    board.replaceChildren(...itemNodes);
  }

  return {
    nodes: [h('div', { class: 'meta' }, counter, errors), h('h1', { class: 'sm' }, t.searchTitle), board, bar, label, feedback],
    patch(next: MachineState) {
      const stage = next.stage;
      if (stage.type !== 'SEARCH_ACTIVE' && stage.type !== 'SEARCH_RESULT_DISPLAY') return;
      const { rounds } = stage.progress;
      const shown = stage.type === 'SEARCH_ACTIVE' ? rounds.length + 1 : rounds.length;
      const wrong = rounds.filter((r) => !r.correct).length;
      setText(counter, t.round(Math.min(shown, config.searchRounds), config.searchRounds));
      setText(errors, t.errors(wrong, config.searchMaxErrors));

      if (stage.type === 'SEARCH_ACTIVE') {
        latestActive = stage;
        if (stage.roundIndex !== renderedRound) {
          renderedRound = stage.roundIndex;
          build(stage);
        }
        board.removeAttribute('data-locked');
        for (const node of itemNodes) node.classList.remove('found', 'missed');
        setText(feedback, '');
        feedback.className = 'feedback';
      } else {
        board.setAttribute('data-locked', '');
        const target = latestActive.items.find((item) => item.isTarget);
        if (target) itemNodes[target.index]?.classList.add(stage.correct ? 'found' : 'missed');
        const text = stage.correct ? t.searchFound(stage.rtMs) : stage.timedOut ? t.tooSlow : t.searchWrong;
        setText(feedback, text);
        feedback.className = `feedback ${stage.correct ? 'good' : 'bad'}`;
      }
    },
    dispose: stopCountdown,
    focus: () => itemNodes[0]?.focus({ preventScroll: true }),
  };
};
