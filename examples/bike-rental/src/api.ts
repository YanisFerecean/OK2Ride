import type { ApiErrorBody, ApiErrorCode, Challenge, Fleet, Me, Rental } from '../shared/types';

/** Everything the app needs from the rental service. */
export interface ApiClient {
  me(): Promise<Me>;
  fleet(): Promise<Fleet>;
  /** Asks for a one-time OK2Ride challenge before renting `bikeId`. */
  createChallenge(bikeId: string): Promise<Challenge>;
  /** Hands in a failed check; the server answers with the cooldown. */
  reportFailedCheck(token: string): Promise<{ cooldownUntil: number }>;
  /** Trades a passing check for a rental. */
  startRental(bikeId: string, token: string): Promise<Rental>;
  endRental(rentalId: string, stationId: string): Promise<Rental>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode | 'NETWORK',
    message: string,
    readonly retryAt: number | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: { accept: 'application/json' } };
  if (body !== undefined) {
    init.headers = { accept: 'application/json', 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, 'NETWORK', "Can't reach the rental service. Check your connection and try again.");
  }
  let data: unknown = null;
  try {
    const text = await res.text();
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const error = (data as Partial<ApiErrorBody> | null)?.error;
    throw new ApiError(res.status, error?.code ?? 'INTERNAL', error?.message ?? `The rental service answered ${res.status}.`, error?.retryAt ?? null);
  }
  return data as T;
}

/** The real client, talking JSON to `/api` on the same origin. */
export function httpApi(): ApiClient {
  return {
    me: () => request('GET', '/api/me'),
    fleet: () => request('GET', '/api/fleet'),
    createChallenge: (bikeId) => request('POST', '/api/challenges', { bikeId }),
    reportFailedCheck: (token) => request('POST', '/api/checks/failed', { token }),
    startRental: (bikeId, token) => request('POST', '/api/rentals', { bikeId, token }),
    endRental: (rentalId, stationId) => request('POST', `/api/rentals/${encodeURIComponent(rentalId)}/end`, { stationId }),
  };
}
