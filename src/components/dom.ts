/**
 * Tiny DOM helpers shared by the screens. No framework, no templates:
 * elements are created directly so dynamic text always goes through
 * `textContent`, never `innerHTML`.
 */

export type AttrValue = string | number | boolean | null | undefined;
export type Attrs = Readonly<Record<string, AttrValue>>;
export type Child = Node | string;

const SVG_NS = 'http://www.w3.org/2000/svg';

export function applyAttrs(el: Element, attrs: Attrs): void {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    el.setAttribute(key, value === true ? '' : String(value));
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  applyAttrs(el, attrs);
  el.append(...children);
  return el;
}

export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  applyAttrs(el, attrs);
  el.append(...children);
  return el;
}

export function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

/**
 * Wires a low-latency "tap" handler: `pointerdown` for pointers (no click
 * delay, no double firing) and Enter / Space for keyboards. The handler gets
 * a `performance.now()` sample taken before any other work.
 */
export function onActivate(el: HTMLElement, handler: (tapTime: number) => void): void {
  el.addEventListener('pointerdown', (event) => {
    const tapTime = performance.now();
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    handler(tapTime);
  });
  el.addEventListener('keydown', (event) => {
    const tapTime = performance.now();
    if (event.repeat || (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar')) return;
    event.preventDefault();
    handler(tapTime);
  });
  el.addEventListener('contextmenu', (event) => event.preventDefault());
}

/**
 * Drives a countdown bar with `requestAnimationFrame`. `probe` returns the
 * remaining time and window, or `null` once the countdown no longer applies.
 * Returns a stop function.
 */
export function runCountdown(fill: HTMLElement, label: HTMLElement | null, probe: () => { remaining: number; windowMs: number } | null): () => void {
  let frame: number | null = null;
  const tick = (): void => {
    const d = probe();
    if (!d) {
      frame = null;
      return;
    }
    fill.style.transform = `scaleX(${(d.windowMs > 0 ? d.remaining / d.windowMs : 0).toFixed(4)})`;
    if (label) setText(label, `${(d.remaining / 1000).toFixed(1)} s left`);
    frame = requestAnimationFrame(tick);
  };
  tick();
  return () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  };
}

export function countdownBar(): { bar: HTMLDivElement; fill: HTMLDivElement; label: HTMLDivElement } {
  const fill = h('div', { class: 'countdown-fill' });
  const bar = h('div', { class: 'countdown', 'aria-hidden': 'true' }, fill);
  const label = h('div', { class: 'countdown-label' });
  return { bar, fill, label };
}

/* --- formatting ------------------------------------------------------------- */

export function formatSeconds(ms: number): string {
  const seconds = ms / 1000;
  return `${Number.isInteger(seconds) ? seconds.toFixed(0) : seconds.toFixed(1)} s`;
}

export function formatMs(ms: number): string {
  return `${Math.round(ms)} ms`;
}

/* --- icons ------------------------------------------------------------------ */

export function iconCheck(): SVGSVGElement {
  return s(
    'svg',
    { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '3.2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
    s('path', { d: 'M4 12.5l5 5L20 6.5' }),
  );
}

export function iconCross(): SVGSVGElement {
  return s(
    'svg',
    { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '3.2', 'stroke-linecap': 'round', 'aria-hidden': 'true' },
    s('path', { d: 'M6 6l12 12M18 6L6 18' }),
  );
}

export function iconScooter(): SVGSVGElement {
  return s(
    'svg',
    { viewBox: '0 0 48 48', fill: 'none', stroke: 'currentColor', 'stroke-width': '3', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
    s('circle', { cx: '10', cy: '36', r: '5' }),
    s('circle', { cx: '38', cy: '36', r: '5' }),
    s('path', { d: 'M15 36h14l6-24h6M35 8h5M29 36l-2-8' }),
  );
}

/* --- styles ----------------------------------------------------------------- */

let sharedSheet: CSSStyleSheet | null | undefined;

export function installStyles(root: ShadowRoot, css: string): void {
  if (sharedSheet === undefined) {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      sharedSheet = sheet;
    } catch {
      sharedSheet = null;
    }
  }
  if (sharedSheet && 'adoptedStyleSheets' in root) {
    root.adoptedStyleSheets = [sharedSheet];
  } else {
    root.append(h('style', {}, css));
  }
}
