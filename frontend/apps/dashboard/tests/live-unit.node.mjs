// Unit tests of the live data layer with a fake client (no network).
import test from 'node:test';
import assert from 'node:assert/strict';
import { OperationOutcomeError, serverError, forbidden, unauthorized } from '@medplum/core';
import { buildConfig, demoButtons } from '../src/live/config.mjs';
import { canView, createAccess, isValidMe, ownPatientIds, familyCriteria, FAMILY_POLICY_NAMES } from '../src/live/permissions.mjs';
import * as q from '../src/live/queries.mjs';
import { withLive, checkLive, resolveDataMode, classifyError } from '../src/live/fallback.mjs';
import { criteriaFor, subscribe, subscribePatient, closeAll } from '../src/live/realtime.mjs';
import { setFamilySharing, toggleCategory } from '../src/live/sharing.mjs';
import { resolveLoginResponse, getRoles, loginDemo, LiveLoginError } from '../src/live/session.mjs';
import { loadVisit } from '../src/visit.mjs';
import { loadResults, resultPresentation, statusKey } from '../src/results.mjs';
import { createCareModel } from '../src/care/care.mjs';

const MOTHER = 'p-1111';
const DAUGHTER_OWN = 'p-2222';
const NO_MATCH = '00000000-0000-0000-0000-000000000000';
const NOT_R = '_security:not=http://terminology.hl7.org/CodeSystem/v3-Confidentiality|R';
// Shapes copied from the live auth/me (sanitized): see docs/CONEXION-LIVE.md.
const basedOn = (...names) => names.map((display, i) => ({ reference: `AccessPolicy/ap-${i}`, display }));
const own = id => [
  { resourceType: 'Patient', readonly: true, criteria: `Patient?_id=${id}` },
  ...['Encounter', 'Task', 'DiagnosticReport', 'MedicationAdministration', 'MedicationRequest', 'CarePlan', 'Observation'].map(t => ({ resourceType: t, readonly: true, criteria: `${t}?_compartment=Patient/${id}` })),
];
const familyEntry = (type, id) => ({ resourceType: type, readonly: true, criteria: `${type}?patient=Patient/${id}&${NOT_R}` });
const noMatch = type => ({ resourceType: type, readonly: true, criteria: `${type}?_id=${NO_MATCH}` });
const NO_MATCH_ALL = ['Patient', 'Encounter', 'Task', 'DiagnosticReport', 'MedicationAdministration', 'MedicationRequest', 'CarePlan', 'Observation'].map(noMatch);
const patientMe = {
  profile: { resourceType: 'Patient', id: MOTHER },
  accessPolicy: { basedOn: basedOn('Paciente (portal)'), resource: own(MOTHER) },
};
// Lourdes: own record ("Paciente (portal)") + visita/medicinas/instrucciones of her mother.
const delegateMe = {
  profile: { resourceType: 'RelatedPerson', id: 'rp-1', patient: { reference: `Patient/${MOTHER}`, display: 'Madre' }, relationship: [{ text: 'hija' }], name: [{ given: ['Hija'], family: 'Ejemplo' }] },
  accessPolicy: {
    basedOn: basedOn('Paciente (portal)', FAMILY_POLICY_NAMES.visita, FAMILY_POLICY_NAMES.medicinas, FAMILY_POLICY_NAMES.instrucciones),
    resource: [
      ...own(DAUGHTER_OWN),
      familyEntry('Patient', MOTHER), familyEntry('Encounter', MOTHER), familyEntry('Task', MOTHER),
      familyEntry('MedicationAdministration', MOTHER), familyEntry('MedicationRequest', MOTHER), familyEntry('CarePlan', MOTHER),
      ...NO_MATCH_ALL,
      { resourceType: 'Practitioner', readonly: true },
    ],
  },
};
const noneMe = {
  profile: { resourceType: 'RelatedPerson', id: 'rp-2', patient: { reference: `Patient/${MOTHER}` } },
  accessPolicy: { basedOn: basedOn('Familiar sin acceso'), resource: NO_MATCH_ALL },
};
const PUBLIC = { EXPO_PUBLIC_MEDPLUM_BASE_URL: 'https://example.test', EXPO_PUBLIC_MEDPLUM_PROJECT_ID: 'proj' };

