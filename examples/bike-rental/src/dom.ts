/** Minimal DOM helpers: elements are built directly, text always via textContent. */

type AttrValue = string | number | boolean | null | undefined;
export type Attrs = Readonly<Record<string, AttrValue>>;
export type Child = Node | string | null | undefined | false;

const SVG_NS = 'http://www.w3.org/2000/svg';

function applyAttrs(el: Element, attrs: Attrs): void {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    el.setAttribute(key, value === true ? '' : String(value));
  }
}

export function compact(children: readonly Child[]): (Node | string)[] {
  return children.filter((c): c is Node | string => c !== null && c !== undefined && c !== false);
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  applyAttrs(el, attrs);
  el.append(...compact(children));
  return el;
}

export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  applyAttrs(el, attrs);
  el.append(...compact(children));
  return el;
}

export function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

function glyph(...parts: SVGElement[]): SVGSVGElement {
  return s(
    'svg',
    { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' },
    ...parts,
  );
}

export const icons = {
  bike: () =>
    glyph(
      s('circle', { cx: 5.5, cy: 16.5, r: 3.5 }),
      s('circle', { cx: 18.5, cy: 16.5, r: 3.5 }),
      s('path', { d: 'M5.5 16.5h6.5L9 9l-3.5 7.5M9 9h6.5l3 7.5M15.5 9 12 16.5M15.5 9l-1-3.5h2.5M9 9l-.6-2M7 7h3' }),
    ),
  bolt: () => glyph(s('path', { d: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z' })),
  box: () => glyph(s('path', { d: 'M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z' }), s('path', { d: 'M3.5 7.5 12 12l8.5-4.5M12 12v9' })),
  close: () => glyph(s('path', { d: 'M6 6l12 12M18 6 6 18' })),
  check: () => glyph(s('path', { d: 'M4 12.5l5 5L20 6.5' })),
  cross: () => glyph(s('path', { d: 'M6 6l12 12M18 6 6 18' })),
  clock: () => glyph(s('circle', { cx: 12, cy: 12, r: 9 }), s('path', { d: 'M12 7v5l3 2' })),
  alert: () => glyph(s('path', { d: 'M12 3 2.5 20h19L12 3Z' }), s('path', { d: 'M12 10v4M12 17h.01' })),
  shield: () => glyph(s('path', { d: 'M12 3 4.5 6v6c0 4.4 3.1 8 7.5 9 4.4-1 7.5-4.6 7.5-9V6L12 3Z' }), s('path', { d: 'm8.5 12 2.5 2.5 4.5-5' })),
  pin: () => glyph(s('path', { d: 'M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 1 1 13 0c0 5.3-6.5 11-6.5 11Z' }), s('circle', { cx: 12, cy: 10, r: 2.4 })),
  lock: () => glyph(s('rect', { x: 5, y: 11, width: 14, height: 10, rx: 2 }), s('path', { d: 'M8 11V8a4 4 0 0 1 8 0v3' })),
};
