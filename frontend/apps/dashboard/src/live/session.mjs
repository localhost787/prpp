// API-01 (login/logout), API-02 (auth/me) and API-03 (roles) against the real Medplum server.
// Tokens live only inside MedplumClient; this module never stores passwords or clinical data.
import { ClientStorage, MedplumClient, MemoryStorage } from '@medplum/core';
import { createAccess } from './permissions.mjs';

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

/** New client for the configured server. `storage` defaults to memory (nothing persisted by us). */
export function createClient(cfg, { storage = new ClientStorage(new MemoryStorage()), fetch } = {}) {
  if (!cfg?.baseUrl) throw Object.assign(new Error('LIVE_CONFIG_INCOMPLETE'), { missing: cfg?.missing ?? [] });
  const client = new MedplumClient({
    baseUrl: cfg.baseUrl,
    storage,
    cacheTime: 0, // every read hits the server: permissions and clinical state change live
    fetch: fetch ?? ((...args) => globalThis.fetch(...args)),
  });
  return Object.assign(client, { liveStorage: storage });
}

/** Email + password login (two steps). Picks the membership of `cfg.projectId` if there are several. */
export async function login(email, password, cfg, options = {}) {
  if (!cfg?.projectId) throw Object.assign(new Error('LIVE_CONFIG_INCOMPLETE'), { missing: cfg?.missing ?? [] });
  const client = createClient(cfg, options);
  const pkce = await preparePkce(client.liveStorage);
  let res = await client.startLogin({ email, password, projectId: cfg.projectId, scope: 'openid', ...pkce });
  if (res.memberships && !res.code) {
    const membership = res.memberships.find(m => m.project?.reference === `Project/${cfg.projectId}`);
    if (!membership) throw new Error('LIVE_NO_PROJECT_MEMBERSHIP');
    res = await client.post('auth/profile', { login: res.login, profile: membership.id });
  }
  if (!res.code) throw new Error('LIVE_LOGIN_NO_CODE');
  await client.processCode(res.code);
  return client;
}

/** Signs out (the SDK revokes the token) and clears local state. Never throws. */
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
 * API-03: roles of this account. Patient → one "self" role. RelatedPerson → "delegate" role for
 * RelatedPerson.patient, plus "self" if a Person links the account to its own Patient.
 * @returns {Promise<Array<{role:'self'|'delegate', patientId:string, displayName:string|null, relationship?:string|null}>>}
 */
export async function getRoles(client) {
  const profile = client.getProfile();
  if (profile?.resourceType === 'Patient') return [{ role: 'self', patientId: profile.id, displayName: nameOf(profile) }];
  if (profile?.resourceType !== 'RelatedPerson') return [];
  const roles = [];
  const caredFor = patientIdOf(profile.patient?.reference);
  if (caredFor) {
    roles.push({ role: 'delegate', patientId: caredFor, displayName: profile.patient.display ?? null, relationship: profile.relationship?.[0]?.text ?? null });
  }
  try {
    const people = await client.searchResources('Person', { relatedperson: `RelatedPerson/${profile.id}` }, { cache: 'no-cache' });
    for (const link of people.flatMap(p => p.link ?? [])) {
      const own = patientIdOf(link.target?.reference);
      if (own && own !== caredFor && !roles.some(r => r.patientId === own)) roles.push({ role: 'self', patientId: own, displayName: link.target.display ?? nameOf(profile) });
    }
  } catch {
    // No Person visible: a single role is not an error (API-03).
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
