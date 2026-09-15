import { TEST_INFO, isTestId } from 'ok2ride';
import type { BikeType, Pricing } from '../shared/types';

const money = new Intl.NumberFormat('en', { style: 'currency', currency: 'EUR' });
const clockTime = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' });
const dateTime = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export const TYPE_LABEL: Readonly<Record<BikeType, string>> = { city: 'City bike', ebike: 'E-bike', cargo: 'Cargo bike' };

export const formatMoney = (cents: number): string => money.format(cents / 100);
export const formatTime = (ms: number): string => clockTime.format(ms);
export const formatDateTime = (ms: number): string => dateTime.format(ms);
export const formatRate = (p: Pricing): string => `${formatMoney(p.unlockFeeCents)} + ${formatMoney(p.perMinuteCents)}/min`;

const pad = (n: number): string => String(n).padStart(2, '0');

/** mm:ss, or h:mm:ss past an hour. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export function checkLength(stageCount: number): string {
  return `${stageCount} quick tests, about ${stageCount * 15} seconds`;
}

/** Human names for the test ids in a check plan. */
export function testNames(plan: readonly string[]): string[] {
  return plan.map((id) => (isTestId(id) ? TEST_INFO[id].name : id));
}
