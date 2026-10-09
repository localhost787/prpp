// Explicit data modes. NO silent mixing: live results never contain mock data and the mock is never
// used automatically. If the live server is unreachable (network error, 5xx or ~4 s timeout), calls
// return { status: 'unavailable' } and the UI offers "Modo demostración (sin servidor)" as an explicit
// choice. Locks, 401/403 and other errors are never "unavailable".
import { getStatus, isOperationOutcome } from '@medplum/core';
import { DEFAULT_TIMEOUT_MS } from './config.mjs';

const NETWORK = /fetch failed|failed to fetch|network ?request failed|networkerror|load failed|econnrefused|econnreset|enotfound|ehostunreach|etimedout|socket hang up/i;

/** 'timeout' | 'network' | 'server' | 'session' | 'forbidden' | 'not-found' | 'throttled' | 'unknown' */
export function classifyError(error) {
  if (!error) return 'unknown';
  if (error.code === 'LIVE_TIMEOUT' || error.name === 'TimeoutError' || error.name === 'AbortError') return 'timeout';
  const outcome = error.outcome ?? (isOperationOutcome(error) ? error : null);
  if (outcome) {
    const issue = outcome.issue?.[0];
    const code = issue?.code;
    if (code === 'timeout') return 'timeout';
    const status = getStatus(outcome);
    if (status === 401 || code === 'login') return 'session';
    // Observed: a token that is not a JWT gets 400 "Authentication error" (same meaning as 401).
    if (code === 'invalid' && /^authentication error$/i.test(issue?.details?.text ?? '')) return 'session';
    if (status === 403 || code === 'forbidden') return 'forbidden';
    if (status === 404 || code === 'not-found') return 'not-found';
    if (status === 429 || code === 'throttled') return 'throttled';
    if (status >= 500 || ['exception', 'transient'].includes(code)) return 'server';
  }
  const status = Number(error.status ?? error.statusCode);
  if (status >= 500) return 'server';
  if (status === 401) return 'session';
  if (error instanceof TypeError || NETWORK.test(String(error.message ?? error)) || NETWORK.test(String(error.cause?.code ?? ''))) return 'network';
  return 'unknown';
}

export const isUnreachable = error => ['timeout', 'network', 'server'].includes(classifyError(error));

/** Rejects with LIVE_TIMEOUT after `ms`. */
export function withTimeout(promise, ms = DEFAULT_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('LIVE_TIMEOUT'), { code: 'LIVE_TIMEOUT' })), ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

const asResult = value => (value && typeof value === 'object' && ['ok', 'locked', 'error', 'unavailable'].includes(value.status) ? value : { status: 'ok', data: value });

/**
 * withLive(liveFn, { timeoutMs }) → the live result tagged `source: 'live'`, or
 * { status: 'unavailable', source: 'live', error } when the server cannot be reached.
 * Never calls or returns mock data.
 */
export async function withLive(liveFn, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  try {
    const live = asResult(await withTimeout(liveFn(), timeoutMs));
    if (live.status === 'error' && isUnreachable(live.error)) return { status: 'unavailable', source: 'live', error: live.error };
    return { ...live, source: 'live' };
  } catch (error) {
    if (isUnreachable(error)) return { status: 'unavailable', source: 'live', error };
    return { status: 'error', source: 'live', error: Object.assign(error, { kind: classifyError(error) }) };
  }
}

/**
 * Is the live server reachable? GET without token. → { status: 'available' } | { status: 'unavailable', error }
 * Default path: healthcheck. From a browser use a CORS-enabled path (the healthcheck sends no CORS
 * headers on this deployment, observed): the portal passes `.well-known/openid-configuration` (~1 KB).
 */
export async function checkLive(cfg, { fetch = (...a) => globalThis.fetch(...a), timeoutMs, path = 'healthcheck' } = {}) {
  if (!cfg?.baseUrl) return { status: 'unavailable', error: Object.assign(new Error('LIVE_CONFIG_INCOMPLETE'), { missing: cfg?.missing ?? [] }) };
  try {
    const res = await withTimeout(fetch(`${cfg.baseUrl}${path}`), timeoutMs ?? cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    if (!res.ok) return { status: 'unavailable', error: Object.assign(new Error('LIVE_UNHEALTHY'), { status: res.status }) };
    return { status: 'available' };
  } catch (error) {
    return { status: 'unavailable', error };
  }
}

/**
 * The one place that decides the data mode. Explicit, never automatic:
 * - 'mock'        the user chose "Modo demostración (sin servidor)" (or the config is not live)
 * - 'live'        integrated mode, server reachable
 * - 'unavailable' live configured but the server is down: show an error and OFFER the mock (offerMock)
 * Switching mode must reset the session and UI state (no data carried across modes).
 */
export function resolveDataMode({ cfg, availability, mockChosen = false } = {}) {
  if (mockChosen) return { mode: 'mock', explicit: true };
  if (!cfg?.live) return { mode: 'mock', explicit: false };
  if (availability?.status === 'available') return { mode: 'live' };
  return { mode: 'unavailable', offerMock: true };
}