test('index exposes the whole layer; login refuses an incomplete config without network', async () => {
  const live = await import('../src/live/index.mjs');
  for (const name of ['login', 'loginDemo', 'logout', 'getAuthMe', 'getRoles', 'openLiveSession', 'canView', 'getVisit', 'getResults', 'subscribePatient', 'closeAll', 'setFamilySharing', 'withLive', 'checkLive', 'resolveDataMode']) assert.equal(typeof live[name], 'function', name);
  assert.equal(live.withFallback, undefined, 'no silent mock fallback');
  await assert.rejects(live.login('a@example.test', 'x', buildConfig({})), e => e.code === 'LIVE_CONFIG_INCOMPLETE');
});

test('config: default mock, live only when complete, URL normalized', () => {
  assert.equal(buildConfig({}).mode, 'mock');
  assert.equal(buildConfig({}).live, false);
  assert.equal(buildConfig({ EXPO_PUBLIC_DATA_MODE: 'weird' }).mode, 'mock');
  const partial = buildConfig({ EXPO_PUBLIC_DATA_MODE: 'live', EXPO_PUBLIC_MEDPLUM_BASE_URL: 'https://example.test' });
  assert.equal(partial.live, false);
  assert.deepEqual([...partial.missing], ['EXPO_PUBLIC_MEDPLUM_PROJECT_ID']);
  const full = buildConfig({ EXPO_PUBLIC_DATA_MODE: 'LIVE', EXPO_PUBLIC_MEDPLUM_BASE_URL: 'https://example.test//', EXPO_PUBLIC_MEDPLUM_PROJECT_ID: 'proj' });
  assert.equal(full.live, true);
  assert.equal(full.baseUrl, 'https://example.test/');
  assert.equal(full.timeoutMs, 4000);
});

test('config: demo buttons only for accounts with email AND password, never without server config', async () => {
  assert.deepEqual(demoButtons(buildConfig(PUBLIC)), []);
  const cfg = buildConfig({
    ...PUBLIC,
    EXPO_PUBLIC_DEMO_CARMEN_EMAIL: 'c@example.test', EXPO_PUBLIC_DEMO_CARMEN_PASSWORD: 'placeholder-1',
    EXPO_PUBLIC_DEMO_LOURDES_EMAIL: 'l@example.test', // no password → hidden
    EXPO_PUBLIC_DEMO_RAFAEL_PASSWORD: 'placeholder-3', // no email → hidden
  });
  const buttons = demoButtons(cfg);
  assert.deepEqual(buttons.map(b => b.key), ['carmen']);
  assert.equal(JSON.stringify(buttons).includes('placeholder-1'), false, 'buttons never carry the password');
  assert.deepEqual(buildConfig({ EXPO_PUBLIC_DEMO_CARMEN_EMAIL: 'c@example.test', EXPO_PUBLIC_DEMO_CARMEN_PASSWORD: 'x' }).demoAccounts, []);
  await assert.rejects(loginDemo(cfg, 'lourdes'), e => e instanceof LiveLoginError && e.code === 'LIVE_DEMO_ACCOUNT_NOT_CONFIGURED');
});

test('login: every LoginAuthenticationResponse branch; code is never assumed', async () => {
  const posts = [];
  const client = { post: async (path, body) => { posts.push([path, body]); return { code: 'c-after-profile' }; } };
  assert.equal(await resolveLoginResponse(client, { login: 'l1', code: 'c1' }, 'proj'), 'c1');
  const memberships = [{ id: 'm-other', project: { reference: 'Project/other' } }, { id: 'm-ok', project: { reference: 'Project/proj' } }];
  assert.equal(await resolveLoginResponse(client, { login: 'l1', memberships }, 'proj'), 'c-after-profile');
  assert.deepEqual(posts, [['auth/profile', { login: 'l1', profile: 'm-ok' }]]);
  await assert.rejects(resolveLoginResponse(client, { login: 'l1', memberships: [memberships[0]] }, 'proj'), e => e.code === 'LIVE_NO_PROJECT_MEMBERSHIP');
  await assert.rejects(resolveLoginResponse(client, { login: 'l1', mfaRequired: true }, 'proj'), e => e.code === 'LIVE_LOGIN_MFA_REQUIRED');
  await assert.rejects(resolveLoginResponse(client, { login: 'l1' }, 'proj'), e => e.code === 'LIVE_LOGIN_UNEXPECTED');
  await assert.rejects(resolveLoginResponse(client, undefined, 'proj'), e => e.code === 'LIVE_LOGIN_UNEXPECTED');
  const mfaAfterProfile = { post: async () => ({ mfaRequired: true }) };
  await assert.rejects(resolveLoginResponse(mfaAfterProfile, { login: 'l1', memberships }, 'proj'), e => e.code === 'LIVE_LOGIN_MFA_REQUIRED');
});

