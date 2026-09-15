/**
 * Encapsulated stylesheet for `<cognitive-captcha>`. Injected into the shadow
 * root, so nothing here leaks into (or is affected by) the host page.
 *
 * Design goals: mobile-first, very high contrast for outdoor daylight and
 * night-time use, large touch targets, no reliance on colour alone.
 */
export const STYLES = /* css */ `
:host {
  --cc-bg: #07090c;
  --cc-surface: #12171e;
  --cc-surface-2: #1c242e;
  --cc-border: #2f3a47;
  --cc-text: #f7f9fb;
  --cc-muted: #aab4c0;
  --cc-accent: #ffd400;
  --cc-on-accent: #07090c;
  --cc-success: #22e39a;
  --cc-on-success: #04150d;
  --cc-danger: #ff4d4d;
  --cc-on-danger: #ffffff;
  --cc-warning: #ffb020;
  --cc-focus: #6cb6ff;
  --cc-c-red: #ff4d4d;
  --cc-c-green: #22e39a;
  --cc-c-blue: #4da3ff;
  --cc-c-yellow: #ffd400;
  --cc-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
  --cc-radius: 22px;
  --cc-font: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;

  display: block;
  box-sizing: border-box;
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  color: var(--cc-text);
  font-family: var(--cc-font);
  font-size: 16px;
  line-height: 1.4;
  color-scheme: dark;
  -webkit-tap-highlight-color: transparent;
  -webkit-text-size-adjust: 100%;
}

:host([theme="light"]) {
  --cc-bg: #ffffff;
  --cc-surface: #f3f5f8;
  --cc-surface-2: #e4e8ee;
  --cc-border: #c5ccd6;
  --cc-text: #0b0f14;
  --cc-muted: #4b5563;
  --cc-accent: #ffd400;
  --cc-on-accent: #0b0f14;
  --cc-success: #0c9f66;
  --cc-on-success: #ffffff;
  --cc-danger: #d62828;
  --cc-on-danger: #ffffff;
  --cc-warning: #c77800;
  --cc-focus: #1a6fd6;
  --cc-c-red: #d62828;
  --cc-c-green: #0c9f66;
  --cc-c-blue: #1a6fd6;
  --cc-c-yellow: #c99a00;
  --cc-shadow: 0 24px 64px rgba(15, 23, 42, 0.18);
  color-scheme: light;
}

:host([hidden]) { display: none; }

*, *::before, *::after { box-sizing: border-box; }

button { font: inherit; }

.modal {
  display: flex;
  flex-direction: column;
  min-height: 600px;
  background: var(--cc-surface);
  border: 1px solid var(--cc-border);
  border-radius: var(--cc-radius);
  box-shadow: var(--cc-shadow);
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--cc-border);
  background: var(--cc-bg);
}

.brand {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--cc-muted);
}

.stage-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--cc-muted);
  text-align: right;
}

.screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 22px 20px 20px;
}

h1 {
  margin: 0;
  font-size: 28px;
  line-height: 1.15;
  font-weight: 800;
  letter-spacing: -0.01em;
}

h1.sm { font-size: 22px; }

p { margin: 0; font-size: 17px; color: var(--cc-muted); }

.center { text-align: center; }

.spacer { flex: 1; }

.steps {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
  counter-reset: step;
}

.steps li {
  position: relative;
  padding: 14px 16px 14px 56px;
  background: var(--cc-bg);
  border: 1px solid var(--cc-border);
  border-radius: 14px;
  font-size: 16px;
  color: var(--cc-text);
}

.steps li::before {
  counter-increment: step;
  content: counter(step);
  position: absolute;
  left: 14px;
  top: 12px;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--cc-accent);
  color: var(--cc-on-accent);
  font-weight: 800;
}

.steps strong { display: block; margin-bottom: 2px; }

.btn {
  appearance: none;
  border: 0;
  width: 100%;
  min-height: 60px;
  padding: 0 24px;
  border-radius: 16px;
  font-size: 19px;
  font-weight: 800;
  cursor: pointer;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
  transition: transform 80ms ease, filter 120ms ease;
}

.btn:active { transform: scale(0.98); filter: brightness(0.92); }

.btn-primary { background: var(--cc-accent); color: var(--cc-on-accent); }

.btn-secondary {
  background: var(--cc-surface-2);
  color: var(--cc-text);
  border: 1px solid var(--cc-border);
}

.btn-ghost {
  background: transparent;
  color: var(--cc-muted);
  border: 1px dashed var(--cc-border);
  min-height: 48px;
  font-size: 15px;
  font-weight: 600;
}

.btn:focus-visible,
.tap-area:focus-visible,
.toggle:focus-visible {
  outline: 3px solid var(--cc-focus);
  outline-offset: 3px;
}

.meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--cc-muted);
  font-variant-numeric: tabular-nums;
}

.progress {
  display: flex;
  align-items: center;
  gap: 10px;
}

.progress-label { font-size: 14px; color: var(--cc-muted); font-weight: 600; }

.dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--cc-surface-2);
  border: 2px solid var(--cc-border);
  transition: background 120ms ease, border-color 120ms ease;
}

.dot.filled { background: var(--cc-success); border-color: var(--cc-success); }

.tap-area {
  flex: 1;
  min-height: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  border-radius: 18px;
  background: var(--cc-bg);
  border: 3px dashed var(--cc-border);
  text-align: center;
  cursor: pointer;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.tap-label {
  font-size: 22px;
  font-weight: 700;
  color: var(--cc-muted);
}

.tap-hint { font-size: 15px; color: var(--cc-muted); }

.tap-area[data-phase="active"] {
  background: var(--cc-accent);
  border-color: var(--cc-accent);
  border-style: solid;
}

.tap-area[data-phase="active"] .tap-label {
  font-size: 64px;
  line-height: 1;
  letter-spacing: 0.06em;
  color: var(--cc-on-accent);
}

.tap-area[data-phase="active"] .tap-hint { display: none; }

.tap-area[data-phase="result"] { border-style: solid; }
.tap-area[data-phase="result"][data-outcome="VALID"] { border-color: var(--cc-success); }
.tap-area[data-phase="result"][data-outcome="FALSE_START"] { border-color: var(--cc-warning); }
.tap-area[data-phase="result"][data-outcome="LAPSE"] { border-color: var(--cc-danger); }

.feedback {
  min-height: 34px;
  font-size: 24px;
  font-weight: 800;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.feedback.good { color: var(--cc-success); }
.feedback.warn { color: var(--cc-warning); }
.feedback.bad { color: var(--cc-danger); }

.dial-wrap {
  position: relative;
  border-radius: 18px;
  background: var(--cc-bg);
  border: 3px solid var(--cc-border);
  padding: 10px;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  cursor: grab;
}

.dial-wrap.dragging { cursor: grabbing; }
.dial-wrap.in-zone { border-color: var(--cc-success); }

svg.dial { display: block; width: 100%; height: auto; overflow: visible; }

.dial-track { fill: none; stroke: var(--cc-border); stroke-width: 18; }
.dial-tick { stroke: var(--cc-muted); stroke-width: 2; stroke-linecap: round; }
.dial-tick.major { stroke-width: 3; }
.dial-target { fill: none; stroke: var(--cc-success); stroke-width: 18; }
.dial-target-marker { fill: none; stroke: var(--cc-success); stroke-width: 3; stroke-dasharray: 6 6; }
.dial-handle .stem { stroke: var(--cc-text); stroke-width: 10; stroke-linecap: round; }
.dial-handle .bar { stroke: var(--cc-text); stroke-width: 12; stroke-linecap: round; }
.dial-handle .grip { fill: var(--cc-accent); }
.dial-handle .pivot { fill: var(--cc-surface-2); stroke: var(--cc-text); stroke-width: 4; }
.in-zone .dial-handle .stem, .in-zone .dial-handle .bar { stroke: var(--cc-success); }

.dial-readout {
  position: absolute;
  left: 50%;
  bottom: 10px;
  transform: translateX(-50%);
  font-size: 26px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.in-zone .dial-readout { color: var(--cc-success); }

.countdown {
  position: relative;
  height: 12px;
  border-radius: 6px;
  background: var(--cc-surface-2);
  overflow: hidden;
}

.countdown-fill {
  position: absolute;
  inset: 0;
  background: var(--cc-accent);
  transform-origin: left center;
}

.countdown-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--cc-muted);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 52px;
  padding: 0 16px;
  border-radius: 14px;
  background: var(--cc-bg);
  border: 1px solid var(--cc-border);
  color: var(--cc-text);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}

.toggle .pill {
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--cc-surface-2);
  color: var(--cc-muted);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.toggle[aria-pressed="true"] .pill { background: var(--cc-success); color: var(--cc-on-success); }

.result-icon {
  width: 104px;
  height: 104px;
  margin: 8px auto 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
}

.result-icon svg { width: 60px; height: 60px; }
.result-icon.pass { background: var(--cc-success); color: var(--cc-on-success); }
.result-icon.fail { background: var(--cc-danger); color: var(--cc-on-danger); }

.stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.stat {
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--cc-bg);
  border: 1px solid var(--cc-border);
}

.stat-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--cc-muted);
}

.stat-value {
  font-size: 22px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.hero {
  width: 88px;
  height: 88px;
  margin: 6px auto 0;
  border-radius: 24px;
  display: grid;
  place-items: center;
  background: var(--cc-bg);
  border: 1px solid var(--cc-border);
  color: var(--cc-accent);
}

.hero svg { width: 52px; height: 52px; }

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* --- shared ------------------------------------------------------------- */

p.note { font-size: 14px; }

/* --- go / no-go ----------------------------------------------------------- */

.tap-area[data-phase="active"][data-signal="go"] {
  background: var(--cc-success);
  border-color: var(--cc-success);
}

.tap-area[data-phase="active"][data-signal="go"] .tap-label { color: var(--cc-on-success); }

.tap-area[data-phase="active"][data-signal="stop"] {
  background: var(--cc-danger);
  border-color: var(--cc-danger);
}

.tap-area[data-phase="active"][data-signal="stop"] .tap-label { color: var(--cc-on-danger); }

/* --- number trail ----------------------------------------------------------- */

.trail-board {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 18px;
  background: var(--cc-bg);
  border: 3px solid var(--cc-border);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  overflow: hidden;
}

.trail-board.error { animation: cc-shake 240ms ease; border-color: var(--cc-danger); }

.trail-node {
  position: absolute;
  width: 58px;
  height: 58px;
  margin: -29px 0 0 -29px;
  padding: 0;
  border-radius: 50%;
  border: 3px solid var(--cc-text);
  background: var(--cc-surface-2);
  color: var(--cc-text);
  font-size: 24px;
  font-weight: 800;
  display: grid;
  place-items: center;
  cursor: pointer;
  touch-action: none;
}

.trail-node.done {
  background: var(--cc-success);
  border-color: var(--cc-success);
  color: var(--cc-on-success);
  cursor: default;
}

@keyframes cc-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-6px); }
  75% { transform: translateX(6px); }
}

/* --- pattern memory ------------------------------------------------------- */

.tiles {
  display: grid;
  gap: 10px;
  width: 100%;
  aspect-ratio: 1;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.tile {
  padding: 0;
  border-radius: 16px;
  border: 3px solid var(--cc-border);
  background: var(--cc-surface-2);
  cursor: pointer;
  touch-action: none;
  transition: background 80ms ease, border-color 80ms ease;
}

.tile.lit { background: var(--cc-accent); border-color: var(--cc-accent); }
.tile.pressed { background: var(--cc-success); border-color: var(--cc-success); }
.tiles[data-locked] .tile { cursor: default; }

/* --- colour match ----------------------------------------------------------- */

.stroop-word {
  min-height: 130px;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: var(--cc-bg);
  border: 3px solid var(--cc-border);
  font-size: 56px;
  font-weight: 900;
  letter-spacing: 0.06em;
  user-select: none;
  -webkit-user-select: none;
}

.ink-red { color: var(--cc-c-red); }
.ink-green { color: var(--cc-c-green); }
.ink-blue { color: var(--cc-c-blue); }
.ink-yellow { color: var(--cc-c-yellow); }

.stroop-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.stroop-option {
  min-height: 66px;
  padding: 0 16px;
  border-radius: 14px;
  border: 3px solid var(--cc-border);
  background: var(--cc-surface-2);
  color: var(--cc-text);
  font-size: 18px;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.stroop-options[data-locked] .stroop-option { cursor: default; opacity: 0.7; }

.swatch { width: 24px; height: 24px; border-radius: 50%; flex: none; }
.swatch.red { background: var(--cc-c-red); }
.swatch.green { background: var(--cc-c-green); }
.swatch.blue { background: var(--cc-c-blue); }
.swatch.yellow { background: var(--cc-c-yellow); }

/* --- results ---------------------------------------------------------------- */

.rows { display: flex; flex-direction: column; gap: 8px; }

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 14px;
  background: var(--cc-bg);
  border: 1px solid var(--cc-border);
}

.row.fail { border-color: var(--cc-danger); }
.row.skipped { opacity: 0.6; }

.badge {
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--cc-surface-2);
}

.badge svg { width: 18px; height: 18px; }
.badge.pass { background: var(--cc-success); color: var(--cc-on-success); }
.badge.fail { background: var(--cc-danger); color: var(--cc-on-danger); }

.row-name { font-weight: 800; }
.row-detail { font-size: 14px; color: var(--cc-muted); font-variant-numeric: tabular-nums; }

@media (max-width: 360px) {
  .screen { padding: 18px 14px 14px; }
  h1 { font-size: 24px; }
  .tap-area { min-height: 240px; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition: none !important; animation: none !important; }
}
`;
