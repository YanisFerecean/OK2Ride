import type { AssessmentResult, TestId, TestResult } from '../../types';
import { formatMs, formatSeconds, h, iconCheck, iconCross, plural } from '../dom';
import { FAILURE_MESSAGES, TEST_INFO } from '../testInfo';
import type { ScreenFactory } from './types';

function summaryFor(r: TestResult): string {
  switch (r.test) {
    case 'pvt':
      return r.meanRtMs === null ? plural(r.lapseCount, 'lapse') : `mean ${formatMs(r.meanRtMs)}`;
    case 'spatial':
      return `${r.errorDeg.toFixed(1)}° off target`;
    case 'go-no-go':
      return `${plural(r.commissionCount, 'false tap')}, ${r.omissionCount} missed`;
    case 'trail':
      return r.completed ? `${formatSeconds(r.durationMs)}, ${plural(r.errorCount, 'error')}` : `${r.reached} of ${r.count} reached`;
    case 'sequence': {
      const correct = r.correct ? r.length : r.timedOut ? r.entered.length : Math.max(0, r.entered.length - 1);
      return `${correct} of ${r.length} tiles`;
    }
    case 'stroop':
      return `${r.correctCount} of ${r.trials.length} correct`;
  }
}

function row(test: TestId, result: TestResult | null, status: 'pass' | 'fail' | 'skipped'): HTMLDivElement {
  const badge = h('span', { class: `badge ${status}`, 'aria-label': status }, status === 'pass' ? iconCheck() : status === 'fail' ? iconCross() : '');
  return h(
    'div',
    { class: `row ${status}` },
    badge,
    h('div', { class: 'row-body' }, h('div', { class: 'row-name' }, TEST_INFO[test].name), h('div', { class: 'row-detail' }, result ? summaryFor(result) : 'not reached')),
  );
}

export const evaluatedScreen: ScreenFactory = (ctx, state) => {
  const stage = state.stage;
  if (stage.type !== 'EVALUATED') return { nodes: [], patch() {} };
  const result: AssessmentResult = stage.details;

  const message = result.passed
    ? 'You responded quickly and stayed in control.'
    : result.failureReason
      ? FAILURE_MESSAGES[result.failureReason]
      : 'The check could not be completed.';

  const rows = h('div', { class: 'rows' });
  for (const test of result.plan) {
    const r = result.results.find((x) => x.test === test) ?? null;
    const status = r ? (result.failedTest === test && !result.passed ? 'fail' : 'pass') : result.failedTest === test ? 'fail' : 'skipped';
    rows.append(row(test, r, status));
  }

  const nodes: Node[] = [
    h('div', { class: `result-icon ${result.passed ? 'pass' : 'fail'}`, 'aria-hidden': 'true' }, result.passed ? iconCheck() : iconCross()),
    h('h1', { class: 'center' }, result.passed ? 'Clear to ride' : 'Check not passed'),
    h('p', { class: 'center', role: 'status' }, message),
    rows,
    h('div', { class: 'meta' }, h('span', {}, 'Total time'), h('span', {}, formatSeconds(Math.round(result.completionTimeMs / 100) * 100))),
    h('div', { class: 'spacer' }),
  ];

  if (!result.passed) {
    const retry = h('button', { type: 'button', class: 'btn btn-secondary', 'data-action': 'reset' }, 'Try again');
    retry.addEventListener('click', () => ctx.reset());
    nodes.push(retry);
  }

  return { nodes, patch() {} };
};