test('roles come from auth/me: patient = self; caregiver = delegate + own record', async () => {
  assert.deepEqual(await getRoles({}, patientMe), [{ role: 'self', patientId: MOTHER, displayName: null }]);
  const roles = await getRoles({}, delegateMe);
  assert.deepEqual(roles.map(r => [r.role, r.patientId]), [['delegate', MOTHER], ['self', DAUGHTER_OWN]]);
  assert.equal(roles[0].relationship, 'hija');
  assert.deepEqual((await getRoles({}, noneMe)).map(r => r.role), ['delegate']);
  assert.deepEqual(await getRoles({ getProfile: () => null }, {}), []);
});

test('canView: own record sees everything (Patient profile and caregiver\'s own record)', () => {
  for (const c of ['visita', 'medicinas', 'instrucciones', 'estudios']) {
    assert.equal(canView(patientMe, MOTHER, c), true);
    assert.equal(canView(delegateMe, DAUGHTER_OWN, c), true);
  }
  assert.equal(canView(patientMe, 'someone-else', 'visita'), false);
  assert.deepEqual(ownPatientIds(delegateMe), [DAUGHTER_OWN]);
  // The NO_MATCH "Patient?_id=…" entry is not an own record (no compartment entry).
  assert.equal(ownPatientIds(delegateMe).includes(NO_MATCH), false);
});

test('canView: family categories = exact policy name AND exact criteria for that patient', () => {
  assert.deepEqual(createAccess(delegateMe).permissionsFor(MOTHER), { visita: true, medicinas: true, instrucciones: true, estudios: false });
  assert.deepEqual(createAccess(noneMe).permissionsFor(MOTHER), { visita: false, medicinas: false, instrucciones: false, estudios: false });
  // Criteria present but policy name missing → no.
  const noName = { ...delegateMe, accessPolicy: { ...delegateMe.accessPolicy, basedOn: basedOn('Paciente (portal)') } };
  assert.equal(canView(noName, MOTHER, 'visita'), false);
  // Policy name present but criteria for another patient → no.
  const otherPatient = { profile: noneMe.profile, accessPolicy: { basedOn: basedOn(FAMILY_POLICY_NAMES.estudios), resource: [familyEntry('DiagnosticReport', 'p-9999')] } };
  assert.equal(canView(otherPatient, MOTHER, 'estudios'), false);
  assert.equal(canView(otherPatient, 'p-9999', 'estudios'), true);
  // A type without criteria (e.g. Practitioner, or an unrestricted DiagnosticReport) never opens a category.
  assert.equal(canView({ profile: noneMe.profile, accessPolicy: { basedOn: basedOn(FAMILY_POLICY_NAMES.estudios), resource: [{ resourceType: 'DiagnosticReport' }] } }, MOTHER, 'estudios'), false);
  // Name with different case/spacing → no (exact match only).
  assert.equal(canView({ profile: noneMe.profile, accessPolicy: { basedOn: basedOn('familiar: estudios y resultados '), resource: [familyEntry('DiagnosticReport', MOTHER)] } }, MOTHER, 'estudios'), false);
  assert.equal(familyCriteria('medicinas', MOTHER), `MedicationAdministration?patient=Patient/${MOTHER}&${NOT_R}`);
});

test('canView fails closed on unknown shapes and never matches id substrings', () => {
  assert.equal(canView(delegateMe, MOTHER, 'unknown'), false);
  assert.equal(canView(delegateMe, '', 'visita'), false);
  assert.equal(canView({ profile: {} }, MOTHER, 'visita'), false);
  assert.equal(canView(undefined, MOTHER, 'visita'), false);
  assert.equal(canView({ profile: patientMe.profile, accessPolicy: { resource: own(MOTHER) } }, MOTHER, 'visita'), false, 'no basedOn');
  assert.equal(canView({ profile: patientMe.profile, accessPolicy: { basedOn: 'x', resource: own(MOTHER) } }, MOTHER, 'visita'), false);
  assert.equal(isValidMe({ profile: { resourceType: 'Patient' }, accessPolicy: { basedOn: [null], resource: [] } }), false);
  assert.equal(canView(delegateMe, 'p-111', 'visita'), false); // prefix of p-1111
  assert.equal(canView(delegateMe, '1111', 'visita'), false);
  assert.equal(canView(delegateMe, `${MOTHER}&x=1`, 'visita'), false);
  assert.equal(createAccess({}).valid, false);
});

