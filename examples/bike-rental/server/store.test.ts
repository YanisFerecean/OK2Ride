import { beforeEach, describe, expect, it } from 'vitest';
import { buildVerificationToken, type TokenClaims } from '../../../src/token.ts';
import { POLICY, RentalStore, type Result } from './store.ts';

const T0 = Date.UTC(2026, 8, 15, 8, 0, 0);
const RIDER = 'a1'.repeat(16);
const OTHER = 'b2'.repeat(16);

let clock = T0;
let store: RentalStore;

beforeEach(() => {
  clock = T0;
  store = new RentalStore({ now: () => clock });
});

/** A widget token as the browser would produce it, issued "now". */
function token(nonce: string | null, overrides: Partial<TokenClaims> = {}): string {
  return buildVerificationToken({
    v: 2,
    sid: 'session',
    nonce,
    ok: true,
    iat: new Date(clock).toISOString(),
    ct: 20_000,
    rt: 310,
    lp: 0,
    fs: 0,
    se: 2,
    pl: 'pvt,spatial,stroop',
    hv: 'human',
    hs: 1,
    ...overrides,
  });
}

function challenge(bikeId = 'b101', rider = RIDER): { nonce: string; stageCount: number } {
  const result = store.issueChallenge(rider, bikeId);
  if (!result.ok) throw new Error(`challenge refused: ${result.error.code}`);
  return result.value;
}

function expectCode(result: Result<unknown>, code: string, status?: number): void {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.code).toBe(code);
  if (status !== undefined) expect(result.error.status).toBe(status);
}

/** Challenge, 25 s of checking, then a passing token. */
function rent(bikeId = 'b101', rider = RIDER) {
  const c = challenge(bikeId, rider);
  clock += 25_000;
  const result = store.startRental(rider, bikeId, token(c.nonce));
  if (!result.ok) throw new Error(`rental refused: ${result.error.code}`);
  return result.value;
}

describe('fleet', () => {
  it('lists stations, bikes, prices and the check policy per bike type', () => {
    const fleet = store.fleet();
    expect(fleet.stations.map((s) => s.id)).toEqual(['market', 'central', 'riverside', 'university', 'harbour']);
    expect(fleet.bikes).toHaveLength(16);
    expect(fleet.pricing.ebike).toEqual({ unlockFeeCents: 100, perMinuteCents: 30 });
    expect(fleet.checks).toEqual({
      city: { stageCount: 2, difficulty: 'medium' },
      ebike: { stageCount: 3, difficulty: 'medium' },
      cargo: { stageCount: 3, difficulty: 'medium' },
    });
  });

  it('marks maintenance, low-battery and out-on-ride bikes as not rentable', () => {
    const byId = new Map(store.fleet().bikes.map((b) => [b.id, b]));
    expect(byId.get('b101')?.rentable).toBe(true);
    expect(byId.get('b104')?.rentable).toBe(false);
    expect(byId.get('b203')?.rentable).toBe(false);
    expect(byId.get('b108')?.rentable).toBe(false);
  });
});

describe('riders', () => {
  it('keeps well-formed ids and replaces anything else', () => {
    expect(store.ensureRider(RIDER)).toEqual({ id: RIDER, created: false });
    const fresh = store.ensureRider('not-an-id');
    expect(fresh.created).toBe(true);
    expect(fresh.id).toMatch(/^[0-9a-f]{32}$/);
    expect(store.ensureRider(null).created).toBe(true);
    expect(store.me(RIDER)).toMatchObject({ rider: { id: RIDER, name: 'Rider A1A1' }, activeRental: null, recentRentals: [], cooldownUntil: null, serverTime: T0 });
  });
});

