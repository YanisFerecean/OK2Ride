/**
 * OK2Ride Bikes: a small bike-rental app that gates every unlock behind the
 * OK2Ride check.
 *
 *   pick a bike → the server issues a one-time challenge → <ok2ride-check>
 *   runs with that nonce → on pass, the verification token goes back to the
 *   server, which validates it and starts the rental → ride → return → receipt
 */

import 'ok2ride'; // registers <ok2ride-check>
import { FAILURE_MESSAGES, TEST_INFO, type AssessmentResult } from 'ok2ride';
import { rideCostCents } from '../shared/pricing';
import type { Bike, BikeType, Challenge, Fleet, Me, Rental } from '../shared/types';
import { ApiError, type ApiClient } from './api';
import { compact, h, icons, setText, type Child } from './dom';
import { TYPE_LABEL, checkLength, formatClock, formatDateTime, formatMoney, formatRate, formatTime, testNames } from './format';
import { renderMap } from './map';

export interface AppOptions {
  readonly api: ApiClient;
  /** How long the widget's "Clear to ride" screen stays up before unlocking. */
  readonly passDelayMs?: number;
  /** Theme handed to the widget; defaults to the system preference. */
  readonly theme?: () => 'dark' | 'light';
}

export interface AppHandle {
  /** Resolves once the first load has rendered. */
  readonly ready: Promise<void>;
  destroy(): void;
}

export function createApp(root: HTMLElement, options: AppOptions): AppHandle {
  const app = new RentalApp(root, options);
  return { ready: app.ready, destroy: () => app.destroy() };
}

type View = 'loading' | 'error' | 'home' | 'ride' | 'receipt';
type TypeFilter = BikeType | 'all';
const TYPE_FILTERS: readonly TypeFilter[] = ['all', 'city', 'ebike', 'cargo'];

interface Overlay {
  readonly isOpen: boolean;
  /** Replaces the content; timers started with `every` for the old content stop. */
  setBody(...nodes: Child[]): void;
  setClosable(closable: boolean): void;
  /** Runs `fn` now and every `ms` until the content is replaced or the overlay closes. */
  every(ms: number, fn: () => void): void;
  close(): void;
}

interface OverlayOptions {
  readonly title: string;
  readonly variant: 'sheet' | 'check';
  readonly onClose?: () => void;
}

