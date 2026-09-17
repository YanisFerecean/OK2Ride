/**
 * In-memory rental service: fleet, riders, OK2Ride challenges and rentals.
 *
 * The unlock rule lives here. A rental starts only with a verification token
 * from the OK2Ride widget that is intact, passed, bound to a challenge this
 * server issued to this rider for this bike, unused, unexpired, fresh, long
 * enough, plausible in timing, and taken by a human.
 *
 * Time and randomness are injected so every rule is unit-testable. State
 * lives in memory and resets when the server restarts.
 */

// In your own backend: import { decodeVerificationToken } from 'ok2ride/token';
import { decodeVerificationToken, type TokenClaims } from '../../../src/token.ts';
import { billedMinutes, rideCostCents } from '../shared/pricing.ts';
import type { ApiErrorCode, Bike, BikeStatus, BikeType, Challenge, CheckPolicy, Fleet, Me, Pricing, Rental } from '../shared/types.ts';
import { CHECKS, PRICING, STATIONS, seedBikes } from './seed.ts';

export const POLICY = {
  /** A challenge must be used within this window. */
  challengeTtlMs: 5 * 60_000,
  /** A token's issued-at must be at most this old when presented. */
  tokenMaxAgeMs: 2 * 60_000,
  /** Tolerated clock difference between rider device and server. */
  clockSkewMs: 30_000,
  /** Wait after a failed check before the next one. */
  cooldownMs: 30_000,
  /** E-bikes below this battery level cannot be rented. */
  minBatteryPercent: 15,
  recentRentals: 5,
} as const;

export interface ApiFailure {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly retryAt?: number;
}

export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ApiFailure };
type Failure = Extract<Result<never>, { ok: false }>;

const success = <T>(value: T): Result<T> => ({ ok: true, value });

function failure(status: number, code: ApiErrorCode, message: string, retryAt?: number): Failure {
  return { ok: false, error: retryAt === undefined ? { status, code, message } : { status, code, message, retryAt } };
}

export interface StoreOptions {
  readonly now?: () => number;
  readonly random?: () => number;
}

interface RiderRecord {
  readonly id: string;
  readonly name: string;
  activeRentalId: string | null;
  cooldownUntil: number | null;
}

interface BikeRecord {
  readonly id: string;
  readonly code: string;
  readonly type: BikeType;
  status: BikeStatus;
  stationId: string | null;
  battery: number | null;
}

interface ChallengeRecord {
  readonly nonce: string;
  readonly riderId: string;
  readonly bikeId: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly policy: CheckPolicy;
  used: boolean;
}

interface RentalRecord {
  readonly id: string;
  readonly riderId: string;
  readonly bikeId: string;
  readonly bikeCode: string;
  readonly bikeType: BikeType;
  readonly pricing: Pricing;
  readonly startStationId: string;
  endStationId: string | null;
  readonly startedAt: number;
  endedAt: number | null;
  readonly unlockCode: string;
  minutes: number | null;
  costCents: number | null;
  readonly check: Rental['check'];
}

const RIDER_ID = /^[0-9a-f]{32}$/;

function randomHex(bytes: number, random: () => number): string {
  let out = '';
  for (let i = 0; i < bytes; i++) {
    out += Math.floor(random() * 256)
      .toString(16)
      .padStart(2, '0');
  }
  return out;
}

function toRental(r: RentalRecord): Rental {
  const { riderId: _riderId, ...rest } = r;
  return { ...rest, check: { ...r.check, plan: [...r.check.plan] } };
}

export class RentalStore {
  readonly #now: () => number;
  readonly #random: () => number;
  readonly #riders = new Map<string, RiderRecord>();
  readonly #bikes = new Map<string, BikeRecord>();
  readonly #challenges = new Map<string, ChallengeRecord>();
  readonly #rentals = new Map<string, RentalRecord>();

  constructor(options: StoreOptions = {}) {
    this.#now = options.now ?? Date.now;
    this.#random = options.random ?? Math.random;
    for (const seed of seedBikes()) this.#bikes.set(seed.id, { ...seed });
  }

  /* --- Riders --------------------------------------------------------------- */