// ---------- fake client ----------
function fakeClient(data = {}, { fail = {} } = {}) {
  const calls = [];
  return {
    calls,
    async searchResources(type, params) {
      calls.push([type, params]);
      if (fail[type]) throw fail[type];
      const v = data[type] ?? [];
      return typeof v === 'function' ? v(params) : v;
    },
    async readReference(ref) {
      calls.push(['read', ref.reference]);
      return data.read?.[ref.reference] ?? Promise.reject(new OperationOutcomeError(forbidden));
    },
  };
}
const ctxFor = (me, client, patientId = MOTHER) => ({ client, access: createAccess(me), patientId });

const encounter = {
  resourceType: 'Encounter', id: 'enc-1', status: 'in-progress', class: { code: 'EMER' }, priority: { text: 'ESI 3' },
  period: { start: '2026-10-09T08:12:00-04:00' }, location: [{ location: { display: 'Cubículo 12' } }],
  participant: [{ individual: { reference: 'Practitioner/pr-1', display: 'Dra. Ejemplo' } }],
};
const stageTask = {
  resourceType: 'Task', id: 't-1', status: 'in-progress', code: { coding: [{ system: 'urn:portal:tarea', code: 'etapa' }] },
  encounter: { reference: 'Encounter/enc-1' }, description: 'Esperar',
  input: [{ type: { text: 'etapa' }, valueInteger: 5 }, { type: { text: 'que-sigue' }, valueString: 'Esperar resultados' }, { type: { text: 'indicacion' }, valueString: 'No coma ni beba por ahora.' }, { type: { text: 'esi' }, valueInteger: 3 }, { type: { text: 'estudios-en-curso' }, valueInteger: 1 }],
};

test('visit: ok in the mock visit shape, stage Task searched by code', async () => {
  const client = fakeClient({ Encounter: [encounter], Task: [stageTask] });
  const r = await q.getVisit(ctxFor(delegateMe, client));
  assert.equal(r.status, 'ok');
  const { id, patientId, status, stage, startedAt, cubicle, clinician, level } = r.data;
  assert.deepEqual({ id, patientId, status, stage, startedAt, cubicle, clinician, level }, { id: 'enc-1', patientId: MOTHER, status: 'in-progress', stage: 5, startedAt: '2026-10-09T08:12:00-04:00', cubicle: 12, clinician: 'Dra. Ejemplo', level: 3 });
  const taskCall = client.calls.find(c => c[0] === 'Task');
  assert.equal(taskCall[1].code, 'urn:portal:tarea|etapa');
  assert.equal(taskCall[1].encounter, 'Encounter/enc-1');
  // Same object feeds the existing loadVisit() unchanged.
  const session = { patient: { id: MOTHER }, permissions: { visita: true, estudios: false } };
  const loaded = await loadVisit(session, q.liveVisitSource(ctxFor(delegateMe, client)));
  assert.equal(loaded.status, 'ready');
  assert.equal(loaded.visit.stage, 5);
  assert.equal(loaded.visit.stageKey, 'visitStagePrivate');
});

test('visit: allowed but nothing = ok null; no stage Task = ok null', async () => {
  assert.deepEqual(await q.getVisit(ctxFor(delegateMe, fakeClient())), { status: 'ok', data: null });
  assert.deepEqual(await q.getVisit(ctxFor(delegateMe, fakeClient({ Encounter: [encounter] }))), { status: 'ok', data: null });
});

test('status mapping: locked never reads; failed read with permission = error', async () => {
  const client = fakeClient({ Observation: [{ resourceType: 'Observation', id: 'o1' }] });
  assert.deepEqual(await q.getResults(ctxFor(delegateMe, client)), { status: 'locked' });
  assert.deepEqual(await q.getStudies(ctxFor(delegateMe, client)), { status: 'locked' });
  assert.equal(client.calls.length, 0);
  for (const fn of [q.getVisit, q.getNotices, q.getMedications, q.getCarePlan]) assert.deepEqual(await fn(ctxFor(noneMe, client)), { status: 'locked' });
  assert.equal(client.calls.length, 0);
  // 403 on a category auth/me allows → technical error, not a lock.
  const failing = fakeClient({}, { fail: { Encounter: new OperationOutcomeError(forbidden) } });
  const r = await q.getVisit(ctxFor(delegateMe, failing));
  assert.equal(r.status, 'error');
  assert.equal(r.error.kind, 'forbidden');
  const down = await q.getMedications(ctxFor(delegateMe, fakeClient({}, { fail: { MedicationAdministration: new TypeError('fetch failed') } })));
  assert.equal(down.status, 'error');
  assert.equal(down.error.kind, 'network');
});

