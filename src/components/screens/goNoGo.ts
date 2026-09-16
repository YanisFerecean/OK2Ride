import type { GoNoGoOutcome, MachineState, TestStage } from '../../types';
import { h, onActivate, setText } from '../dom';
import type { Strings } from '../i18n';
import type { ScreenFactory } from './types';

type GngStage = Extract<TestStage, { type: 'GNG_AWAITING' | 'GNG_STIMULUS_ACTIVE' | 'GNG_RESULT_DISPLAY' }>;

function isGngStage(stage: TestStage): stage is GngStage {
  return stage.type === 'GNG_AWAITING' || stage.type === 'GNG_STIMULUS_ACTIVE' || stage.type === 'GNG_RESULT_DISPLAY';
}

function feedbackFor(outcome: GoNoGoOutcome, rtMs: number | null, t: Strings): { text: string; tone: string } {
  switch (outcome) {
    case 'HIT':
      return { text: t.gngHit(rtMs), tone: 'good' };
    case 'CORRECT_REJECTION':
      return { text: t.gngHeld, tone: 'good' };
    case 'COMMISSION':
      return { text: t.gngCommission, tone: 'bad' };
    case 'OMISSION':
      return { text: t.gngOmission, tone: 'bad' };
    case 'FALSE_START':
      return { text: t.gngTooEarly, tone: 'warn' };
  }
}

export const goNoGoScreen: ScreenFactory = (ctx, state) => {
  const { config } = state;
  const { t } = ctx;

  const counter = h('span');
  const counts = h('span');
  const label = h('span', { class: 'tap-label' });
  const hint = h('span', { class: 'tap-hint' });
  const tap = h('div', { class: 'tap-area', part: 'tap-area', role: 'button', tabindex: '0', 'aria-label': t.gngTarget, 'data-phase': 'waiting' }, label, hint);
  onActivate(tap, (tapTime) => ctx.dispatch({ type: 'TARGET_TAPPED', tapTime }, tapTime));
  const feedback = h('div', { class: 'feedback', role: 'status', 'aria-live': 'assertive' });

  function patch(next: MachineState): void {
    const stage = next.stage;
    if (!isGngStage(stage)) return;
    const { progress } = stage;
    const total = progress.schedule.length;
    const shown = stage.type === 'GNG_RESULT_DISPLAY' ? progress.trials.length : progress.trials.length + 1;
    const commissions = progress.trials.filter((tr) => tr.outcome === 'COMMISSION' || tr.outcome === 'FALSE_START').length;
    const omissions = progress.trials.filter((tr) => tr.outcome === 'OMISSION').length;
    setText(counter, t.gngSignal(Math.min(shown, total), total));
    setText(counts, t.gngCounts(commissions, config.gngMaxCommissions, omissions, config.gngMaxOmissions));

    switch (stage.type) {
      case 'GNG_AWAITING':
        tap.dataset['phase'] = 'waiting';
        delete tap.dataset['signal'];
        delete tap.dataset['outcome'];
        setText(label, t.gngGetReady);
        setText(hint, t.gngHint);
        setText(feedback, '');
        feedback.className = 'feedback';
        break;
      case 'GNG_STIMULUS_ACTIVE':
        tap.dataset['phase'] = 'active';
        tap.dataset['signal'] = stage.isGo ? 'go' : 'stop';
        delete tap.dataset['outcome'];
        setText(label, stage.isGo ? t.gngGo : t.gngStop);
        setText(hint, '');
        break;
      case 'GNG_RESULT_DISPLAY': {
        const fb = feedbackFor(stage.outcome, stage.rtMs, t);
        const good = stage.outcome === 'HIT' || stage.outcome === 'CORRECT_REJECTION';
        tap.dataset['phase'] = 'result';
        delete tap.dataset['signal'];
        tap.dataset['outcome'] = good ? 'VALID' : stage.outcome === 'FALSE_START' ? 'FALSE_START' : 'LAPSE';
        setText(label, fb.text);
        setText(hint, '');
        setText(feedback, fb.text);
        feedback.className = `feedback ${fb.tone}`;
        break;
      }
    }
  }

  return {
    nodes: [h('div', { class: 'meta' }, counter, counts), tap, feedback],
    patch,
    focus: () => tap.focus({ preventScroll: true }),
  };
};
