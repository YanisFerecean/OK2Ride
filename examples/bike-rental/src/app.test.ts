// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssessmentResult, OK2Ride } from 'ok2ride';
import { buildVerificationToken } from 'ok2ride/token';
import { RentalStore, type Result } from '../server/store';
import { ApiError, type ApiClient } from './api';
import { createApp, type AppHandle } from './app';

const RIDER = 'c3'.repeat(16);

let clock: number;
let store: RentalStore;
let root: HTMLElement;
let app: AppHandle | null;

/** The app's API backed directly by the real store, no HTTP in between. */
function storeApi(): ApiClient {
  const unwrap = <T>(result: Result<T>): T => {
    if (result.ok) return result.value;
    throw new ApiError(result.error.status, result.error.code, result.error.message, result.error.retryAt ?? null);
  };
  return {
    me: async () => store.me(RIDER),
    fleet: async () => store.fleet(),
    createChallenge: async (bikeId) => unwrap(store.issueChallenge(RIDER, bikeId)),
    reportFailedCheck: async (token) => unwrap(store.reportFailedCheck(RIDER, token)),
    startRental: async (bikeId, token) => unwrap(store.startRental(RIDER, bikeId, token)),
    endRental: async (rentalId, stationId) => unwrap(store.endRental(RIDER, rentalId, stationId)),
  };
}

async function start(api: ApiClient = storeApi()): Promise<AppHandle> {
  app = createApp(root, { api, passDelayMs: 0, theme: () => 'dark' });
  await app.ready;
  return app;
}

function $<T extends Element = HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}
const $$ = (selector: string): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(selector)];
const click = (selector: string): void => $(selector).click();
const text = (selector: string): string => $(selector).textContent ?? '';
const bikeIds = (): (string | undefined)[] => $$('.bike-card').map((c) => c.dataset['bike']);

function tokenFor(nonce: string, ok: boolean, plan = 'pvt,stroop'): string {
  return buildVerificationToken({ v: 2, sid: 'test', nonce, ok, iat: new Date(clock).toISOString(), ct: 20_000, rt: 298, lp: 0, fs: 0, se: null, pl: plan, hv: 'human', hs: 1 });
}

/** Just the parts of a widget result the app reads. */
function widgetResult(fields: Partial<AssessmentResult> & { verificationToken: string }): AssessmentResult {
  return { passed: true, failureReason: null, failedTest: null, plan: ['pvt', 'stroop'], results: [], ...fields } as AssessmentResult;
}

async function openCheck(bikeId: string): Promise<{ widget: OK2Ride; nonce: string }> {
  click(`.bike-card[data-bike="${bikeId}"]`);
  click('[data-action="start-check"]');
  await vi.waitFor(() => expect(document.querySelector('ok2ride-check')).not.toBeNull());
  const widget = $<OK2Ride>('ok2ride-check');
  return { widget, nonce: widget.getAttribute('challenge-nonce') ?? '' };
}

beforeEach(() => {
  clock = Date.UTC(2026, 8, 15, 18, 0, 0);
  store = new RentalStore({ now: () => clock });
  root = document.createElement('div');
  document.body.append(root);
  app = null;
});

afterEach(() => {
  app?.destroy();
  document.body.innerHTML = '';
});

