import type { BikeStatus, BikeType, CheckPolicy, Pricing, Station } from '../shared/types.ts';

/** Demo stations in a fictional city, positioned on the app's map. */
export const STATIONS: readonly Station[] = [
  { id: 'market', name: 'Market Square', x: 32, y: 24 },
  { id: 'central', name: 'Central Station', x: 52, y: 38 },
  { id: 'riverside', name: 'Riverside Park', x: 70, y: 33 },
  { id: 'university', name: 'University', x: 86, y: 12 },
  { id: 'harbour', name: 'Harbour', x: 14, y: 40 },
];

export const PRICING: Readonly<Record<BikeType, Pricing>> = {
  city: { unlockFeeCents: 100, perMinuteCents: 15 },
  ebike: { unlockFeeCents: 100, perMinuteCents: 30 },
  cargo: { unlockFeeCents: 150, perMinuteCents: 35 },
};

/** Faster and heavier bikes get a longer check. */
export const CHECKS: Readonly<Record<BikeType, CheckPolicy>> = {
  city: { stageCount: 2, difficulty: 'medium' },
  ebike: { stageCount: 3, difficulty: 'medium' },
  cargo: { stageCount: 3, difficulty: 'medium' },
};

export interface BikeSeed {
  readonly id: string;
  readonly code: string;
  readonly type: BikeType;
  readonly status: BikeStatus;
  readonly stationId: string | null;
  readonly battery: number | null;
}

function bike(code: string, type: BikeType, stationId: string | null, battery: number | null = null, status: BikeStatus = 'available'): BikeSeed {
  return { id: code.replace('-', '').toLowerCase(), code, type, status, stationId, battery };
}

export function seedBikes(): BikeSeed[] {
  return [
    bike('B-101', 'city', 'market'),
    bike('B-102', 'city', 'market'),
    bike('B-201', 'ebike', 'market', 88),
    bike('B-301', 'cargo', 'market'),
    bike('B-103', 'city', 'central'),
    bike('B-104', 'city', 'central', null, 'maintenance'),
    bike('B-202', 'ebike', 'central', 64),
    bike('B-203', 'ebike', 'central', 9),
    bike('B-105', 'city', 'riverside'),
    bike('B-204', 'ebike', 'riverside', 92),
    bike('B-106', 'city', 'university'),
    bike('B-205', 'ebike', 'university', 47),
    bike('B-107', 'city', 'harbour'),
    bike('B-302', 'cargo', 'harbour'),
    // Out on rides with other riders.
    bike('B-108', 'city', null, null, 'rented'),
    bike('B-206', 'ebike', null, 71, 'rented'),
  ];
}