test('allowed and empty = ok []', async () => {
  const ctx = ctxFor(patientMe, fakeClient());
  for (const fn of [q.getResults, q.getStudies, q.getNotices, q.getMedications, q.getPrescriptions, q.getAppointments]) {
    assert.deepEqual(await fn(ctx), { status: 'ok', data: [] });
  }
  assert.deepEqual(await q.getCarePlan(ctx), { status: 'ok', data: null });
});

test('results keep the mock Observation shape and attach their report', async () => {
  const obs = { resourceType: 'Observation', id: 'wbc', status: 'final', code: { text: 'Glóbulos blancos' }, valueQuantity: { value: 15.2, unit: 'mil/µL' }, referenceRange: [{ text: '4.5–11.0' }], interpretation: [{ coding: [{ code: 'H' }] }], note: [{ text: 'Están altos.' }] };
  const rep = { resourceType: 'DiagnosticReport', id: 'dr1', status: 'final', code: { text: 'Hemograma completo' }, result: [{ reference: 'Observation/wbc' }] };
  const ctx = { ...ctxFor(patientMe, fakeClient({ Observation: [obs], DiagnosticReport: [rep] })), encounterId: 'enc-1' };
  const r = await q.getResults(ctx);
  assert.equal(r.status, 'ok');
  assert.equal(r.data[0].report.code.text, 'Hemograma completo');
  assert.equal(statusKey(r.data[0]), 'final');
  const view = resultPresentation(r.data[0], 'es');
  assert.deepEqual([view.title, view.value, view.unit, view.report], ['Glóbulos blancos', 15.2, 'mil/µL', 'Hemograma completo']);
  const loaded = await loadResults({ patient: { id: MOTHER }, permissions: { estudios: true } }, q.liveResultsSource(ctx));
  assert.equal(loaded.items.length, 1);
  const obsCall = ctx.client.calls.find(c => c[0] === 'Observation')[1];
  assert.equal(obsCall.category, 'laboratory,imaging');
  assert.equal(obsCall.encounter, 'Encounter/enc-1');
});

test('studies status follows API-09', () => {
  const o = (id, status = 'active') => ({ id, status, code: { text: id } });
  const dr = (id, status) => ({ status, basedOn: [{ reference: `ServiceRequest/${id}` }] });
  const sp = id => ({ request: [{ reference: `ServiceRequest/${id}` }] });
  const rows = q.mapStudies(
    [o('a'), o('b'), o('c'), o('d'), o('e'), o('f', 'revoked'), o('g', 'completed')],
    [dr('a', 'final'), dr('b', 'amended'), dr('c', 'preliminary'), dr('d', 'registered')],
    [sp('e')],
  );
  assert.deepEqual(rows.map(r => r.statusKey), ['ready', 'corrected', 'preliminary', 'inProgress', 'collected', 'cancelled', 'ready']);
  assert.equal(q.mapStudies([o('z')], [], [])[0].statusKey, 'ordered');
});

test('notices: neutral twin hidden only when the session sees studies', async () => {
  const c = (id, ...codes) => ({ id, sent: '2026-10-09T09:00:00-04:00', payload: [{ contentString: id }], category: codes.map(code => ({ coding: [{ system: 'urn:portal:aviso', code }] })) });
  const list = [c('real', 'resultado'), c('neutral', 'visita', 'neutral-familia'), c('arrive', 'visita')];
  const own = await q.getNotices(ctxFor(patientMe, fakeClient({ Communication: list })));
  assert.deepEqual(own.data.map(n => n.id), ['real', 'arrive']);
  const fam = await q.getNotices(ctxFor(delegateMe, fakeClient({ Communication: list })));
  assert.deepEqual(fam.data.map(n => n.id), ['real', 'neutral', 'arrive']);
});

