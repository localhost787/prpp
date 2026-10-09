// Small helpers around MedplumClient (@medplum/core 5.1.42) for setup scripts and tests.
import { ClientStorage, MedplumClient, MemoryStorage } from '@medplum/core';
import { createHash, randomBytes } from 'node:crypto';
import { baseUrl } from './env.mjs';

/** New client with caching off, so every read hits the server. */
export function newClient() {
  const storage = new ClientStorage(new MemoryStorage());
  const medplum = new MedplumClient({ baseUrl: baseUrl(), cacheTime: 0, fetch: globalThis.fetch, storage });
  return Object.assign(medplum, { pkceStorage: storage });
}

/** Email + password login (two-step PKCE flow). Picks the membership in `projectId` if given. */
export async function loginUser(email, password, projectId) {
  const medplum = newClient();
  // PKCE done here: the SDK's own PKCE helper needs `window.crypto` (browser only).
  const verifier = randomBytes(32).toString('base64url');
  medplum.pkceStorage.setString('codeVerifier', verifier);
  const codeChallenge = createHash('sha256').update(verifier).digest('base64url');
  let res = await medplum.startLogin({
    email,
    password,
    projectId,
    scope: 'openid',
    codeChallenge,
    codeChallengeMethod: 'S256',
  });
  if (res.memberships && !res.code) {
    const membership = res.memberships.find((m) => m.project?.reference === `Project/${projectId}`);
    if (!membership) {
      throw new Error(`${email} has no membership in Project/${projectId}`);
    }
    res = await medplum.post('auth/profile', { login: res.login, profile: membership.id });
  }
  if (!res.code) {
    throw new Error(`Login for ${email} returned no code`);
  }
  await medplum.processCode(res.code);
  return medplum;
}

/** Client credentials login (ClientApplication). */
export async function loginClient(clientId, clientSecret) {
  const medplum = newClient();
  await medplum.startClientLogin(clientId, clientSecret);
  return medplum;
}

/** Raw request that returns { status, body } instead of throwing. For permission tests. */
export async function rawRequest(medplum, method, path, body, contentType = 'application/fhir+json') {
  const res = await fetch(medplum.getBaseUrl() + path, {
    method,
    headers: {
      Authorization: `Bearer ${medplum.getAccessToken()}`,
      ...(body !== undefined ? { 'Content-Type': contentType } : {}),
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

/** Print one evidence line: "ok|new|same|fix|FAIL  message". */
export function log(tag, msg) {
  console.log(`${tag.padEnd(4)} ${msg}`);
}