  /**
   * Resolves the rider behind a cookie value. A well-formed id is kept even
   * when unknown (the server restarted); anything else gets a fresh id, and
   * `created` tells the caller to set the cookie.
   */
  ensureRider(candidate: string | null): { id: string; created: boolean } {
    if (candidate !== null && RIDER_ID.test(candidate)) {
      this.#rider(candidate);
      return { id: candidate, created: false };
    }
    const id = randomHex(16, this.#random);
    this.#rider(id);
    return { id, created: true };
  }

  #rider(id: string): RiderRecord {
    let rider = this.#riders.get(id);
    if (!rider) {
      rider = { id, name: `Rider ${id.slice(0, 4).toUpperCase()}`, activeRentalId: null, cooldownUntil: null };
      this.#riders.set(id, rider);
    }
    return rider;
  }

  me(riderId: string): Me {
    const rider = this.#rider(riderId);
    const now = this.#now();
    const active = rider.activeRentalId ? this.#rentals.get(rider.activeRentalId) : undefined;
    const recent = [...this.#rentals.values()]
      .filter((r) => r.riderId === riderId && r.endedAt !== null)
      .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
      .slice(0, POLICY.recentRentals)
      .map(toRental);
    return {
      rider: { id: rider.id, name: rider.name },
      activeRental: active ? toRental(active) : null,
      recentRentals: recent,
      cooldownUntil: rider.cooldownUntil !== null && rider.cooldownUntil > now ? rider.cooldownUntil : null,
      serverTime: now,
    };
  }

  /* --- Fleet ---------------------------------------------------------------- */

  #isRentable(bike: BikeRecord): boolean {
    return bike.status === 'available' && bike.stationId !== null && (bike.battery === null || bike.battery >= POLICY.minBatteryPercent);
  }

