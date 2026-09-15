import '../src/index';
import type { OK2Ride } from '../src/index';
import { initCopyButtons } from './shared';

initCopyButtons();

const captcha = document.querySelector<OK2Ride>('ok2ride-check');
const log = document.getElementById('log');
const clear = document.getElementById('clear-log');

if (captcha && log) {
  const write = (label: string, payload: unknown): void => {
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    const head = document.createElement('span');
    head.className = 'evt';
    head.textContent = `[${time}] ${label}`;
    entry.append(head, document.createTextNode(`\n${JSON.stringify(payload, null, 2)}\n\n`));
    log.prepend(entry);
  };

  captcha.addEventListener('capability-passed', (e) => write('capability-passed', e.detail));
  captcha.addEventListener('capability-failed', (e) => write('capability-failed', e.detail));
  captcha.addEventListener('stage-change', (e) => write('stage-change', { from: e.detail.previous.type, to: e.detail.stage.type, plan: captcha.plan }));

  const bind = (id: string, apply: (value: string) => void): void => {
    const input = document.getElementById(id);
    if (input instanceof HTMLSelectElement || input instanceof HTMLInputElement) {
      input.addEventListener('change', () => apply(input.value));
    }
  };
  bind('stageCount', (v) => captcha.setAttribute('stage-count', v));
  bind('difficulty', (v) => captcha.setAttribute('difficulty', v));
  bind('timeLimit', (v) => captcha.setAttribute('time-limit-ms', v));
  bind('theme', (v) => captcha.setAttribute('theme', v));

  const pool = document.getElementById('pool');
  pool?.addEventListener('change', () => {
    const ids = [...pool.querySelectorAll<HTMLInputElement>('input:checked')].map((i) => i.value);
    captcha.stagePool = ids;
  });

  document.getElementById('reset')?.addEventListener('click', () => captcha.reset());
  clear?.addEventListener('click', () => log.replaceChildren());
}
