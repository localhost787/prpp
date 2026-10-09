// Demo safety net: if the server cannot be reached (network error, 5xx, ~4 s timeout), show the mock
// and flag `demoFallback: true` so the UI can say "Modo demostración". Never used for locks or 401/403.
import { getStatus, isOperationOutcome } from '@medplum/core';
import { DEFAULT_TIMEOUT_MS } from './config.mjs';

const NETWORK = /fetch failed|failed to fetch|network ?request failed|networkerror|load failed|econnrefused|econnreset|enotfound|ehostunreach|etimedout|socket hang up/i;

/** 'timeout' | 'network' | 'server' | 'session' | 'forbidden' | 'not-found' | 'throttled' | 'unknown' */
export function classifyError(error) {
  if (!error) return 'unknown';
  if (error.code === 'LIVE_TIMEOUT' || error.name === 'TimeoutError' || error.name === 'AbortError') return 'timeout';
  const outcome = error.outcome ?? (isOperationOutcome(error) ? error : null);
  if (outcome) {
    const code = outcome.issue?.[0]?.code;
    if (code === 'timeout') return 'timeout';
    const status = getStatus(outcome);
    if (status === 401 || code === 'login') return 'session';
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

const asResult = value => (value && typeof value === 'object' && ['ok', 'locked', 'error'].includes(value.status) ? value : { status: 'ok', data: value });

/**
 * withFallback(liveFn, mockFn, { timeoutMs }) → the live result (+ demoFallback:false), or, only when the
 * server is unreachable, the mock result with demoFallback:true. Locks and other errors pass through.
 */
export async function withFallback(liveFn, mockFn, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  let live;
  try {
    live = asResult(await withTimeout(liveFn(), timeoutMs));
    if (!(live.status === 'error' && isUnreachable(live.error))) return { ...live, demoFallback: false };
  } catch (error) {
    if (!isUnreachable(error)) return { status: 'error', error, demoFallback: false };
  }
  return { ...asResult(await mockFn()), demoFallback: true };
}