  fleet(): Fleet {
    const bikes: Bike[] = [...this.#bikes.values()].map((b) => ({ ...b, rentable: this.#isRentable(b) }));
    return { stations: STATIONS, bikes, pricing: PRICING, checks: CHECKS };
  }

  /* --- Challenges ----------------------------------------------------------- */

  /** Issues a one-time nonce for checking before renting `bikeId`. */
  issueChallenge(riderId: string, bikeId: string): Result<Challenge> {
    const rider = this.#rider(riderId);
    const now = this.#now();
    if (rider.cooldownUntil !== null && rider.cooldownUntil > now) {
      return failure(429, 'COOLDOWN', 'Take a short break before the next check.', rider.cooldownUntil);
    }
    if (rider.activeRentalId) return failure(409, 'ALREADY_RIDING', 'You already have a ride in progress.');
    const bike = this.#bikes.get(bikeId);
    if (!bike) return failure(404, 'BIKE_NOT_FOUND', 'That bike does not exist.');
    if (!this.#isRentable(bike)) return failure(409, 'BIKE_UNAVAILABLE', 'That bike cannot be rented right now.');

    this.#pruneChallenges(now);
    const policy = CHECKS[bike.type];
    const record: ChallengeRecord = {
      nonce: randomHex(16, this.#random),
      riderId,
      bikeId,
      issuedAt: now,
      expiresAt: now + POLICY.challengeTtlMs,
      policy,
      used: false,
    };
    this.#challenges.set(record.nonce, record);
    return success({ nonce: record.nonce, bikeId, expiresAt: record.expiresAt, ...policy });
  }

  #pruneChallenges(now: number): void {
    for (const [nonce, c] of this.#challenges) {
      if (c.expiresAt + POLICY.challengeTtlMs < now) this.#challenges.delete(nonce);
    }
  }

  /** Decodes a token and matches it to an open challenge issued to this rider. */
  #verify(riderId: string, token: string, expectPassed: boolean): Result<{ claims: TokenClaims; challenge: ChallengeRecord }> {
    const claims = decodeVerificationToken(token);
    if (!claims) return failure(400, 'TOKEN_INVALID', 'The check result could not be read.');
    if (claims.ok !== expectPassed) {
      return expectPassed
        ? failure(403, 'CHECK_NOT_PASSED', 'The safety check was not passed.')
        : failure(400, 'BAD_REQUEST', 'This result is for a passed check.');
    }
    const challenge = claims.nonce === null ? undefined : this.#challenges.get(claims.nonce);
    if (!challenge || challenge.riderId !== riderId) return failure(403, 'NONCE_UNKNOWN', 'This check was not issued to you.');
    if (challenge.used) return failure(409, 'NONCE_USED', 'This check result was already used.');
    if (this.#now() > challenge.expiresAt) return failure(403, 'NONCE_EXPIRED', 'This check expired. Please take it again.');
    return success({ claims, challenge });
  }

  /* --- Rentals -------------------------------------------------------------- */

  /** Starts a rental when `token` proves a fresh, passing check for this bike. */
  startRental(riderId: string, bikeId: string, token: string): Result<Rental> {
    const verified = this.#verify(riderId, token, true);
    if (!verified.ok) return verified;
    const { claims, challenge } = verified.value;
    const now = this.#now();

    if (challenge.bikeId !== bikeId) return failure(403, 'BIKE_MISMATCH', 'This check was taken for a different bike.');
    const issuedAt = Date.parse(claims.iat);
    if (!Number.isFinite(issuedAt) || now - issuedAt > POLICY.tokenMaxAgeMs || issuedAt - now > POLICY.clockSkewMs) {
      return failure(403, 'TOKEN_STALE', 'This check result is too old. Please take it again.');
    }
    // The check cannot have taken longer than the time since we issued its challenge.
    if (claims.ct > now - challenge.issuedAt + POLICY.clockSkewMs) {
      return failure(403, 'IMPLAUSIBLE_TIMING', 'This check result does not match its challenge.');
    }
    const plan = [...new Set(claims.pl.split(',').filter(Boolean))];
    if (plan.length < challenge.policy.stageCount) {
      return failure(403, 'NOT_ENOUGH_TESTS', `This bike needs ${challenge.policy.stageCount} tests.`);
    }
    // Defence in depth: the widget already fails an automated run, so a passing
    // token that still admits to one has been tampered with.
    if (claims.hv === 'automated') return failure(403, 'NOT_HUMAN', 'This check did not look like it was taken by a person.');

    const rider = this.#rider(riderId);
    if (rider.activeRentalId) return failure(409, 'ALREADY_RIDING', 'You already have a ride in progress.');
    const bike = this.#bikes.get(bikeId);
    if (!bike || !this.#isRentable(bike) || bike.stationId === null) {
      return failure(409, 'BIKE_UNAVAILABLE', 'That bike cannot be rented right now.');
    }

    challenge.used = true;
    const rental: RentalRecord = {
      id: `r_${randomHex(6, this.#random)}`,
      riderId,
      bikeId: bike.id,
      bikeCode: bike.code,
      bikeType: bike.type,
      pricing: PRICING[bike.type],
      startStationId: bike.stationId,
      endStationId: null,
      startedAt: now,
      endedAt: null,
      unlockCode: String(Math.floor(this.#random() * 10_000)).padStart(4, '0'),
      minutes: null,
      costCents: null,
      check: { plan, meanRtMs: claims.rt, completionTimeMs: claims.ct },
    };
    this.#rentals.set(rental.id, rental);
    bike.status = 'rented';
    bike.stationId = null;
    rider.activeRentalId = rental.id;
    return success(toRental(rental));
  }

  /** Records a failed check: consumes its challenge and starts the cooldown. */
  reportFailedCheck(riderId: string, token: string): Result<{ cooldownUntil: number }> {
    const verified = this.#verify(riderId, token, false);
    if (!verified.ok) return verified;
    verified.value.challenge.used = true;
    const rider = this.#rider(riderId);
    const cooldownUntil = this.#now() + POLICY.cooldownMs;
    rider.cooldownUntil = cooldownUntil;
    return success({ cooldownUntil });
  }

  endRental(riderId: string, rentalId: string, stationId: string): Result<Rental> {
    const rental = this.#rentals.get(rentalId);
    if (!rental || rental.riderId !== riderId) return failure(404, 'RENTAL_NOT_FOUND', 'That ride was not found.');
    if (rental.endedAt !== null) return failure(409, 'RENTAL_ALREADY_ENDED', 'That ride has already ended.');
    const station = STATIONS.find((s) => s.id === stationId);
    if (!station) return failure(400, 'STATION_NOT_FOUND', 'Choose a station to return the bike to.');

    const now = this.#now();
    const duration = now - rental.startedAt;
    rental.endedAt = now;
    rental.endStationId = station.id;
    rental.minutes = billedMinutes(duration);
    rental.costCents = rideCostCents(rental.pricing, duration);

    const bike = this.#bikes.get(rental.bikeId);
    if (bike) {
      bike.status = 'available';
      bike.stationId = station.id;
      if (bike.battery !== null) bike.battery = Math.max(5, bike.battery - rental.minutes);
    }
    this.#rider(riderId).activeRentalId = null;
    return success(toRental(rental));
  }
}