test('care: same shape as loadCare(), each section guarded, renders with createCareModel', async () => {
  const ma = { id: 'ma1', medicationCodeableConcept: { text: 'Ceftriaxona' }, effectiveDateTime: '2026-10-09T10:15:00-04:00', dosage: { route: { text: 'por la vena' }, dose: { value: 1, unit: 'g' } } };
  const pr = { resourceType: 'Practitioner', id: 'pr-1', name: [{ text: 'Dra. Ejemplo' }], qualification: [{ code: { text: 'Médica de Emergencias' } }] };
  const client = fakeClient({ Encounter: [encounter], Task: [stageTask], MedicationAdministration: [ma], read: { 'Practitioner/pr-1': pr } });
  const care = await q.getCare(ctxFor(delegateMe, client));
  assert.deepEqual(care.permissions, { team: true, instructions: true, medicines: true });
  assert.deepEqual(care.data.medicines[0], { id: 'ma1', name: { es: 'Ceftriaxona', en: 'Ceftriaxona' }, dose: '1 g', route: { es: 'por la vena', en: 'por la vena' }, time: '10:15 AM', purpose: null, mockOnly: false });
  assert.equal(care.data.participant.roleKey, 'emergencyPhysician');
  assert.equal(care.data.instructions[0].text.es, 'No coma ni beba por ahora.');
  const model = createCareModel({ language: 'es', patientDisplayName: 'X', ...care });
  assert.equal(model.sections.team.status, 'ready');
  assert.equal(model.sections.medicines.items[0].name, 'Ceftriaxona');
  const none = await q.getCare(ctxFor(noneMe, fakeClient()));
  assert.deepEqual(none.permissions, { team: false, instructions: false, medicines: false });
  assert.equal(createCareModel({ permissions: none.permissions, data: none.data }).sections.medicines.status, 'restricted');
});

test('modes are explicit: unreachable → unavailable (never mock data); locks, 403 and 401 pass through', async () => {
  assert.deepEqual(await withLive(async () => ({ status: 'ok', data: ['live'] })), { status: 'ok', data: ['live'], source: 'live' });
  const down = await withLive(async () => { throw new TypeError('fetch failed'); });
  assert.equal(down.status, 'unavailable'); assert.equal(down.source, 'live'); assert.equal('data' in down, false);
  assert.equal((await withLive(async () => ({ status: 'error', error: new OperationOutcomeError(serverError(new Error('x'))) }))).status, 'unavailable');
  assert.equal((await withLive(() => new Promise(r => setTimeout(() => r({ status: 'ok', data: ['late'] }), 200)), { timeoutMs: 30 })).status, 'unavailable');
  assert.deepEqual(await withLive(async () => ({ status: 'locked' })), { status: 'locked', source: 'live' });
  const denied = await withLive(async () => { throw new OperationOutcomeError(forbidden); });
  assert.equal(denied.status, 'error'); assert.equal(denied.error.kind, 'forbidden');
  const expired = await withLive(async () => ({ status: 'error', error: new OperationOutcomeError(unauthorized) }));
  assert.equal(expired.status, 'error');
  assert.equal(classifyError(new OperationOutcomeError(unauthorized)), 'session');
  // Observed: a non-JWT token gets 400 "Authentication error" → same as 401.
  assert.equal(classifyError(new OperationOutcomeError({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'invalid', details: { text: 'Authentication error' } }] })), 'session');
  const cfg = buildConfig({ ...PUBLIC, EXPO_PUBLIC_DATA_MODE: 'live' });
  assert.deepEqual(await checkLive(cfg, { fetch: async () => ({ ok: true }) }), { status: 'available' });
  assert.equal((await checkLive(cfg, { fetch: async () => { throw new TypeError('fetch failed'); } })).status, 'unavailable');
  assert.equal((await checkLive(buildConfig({}))).status, 'unavailable');
  assert.deepEqual(resolveDataMode({ cfg, availability: { status: 'available' } }), { mode: 'live' });
  assert.deepEqual(resolveDataMode({ cfg, availability: { status: 'unavailable' } }), { mode: 'unavailable', offerMock: true });
  assert.deepEqual(resolveDataMode({ cfg, availability: { status: 'unavailable' }, mockChosen: true }), { mode: 'mock', explicit: true });
  assert.deepEqual(resolveDataMode({ cfg: buildConfig({}) }), { mode: 'mock', explicit: false });
});

