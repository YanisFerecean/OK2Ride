import type { AssessmentResult, TestId, TestResult } from '../../types';
import { formatSeconds, h, iconCheck, iconCross } from '../dom';
import type { Strings } from '../i18n';
import type { ScreenFactory } from './types';

function summaryFor(r: TestResult, t: Strings): string {
  switch (r.test) {
    case 'pvt':
      return t.summaryPvt(r.meanRtMs, r.lapseCount);
    case 'spatial':
      return t.summarySpatial(r.errorDeg);
    case 'go-no-go':
      return t.summaryGoNoGo(r.commissionCount, r.omissionCount);
    case 'trail':
      return t.summaryTrail(r.completed, r.durationMs, r.errorCount, r.reached, r.count);
    case 'sequence': {
      const correct = r.correct ? r.length : r.timedOut ? r.entered.length : Math.max(0, r.entered.length - 1);
      return t.summarySequence(correct, r.length);
    }
    case 'stroop':
      return t.summaryStroop(r.correctCount, r.trials.length);
    case 'timing':
      return t.summaryTiming(r.meanErrorMs, r.missCount);
    case 'search':
      return t.summarySearch(r.correctCount, r.rounds.length);
  }
}

function row(test: TestId, result: TestResult | null, status: 'pass' | 'fail' | 'skipped', t: Strings): HTMLDivElement {
  const badge = h('span', { class: `badge ${status}`, 'aria-label': status }, status === 'pass' ? iconCheck() : status === 'fail' ? iconCross() : '');
  return h(
    'div',
    { class: `row ${status}` },
    badge,
    h('div', { class: 'row-body' }, h('div', { class: 'row-name' }, t.tests[test].name), h('div', { class: 'row-detail' }, result ? summaryFor(result, t) : t.resultNotReached)),
  );
}

export const evaluatedScreen: ScreenFactory = (ctx, state) => {
  const stage = state.stage;
  if (stage.type !== 'EVALUATED') return { nodes: [], patch() {} };
  const result: AssessmentResult = stage.details;
  const { t } = ctx;

  const message = result.passed ? t.resultPassBody : result.failureReason ? t.failures[result.failureReason] : t.resultIncomplete;

  const rows = h('div', { class: 'rows' });
  for (const test of result.plan) {
    const r = result.results.find((x) => x.test === test) ?? null;
    const status = r ? (result.failedTest === test && !result.passed ? 'fail' : 'pass') : result.failedTest === test ? 'fail' : 'skipped';
    rows.append(row(test, r, status, t));
  }

  const nodes: Node[] = [
    h('div', { class: `result-icon ${result.passed ? 'pass' : 'fail'}`, 'aria-hidden': 'true' }, result.passed ? iconCheck() : iconCross()),
    h('h1', { class: 'center' }, result.passed ? t.resultPass : t.resultFail),
    h('p', { class: 'center', role: 'status' }, message),
    rows,
    h('div', { class: 'meta' }, h('span', {}, t.resultTotalTime), h('span', {}, formatSeconds(Math.round(result.completionTimeMs / 100) * 100))),
    h('div', { class: 'spacer' }),
  ];

  if (!result.passed) {
    const retry = h('button', { type: 'button', class: 'btn btn-secondary', 'data-action': 'reset' }, t.resultRetry);
    retry.addEventListener('click', () => ctx.reset());
    nodes.push(retry);
  }

  return { nodes, patch() {} };
};
