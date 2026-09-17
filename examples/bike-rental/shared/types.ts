/**
 * Types shared by the bike-rental API server and the browser app.
 * All timestamps are server epoch milliseconds; money is in cents.
 */

export type BikeType = 'city' | 'ebike' | 'cargo';
export const BIKE_TYPES: readonly BikeType[] = ['city', 'ebike', 'cargo'];

export type BikeStatus = 'available' | 'rented' | 'maintenance';

export interface Station {
  readonly id: string;
  readonly name: string;
  /** Position on the demo map, in map units (0–100 wide, 0–64 tall). */
  readonly x: number;
  readonly y: number;
}

export interface Bike {
  readonly id: string;
  /** Code printed on the frame, e.g. "B-204". */
  readonly code: string;
  readonly type: BikeType;
  readonly status: BikeStatus;
  /** Station the bike is docked at; null while it is out on a ride. */
  readonly stationId: string | null;
  /** Battery percentage for e-bikes, null for pedal bikes. */
  readonly battery: number | null;
  /** Whether a rider may rent it right now. */
  readonly rentable: boolean;
}

export interface Pricing {
  readonly unlockFeeCents: number;
  readonly perMinuteCents: number;
}

/** How strict the OK2Ride check is for a bike type. */
export interface CheckPolicy {
  /** Tests the widget must run (its `stage-count`). */
  readonly stageCount: number;
  readonly difficulty: 'easy' | 'medium' | 'hard';
}

export interface Fleet {
  readonly stations: readonly Station[];
  readonly bikes: readonly Bike[];
  readonly pricing: Readonly<Record<BikeType, Pricing>>;
  readonly checks: Readonly<Record<BikeType, CheckPolicy>>;
}

/** A one-time challenge issued before a check. */
export interface Challenge extends CheckPolicy {
  /** Pass to the widget's `challenge-nonce` attribute. Valid for one check. */
  readonly nonce: string;
  readonly bikeId: string;
  readonly expiresAt: number;
}

/** What the server kept from the passing check. */
export interface CheckSummary {
  readonly plan: readonly string[];
  readonly meanRtMs: number | null;
  readonly completionTimeMs: number;
}

export interface Rental {
  readonly id: string;
  readonly bikeId: string;
  readonly bikeCode: string;
  readonly bikeType: BikeType;
  readonly pricing: Pricing;
  readonly startStationId: string;
  readonly endStationId: string | null;
  readonly startedAt: number;
  readonly endedAt: number | null;
  /** Code the rider types on the bike's keypad to release the lock. */
  readonly unlockCode: string;
  readonly minutes: number | null;
  readonly costCents: number | null;
  readonly check: CheckSummary;
}

export interface Rider {
  readonly id: string;
  readonly name: string;
}

export interface Me {
  readonly rider: Rider;
  readonly activeRental: Rental | null;
  readonly recentRentals: readonly Rental[];
  /** While in the future, the rider must wait before taking another check. */
  readonly cooldownUntil: number | null;
  /** Server clock at response time, so the app can correct for skew. */
  readonly serverTime: number;
}

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'PAYLOAD_TOO_LARGE'
  | 'NOT_FOUND'
  | 'BIKE_NOT_FOUND'
  | 'BIKE_UNAVAILABLE'
  | 'STATION_NOT_FOUND'
  | 'ALREADY_RIDING'
  | 'RENTAL_NOT_FOUND'
  | 'RENTAL_ALREADY_ENDED'
  | 'COOLDOWN'
  | 'TOKEN_INVALID'
  | 'CHECK_NOT_PASSED'
  | 'NONCE_UNKNOWN'
  | 'NONCE_USED'
  | 'NONCE_EXPIRED'
  | 'BIKE_MISMATCH'
  | 'TOKEN_STALE'
  | 'NOT_ENOUGH_TESTS'
  | 'NOT_HUMAN'
  | 'IMPLAUSIBLE_TIMING'
  | 'INTERNAL';

export interface ApiErrorBody {
  readonly error: {
    readonly code: ApiErrorCode;
    readonly message: string;
    /** For `COOLDOWN`: when the rider may try again. */
    readonly retryAt?: number;
  };
}