test('realtime: only permitted categories; events carry only the type (re-read); closeAll releases everything', async () => {
  const crit = criteriaFor(createAccess(delegateMe), MOTHER);
  assert.ok(crit.includes(`Task?patient=Patient/${MOTHER}`));
  assert.ok(crit.includes(`MedicationAdministration?patient=Patient/${MOTHER}`));
  assert.ok(!crit.some(c => /DiagnosticReport|Observation|ServiceRequest/.test(c)));
  assert.deepEqual(criteriaFor(createAccess(noneMe), MOTHER), []);
  assert.deepEqual(criteriaFor(createAccess({ broken: true }), MOTHER), [], 'bad auth/me → nothing');
  const listeners = new Map();
  const released = [];
  let socketClosed = 0;
  const manager = {
    addCriteria: c => {
      const own = {};
      listeners.set(c, own);
      return { addEventListener: (t, fn) => { own[t] = fn; }, removeEventListener: t => { delete own[t]; } };
    },
    removeCriteria: c => released.push(c),
    closeWebSocket: () => { socketClosed++; },
  };
  const client = { getSubscriptionManager: () => manager };
  const got = [];
  const sub = subscribe(client, 'Task?patient=Patient/x', { onEvent: e => got.push(e), onConnect: c => got.push(c.subscriptionId) });
  listeners.get('Task?patient=Patient/x').connect({ payload: { subscriptionId: 's1' } });
  listeners.get('Task?patient=Patient/x').message({ payload: { entry: [{}, { resource: { resourceType: 'Task', id: 't1', secret: 'payload' } }] } });
  sub.unsubscribe(); sub.unsubscribe();
  assert.deepEqual(got, ['s1', { resourceType: 'Task' }], 'payload content is never passed on');
  assert.deepEqual(released, ['Task?patient=Patient/x']);
  // subscribePatient batches types; closeAll releases every criterion and closes the socket.
  const changes = [];
  const all = subscribePatient(client, createAccess(delegateMe), MOTHER, { onChange: c => changes.push([...c.types]), batchMs: 5 });
  listeners.get(`Encounter?patient=Patient/${MOTHER}`).message({ payload: { entry: [{}, { resource: { resourceType: 'Encounter' } }] } });
  listeners.get(`Task?patient=Patient/${MOTHER}`).message({ payload: { entry: [{}, { resource: { resourceType: 'Task' } }] } });
  await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(changes, [['Encounter', 'Task']]);
  assert.equal(closeAll(client), all.criteria.length);
  assert.deepEqual(released.slice(1).sort(), [...all.criteria].sort());
  assert.equal(socketClosed, 1);
  assert.equal(closeAll(client), 0);
});

test('sharing: validates input before calling the Bot; toggle keeps "visita" as base', async () => {
  let executed = 0;
  const client = { searchOne: async () => ({ id: 'bot-1' }), executeBot: async (id, body) => { executed++; return { ok: true, compartir: ['visita', ...body.compartir.filter(c => c !== 'visita')], familiares: ['X'] }; } };
  assert.equal((await setFamilySharing(client, { relatedPersonId: '', categories: ['visita'] })).status, 'error');
  assert.equal((await setFamilySharing(client, { relatedPersonId: 'a/../b', categories: ['visita'] })).status, 'error');
  assert.equal((await setFamilySharing(client, { relatedPersonId: 'rp-1', categories: ['radiografias'] })).status, 'error');
  assert.equal(executed, 0);
  const ok = await setFamilySharing(client, { relatedPersonId: 'rp-1', categories: ['estudios'] });
  assert.deepEqual(ok, { status: 'ok', data: { compartir: ['visita', 'estudios'], familiares: ['X'] } });
  const fallbackId = await setFamilySharing({ searchOne: async () => { throw new Error('no'); }, executeBot: async id => ({ ok: id === 'cfg-bot', compartir: [] }) }, { relatedPersonId: 'rp-1', categories: [] }, { botCompartirId: 'cfg-bot' });
  assert.equal(fallbackId.status, 'ok');
  assert.deepEqual(toggleCategory(['visita', 'medicinas'], 'estudios', true), ['visita', 'medicinas', 'estudios']);
  assert.deepEqual(toggleCategory(['visita', 'medicinas', 'estudios'], 'estudios', false), ['visita', 'medicinas']);
  assert.deepEqual(toggleCategory(['visita', 'medicinas'], 'visita', false), []);
});
