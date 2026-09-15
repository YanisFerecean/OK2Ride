import type { Pricing } from './types.ts';

/** Minutes billed for a ride: every started minute counts, with a minimum of one. */
export function billedMinutes(durationMs: number): number {
  return Math.max(1, Math.ceil(Math.max(0, durationMs) / 60_000));
}

/** Unlock fee plus billed minutes at the per-minute rate, in cents. */
export function rideCostCents(pricing: Pricing, durationMs: number): number {
  return pricing.unlockFeeCents + billedMinutes(durationMs) * pricing.perMinuteCents;
}
