/**
 * Verification token helpers.
 *
 * The token binds the assessment outcome to the session (and an optional
 * host-supplied nonce) with a 64-bit integrity checksum, so accidental
 * corruption or naive tampering is detectable and the host can parse the
 * outcome without trusting free-form JSON.
 *
 * It is NOT a cryptographic signature: anything produced client-side can be
 * forged by a hostile client. A backend that unlocks vehicles must validate
 * the decoded claims against its own session / nonce records.
 */

export interface TokenClaims {
  /** Claims version. Bumped to 2 by the humanity claims (`hv`, `hs`). */
  readonly v: 2;
  /** Session id. */
  readonly sid: string;
  /** Host-supplied nonce, if any. */
  readonly nonce: string | null;
  /** Passed? */
  readonly ok: boolean;
  /** Issued-at ISO timestamp. */
  readonly iat: string;
  /** Completion time in ms. */
  readonly ct: number;
  /** Mean RT in ms. */
  readonly rt: number | null;
  /** Lapse count. */
  readonly lp: number;
  /** False-start count. */
  readonly fs: number;
  /** Spatial error in degrees. */
  readonly se: number | null;
  /** Comma-separated plan of tests presented. */
  readonly pl: string;
  /**
   * Humanity verdict, or null when the check was off. Spelled out rather than
   * imported: this module stays dependency-free so it can ship as the
   * server-side entry. The compiler still checks it against `HumanityVerdict`
   * wherever a token is built.
   */
  readonly hv: 'human' | 'suspect' | 'automated' | null;
  /** Humanity score, 0–1, or null when the check was off. */
  readonly hs: number | null;
}

export const TOKEN_PREFIX = 'ok2r1';

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = (1n << 64n) - 1n;

/** FNV-1a 64-bit hash of the UTF-8 encoding of `input`, as 16 hex characters. */
export function fnv1a64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let hash = FNV_OFFSET;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16).padStart(16, '0');
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(encoded: string): string | null {
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (encoded.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function buildVerificationToken(claims: TokenClaims): string {
  const payload = toBase64Url(JSON.stringify(claims));
  const body = `${TOKEN_PREFIX}.${payload}`;
  return `${body}.${fnv1a64(body)}`;
}

/** Parses and checksum-validates a token. Returns `null` for anything malformed. */
export function decodeVerificationToken(token: string): TokenClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [prefix, payload, signature] = parts;
  if (prefix !== TOKEN_PREFIX || payload === undefined || signature === undefined) return null;
  if (fnv1a64(`${prefix}.${payload}`) !== signature) return null;
  const json = fromBase64Url(payload);
  if (json === null) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    return isTokenClaims(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isTokenClaims(value: unknown): value is TokenClaims {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const numOrNull = (x: unknown): boolean => x === null || typeof x === 'number';
  const verdictOrNull = (x: unknown): boolean => x === null || x === 'human' || x === 'suspect' || x === 'automated';
  return (
    v['v'] === 2 &&
    typeof v['sid'] === 'string' &&
    (v['nonce'] === null || typeof v['nonce'] === 'string') &&
    typeof v['ok'] === 'boolean' &&
    typeof v['iat'] === 'string' &&
    typeof v['ct'] === 'number' &&
    numOrNull(v['rt']) &&
    typeof v['lp'] === 'number' &&
    typeof v['fs'] === 'number' &&
    numOrNull(v['se']) &&
    typeof v['pl'] === 'string' &&
    verdictOrNull(v['hv']) &&
    numOrNull(v['hs'])
  );
}