describe('OK2Ride Bikes', () => {
  it('shows the map and every docked bike, with unavailable ones disabled', async () => {
    await start();
    expect(text('.rider-pill')).toBe('Rider C3C3');
    expect($$('.map-pin')).toHaveLength(5);
    expect(text('.map-head')).toContain('12 ready nearby');
    expect(bikeIds()).toHaveLength(14);
    const disabled = $$('.bike-card')
      .filter((c) => (c as HTMLButtonElement).disabled)
      .map((c) => c.dataset['bike']);
    expect(disabled.sort()).toEqual(['b104', 'b203']);
    expect(text('.bike-card[data-bike="b203"]')).toContain('Low battery');
    expect(text('.bike-card[data-bike="b201"]')).toContain('3 tests');
  });

  it('filters by bike type and by station', async () => {
    await start();
    click('.chip[data-type="ebike"]');
    expect(bikeIds()).toEqual(['b201', 'b202', 'b204', 'b205', 'b203']);
    $('.map-pin[data-station="central"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(bikeIds()).toEqual(['b202', 'b203']);
    expect(text('.station-bar')).toContain('Central Station');
    click('[data-action="clear-station"]');
    click('.chip[data-type="all"]');
    expect(bikeIds()).toHaveLength(14);
  });

  it('runs the OK2Ride check before unlocking, then rides and returns the bike', async () => {
    await start();
    click('.bike-card[data-bike="b101"]');
    expect(text('.panel h2')).toBe('City bike B-101');
    expect(text('.explainer')).toContain('2 quick tests');

    const { widget, nonce } = await openCheck('b101');
    expect(widget.getAttribute('stage-count')).toBe('2');
    expect(widget.getAttribute('difficulty')).toBe('medium');
    expect(widget.getAttribute('theme')).toBe('dark');
    expect(nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(widget.stage.type).toBe('INSTRUCTION'); // started straight away

    clock += 25_000;
    widget.dispatchEvent(new CustomEvent('capability-passed', { detail: widgetResult({ verificationToken: tokenFor(nonce, true) }) }));

    await vi.waitFor(() => expect(document.querySelector('.ride-timer')).not.toBeNull());
    expect(document.querySelector('.panel')).toBeNull();
    const rental = store.me(RIDER).activeRental;
    expect(rental?.bikeId).toBe('b101');
    expect(text('.unlock-code')).toBe(rental?.unlockCode);
    expect(text('.ride')).toContain('Passed 2 tests · 298 ms mean reaction');
    expect(text('.toasts')).toContain(`B-101 unlocked. Your code is ${rental?.unlockCode}.`);

    click('[data-action="end-ride"]');
    const harbour = $<HTMLInputElement>('input[name="return-station"][value="harbour"]');
    harbour.checked = true;
    harbour.dispatchEvent(new Event('change', { bubbles: true }));
    clock += 6.5 * 60_000;
    click('[data-action="confirm-end"]');

    await vi.waitFor(() => expect(document.querySelector('.receipt')).not.toBeNull());
    expect(text('.receipt')).toContain('Market Square → Harbour');
    expect(text('.bill-line.total')).toContain('€2.05');
    expect(store.fleet().bikes.find((b) => b.id === 'b101')?.stationId).toBe('harbour');

    click('[data-action="done"]');
    expect(text('.rides')).toContain('City bike B-101');
    expect(text('.rides')).toContain('€2.05');
  });

  it('explains a failed check and enforces the cooldown before retrying', async () => {
    await start();
    const { widget, nonce } = await openCheck('b204');
    expect(widget.getAttribute('stage-count')).toBe('3');

    widget.dispatchEvent(
      new CustomEvent('capability-failed', {
        detail: widgetResult({
          passed: false,
          failureReason: 'TRAIL_TIMEOUT',
          failedTest: 'trail',
          plan: ['pvt', 'trail', 'stroop'],
          results: [{ test: 'pvt' }] as unknown as AssessmentResult['results'],
          verificationToken: tokenFor(nonce, false),
        }),
      }),
    );

    expect(document.querySelector('ok2ride-check')).toBeNull();
    expect(text('.outcome h3')).toBe('Not cleared to ride');
    expect(text('.outcome')).toContain('The number trail was not finished in time.');
    expect($$('.test-rows li').map((li) => li.className)).toEqual(['pass', 'fail', 'skip']);

    await vi.waitFor(() => expect(store.me(RIDER).cooldownUntil).toBe(clock + 30_000));
    await vi.waitFor(() => expect(text('.retry .notice')).toMatch(/wait \d+ s before trying again/));
    expect($<HTMLButtonElement>('[data-action="retry"]').disabled).toBe(true);

    click('[data-action="close"]');
    expect(document.querySelector('.panel')).toBeNull();
    click('.bike-card[data-bike="b101"]');
    expect($<HTMLButtonElement>('[data-action="start-check"]').disabled).toBe(true);
    expect(text('.notice.warn')).toMatch(/try again in \d+ s/);
  });

  it('keeps the bike locked when the server rejects the result', async () => {
    await start();
    const { widget } = await openCheck('b101');
    clock += 25_000;
    widget.dispatchEvent(new CustomEvent('capability-passed', { detail: widgetResult({ verificationToken: tokenFor('f'.repeat(32), true) }) }));
    await vi.waitFor(() => expect(document.querySelector('.outcome.error')).not.toBeNull());
    expect(text('.outcome h3')).toBe('The bike did not unlock');
    expect(text('.outcome')).toContain('This check was not issued to you.');
    expect(store.me(RIDER).activeRental).toBeNull();
  });

  it('explains when the check cannot start', async () => {
    const api = storeApi();
    await start({
      ...api,
      createChallenge: async () => {
        throw new ApiError(0, 'NETWORK', "Can't reach the rental service.");
      },
    });
    click('.bike-card[data-bike="b101"]');
    click('[data-action="start-check"]');
    await vi.waitFor(() => expect(text('.outcome h3')).toBe('Could not start the check'));
    expect(text('.outcome')).toContain("Can't reach the rental service.");
  });

  it('resumes a ride in progress after a reload', async () => {
    const challenge = store.issueChallenge(RIDER, 'b105');
    if (!challenge.ok) throw new Error('challenge refused');
    clock += 25_000;
    expect(store.startRental(RIDER, 'b105', tokenFor(challenge.value.nonce, true)).ok).toBe(true);
    clock += 90_000;
    await start();
    expect(text('.ride')).toContain('City bike B-105');
    expect(text('.ride-timer')).toMatch(/^01:3\d$/);
  });
});