function systemTheme(): 'dark' | 'light' {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function messageOf(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

const fact = (label: string, value: string): HTMLElement => h('div', { class: 'fact' }, h('dt', {}, label), h('dd', {}, value));

const billLine = (label: string, value: string, extra = ''): HTMLElement => h('div', { class: `bill-line ${extra}`.trim() }, h('dt', {}, label), h('dd', {}, value));

function batteryPill(percent: number, low: boolean): HTMLElement {
  return h(
    'span',
    { class: `battery${low ? ' low' : ''}`, title: `Battery ${percent}%` },
    h('span', { class: 'battery-bar', 'aria-hidden': 'true' }, h('span', { class: 'battery-fill', style: `width:${percent}%` })),
    `${percent}%`,
  );
}

let overlaySeq = 0;

class RentalApp {
  readonly ready: Promise<void>;
  readonly #api: ApiClient;
  readonly #passDelayMs: number;
  readonly #theme: () => 'dark' | 'light';
  readonly #root: HTMLElement;
  readonly #header: HTMLElement;
  readonly #riderPill: HTMLElement;
  readonly #main: HTMLElement;
  readonly #layer: HTMLElement;
  readonly #toasts: HTMLElement;

  #me: Me | null = null;
  #fleet: Fleet | null = null;
  /** serverTime − Date.now(), so countdowns follow the server clock. */
  #offset = 0;
  #view: View = 'loading';
  #error = '';
  #receipt: Rental | null = null;
  #typeFilter: TypeFilter = 'all';
  #stationFilter: string | null = null;
  #viewTimers: number[] = [];
  #overlay: Overlay | null = null;
  #destroyed = false;

  constructor(root: HTMLElement, options: AppOptions) {
    this.#api = options.api;
    this.#passDelayMs = options.passDelayMs ?? 1_200;
    this.#theme = options.theme ?? systemTheme;
    this.#root = root;

    this.#riderPill = h('span', { class: 'rider-pill' }, '…');
    this.#header = h(
      'header',
      { class: 'topbar' },
      h('div', { class: 'topbar-inner' }, h('span', { class: 'brand' }, h('span', { class: 'brand-mark' }, icons.bike()), 'OK2Ride Bikes'), this.#riderPill),
    );
    this.#main = h('main', { class: 'view', tabindex: '-1' });
    this.#layer = h('div', { class: 'layer' });
    this.#toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
    root.replaceChildren(this.#header, this.#main, this.#layer, this.#toasts);

    this.ready = this.#load();
  }

  destroy(): void {
    this.#destroyed = true;
    this.#overlay?.close();
    this.#clearViewTimers();
    this.#root.replaceChildren();
  }

  /* --- Data ------------------------------------------------------------------ */

  async #load(): Promise<void> {
    this.#setView('loading');
    try {
      await this.#refresh();
      this.#setView(this.#me?.activeRental ? 'ride' : 'home');
    } catch (err) {
      this.#error = messageOf(err);
      this.#setView('error');
    }
  }

  async #refresh(): Promise<void> {
    const [me, fleet] = await Promise.all([this.#api.me(), this.#api.fleet()]);
    this.#me = me;
    this.#fleet = fleet;
    this.#offset = me.serverTime - Date.now();
    setText(this.#riderPill, me.rider.name);
  }

  #serverNow(): number {
    return Date.now() + this.#offset;
  }

  #cooldownLeft(): number {
    const until = this.#me?.cooldownUntil ?? null;
    return until === null ? 0 : Math.max(0, until - this.#serverNow());
  }

  #setCooldown(until: number): void {
    if (this.#me) this.#me = { ...this.#me, cooldownUntil: until };
  }

  #stationName(id: string | null): string {
    return this.#fleet?.stations.find((s) => s.id === id)?.name ?? 'Unknown station';
  }

  /* --- Views ----------------------------------------------------------------- */

  #setView(view: View, focus?: string): void {
    this.#view = view;
    this.#render(focus);
  }

  #render(focusSelector?: string): void {
    if (this.#destroyed) return;
    this.#clearViewTimers();
    this.#main.replaceChildren(...compact(this.#viewNodes()));
    if (focusSelector) this.#main.querySelector<HTMLElement | SVGElement>(focusSelector)?.focus();
  }

  #viewNodes(): Child[] {
    switch (this.#view) {
      case 'loading':
        return [h('div', { class: 'state' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('p', { class: 'state-title' }, 'Finding bikes near you…'))];
      case 'error': {
        const retry = h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'reload' }, 'Try again');
        retry.addEventListener('click', () => void this.#load());
        return [h('div', { class: 'state' }, h('h1', {}, 'Could not load bikes'), h('p', { class: 'muted' }, this.#error), retry)];
      }
      case 'home':
        return this.#homeView();
      case 'ride':
        return this.#rideView();
      case 'receipt':
        return this.#receiptView();
    }
  }

  #every(ms: number, fn: () => void): void {
    fn();
    this.#viewTimers.push(window.setInterval(fn, ms));
  }

  #clearViewTimers(): void {
    for (const t of this.#viewTimers) window.clearInterval(t);
    this.#viewTimers = [];
  }

  /* --- Home ------------------------------------------------------------------ */

  #homeView(): Child[] {
    const fleet = this.#fleet;
    if (!fleet) return [];
    const docked = fleet.bikes.filter((b) => b.stationId !== null);
    const ready = docked.filter((b) => b.rentable).length;
    const order = new Map(fleet.stations.map((s, i) => [s.id, i]));
    const shown = docked
      .filter((b) => this.#typeFilter === 'all' || b.type === this.#typeFilter)
      .filter((b) => this.#stationFilter === null || b.stationId === this.#stationFilter)
      .sort(
        (a, b) =>
          Number(b.rentable) - Number(a.rentable) ||
          (order.get(a.stationId ?? '') ?? 0) - (order.get(b.stationId ?? '') ?? 0) ||
          a.code.localeCompare(b.code),
      );

    const map = renderMap({
      stations: fleet.stations,
      bikes: docked,
      selected: this.#stationFilter,
      onSelect: (id) => {
        this.#stationFilter = id;
        this.#render(id ? `[data-station="${id}"]` : undefined);
      },
    });

    const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Bike type' });
    for (const type of TYPE_FILTERS) {
      const chip = h('button', { type: 'button', class: 'chip', 'data-type': type, 'aria-pressed': String(this.#typeFilter === type) }, type === 'all' ? 'All bikes' : TYPE_LABEL[type]);
      chip.addEventListener('click', () => {
        this.#typeFilter = type;
        this.#render(`.chip[data-type="${type}"]`);
      });
      chips.append(chip);
    }

    let stationBar: HTMLElement | null = null;
    if (this.#stationFilter !== null) {
      const clear = h('button', { type: 'button', class: 'link-btn', 'data-action': 'clear-station' }, 'Show all stations');
      clear.addEventListener('click', () => {
        this.#stationFilter = null;
        this.#render();
      });
      stationBar = h('div', { class: 'station-bar' }, icons.pin(), h('span', {}, this.#stationName(this.#stationFilter)), clear);
    }

    const list = h('ul', { class: 'bike-list', 'aria-label': 'Bikes' });
    for (const bike of shown) list.append(h('li', {}, this.#bikeCard(bike, fleet)));

    return [
      h(
        'section',
        { class: 'card map-card' },
        h('div', { class: 'map-head' }, h('h1', {}, 'Find a bike'), h('span', { class: 'muted' }, `${ready} ready nearby`)),
        map,
        h('p', { class: 'map-hint muted' }, 'Tap a station to see only its bikes.'),
      ),
      chips,
      stationBar,
      shown.length ? list : h('p', { class: 'empty muted' }, 'No bikes match. Try another type or station.'),
      this.#ridesSection(),
      this.#howSection(fleet),
    ];
  }

  #bikeCard(bike: Bike, fleet: Fleet): HTMLButtonElement {
    const pricing = fleet.pricing[bike.type];
    const check = fleet.checks[bike.type];
    const station = this.#stationName(bike.stationId);
    const reason = bike.rentable ? null : bike.status === 'maintenance' ? 'In maintenance' : bike.battery !== null ? 'Low battery' : 'Unavailable';
    const label = [`${TYPE_LABEL[bike.type]} ${bike.code} at ${station}`, bike.battery !== null ? `battery ${bike.battery}%` : null, reason ?? `${formatMoney(pricing.perMinuteCents)} per minute`]
      .filter(Boolean)
      .join(', ');

    const card = h(
      'button',
      { type: 'button', class: `bike-card type-${bike.type}`, 'data-bike': bike.id, disabled: !bike.rentable, 'aria-label': label },
      h('span', { class: 'bike-icon', 'aria-hidden': 'true' }, bike.type === 'ebike' ? icons.bolt() : bike.type === 'cargo' ? icons.box() : icons.bike()),
      h('span', { class: 'bike-main' }, h('span', { class: 'bike-title' }, `${TYPE_LABEL[bike.type]} `, h('strong', {}, bike.code)), h('span', { class: 'bike-meta' }, `${station} · ${formatRate(pricing)}`)),
      h(
        'span',
        { class: 'bike-side' },
        bike.battery !== null ? batteryPill(bike.battery, reason === 'Low battery') : null,
        reason ? h('span', { class: 'pill warn' }, reason) : h('span', { class: 'pill' }, `${check.stageCount} tests`),
      ),
    );
    card.addEventListener('click', () => this.#openBikeSheet(bike));
    return card;
  }

  #ridesSection(): HTMLElement {
    const rides = this.#me?.recentRentals ?? [];
    const section = h('section', { class: 'card rides' }, h('h2', {}, 'Your rides'));
    if (!rides.length) {
      section.append(h('p', { class: 'muted' }, 'No rides yet. Every ride starts with a quick OK2Ride check.'));
      return section;
    }
    const list = h('ul', { class: 'ride-list' });
    for (const r of rides) {
      list.append(
        h(
          'li',
          {},
          h('div', { class: 'ride-row-main' }, h('strong', {}, `${TYPE_LABEL[r.bikeType]} ${r.bikeCode}`), h('span', { class: 'muted' }, `${this.#stationName(r.startStationId)} → ${this.#stationName(r.endStationId)}`)),
          h('div', { class: 'ride-row-side' }, h('strong', {}, formatMoney(r.costCents ?? 0)), h('span', { class: 'muted' }, `${r.minutes ?? 0} min · ${formatDateTime(r.endedAt ?? r.startedAt)}`)),
        ),
      );
    }
    section.append(list);
    return section;
  }

  #howSection(fleet: Fleet): HTMLElement {
    const { city, ebike } = fleet.checks;
    return h(
      'section',
      { class: 'card how' },
      h('h2', {}, 'How unlocking works'),
      h(
        'ol',
        { class: 'how-steps' },
        h('li', {}, h('strong', {}, 'Pick a bike.'), ` City bikes need ${city.stageCount} quick tests; e-bikes and cargo bikes need ${ebike.stageCount}.`),
        h('li', {}, h('strong', {}, 'Take the OK2Ride check.'), ' Short reaction and coordination tests, picked at random each time.'),
        h('li', {}, h('strong', {}, 'Ride.'), ' The lock opens only after our server has verified your result.'),
      ),
    );
  }

  /* --- Bike sheet -------------------------------------------------------------- */

  #openBikeSheet(bike: Bike): void {
    const fleet = this.#fleet;
    if (!fleet) return;
    const pricing = fleet.pricing[bike.type];
    const check = fleet.checks[bike.type];
    const overlay = this.#openOverlay({ title: `${TYPE_LABEL[bike.type]} ${bike.code}`, variant: 'sheet' });

    const cta = h('button', { type: 'button', class: 'btn btn-primary btn-block btn-big', 'data-action': 'start-check' }, icons.shield(), 'Start safety check');
    cta.addEventListener('click', () => {
      overlay.close();
      void this.#runCheck(bike);
    });
    const wait = h('p', { class: 'notice warn', role: 'status', hidden: true });

    overlay.setBody(
      h(
        'dl',
        { class: 'facts' },
        fact('Station', this.#stationName(bike.stationId)),
        fact('Price', `${formatMoney(pricing.unlockFeeCents)} to unlock, then ${formatMoney(pricing.perMinuteCents)} per minute`),
        bike.battery !== null ? fact('Battery', `${bike.battery}%`) : null,
      ),
      h(
        'div',
        { class: 'explainer' },
        h('span', { class: 'explainer-icon', 'aria-hidden': 'true' }, icons.shield()),
        h('div', {}, h('strong', {}, `Safety check: ${checkLength(check.stageCount)}`), h('p', {}, 'OK2Ride runs short reaction and coordination tests before the bike unlocks. They are picked at random every time.')),
      ),
      wait,
      cta,
    );
    overlay.every(500, () => {
      const left = this.#cooldownLeft();
      cta.disabled = left > 0;
      wait.hidden = left <= 0;
      setText(wait, left > 0 ? `Your last check didn't pass. You can try again in ${Math.ceil(left / 1000)} s.` : '');
    });
  }

  /* --- The check --------------------------------------------------------------- */

  async #runCheck(bike: Bike): Promise<void> {
    let open = true;
    const overlay = this.#openOverlay({
      title: `Safety check · ${bike.code}`,
      variant: 'check',
      onClose: () => {
        open = false;
      },
    });

    const busy = (title: string, detail?: string): HTMLElement =>
      h('div', { class: 'state' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('p', { class: 'state-title' }, title), detail ? h('p', { class: 'muted' }, detail) : null);

    const actions = (primary: HTMLButtonElement, note?: HTMLElement): HTMLElement => {
      const close = h('button', { type: 'button', class: 'btn btn-block', 'data-action': 'close' }, 'Choose another bike');
      close.addEventListener('click', () => overlay.close());
      return h('div', { class: 'retry' }, note ?? null, primary, close);
    };

    const retryButton = (label: string): HTMLButtonElement => {
      const button = h('button', { type: 'button', class: 'btn btn-primary btn-block', 'data-action': 'retry' }, label);
      button.addEventListener('click', () => void begin());
      return button;
    };

    /**
     * Retry controls that respect the cooldown; `pending` holds them while a
     * result is being saved. Call `tick` via `overlay.every` after `setBody`,
     * since `setBody` stops the previous content's timers.
     */
    const cooldownActions = (pending: () => boolean): { footer: HTMLElement; tick: () => void } => {
      const note = h('p', { class: 'notice', role: 'status' });
      const retry = retryButton('Try again');
      const tick = (): void => {
        const left = this.#cooldownLeft();
        retry.disabled = pending() || left > 0;
        setText(note, pending() ? 'Saving your result…' : left > 0 ? `For your safety, wait ${Math.ceil(left / 1000)} s before trying again.` : 'You can try again now.');
      };
      return { footer: actions(retry, note), tick };
    };

    const showError = (title: string, message: string): void => {
      overlay.setBody(
        h('div', { class: 'outcome error' }, h('span', { class: 'outcome-icon', 'aria-hidden': 'true' }, icons.alert()), h('h3', {}, title), h('p', {}, message)),
        actions(retryButton('Take the check again')),
      );
    };

    const showCooldown = (): void => {
      const { footer, tick } = cooldownActions(() => false);
      overlay.setBody(
        h(
          'div',
          { class: 'outcome wait' },
          h('span', { class: 'outcome-icon', 'aria-hidden': 'true' }, icons.clock()),
          h('h3', {}, 'Take a short break'),
          h('p', {}, "Your last check didn't pass. The next one opens after a short pause."),
        ),
        footer,
      );
      overlay.every(500, tick);
    };

    const showFailure = (result: AssessmentResult, pending: () => boolean): (() => void) => {
      const rows = h('ul', { class: 'test-rows' });
      for (const id of result.plan) {
        const status = result.failedTest === id ? 'fail' : result.results.some((r) => r.test === id) ? 'pass' : 'skip';
        rows.append(
          h(
            'li',
            { class: status },
            h('span', { class: 'test-badge', 'aria-hidden': 'true' }, status === 'pass' ? icons.check() : status === 'fail' ? icons.cross() : '–'),
            h('span', {}, TEST_INFO[id].name),
            h('span', { class: 'muted' }, status === 'pass' ? 'Passed' : status === 'fail' ? 'Not passed' : 'Not reached'),
          ),
        );
      }
      const { footer, tick } = cooldownActions(pending);
      overlay.setBody(
        h(
          'div',
          { class: 'outcome fail' },
          h('span', { class: 'outcome-icon', 'aria-hidden': 'true' }, icons.cross()),
          h('h3', {}, 'Not cleared to ride'),
          h('p', {}, result.failureReason ? FAILURE_MESSAGES[result.failureReason] : 'The check could not be completed.'),
          rows,
          h('p', { class: 'muted small' }, "If you're tired or unwell, please don't ride. The bike stays locked."),
        ),
        footer,
      );
      overlay.every(500, tick);
      return tick;
    };

    const onPassed = async (result: AssessmentResult): Promise<void> => {
      overlay.setClosable(false);
      await delay(this.#passDelayMs); // let the rider see "Clear to ride"
      if (!open) return;
      overlay.setBody(busy(`Unlocking ${bike.code}…`, 'Verifying your check with the rental service.'));
      try {
        const rental = await this.#api.startRental(bike.id, result.verificationToken);
        if (!open) return;
        overlay.setClosable(true);
        overlay.close();
        await this.#refresh().catch(() => undefined);
        if (this.#me && !this.#me.activeRental) this.#me = { ...this.#me, activeRental: rental };
        this.#setView('ride');
        this.#toast(`${bike.code} unlocked. Your code is ${rental.unlockCode}.`, 'good');
      } catch (err) {
        if (!open) return;
        overlay.setClosable(true);
        showError('The bike did not unlock', messageOf(err));
      }
    };

    const onFailed = (result: AssessmentResult): void => {
      let pending = true;
      const refresh = showFailure(result, () => pending);
      this.#api
        .reportFailedCheck(result.verificationToken)
        .then(({ cooldownUntil }) => this.#setCooldown(cooldownUntil))
        .catch(() => undefined)
        .finally(() => {
          pending = false;
          if (open) refresh();
        });
    };

    const showWidget = (challenge: Challenge): void => {
      const widget = document.createElement('ok2ride-check');
      widget.setAttribute('stage-count', String(challenge.stageCount));
      widget.setAttribute('difficulty', challenge.difficulty);
      widget.setAttribute('challenge-nonce', challenge.nonce);
      widget.setAttribute('theme', this.#theme());
      let settled = false;
      widget.addEventListener('capability-passed', (event) => {
        if (settled) return;
        settled = true;
        void onPassed(event.detail);
      });
      widget.addEventListener('capability-failed', (event) => {
        if (settled) return;
        settled = true;
        onFailed(event.detail);
      });
      overlay.setBody(h('p', { class: 'check-lede muted' }, `This ${TYPE_LABEL[bike.type].toLowerCase()} needs ${challenge.stageCount} tests. Follow the instructions in the panel below.`), widget);
      widget.start(); // skip the widget's idle screen: the rider already chose to rent
    };

    const begin = async (): Promise<void> => {
      overlay.setClosable(true);
      overlay.setBody(busy('Preparing your check…'));
      let challenge: Challenge;
      try {
        challenge = await this.#api.createChallenge(bike.id);
      } catch (err) {
        if (!open) return;
        if (err instanceof ApiError && err.code === 'COOLDOWN' && err.retryAt !== null) {
          this.#setCooldown(err.retryAt);
          showCooldown();
        } else {
          showError('Could not start the check', messageOf(err));
        }
        return;
      }
      if (open) showWidget(challenge);
    };

    await begin();
  }

  /* --- Ride ------------------------------------------------------------------ */

  #rideView(): Child[] {
    const rental = this.#me?.activeRental;
    if (!rental) return [];
    const timer = h('div', { class: 'ride-timer', role: 'timer', 'aria-label': 'Ride time' });
    const cost = h('div', { class: 'ride-cost' });
    this.#every(1_000, () => {
      const elapsed = this.#serverNow() - rental.startedAt;
      setText(timer, formatClock(elapsed));
      setText(cost, `${formatMoney(rideCostCents(rental.pricing, elapsed))} so far`);
    });

    const end = h('button', { type: 'button', class: 'btn btn-primary btn-block btn-big', 'data-action': 'end-ride' }, 'End ride');
    end.addEventListener('click', () => this.#openEndRide(rental));
    const digits = rental.unlockCode.split('');
    const tests = testNames(rental.check.plan);
    const reaction = rental.check.meanRtMs === null ? '' : ` · ${Math.round(rental.check.meanRtMs)} ms mean reaction`;

    return [
      h(
        'section',
        { class: 'card ride' },
        h('div', { class: 'live' }, h('span', { class: 'live-dot', 'aria-hidden': 'true' }), 'Ride in progress'),
        timer,
        cost,
        h(
          'div',
          { class: 'unlock' },
          h('span', { class: 'unlock-label' }, icons.lock(), 'Unlock code'),
          h('span', { class: 'unlock-code', role: 'img', 'aria-label': `Unlock code ${digits.join(' ')}` }, ...digits.map((d) => h('span', { 'aria-hidden': 'true' }, d))),
          h('span', { class: 'muted small' }, 'Type it on the keypad by the rear wheel to open the lock.'),
        ),
        h(
          'dl',
          { class: 'facts' },
          fact('Bike', `${TYPE_LABEL[rental.bikeType]} ${rental.bikeCode}`),
          fact('Picked up', `${this.#stationName(rental.startStationId)} at ${formatTime(rental.startedAt)}`),
          fact('Rate', formatRate(rental.pricing)),
          fact('Safety check', `Passed ${tests.length} tests${reaction}`),
        ),
        end,
      ),
    ];
  }

  #openEndRide(rental: Rental): void {
    const fleet = this.#fleet;
    if (!fleet) return;
    const overlay = this.#openOverlay({ title: 'Return the bike', variant: 'sheet' });
    let selected = rental.startStationId;

    const group = h('div', { class: 'station-list', role: 'radiogroup', 'aria-label': 'Return station' });
    for (const station of fleet.stations) {
      const docked = fleet.bikes.filter((b) => b.stationId === station.id).length;
      const input = h('input', { type: 'radio', name: 'return-station', value: station.id, checked: station.id === selected });
      input.addEventListener('change', () => {
        selected = station.id;
      });
      group.append(h('label', { class: 'station-option' }, input, h('span', { class: 'station-name' }, station.name), h('span', { class: 'muted small' }, `${docked} docked`)));
    }

    const confirm = h('button', { type: 'button', class: 'btn btn-primary btn-block btn-big', 'data-action': 'confirm-end' }, 'End ride here');
    confirm.addEventListener('click', () => {
      confirm.disabled = true;
      overlay.setClosable(false);
      setText(confirm, 'Ending ride…');
      this.#api.endRental(rental.id, selected).then(
        async (ended) => {
          overlay.setClosable(true);
          overlay.close();
          this.#receipt = ended;
          await this.#refresh().catch(() => undefined);
          if (this.#me?.activeRental?.id === ended.id) this.#me = { ...this.#me, activeRental: null };
          this.#setView('receipt');
        },
        (err: unknown) => {
          overlay.setClosable(true);
          confirm.disabled = false;
          setText(confirm, 'End ride here');
          this.#toast(messageOf(err), 'bad');
        },
      );
    });

    overlay.setBody(h('p', { class: 'muted' }, 'Dock the bike, close the lock, then confirm where you left it.'), group, confirm);
  }

  /* --- Receipt ------------------------------------------------------------------ */

  #receiptView(): Child[] {
    const r = this.#receipt;
    if (!r || r.minutes === null || r.costCents === null || r.endedAt === null) return [];
    const done = h('button', { type: 'button', class: 'btn btn-primary btn-block', 'data-action': 'done' }, 'Done');
    done.addEventListener('click', () => {
      this.#receipt = null;
      this.#setView('home');
    });
    return [
      h(
        'section',
        { class: 'card receipt' },
        h('span', { class: 'outcome-icon pass', 'aria-hidden': 'true' }, icons.check()),
        h('h1', {}, 'Ride complete'),
        h('p', { class: 'muted' }, `${this.#stationName(r.startStationId)} → ${this.#stationName(r.endStationId)}`),
        h(
          'dl',
          { class: 'bill' },
          billLine('Ride time', formatClock(r.endedAt - r.startedAt)),
          billLine('Unlock', formatMoney(r.pricing.unlockFeeCents)),
          billLine(`${r.minutes} min × ${formatMoney(r.pricing.perMinuteCents)}`, formatMoney(r.minutes * r.pricing.perMinuteCents)),
          billLine('Total', formatMoney(r.costCents), 'total'),
        ),
        h('p', { class: 'muted small' }, `Cleared by OK2Ride before unlocking: ${testNames(r.check.plan).join(', ')}.`),
        done,
      ),
    ];
  }

  /* --- Overlays & toasts ---------------------------------------------------------- */

  #openOverlay(options: OverlayOptions): Overlay {
    this.#overlay?.close();
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const titleId = `overlay-title-${++overlaySeq}`;
    const closeButton = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', 'data-action': 'close-overlay' }, icons.close());
    const body = h('div', { class: 'panel-body' });
    const panel = h(
      'div',
      { class: `panel ${options.variant}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1' },
      h('div', { class: 'panel-head' }, h('h2', { id: titleId }, options.title), closeButton),
      body,
    );
    const backdrop = h('div', { class: `backdrop ${options.variant}` }, panel);

    let open = true;
    let closable = true;
    let timers: number[] = [];
    const stopTimers = (): void => {
      for (const t of timers) window.clearInterval(t);
      timers = [];
    };

    const handle: Overlay = {
      get isOpen() {
        return open;
      },
      setBody: (...nodes) => {
        stopTimers();
        body.replaceChildren(...compact(nodes));
      },
      setClosable: (value) => {
        closable = value;
        closeButton.disabled = !value;
      },
      every: (ms, fn) => {
        fn();
        timers.push(window.setInterval(fn, ms));
      },
      close: () => {
        if (!open) return;
        open = false;
        stopTimers();
        document.removeEventListener('keydown', onKey);
        backdrop.remove();
        this.#setInert(false);
        if (this.#overlay === handle) this.#overlay = null;
        options.onClose?.();
        if (returnFocus?.isConnected) returnFocus.focus();
        else this.#main.focus();
      },
    };

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && closable) {
        event.preventDefault();
        handle.close();
      }
    };
    closeButton.addEventListener('click', () => {
      if (closable) handle.close();
    });
    // Sheets close on a backdrop tap; the check does not, so a stray tap can't abort it.
    if (options.variant === 'sheet') {
      backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop && closable) handle.close();
      });
    }
    document.addEventListener('keydown', onKey);

    this.#layer.append(backdrop);
    this.#setInert(true);
    this.#overlay = handle;
    panel.focus();
    return handle;
  }

  #setInert(inert: boolean): void {
    for (const el of [this.#header, this.#main]) {
      if (inert) el.setAttribute('inert', '');
      else el.removeAttribute('inert');
    }
  }

  #toast(message: string, tone: 'good' | 'bad' | 'info' = 'info'): void {
    const toast = h('div', { class: `toast ${tone}`, role: tone === 'bad' ? 'alert' : null }, message);
    this.#toasts.append(toast);
    window.setTimeout(() => toast.remove(), 4_500);
  }
}
