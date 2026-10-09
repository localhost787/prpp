#!/usr/bin/env node
// AYO-113: session contract of Medplum 5.1.42 with the demo accounts (never admin):
//   login variants (auth/method, auth/login -> code | memberships | MFA), processCode, getProfile,
//   "reload" (new client from the stored tokens, and from the refresh token only), auth/revoke of another
//   session, signOut (POST oauth2/logout), and 401 for missing / invalid / revoked / expired tokens.
// It also builds the portal context of the four views from auth/me: Carmen (own record), Lourdes for Carmen,
// Lourdes "Mi salud" (her own Patient) and Rafael for Carmen.
//
// Usage: node scripts/test-auth-session.mjs [--examples <file>] [--expiry-probe <file>]
//   --examples <file>      write the four auth/me examples, sanitized (ids -> placeholders, no tokens,
//                          no session IPs), to <file>. The file must be outside the repo.
//   --expiry-probe <file>  measure a REAL expiry. First run: logs in once more and stores that access token
//                          and its `exp` in <file> (chmod 600, outside the repo; never printed). A later run,
//                          after `exp`, checks that the token gets 401 and deletes the file.
//
// Endpoints used (all documented for Medplum 5.1.42): POST auth/method, POST auth/login, POST auth/profile,
// POST oauth2/token (authorization_code via processCode, refresh_token), GET auth/me, POST auth/revoke,
// POST oauth2/logout (MedplumClient.signOut).
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClientStorage, MedplumClient, MemoryStorage } from '@medplum/core';
import { baseUrl, required } from '../lib/env.mjs';
import { log, newClient, rawRequest } from '../lib/medplum.mjs';
import { CATEGORIES, NOT_SENSITIVE } from '../lib/policies.mjs';

const projectId = required('MEDPLUM_PROJECT_ID');
const C = required('DEMO_CARMEN_PATIENT_ID');
const LP = required('DEMO_LOURDES_PATIENT_ID');
const LOURDES_RP = required('DEMO_LOURDES_RELATEDPERSON_ID');
const RAFAEL_RP = required('DEMO_RAFAEL_RELATEDPERSON_ID');
const ACCOUNTS = {
  carmen: { email: required('DEMO_CARMEN_EMAIL'), password: required('DEMO_CARMEN_PASSWORD') },
  lourdes: { email: required('DEMO_LOURDES_EMAIL'), password: required('DEMO_LOURDES_PASSWORD') },
  rafael: { email: required('DEMO_RAFAEL_EMAIL'), password: required('DEMO_RAFAEL_PASSWORD') },
};