describe('challenges', () => {
  it('issues a single-use nonce sized to the bike type', () => {
    const city = store.issueChallenge(RIDER, 'b101');
    expect(city).toMatchObject({ ok: true, value: { bikeId: 'b101', stageCount: 2, difficulty: 'medium', expiresAt: T0 + POLICY.challengeTtlMs } });
    const ebike = challenge('b201');
    expect(ebike.stageCount).toBe(3);
    expect(ebike.nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(city.ok && city.value.nonce).not.toBe(ebike.nonce);
  });

  it('refuses unknown and unrentable bikes', () => {
    expectCode(store.issueChallenge(RIDER, 'nope'), 'BIKE_NOT_FOUND', 404);
    expectCode(store.issueChallenge(RIDER, 'b104'), 'BIKE_UNAVAILABLE', 409);
    expectCode(store.issueChallenge(RIDER, 'b203'), 'BIKE_UNAVAILABLE', 409);
  });
});

describe('starting a rental', () => {
  it('accepts a fresh passing token and unlocks the bike', () => {
    const c = challenge('b201');
    clock += 40_000;
    const result = store.startRental(RIDER, 'b201', token(c.nonce, { ct: 35_000 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      bikeId: 'b201',
      bikeCode: 'B-201',
      bikeType: 'ebike',
      startStationId: 'market',
      startedAt: T0 + 40_000,
      endedAt: null,
      check: { plan: ['pvt', 'spatial', 'stroop'], meanRtMs: 310, completionTimeMs: 35_000 },
    });
    expect(result.value.unlockCode).toMatch(/^\d{4}$/);
    expect(store.fleet().bikes.find((b) => b.id === 'b201')).toMatchObject({ status: 'rented', stationId: null, rentable: false });
    expect(store.me(RIDER).activeRental?.id).toBe(result.value.id);
  });

  describe('rejects a token that', () => {
    it('is malformed or tampered with', () => {
      const c = challenge();
      clock += 25_000;
      expectCode(store.startRental(RIDER, 'b101', 'garbage'), 'TOKEN_INVALID', 400);
      const good = token(c.nonce);
      const tampered = good.slice(0, -1) + (good.endsWith('0') ? '1' : '0');
      expectCode(store.startRental(RIDER, 'b101', tampered), 'TOKEN_INVALID', 400);
    });

    it('reports a failed check', () => {
      const c = challenge();
      clock += 25_000;
      expectCode(store.startRental(RIDER, 'b101', token(c.nonce, { ok: false })), 'CHECK_NOT_PASSED', 403);
    });

    it('has no nonce, an unknown nonce, or another rider’s nonce', () => {
      const theirs = challenge('b101', OTHER);
      clock += 25_000;
      expectCode(store.startRental(RIDER, 'b101', token(null)), 'NONCE_UNKNOWN', 403);
      expectCode(store.startRental(RIDER, 'b101', token('f'.repeat(32))), 'NONCE_UNKNOWN', 403);
      expectCode(store.startRental(RIDER, 'b101', token(theirs.nonce)), 'NONCE_UNKNOWN', 403);
    });

    it('was taken for a different bike', () => {
      const c = challenge('b102');
      clock += 25_000;
      expectCode(store.startRental(RIDER, 'b101', token(c.nonce)), 'BIKE_MISMATCH', 403);
    });

    it('is too old, or dated in the future', () => {
      const c = challenge();
      const early = token(c.nonce, { ct: 1_000 });
      clock += POLICY.tokenMaxAgeMs + 1_000;
      expectCode(store.startRental(RIDER, 'b101', early), 'TOKEN_STALE', 403);
      const future = token(c.nonce, { iat: new Date(clock + POLICY.clockSkewMs + 1_000).toISOString() });
      expectCode(store.startRental(RIDER, 'b101', future), 'TOKEN_STALE', 403);
    });

    it('claims a check longer than the time since its challenge', () => {
      const c = challenge();
      clock += 10_000;
      expectCode(store.startRental(RIDER, 'b101', token(c.nonce, { ct: 60_000 })), 'IMPLAUSIBLE_TIMING', 403);
    });

    it('ran fewer distinct tests than the bike requires', () => {
      const c = challenge('b201');
      clock += 25_000;
      expectCode(store.startRental(RIDER, 'b201', token(c.nonce, { pl: 'pvt,stroop' })), 'NOT_ENOUGH_TESTS', 403);
      expectCode(store.startRental(RIDER, 'b201', token(c.nonce, { pl: 'pvt,pvt,pvt' })), 'NOT_ENOUGH_TESTS', 403);
    });

    it('admits the check was automated, which only a tampered token can do', () => {
      const c = challenge();
      clock += 25_000;
      expectCode(store.startRental(RIDER, 'b101', token(c.nonce, { hv: 'automated', hs: 0 })), 'NOT_HUMAN', 403);
      // A run the widget merely found odd is still the rider's to take.
      expect(store.startRental(RIDER, 'b101', token(c.nonce, { hv: 'suspect', hs: 0.5 })).ok).toBe(true);
    });

    it('arrives after the challenge expired', () => {
      const c = challenge();
      clock += POLICY.challengeTtlMs + 1;
      expectCode(store.startRental(RIDER, 'b101', token(c.nonce)), 'NONCE_EXPIRED', 403);
    });

    it('was already used', () => {
      const c = challenge();
      clock += 25_000;
      const once = token(c.nonce);
      const first = store.startRental(RIDER, 'b101', once);
      expect(first.ok).toBe(true);
      if (first.ok) store.endRental(RIDER, first.value.id, 'harbour');
      expectCode(store.startRental(RIDER, 'b101', once), 'NONCE_USED', 409);
    });
  });

  it('allows one active ride per rider', () => {
    rent('b101');
    expectCode(store.issueChallenge(RIDER, 'b102'), 'ALREADY_RIDING', 409);
  });

  it('does not hand over a bike someone else took in the meantime', () => {
    const mine = challenge('b105');
    rent('b105', OTHER);
    expectCode(store.startRental(RIDER, 'b105', token(mine.nonce)), 'BIKE_UNAVAILABLE', 409);
  });
});

describe('failed checks', () => {
  it('consume the challenge and start a cooldown', () => {
    const c = challenge();
    expect(store.reportFailedCheck(RIDER, token(c.nonce, { ok: false }))).toEqual({ ok: true, value: { cooldownUntil: T0 + POLICY.cooldownMs } });
    expect(store.me(RIDER).cooldownUntil).toBe(T0 + POLICY.cooldownMs);

    const blocked = store.issueChallenge(RIDER, 'b101');
    expectCode(blocked, 'COOLDOWN', 429);
    expect(!blocked.ok && blocked.error.retryAt).toBe(T0 + POLICY.cooldownMs);
    expectCode(store.startRental(RIDER, 'b101', token(c.nonce)), 'NONCE_USED', 409);

    clock += POLICY.cooldownMs;
    expect(store.issueChallenge(RIDER, 'b101').ok).toBe(true);
    expect(store.me(RIDER).cooldownUntil).toBeNull();
  });

  it('must be real failures from this rider', () => {
    const c = challenge();
    expectCode(store.reportFailedCheck(RIDER, token(c.nonce)), 'BAD_REQUEST', 400);
    expectCode(store.reportFailedCheck(OTHER, token(c.nonce, { ok: false })), 'NONCE_UNKNOWN', 403);
  });
});

describe('ending a rental', () => {
  it('bills every started minute and docks the bike at the chosen station', () => {
    const rental = rent('b201');
    clock += 6.5 * 60_000;
    const result = store.endRental(RIDER, rental.id, 'harbour');
    expect(result).toMatchObject({ ok: true, value: { endStationId: 'harbour', endedAt: clock, minutes: 7, costCents: 100 + 7 * 30 } });
    expect(store.fleet().bikes.find((b) => b.id === 'b201')).toMatchObject({ status: 'available', stationId: 'harbour', battery: 81, rentable: true });
    const me = store.me(RIDER);
    expect(me.activeRental).toBeNull();
    expect(me.recentRentals.map((r) => r.id)).toEqual([rental.id]);
  });

  it('charges at least one minute', () => {
    const rental = rent('b101');
    clock += 5_000;
    const result = store.endRental(RIDER, rental.id, 'market');
    expect(result.ok && result.value.costCents).toBe(115);
  });

  it('rejects unknown, foreign and finished rides, and unknown stations', () => {
    const rental = rent('b101');
    expectCode(store.endRental(RIDER, 'r_nope', 'market'), 'RENTAL_NOT_FOUND', 404);
    expectCode(store.endRental(OTHER, rental.id, 'market'), 'RENTAL_NOT_FOUND', 404);
    expectCode(store.endRental(RIDER, rental.id, 'moon'), 'STATION_NOT_FOUND', 400);
    expect(store.endRental(RIDER, rental.id, 'market').ok).toBe(true);
    expectCode(store.endRental(RIDER, rental.id, 'market'), 'RENTAL_ALREADY_ENDED', 409);
  });

  it('lists recent rides newest first', () => {
    const first = rent('b101');
    clock += 60_000;
    store.endRental(RIDER, first.id, 'central');
    const second = rent('b102');
    clock += 60_000;
    store.endRental(RIDER, second.id, 'central');
    expect(store.me(RIDER).recentRentals.map((r) => r.bikeCode)).toEqual(['B-102', 'B-101']);
  });
});
