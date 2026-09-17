/// <reference types="node" />
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildVerificationToken } from '../../../src/token.ts';
import { RIDER_COOKIE, createApiMiddleware } from './http.ts';
import { RentalStore } from './store.ts';

let clock: number;
let server: Server;
let base: string;

beforeEach(async () => {
  clock = Date.UTC(2026, 8, 15, 8, 0, 0);
  const middleware = createApiMiddleware(new RentalStore({ now: () => clock }));
  server = createServer((req, res) =>
    middleware(req, res, () => {
      res.statusCode = 404;
      res.end('not an api route');
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

interface Reply {
  status: number;
  setCookie: string | null;
  body: any;
}

/** A tiny cookie-keeping client, like a browser tab. */
function browser() {
  let cookie = '';
  return async (method: 'GET' | 'POST', path: string, body?: unknown, contentType = 'application/json'): Promise<Reply> => {
    const headers: Record<string, string> = {};
    if (cookie) headers['cookie'] = cookie;
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers['content-type'] = contentType;
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const res = await fetch(base + path, init);
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0] ?? '';
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep raw text */
    }
    return { status: res.status, setCookie, body: parsed };
  };
}

function passToken(nonce: string, pl = 'pvt,stroop'): string {
  return buildVerificationToken({ v: 2, sid: 's', nonce, ok: true, iat: new Date(clock).toISOString(), ct: 15_000, rt: 290, lp: 0, fs: 0, se: null, pl, hv: 'human', hs: 1 });
}

describe('rental API over HTTP', () => {
  it('identifies riders with an HttpOnly, SameSite cookie', async () => {
    const call = browser();
    const first = await call('GET', '/api/me');
    expect(first.status).toBe(200);
    expect(first.setCookie).toMatch(new RegExp(`^${RIDER_COOKIE}=[0-9a-f]{32}; Path=/; HttpOnly; SameSite=Lax`));
    const second = await call('GET', '/api/me');
    expect(second.setCookie).toBeNull();
    expect(second.body.rider.id).toBe(first.body.rider.id);
  });

  it('serves the fleet without creating a rider', async () => {
    const res = await browser()('GET', '/api/fleet');
    expect(res.status).toBe(200);
    expect(res.setCookie).toBeNull();
    expect(res.body.stations).toHaveLength(5);
    expect(res.body.bikes).toHaveLength(16);
  });

  it('insists on JSON, well-formed bodies and known routes', async () => {
    const call = browser();
    expect(await call('POST', '/api/challenges', 'bikeId=b101', 'application/x-www-form-urlencoded')).toMatchObject({ status: 415, body: { error: { code: 'UNSUPPORTED_MEDIA_TYPE' } } });
    expect(await call('POST', '/api/challenges', '{nope')).toMatchObject({ status: 400, body: { error: { code: 'BAD_REQUEST' } } });
    expect(await call('POST', '/api/challenges', {})).toMatchObject({ status: 400, body: { error: { code: 'BAD_REQUEST', message: 'Missing or invalid "bikeId".' } } });
    expect(await call('GET', '/api/nothing')).toMatchObject({ status: 404, body: { error: { code: 'NOT_FOUND' } } });
    expect(await call('GET', '/index.html')).toMatchObject({ status: 404, body: 'not an api route' });
  });

  it('passes odd non-API paths through instead of failing', async () => {
    const call = browser();
    expect(await call('GET', '//')).toMatchObject({ status: 404, body: 'not an api route' });
    expect(await call('GET', '//evil.example/x')).toMatchObject({ status: 404, body: 'not an api route' });
    expect(await call('GET', '/api/fleet?fresh=1')).toMatchObject({ status: 200 });
  });

  it('runs challenge → check → rental → return', async () => {
    const call = browser();
    await call('GET', '/api/me');

    const challenge = await call('POST', '/api/challenges', { bikeId: 'b101' });
    expect(challenge).toMatchObject({ status: 201, body: { bikeId: 'b101', stageCount: 2, difficulty: 'medium' } });

    clock += 20_000;
    const rental = await call('POST', '/api/rentals', { bikeId: 'b101', token: passToken(challenge.body.nonce) });
    expect(rental).toMatchObject({ status: 201, body: { bikeCode: 'B-101', startStationId: 'market', endedAt: null } });

    const reuse = await call('POST', '/api/rentals', { bikeId: 'b101', token: passToken(challenge.body.nonce) });
    expect(reuse).toMatchObject({ status: 409, body: { error: { code: 'NONCE_USED' } } });
    expect((await call('GET', '/api/me')).body.activeRental.id).toBe(rental.body.id);

    clock += 3 * 60_000;
    const ended = await call('POST', `/api/rentals/${rental.body.id}/end`, { stationId: 'riverside' });
    expect(ended).toMatchObject({ status: 200, body: { endStationId: 'riverside', minutes: 3, costCents: 145 } });
    const me = (await call('GET', '/api/me')).body;
    expect(me.activeRental).toBeNull();
    expect(me.recentRentals).toHaveLength(1);
  });

  it('keeps riders apart', async () => {
    const alice = browser();
    const bob = browser();
    await alice('GET', '/api/me');
    await bob('GET', '/api/me');
    const challenge = await alice('POST', '/api/challenges', { bikeId: 'b101' });
    clock += 20_000;
    const stolen = await bob('POST', '/api/rentals', { bikeId: 'b101', token: passToken(challenge.body.nonce) });
    expect(stolen).toMatchObject({ status: 403, body: { error: { code: 'NONCE_UNKNOWN' } } });
  });

  it('reports the cooldown after a failed check with a retry time', async () => {
    const call = browser();
    await call('GET', '/api/me');
    const challenge = await call('POST', '/api/challenges', { bikeId: 'b101' });
    const failed = buildVerificationToken({ v: 2, sid: 's', nonce: challenge.body.nonce, ok: false, iat: new Date(clock).toISOString(), ct: 9_000, rt: 520, lp: 3, fs: 0, se: null, pl: 'pvt', hv: 'human', hs: 1 });
    expect(await call('POST', '/api/checks/failed', { token: failed })).toMatchObject({ status: 200, body: { cooldownUntil: clock + 30_000 } });
    expect(await call('POST', '/api/challenges', { bikeId: 'b101' })).toMatchObject({ status: 429, body: { error: { code: 'COOLDOWN', retryAt: clock + 30_000 } } });
  });
});
