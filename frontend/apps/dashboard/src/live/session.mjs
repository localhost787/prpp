// API-01 (login/logout), API-02 (auth/me) and API-03 (roles) against the real Medplum server.
// Tokens live only inside MedplumClient; this module never stores passwords or clinical data.
import { ClientStorage, MedplumClient, MemoryStorage } from '@medplum/core';
import { createAccess, ownPatientIds } from './permissions.mjs';
import { classifyError } from './fallback.mjs';

const toBase64Url = bytes => {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** PKCE S256 with Web Crypto (browser and Node >= 20). The SDK reads `codeVerifier` back in processCode. */
async function preparePkce(storage) {
  const verifier = toBase64Url(globalThis.crypto.getRandomValues(new Uint8Array(32)));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  storage.setString('codeVerifier', verifier);
  return { codeChallenge: toBase64Url(new Uint8Array(digest)), codeChallengeMethod: 'S256' };
}

/**
 * Typed login error. `code`:
 *  LIVE_CONFIG_INCOMPLETE · LIVE_LOGIN_REJECTED (wrong email/password: server answers 400) ·
 *  LIVE_LOGIN_THROTTLED (5 logins/min/IP) · LIVE_LOGIN_MFA_REQUIRED · LIVE_NO_PROJECT_MEMBERSHIP ·
 *  LIVE_LOGIN_UNEXPECTED (no code and no known branch) · LIVE_UNAVAILABLE (network/5xx/timeout)
 */
export class LiveLoginError extends Error {
  constructor(code, extra = {}) {
    super(code);
    this.name = 'LiveLoginError';
    this.code = code;
    Object.assign(this, extra);
  }
}

/** New client for the configured server. `storage` defaults to memory (nothing persisted by us). */
export function createClient(cfg, { storage = new ClientStorage(new MemoryStorage()), fetch } = {}) {
  if (!cfg?.baseUrl) throw new LiveLoginError('LIVE_CONFIG_INCOMPLETE', { missing: cfg?.missing ?? [] });
  const client = new MedplumClient({
    baseUrl: cfg.baseUrl,
    storage,
    cacheTime: 0, // every read hits the server: permissions and clinical state change live
    fetch: fetch ?? ((...args) => globalThis.fetch(...args)),
  });
  return Object.assign(client, { liveStorage: storage });
}

function loginFailure(error) {
  if (error instanceof LiveLoginError) return error;
  const kind = classifyError(error);
  if (['network', 'timeout', 'server'].includes(kind)) return new LiveLoginError('LIVE_UNAVAILABLE', { cause: error });
  if (kind === 'throttled' || /too many requests/i.test(String(error?.message))) return new LiveLoginError('LIVE_LOGIN_THROTTLED', { cause: error });
  return new LiveLoginError('LIVE_LOGIN_REJECTED', { cause: error });
}

/**
 * Follows one LoginAuthenticationResponse until a code. Never assumes `code` is present:
 *  - code            → done
 *  - mfaRequired     → LIVE_LOGIN_MFA_REQUIRED (the demo accounts have no MFA)
 *  - memberships[]   → pick the one of cfg.projectId, POST auth/profile, then follow that answer
 *  - anything else   → LIVE_LOGIN_UNEXPECTED
 */
export async function resolveLoginResponse(client, res, projectId) {
  for (let step = 0; step < 3; step++) {
    if (res?.code) return res.code;
    if (res?.mfaRequired) throw new LiveLoginError('LIVE_LOGIN_MFA_REQUIRED');
    if (Array.isArray(res?.memberships)) {
      const membership = res.memberships.find(m => m?.project?.reference === `Project/${projectId}`);
      if (!membership?.id || !res.login) throw new LiveLoginError('LIVE_NO_PROJECT_MEMBERSHIP');
      res = await client.post('auth/profile', { login: res.login, profile: membership.id });
      continue;
    }
    break;
  }
  throw new LiveLoginError('LIVE_LOGIN_UNEXPECTED');
}

/**
 * Email + password login. projectId is REQUIRED on this deployment: the accounts are project users and
 * the server answers 400 "User not found" without it (observed).
 */
export async function login(email, password, cfg, options = {}) {
  if (!cfg?.baseUrl || !cfg?.projectId) throw new LiveLoginError('LIVE_CONFIG_INCOMPLETE', { missing: cfg?.missing ?? [] });
  const client = createClient(cfg, options);
  try {
    const pkce = await preparePkce(client.liveStorage);
    const res = await client.startLogin({ email, password, projectId: cfg.projectId, scope: 'openid', ...pkce });
    const code = await resolveLoginResponse(client, res, cfg.projectId);
    await client.processCode(code);
    return client;
  } catch (error) {
    throw loginFailure(error);
  }
}

/** One-click demo login (team decision) with credentials from EXPO_PUBLIC_DEMO_*; REAL server. */
export function loginDemo(cfg, key, options = {}) {
  const account = (cfg?.demoAccounts ?? []).find(a => a.key === key);
  if (!account) return Promise.reject(new LiveLoginError('LIVE_DEMO_ACCOUNT_NOT_CONFIGURED', { key }));
  return login(account.email, account.password, cfg, options);
}

/** Signs out (the SDK revokes the token and clears its storage). Never throws. */
export async function logout(client) {
  try {
    await client?.signOut();
  } catch {
    client?.clear?.();
  }
}

export const getProfile = client => client.getProfile();

/** API-02: combined access policy, ALWAYS without cache (getAccessPolicy() is the stale login copy). */
export const getAuthMe = client => client.get('auth/me', { cache: 'no-cache' });

const patientIdOf = reference => (reference?.startsWith('Patient/') ? reference.slice('Patient/'.length) : null);
const nameOf = resource => resource?.name?.[0]?.text ?? ([resource?.name?.[0]?.given?.join(' '), resource?.name?.[0]?.family].filter(Boolean).join(' ') || null);

/**
 * API-03: roles of this account, from auth/me only.
 * Patient profile → "self". RelatedPerson → "delegate" for RelatedPerson.patient, plus "self" for each
 * own record auth/me grants ("Paciente (portal)" + exact own-record entries; e.g. Lourdes' "Mi salud").
 * @returns {Promise<Array<{role:'self'|'delegate', patientId:string, displayName:string|null, relationship?:string|null}>>}
 */
export async function getRoles(client, me) {
  me ??= await getAuthMe(client);
  const profile = me?.profile ?? client.getProfile();
  const own = ownPatientIds(me);
  if (profile?.resourceType === 'Patient') {
    return own.includes(profile.id) ? [{ role: 'self', patientId: profile.id, displayName: nameOf(profile) }] : [];
  }
  if (profile?.resourceType !== 'RelatedPerson') return [];
  const roles = [];
  const caredFor = patientIdOf(profile.patient?.reference);
  if (caredFor) {
    roles.push({ role: 'delegate', patientId: caredFor, displayName: profile.patient.display ?? null, relationship: profile.relationship?.[0]?.text ?? null });
  }
  for (const id of own) {
    if (id !== caredFor && !roles.some(r => r.patientId === id)) roles.push({ role: 'self', patientId: id, displayName: nameOf(profile) });
  }
  return roles;
}

/**
 * Builds the same session shape the mock UI consumes: { client, patient, permissions, profile, role, access }.
 * `permissions` = { visita, medicinas, instrucciones, estudios } from auth/me (fresh).
 */
export async function openLiveSession(client, role) {
  const access = createAccess(await getAuthMe(client));
  let patient = { resourceType: 'Patient', id: role.patientId, name: [{ text: role.displayName ?? '' }] };
  if (access.canView(role.patientId, 'visita')) {
    try {
      patient = await client.readResource('Patient', role.patientId);
    } catch {
      // Keep the display-only header.
    }
  }
  return { client, patient, permissions: access.permissionsFor(role.patientId), profile: client.getProfile(), role: role.role, access };
}
