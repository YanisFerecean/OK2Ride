/// <reference types="node" />
/**
 * JSON-over-HTTP layer for the rental store, as a Connect-style middleware
 * (works in Vite's dev and preview servers, Express, or a bare node:http
 * server). Riders are identified by an HttpOnly, SameSite=Lax cookie; POST
 * bodies must be JSON, which keeps cross-site form posts out.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiErrorBody, ApiErrorCode } from '../shared/types.ts';
import type { ApiFailure, RentalStore, Result } from './store.ts';

export const RIDER_COOKIE = 'ok2r_rider';
const MAX_BODY_BYTES = 16 * 1024;

export type Middleware = (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => void;

class HttpError extends Error implements ApiFailure {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function parseCookies(header: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of (header ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) out.set(part.slice(0, eq).trim(), decodeURIComponent(part.slice(eq + 1).trim()));
  }
  return out;
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const type = String(req.headers['content-type'] ?? '').toLowerCase();
  if (!type.startsWith('application/json')) throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send JSON with Content-Type: application/json.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
    chunks.push(buffer);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new HttpError(400, 'BAD_REQUEST', 'Request body is not valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new HttpError(400, 'BAD_REQUEST', 'Request body must be a JSON object.');
  }
  return parsed as Record<string, unknown>;
}

function field(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096) {
    throw new HttpError(400, 'BAD_REQUEST', `Missing or invalid "${key}".`);
  }
  return value;
}

function send(res: ServerResponse, status: number, body?: unknown): void {
  res.statusCode = status;
  res.setHeader('cache-control', 'no-store');
  if (body === undefined) {
    res.end();
    return;
  }
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function sendError(res: ServerResponse, e: ApiFailure): void {
  const error: ApiErrorBody['error'] = e.retryAt === undefined ? { code: e.code, message: e.message } : { code: e.code, message: e.message, retryAt: e.retryAt };
  send(res, e.status, { error } satisfies ApiErrorBody);
}

function reply<T>(res: ServerResponse, result: Result<T>, status = 200): void {
  if (result.ok) send(res, status, result.value);
  else sendError(res, result.error);
}

async function handle(store: RentalStore, req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
  const method = req.method ?? 'GET';

  // Public: no rider needed.
  if (method === 'GET' && path === '/api/fleet') return send(res, 200, store.fleet());

  const cookies = parseCookies(req.headers.cookie);
  const { id: riderId, created } = store.ensureRider(cookies.get(RIDER_COOKIE) ?? null);
  if (created) res.setHeader('set-cookie', `${RIDER_COOKIE}=${riderId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`);

  if (method === 'GET' && path === '/api/me') return send(res, 200, store.me(riderId));

  if (method === 'POST' && path === '/api/challenges') {
    const body = await readJson(req);
    return reply(res, store.issueChallenge(riderId, field(body, 'bikeId')), 201);
  }
  if (method === 'POST' && path === '/api/checks/failed') {
    const body = await readJson(req);
    return reply(res, store.reportFailedCheck(riderId, field(body, 'token')));
  }
  if (method === 'POST' && path === '/api/rentals') {
    const body = await readJson(req);
    return reply(res, store.startRental(riderId, field(body, 'bikeId'), field(body, 'token')), 201);
  }
  const end = /^\/api\/rentals\/([\w-]+)\/end$/.exec(path);
  if (method === 'POST' && end) {
    const body = await readJson(req);
    return reply(res, store.endRental(riderId, end[1] ?? '', field(body, 'stationId')));
  }
  throw new HttpError(404, 'NOT_FOUND', 'No such endpoint.');
}

/** Serves `/api/*` from `store`; every other request goes to `next()`. */
export function createApiMiddleware(store: RentalStore): Middleware {
  return (req, res, next) => {
    // Plain string split: `new URL()` throws on paths like "//host", which must fall through.
    const path = (req.url ?? '/').split('?', 1)[0] ?? '/';
    if (!path.startsWith('/api/')) {
      next();
      return;
    }
    handle(store, req, res, path).catch((err: unknown) => {
      if (err instanceof HttpError) {
        sendError(res, err);
        return;
      }
      console.error('[bike-rental api]', err);
      sendError(res, { status: 500, code: 'INTERNAL', message: 'Something went wrong.' });
    });
  };
}
