import type { MachineState, TestStage } from '../../types';
import { type Attrs, countdownBar, formatAngle, h, runCountdown, s, setText } from '../dom';
import type { ScreenFactory } from './types';

type SpatialStage = Extract<TestStage, { type: 'SPATIAL_MATCHING' }>;

const DIAL_R = 95;
/** viewBox is `-110 -110 220 140`: the pivot (0,0) sits 110/140 of the way down. */
const PIVOT_Y_RATIO = 110 / 140;

function polar(deg: number, r: number): readonly [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [r * Math.sin(rad), -r * Math.cos(rad)];
}

function arcPath(fromDeg: number, toDeg: number, r: number): string {
  const [x1, y1] = polar(fromDeg, r);
  const [x2, y2] = polar(toDeg, r);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function radialLine(deg: number, r1: number, r2: number, attrs: Attrs): SVGLineElement {
  const [x1, y1] = polar(deg, r1);
  const [x2, y2] = polar(deg, r2);
  return s('line', { ...attrs, x1: x1.toFixed(2), y1: y1.toFixed(2), x2: x2.toFixed(2), y2: y2.toFixed(2) });
}

/** Wraps an angular delta into (-180, 180]. */
function normalizeDelta(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

export const spatialScreen: ScreenFactory = (ctx, state) => {
  const initial = state.stage;
  if (initial.type !== 'SPATIAL_MATCHING') return { nodes: [], patch() {} };
  const { config } = state;
  const tolerance = config.spatialToleranceDeg;
  const maxAngle = config.spatialMaxAngleDeg;
  let latest: SpatialStage = initial;

  /* --- dial ------------------------------------------------------------------ */

  const svg = s('svg', { class: 'dial', viewBox: '-110 -110 220 140', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(s('path', { class: 'dial-track', d: arcPath(-maxAngle, maxAngle, DIAL_R) }));
  for (let deg = -maxAngle; deg <= maxAngle; deg += 15) {
    const major = deg % 45 === 0;
    svg.append(radialLine(deg, major ? 72 : 78, 83, { class: major ? 'dial-tick major' : 'dial-tick' }));
  }
  svg.append(s('path', { class: 'dial-target', d: arcPath(initial.targetAngle - tolerance, initial.targetAngle + tolerance, DIAL_R) }));
  svg.append(radialLine(initial.targetAngle, 18, 84, { class: 'dial-target-marker' }));
  const handle = s(
    'g',
    { class: 'dial-handle', transform: 'rotate(0)' },
    s('line', { class: 'stem', x1: 0, y1: 0, x2: 0, y2: -66 }),
    s('line', { class: 'bar', x1: -34, y1: -66, x2: 34, y2: -66 }),
    s('circle', { class: 'grip', cx: -34, cy: -66, r: 7 }),
    s('circle', { class: 'grip', cx: 34, cy: -66, r: 7 }),
    s('circle', { class: 'pivot', cx: 0, cy: 0, r: 12 }),
  );
  svg.append(handle);

  const readout = h('div', { class: 'dial-readout' }, '0°');
  const wrap = h(
    'div',
    {
      class: 'dial-wrap',
      part: 'dial',
      role: 'slider',
      tabindex: '0',
      'aria-label': 'Handlebar angle',
      'aria-valuemin': String(-maxAngle),
      'aria-valuemax': String(maxAngle),
      'aria-valuenow': '0',
    },
    svg,
    readout,
  );

  /* --- pointer drag (relative rotation around the pivot) ------------------- */

  let drag: { pointerId: number; pointerStartDeg: number; handleStartDeg: number } | null = null;

  const pointerAngle = (event: PointerEvent): number => {
    const rect = svg.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height * PIVOT_Y_RATIO;
    return (Math.atan2(event.clientX - cx, -(event.clientY - cy)) * 180) / Math.PI;
  };

  wrap.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    try {
      wrap.setPointerCapture(event.pointerId);
    } catch {
      /* best effort */
    }
    wrap.classList.add('dragging');
    drag = { pointerId: event.pointerId, pointerStartDeg: pointerAngle(event), handleStartDeg: latest.currentAngle };
  });
  wrap.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    const delta = normalizeDelta(pointerAngle(event) - drag.pointerStartDeg);
    ctx.dispatch({ type: 'UPDATE_SPATIAL_ANGLE', angle: drag.handleStartDeg + delta });
  });
  const release = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = null;
    wrap.classList.remove('dragging');
    // A cancelled pointer (OS gesture, palm rejection) is not a deliberate release.
    if (event.type === 'pointercancel') return;
    ctx.dispatch({ type: 'COMPLETE_SPATIAL_STAGE' });
  };
  wrap.addEventListener('pointerup', release);
  wrap.addEventListener('pointercancel', release);
  wrap.addEventListener('contextmenu', (event) => event.preventDefault());

  wrap.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 5 : 1;
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        event.preventDefault();
        ctx.dispatch({ type: 'UPDATE_SPATIAL_ANGLE', angle: latest.currentAngle - step });
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        event.preventDefault();
        ctx.dispatch({ type: 'UPDATE_SPATIAL_ANGLE', angle: latest.currentAngle + step });
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        ctx.dispatch({ type: 'COMPLETE_SPATIAL_STAGE' });
        break;
      default:
        break;
    }
  });

  /* --- tilt ------------------------------------------------------------------ */

  let tiltListener: ((event: DeviceOrientationEvent) => void) | null = null;
  if (ctx.tiltPreferred && typeof window !== 'undefined') {
    let baseline: number | null = null;
    tiltListener = (event) => {
      if (event.gamma === null) return;
      if (baseline === null) baseline = event.gamma;
      ctx.dispatch({ type: 'UPDATE_SPATIAL_ANGLE', angle: event.gamma - baseline });
    };
    window.addEventListener('deviceorientation', tiltListener);
  }

  /* --- countdown ------------------------------------------------------------- */

  const { bar, fill, label } = countdownBar();
  const stopCountdown = runCountdown(fill, label, () => ({
    remaining: Math.max(0, config.spatialWindowMs - (performance.now() - latest.startTime)),
    windowMs: config.spatialWindowMs,
  }));

  const nodes: Node[] = [
    h('div', { class: 'meta' }, h('span', {}, 'Steering'), h('span', {}, `Target ${formatAngle(initial.targetAngle)} · ±${tolerance}°`)),
    h('h1', { class: 'sm' }, ctx.tiltPreferred ? 'Tilt the phone until the handlebar sits in the green zone, then lock it in' : 'Drag to turn the handlebar into the green zone, then let go'),
    wrap,
    bar,
    label,
  ];
  if (ctx.tiltPreferred) {
    const lock = h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'lock-in' }, 'Lock it in');
    lock.addEventListener('click', () => ctx.dispatch({ type: 'COMPLETE_SPATIAL_STAGE' }));
    nodes.push(lock);
  }

  return {
    nodes,
    patch(next: MachineState) {
      const stage = next.stage;
      if (stage.type !== 'SPATIAL_MATCHING') return;
      latest = stage;
      const angle = stage.currentAngle;
      handle.setAttribute('transform', `rotate(${angle.toFixed(2)})`);
      setText(readout, formatAngle(angle));
      wrap.setAttribute('aria-valuenow', String(Math.round(angle)));
      wrap.classList.toggle('in-zone', Math.abs(angle - stage.targetAngle) <= tolerance);
    },
    dispose() {
      stopCountdown();
      if (tiltListener) window.removeEventListener('deviceorientation', tiltListener);
      tiltListener = null;
      drag = null;
    },
    focus: () => wrap.focus({ preventScroll: true }),
  };
};
