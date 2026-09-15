import type { Bike, Station } from '../shared/types';
import { s } from './dom';

const WIDTH = 100;
const HEIGHT = 64;

export interface MapOptions {
  readonly stations: readonly Station[];
  readonly bikes: readonly Bike[];
  readonly selected: string | null;
  onSelect(stationId: string | null): void;
}

/** A stylised city map with one pin per station showing bikes ready to rent. */
export function renderMap(options: MapOptions): SVGSVGElement {
  const svg = s('svg', { class: 'map', viewBox: `0 0 ${WIDTH} ${HEIGHT}`, role: 'group', 'aria-label': 'Map of bike stations' });

  svg.append(
    s('rect', { class: 'map-land', x: 0, y: 0, width: WIDTH, height: HEIGHT }),
    s('rect', { class: 'map-park', x: 55, y: 26, width: 31, height: 16, rx: 4 }),
    s('path', { class: 'map-water', d: 'M-5 58 C 15 50, 30 62, 50 56 S 80 44, 105 48' }),
  );

  const streets = s('g', { class: 'map-streets', 'aria-hidden': 'true' });
  for (const x of [12, 32, 52, 72, 90]) streets.append(s('line', { x1: x, y1: 0, x2: x, y2: HEIGHT }));
  for (const y of [10, 24, 38]) streets.append(s('line', { x1: 0, y1: y, x2: WIDTH, y2: y }));
  streets.append(s('line', { class: 'avenue', x1: 0, y1: 32, x2: WIDTH, y2: 2 }));
  svg.append(streets);

  svg.append(
    s('g', { class: 'map-you', transform: 'translate(43 15)', 'aria-label': 'You are here', role: 'img' }, s('circle', { class: 'pulse', r: 3 }), s('circle', { class: 'dot', r: 1.6 })),
  );

  for (const station of options.stations) {
    const ready = options.bikes.filter((b) => b.stationId === station.id && b.rentable).length;
    const selected = options.selected === station.id;
    const pin = s(
      'g',
      {
        class: `map-pin${ready ? '' : ' empty'}${selected ? ' selected' : ''}`,
        transform: `translate(${station.x} ${station.y})`,
        role: 'button',
        tabindex: 0,
        'aria-pressed': String(selected),
        'aria-label': `${station.name}: ${ready} ${ready === 1 ? 'bike' : 'bikes'} ready`,
        'data-station': station.id,
      },
      s('circle', { class: 'ring', r: 6.4 }),
      s('circle', { class: 'body', r: 4.4 }),
      s('text', { class: 'count', y: 1.55, 'text-anchor': 'middle' }, String(ready)),
      s('text', { class: 'label', y: 9.4, 'text-anchor': 'middle' }, station.name),
    );
    const toggle = (): void => options.onSelect(selected ? null : station.id);
    pin.addEventListener('click', toggle);
    pin.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggle();
      }
    });
    svg.append(pin);
  }
  return svg;
}