const argValue = (flag) => {
  const i = process.argv.indexOf(flag);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  cwd: dirname(fileURLToPath(import.meta.url)),
  encoding: 'utf8',
}).trim();
function outsideRepo(file, flag) {
  if (!file) {
    return undefined;
  }
  const full = resolve(file);
  if (full === repoRoot || full.startsWith(`${repoRoot}/`)) {
    console.log(`FALLA ${flag} must point outside the repo (${full})`);
    process.exit(1);
  }
  return full;
}
const examplesFile = outsideRepo(argValue('--examples'), '--examples');
const probeFile = outsideRepo(argValue('--expiry-probe'), '--expiry-probe');

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'pasa ' : 'FALLA'} ${name}${detail ? ` · ${detail}` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Replace every known id (and any other UUID) by a placeholder. */
function sanitize(text) {
  let out = text;
  for (const [id, label] of [
    [C, '<Patient:carmen>'],
    [LP, '<Patient:lourdes>'],
    [LOURDES_RP, '<RelatedPerson:lourdes>'],
    [RAFAEL_RP, '<RelatedPerson:rafael>'],
    [projectId, '<Project:PRPP>'],
  ]) {
    out = out.replaceAll(id, label);
  }
  return out.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<id>');
}

/** GET/POST with an explicit bearer token (or none), returns { status, body }. Never logs the token. */
async function call(method, path, token, body, contentType = 'application/json') {
  const res = await fetch(baseUrl() + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
const outcome = (r) => {
  const issue = r.body?.issue?.[0];
  return issue ? `${issue.code}: ${issue.details?.text ?? issue.diagnostics ?? ''}`.slice(0, 80) : (r.body?.error ?? '');
};
const claims = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));

/** Same as lib/medplum.loginUser, but raw, so each step's HTTP answer and variant is recorded. Retries on 429. */
async function login(who, scope = 'openid') {
  for (let attempt = 1; ; attempt++) {
    try {
      return await loginOnce(who, scope);
    } catch (err) {
      const msg = String(err?.message ?? err);
      if (attempt >= 4 || !/Too Many Requests|429/i.test(msg)) {
        throw err;
      }
      const wait = Number(msg.match(/"_msBeforeNext":(\d+)/)?.[1] ?? 60000) + 1000;
      log('wait', `login rate limit, retrying in ${Math.round(wait / 1000)} s`);
      await sleep(wait);
    }
  }
}
async function loginOnce(who, scope) {
  const { email, password } = ACCOUNTS[who];
  const medplum = newClient();
  const verifier = randomBytes(32).toString('base64url');
  medplum.pkceStorage.setString('codeVerifier', verifier);
  const codeChallenge = createHash('sha256').update(verifier).digest('base64url');
  const r = await call('POST', 'auth/login', undefined, {
    email,
    password,
    projectId,
    scope,
    codeChallenge,
    codeChallengeMethod: 'S256',
  });
  if (r.status === 429) {
    throw new Error(`Too Many Requests ${JSON.stringify(r.body)}`);
  }
  const keys = Object.keys(r.body ?? {}).sort();
  let variant;
  let code = r.body?.code;
  if (r.body?.mfaRequired) {
    variant = 'mfaRequired';
  } else if (code) {
    variant = 'code';
  } else if (r.body?.memberships) {
    variant = 'memberships';
    const m = r.body.memberships.find((x) => x.project?.reference === `Project/${projectId}`);
    const p = await call('POST', 'auth/profile', undefined, { login: r.body.login, profile: m?.id });
    code = p.body?.code;
  }
  if (!code) {
    return { medplum: undefined, status: r.status, variant: variant ?? 'none', keys, outcome: outcome(r) };
  }
  await medplum.processCode(code);
  return { medplum, status: r.status, variant, keys };
}

// =====================================================================================================
console.log('== 1 · Inicio de sesión (Medplum 5.1.42) ==');
const method = await call('POST', 'auth/method', undefined, { email: ACCOUNTS.carmen.email });
check('POST auth/method {email} -> 200 (paso 1: el servidor dice si usa contraseña o SSO)', method.status === 200, `${method.status} keys=${Object.keys(method.body ?? {}).join(',') || '(empty)'}`);

const wrong = await call('POST', 'auth/login', undefined, {
  email: ACCOUNTS.carmen.email,
  password: 'wrong-password-for-test',
  projectId,
  scope: 'openid',
  codeChallenge: 'x'.repeat(43),
  codeChallengeMethod: 'S256',
});
check('POST auth/login con contraseña equivocada -> 400 OperationOutcome (no 401)', wrong.status === 400, `${wrong.status} ${outcome(wrong)}`);

const variants = {};
const a = await login('carmen', 'openid offline_access');
variants.carmen = a.variant;
check('Carmen: auth/login -> 200 con "code" (sin selección de membresía ni MFA)', a.status === 200 && a.variant === 'code', `${a.status} variant=${a.variant} keys=${a.keys.join(',')}`);
const carmen = a.medplum;
check('processCode(code) deja la sesión activa (isAuthenticated)', carmen?.isAuthenticated() === true);
const profile = carmen.getProfile();
check('getProfile() -> Patient de Carmen', profile?.resourceType === 'Patient' && profile.id === C, `${profile?.resourceType}/${sanitize(profile?.id ?? '')}`);
const accessA = carmen.getAccessToken();
const loginA = carmen.pkceStorage.getObject('activeLogin');
const refreshA = loginA?.refreshToken;
const ttl = claims(accessA).exp - claims(accessA).iat;
check('access token JWT con exp (vida observada)', ttl > 0, `${ttl} s, claims: ${Object.keys(claims(accessA)).sort().join(',')}`);
check('scope offline_access -> llega refresh token', typeof refreshA === 'string' && refreshA.length > 0);

const meA = await call('GET', 'auth/me', accessA);
check('GET auth/me con el token -> 200', meA.status === 200, `${meA.status} keys=${Object.keys(meA.body ?? {}).join(',')}`);
check('auth/me.membership no trae access[] (solo id, user, profile)', meA.body?.membership && !('access' in meA.body.membership), Object.keys(meA.body?.membership ?? {}).join(','));

// =====================================================================================================
console.log('\n== 2 · "Recargar la página" ==');
// The SDK keeps the session in its storage (localStorage in the browser). A new MedplumClient on the same
// stored data resumes it by itself (attemptResumeActiveLogin -> GET auth/me).
const saved = new Map();
const inner = carmen.pkceStorage.storage;
for (let i = 0; i < inner.length; i++) {
  saved.set(inner.key(i), inner.getItem(inner.key(i)));
}
const reloadedStore = new MemoryStorage();
for (const [k, v] of saved) {
  reloadedStore.setItem(k, v);
}
const reloaded = new MedplumClient({ baseUrl: baseUrl(), cacheTime: 0, fetch: globalThis.fetch, storage: new ClientStorage(reloadedStore) });
const reloadedProfile = await reloaded.getProfileAsync();
check('cliente nuevo desde lo guardado: getProfileAsync() -> la misma Patient sin volver a entrar', reloadedProfile?.id === C, `${reloadedProfile?.resourceType}/${sanitize(reloadedProfile?.id ?? '')}`);
const meReloaded = await rawRequest(reloaded, 'GET', 'auth/me');
check('cliente recargado: GET auth/me -> 200', meReloaded.status === 200, `${meReloaded.status}`);

const form = (params) => new URLSearchParams(params).toString();
const refreshed = await call('POST', 'oauth2/token', undefined, form({ grant_type: 'refresh_token', refresh_token: refreshA }), 'application/x-www-form-urlencoded');
check('solo con el refresh token: POST oauth2/token grant_type=refresh_token -> 200 con access_token nuevo', refreshed.status === 200 && !!refreshed.body?.access_token, `${refreshed.status} ${refreshed.status === 200 ? `keys=${Object.keys(refreshed.body).sort().join(',')}` : outcome(refreshed)}`);
const accessRefreshed = refreshed.body?.access_token;
const refreshB = refreshed.body?.refresh_token;
const meRefreshed = await call('GET', 'auth/me', accessRefreshed);
check('token renovado: GET auth/me -> 200 y el mismo perfil', meRefreshed.status === 200 && meRefreshed.body?.profile?.id === C, `${meRefreshed.status}`);
check('token renovado: misma sesión (mismo login_id)', accessRefreshed && claims(accessRefreshed).login_id === claims(accessA).login_id);

// =====================================================================================================
console.log('\n== 3 · Sesión ausente / inválida -> 401 ==');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const forged = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ ...claims(accessA), exp: Math.floor(Date.now() / 1000) - 60 })}.c2ln`;
for (const [label, token] of [
  ['sin Authorization', undefined],
  ['token basura', 'not-a-token'],
  ['JWT con claims reales de Carmen pero exp vencido y firma falsa', forged],
]) {
  for (const path of ['auth/me', `fhir/R4/Patient/${C}`]) {
    const r = await call('GET', path, token);
    check(`${label}: GET ${sanitize(path)} -> 401`, r.status === 401, `${r.status} ${outcome(r)}`);
  }
}
const malformed = await call('GET', 'auth/me', 'invalid.token.value');
check('JWT malformado ("a.b.c"): rechazado, nunca 2xx', malformed.status === 400 || malformed.status === 401, `${malformed.status} ${outcome(malformed)}`);
if (malformed.status !== 401) {
  console.log(`info  JWT malformado -> ${malformed.status}, no 401 (el contrato pide 401: decisión abierta)`);
}

// =====================================================================================================
console.log('\n== 4 · Cerrar otra sesión (POST auth/revoke) ==');
const b = await login('carmen');
const accessOther = b.medplum.getAccessToken();
const beforeRevoke = await call('GET', `fhir/R4/Patient/${C}`, accessOther);
check('segunda sesión de Carmen: lee su Patient -> 200 (control)', beforeRevoke.status === 200, `${beforeRevoke.status}`);
const sessions = meA.body?.security?.sessions?.length;
const otherLoginId = claims(accessOther).login_id;
const revoke = await call('POST', 'auth/revoke', accessA, { loginId: otherLoginId });
check('sesión A: POST auth/revoke {loginId de B} -> 200', revoke.status === 200, `${revoke.status} ${outcome(revoke)}`);
for (const path of ['auth/me', `fhir/R4/Patient/${C}`]) {
  const r = await call('GET', path, accessOther);
  check(`token revocado (B): GET ${sanitize(path)} -> 401`, r.status === 401, `${r.status} ${outcome(r)}`);
}
const stillA = await call('GET', 'auth/me', accessA);
check('la sesión A sigue viva después de revocar B', stillA.status === 200, `${stillA.status}; auth/me lista ${sessions} sesiones de esta cuenta`);

// =====================================================================================================
console.log('\n== 5 · Contexto auth/me de las cuatro vistas ==');
const l = await login('lourdes');
variants.lourdes = l.variant;
const r = await login('rafael');
variants.rafael = r.variant;
check('Lourdes y Rafael: auth/login -> "code" directo', l.variant === 'code' && r.variant === 'code', `lourdes=${l.variant} rafael=${r.variant}`);
const meL = await rawRequest(l.medplum, 'GET', 'auth/me');
const meR = await rawRequest(r.medplum, 'GET', 'auth/me');

const REPRESENTATIVE = { visita: 'Encounter', medicinas: 'MedicationRequest', instrucciones: 'CarePlan', estudios: 'DiagnosticReport' };
/**
 * Portal context for one patient, read only from auth/me (server-resolved AccessPolicy), never from text.
 * Fails closed: a patient no policy entry names -> role "none" and no categories.
 */
function portalContext(me, patientId) {
  const entries = me.accessPolicy?.resource ?? [];
  const names = (type) => entries.filter((e) => e.resourceType === type && e.criteria?.includes(patientId));
  const patientEntries = names('Patient');
  const own = patientEntries.some((e) => !e.hiddenFields && !e.criteria.includes(NOT_SENSITIVE));
  const family = !own && patientEntries.some((e) => e.hiddenFields);
  const categories = Object.fromEntries(
    CATEGORIES.map((cat) => [cat, own || (family && names(REPRESENTATIVE[cat]).length > 0)])
  );
  const relatedPatient = me.profile?.resourceType === 'RelatedPerson' ? me.profile.patient?.reference : undefined;
  return {
    account: { user: `User/${me.user?.id}`, email: me.user?.email },
    profile: `${me.profile?.resourceType}/${me.profile?.id}`,
    patient: `Patient/${patientId}`,
    role: own ? 'patient' : family ? 'family' : 'none',
    relationship: family && relatedPatient === `Patient/${patientId}` ? (me.profile.relationship?.[0]?.text ?? null) : null,
    categories,
    accessPolicies: (me.accessPolicy?.basedOn ?? []).map((x) => x.display),
    source: 'auth/me accessPolicy (resolved by the server from the ProjectMembership access[] entries)',
  };
}
/** auth/me without tokens, session list, IPs or the full policy body; ids replaced by placeholders. */
function sanitizedMe(me) {
  const slim = {
    user: { resourceType: 'User', id: me.user?.id, email: me.user?.email },
    project: { id: me.project?.id, name: me.project?.name, features: me.project?.features },
    membership: me.membership,
    profile: me.profile,
    accessPolicy: { basedOn: me.accessPolicy?.basedOn, resource: `[${me.accessPolicy?.resource?.length ?? 0} entries, omitted]` },
    security: { mfaEnrolled: me.security?.mfaEnrolled, mfaRequired: me.security?.mfaRequired, sessions: '[omitted]' },
  };
  return JSON.parse(sanitize(JSON.stringify(slim)).replaceAll(/"versionId":"[^"]*"/g, '"versionId":"<version>"'));
}

const views = [
  ['1 · Carmen, su propia salud', meA.body, C, { role: 'patient', cats: CATEGORIES }],
  ['2 · Lourdes, salud de Carmen (delegada)', meL.body, C, { role: 'family', cats: ['visita', 'medicinas', 'instrucciones'] }],
  ['3 · Lourdes, "Mi salud" (MRN-0002)', meL.body, LP, { role: 'patient', cats: CATEGORIES }],
  ['4 · Rafael, salud de Carmen (delegada)', meR.body, C, { role: 'family', cats: CATEGORIES }],
];
const examples = [];
for (const [label, me, patientId, expected] of views) {
  const ctx = portalContext(me, patientId);
  const open = CATEGORIES.filter((c) => ctx.categories[c]);
  check(`${label}: role=${expected.role}, categorías=${expected.cats.join('+')}`, ctx.role === expected.role && open.join() === expected.cats.join(), `role=${ctx.role} ${open.join('+')} rel=${ctx.relationship}`);
  examples.push({ view: label, context: JSON.parse(sanitize(JSON.stringify(ctx))), authMe: sanitizedMe(me) });
}
const none = portalContext(meR.body, LP);
check('falla cerrado: Rafael con la Patient de Lourdes -> role none, sin categorías', none.role === 'none' && !Object.values(none.categories).some(Boolean), none.role);

// =====================================================================================================
console.log('\n== 6 · signOut() = POST oauth2/logout ==');
let signedOut = true;
try {
  await carmen.signOut();
} catch (err) {
  signedOut = false;
  console.log(`info  signOut error: ${err.message}`);
}
check('carmen.signOut() -> sin error, el cliente queda sin sesión', signedOut && !carmen.isAuthenticated() && !carmen.getAccessToken());
for (const [label, token] of [
  ['token viejo', accessA],
  ['token renovado de la misma sesión', accessRefreshed],
]) {
  for (const path of ['auth/me', `fhir/R4/Patient/${C}`]) {
    const res = await call('GET', path, token);
    check(`después de signOut, ${label}: GET ${sanitize(path)} -> 401`, res.status === 401, `${res.status} ${outcome(res)}`);
  }
}
for (const [label, token] of [
  ['refresh token original', refreshA],
  ['refresh token renovado', refreshB],
]) {
  const res = await call('POST', 'oauth2/token', undefined, form({ grant_type: 'refresh_token', refresh_token: token }), 'application/x-www-form-urlencoded');
  check(`después de signOut, ${label} -> rechazado (no 200)`, res.status !== 200, `${res.status} ${outcome(res)}`);
}
const reloadedAfter = await rawRequest(reloaded, 'GET', 'auth/me');
check('después de signOut, la pestaña "recargada" con el token guardado -> 401', reloadedAfter.status === 401, `${reloadedAfter.status}`);

// cleanup: close the remaining sessions of this run
for (const client of [l.medplum, r.medplum]) {
  await client.signOut().catch(() => undefined);
}

// =====================================================================================================
console.log('\n== 7 · Sesión vencida de verdad ==');
if (!probeFile) {
  console.log(`info  no probado: hace falta un token con más de ${ttl} s; correr con --expiry-probe <archivo fuera del repo> y repetir después`);
} else if (!existsSync(probeFile)) {
  const p = await login('rafael');
  const token = p.medplum.getAccessToken();
  writeFileSync(probeFile, JSON.stringify({ token, exp: claims(token).exp, savedAt: new Date().toISOString() }), { mode: 0o600 });
  chmodSync(probeFile, 0o600);
  console.log(`info  token de Rafael guardado; vence ${new Date(claims(token).exp * 1000).toISOString()}. Repetir con --expiry-probe después de esa hora`);
} else {
  const probe = JSON.parse(readFileSync(probeFile, 'utf8'));
  const left = probe.exp * 1000 - Date.now();
  if (left > 0) {
    console.log(`info  el token guardado todavía no vence (faltan ${Math.ceil(left / 1000)} s)`);
  } else {
    for (const path of ['auth/me', `fhir/R4/Patient/${C}`]) {
      const res = await call('GET', path, probe.token);
      check(`token vencido de verdad (guardado ${probe.savedAt}, venció hace ${Math.round(-left / 1000)} s): GET ${sanitize(path)} -> 401`, res.status === 401, `${res.status} ${outcome(res)}`);
    }
    rmSync(probeFile);
  }
}

if (examplesFile) {
  writeFileSync(examplesFile, `${JSON.stringify({ server: 'Medplum 5.1.42', date: new Date().toISOString(), loginVariants: variants, examples }, null, 2)}\n`);
  console.log(`\ninfo  ejemplos auth/me sanitizados en ${examplesFile}`);
}
console.log(`\nResultado: ${pass} pasan, ${fail} fallan`);
process.exit(fail ? 1 : 0);
