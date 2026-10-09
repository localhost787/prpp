// Integrated mode adapter (src/live/portal.mjs): live data → the shapes the existing screens consume.
// Fake clients only (no network).
import test from 'node:test';
import assert from 'node:assert/strict';
import { OperationOutcomeError, unauthorized } from '@medplum/core';
import { buildConfig } from '../src/live/config.mjs';
import { createAccess, FAMILY_POLICY_NAMES } from '../src/live/permissions.mjs';
import { adaptSession, createIntegratedPortal, liveReportGroups, liveErrorKey, screenPatient, loadDischarge } from '../src/live/portal.mjs';
import { createPortalStore } from '../src/context.mjs';
import { loadVisit, createVisitController, visitPresentation } from '../src/visit.mjs';
import { loadResults, createResultsController, resultPresentation, statusKey, statusLabel } from '../src/results.mjs';
import { loadCare } from '../src/care/adapter.mjs';
import { createCareController } from '../src/care/controller.mjs';
import { createCareModel } from '../src/care/care.mjs';
import { translate } from '../src/i18n.mjs';

const MOTHER = 'p-1111';
const OWN = 'p-2222';
const NOT_R = '_security:not=http://terminology.hl7.org/CodeSystem/v3-Confidentiality|R';
const basedOn = (...names) => names.map((display, i) => ({ reference: `AccessPolicy/ap-${i}`, display }));
const own = id => [
  { resourceType: 'Patient', criteria: `Patient?_id=${id}` },
  { resourceType: 'Encounter', criteria: `Encounter?_compartment=Patient/${id}` },
];
const family = (type, id) => ({ resourceType: type, criteria: `${type}?patient=Patient/${id}&${NOT_R}` });
const patientMe = { profile: { resourceType: 'Patient', id: MOTHER }, accessPolicy: { basedOn: basedOn('Paciente (portal)'), resource: own(MOTHER) } };
const daughterMe = {
  profile: { resourceType: 'RelatedPerson', id: 'rp-1', patient: { reference: `Patient/${MOTHER}` } },
  accessPolicy: {
    basedOn: basedOn('Paciente (portal)', FAMILY_POLICY_NAMES.visita, FAMILY_POLICY_NAMES.medicinas, FAMILY_POLICY_NAMES.instrucciones),
    resource: [...own(OWN), family('Encounter', MOTHER), family('MedicationAdministration', MOTHER), family('CarePlan', MOTHER)],
  },
};
const husbandMe = {
  profile: { resourceType: 'RelatedPerson', id: 'rp-2', patient: { reference: `Patient/${MOTHER}` } },
  accessPolicy: {
    basedOn: basedOn(...Object.values(FAMILY_POLICY_NAMES)),
    resource: ['Encounter', 'MedicationAdministration', 'CarePlan', 'DiagnosticReport'].map(t => family(t, MOTHER)),
  },
};

// Server-shaped resources (sanitized copies of the demo seed).
const encounter = {
  resourceType: 'Encounter', id: 'enc-1', status: 'finished', class: { code: 'EMER' }, period: { start: '2026-10-09T08:12:00-04:00' },
  location: [{ location: { display: 'Cubículo 12' } }], participant: [{ individual: { reference: 'Practitioner/pr-1', display: 'Dra. Ejemplo' } }], priority: { text: 'ESI 3' },
};
const stageTask = { resourceType: 'Task', id: 't-1', status: 'completed', encounter: { reference: 'Encounter/enc-1' }, input: [{ type: { text: 'etapa' }, valueInteger: 7 }, { type: { text: 'indicacion' }, valueString: 'Descanse.' }] };
const obs = (id, text, extra) => ({ resourceType: 'Observation', id, status: 'final', code: { text }, note: [{ text: 'Nota.' }], ...extra });
const observations = [
  obs('o-wbc', 'Glóbulos blancos', { category: [{ coding: [{ code: 'laboratory' }] }], valueQuantity: { value: 15.2, unit: 'mil/µL' }, referenceRange: [{ text: '4.5–11.0' }], interpretation: [{ coding: [{ code: 'H' }] }] }),
  obs('o-rx', 'Radiografía de tórax', { status: 'corrected', category: [{ coding: [{ code: 'imaging' }] }], valueString: 'Pulmonía' }),
];
const reports = [
  { resourceType: 'DiagnosticReport', id: 'dr-cbc', status: 'final', code: { text: 'Hemograma completo' }, result: [{ reference: 'Observation/o-wbc' }] },
  { resourceType: 'DiagnosticReport', id: 'dr-rx', status: 'corrected', code: { text: 'Radiografía de tórax' }, result: [{ reference: 'Observation/o-rx' }] },
];
const medAdmin = { resourceType: 'MedicationAdministration', id: 'ma-1', medicationCodeableConcept: { text: 'Ceftriaxona' }, dosage: { dose: { value: 1, unit: 'g' }, route: { text: 'por la vena' } }, effectiveDateTime: '2026-10-09T10:15:00-04:00' };
const carePlan = { resourceType: 'CarePlan', id: 'cp-1', title: 'Su alta', description: 'Pulmonía', activity: [{ detail: { description: 'Tome la medicina.' } }, { detail: { code: { text: 'alarma' }, description: 'Le falta el aire.' } }] };

function fakeClient(me, data = {}, { fail = {} } = {}) {
  const calls = [];
  return {
    calls,
    async get(url) { calls.push(['get', url]); if (fail.me) throw fail.me; return typeof me === 'function' ? me() : me; },
    async searchResources(type, params) { calls.push([type, params]); if (fail[type]) throw fail[type]; return data[type] ?? []; },
    async readReference(ref) { return data.read?.[ref.reference] ?? Promise.reject(new Error('no')); },
    async readResource(type, id) { return { resourceType: 'Patient', id, name: [{ given: ['Madre'], family: 'Ejemplo' }] }; },
    getProfile: () => (typeof me === 'function' ? me() : me).profile,
    getSubscriptionManager: () => ({ closeWebSocket() {} }),
  };
}
const SERVER = { Encounter: [encounter], Task: [stageTask], Observation: observations, DiagnosticReport: reports, MedicationAdministration: [medAdmin], CarePlan: [carePlan] };
const sessionFor = (me, role, client = fakeClient(me, SERVER)) => {
  const access = createAccess(me);
  return adaptSession({
    account: 'x', role, client, cfg: {},
    live: { access, permissions: access.permissionsFor(role.patientId), profile: me.profile, patient: { resourceType: 'Patient', id: role.patientId, name: [{ given: ['Madre'], family: 'Ejemplo' }] } },
  });
};

test('screenPatient always gives name[0].text (the header reads it)', () => {
  assert.equal(screenPatient({ id: 'a', name: [{ given: ['Ana', 'María'], family: 'Ruiz' }] }).name[0].text, 'Ana María Ruiz');
  assert.equal(screenPatient({ id: 'a' }, 'Visible').name[0].text, 'Visible');
  assert.equal(screenPatient({ id: 'a', name: [{ text: 'Tal cual' }] }).name[0].text, 'Tal cual');
});

test('patient (own record): visit, results and care come from the server in the screen shapes', async () => {
  const session = sessionFor(patientMe, { role: 'self', patientId: MOTHER, displayName: 'Madre Ejemplo' });
  assert.deepEqual(session.permissions, { visita: true, medicinas: true, instrucciones: true, estudios: true });
  assert.equal(session.patient.name[0].text, 'Madre Ejemplo');

  const visit = await loadVisit(session);
  assert.equal(visit.status, 'ready');
  assert.deepEqual(Object.keys(visit.visit).sort(), ['clinician', 'cubicle', 'id', 'level', 'nextKey', 'patientId', 'stage', 'startedAt', 'status'].sort());
  assert.equal(visit.visit.stage, 7);
  assert.equal(visit.visit.patientId, MOTHER);
  assert.equal(visit.visit.cubicle, 12);
  assert.equal(visit.visit.clinician, 'Ejemplo', 'no double "Dr." prefix on screen');
  assert.ok(visitPresentation(visit.visit, session.permissions, 'es').description.length > 0);

  const results = await loadResults(session);
  assert.equal(results.status, 'ready');
  assert.equal(results.items.length, 2);
  assert.ok(results.items.every(i => i.resourceType === 'Observation' && i.report?.id));
  assert.equal(resultPresentation(results.items[0], 'es').title, 'Glóbulos blancos');
  assert.equal(statusKey(results.items[1]), 'corrected');
  const groups = liveReportGroups(results.items, { statusLabel: i => statusLabel(i, 'es'), source: 'S' });
  assert.deepEqual(groups.map(g => [g.id, g.title, g.typeKey, g.downloadable, g.items.map(x => x.id)]), [
    ['dr-cbc', 'Hemograma completo', 'reportLaboratory', false, ['o-wbc']],
    ['dr-rx', 'Radiografía de tórax', 'reportImaging', false, ['o-rx']],
  ]);

  const care = await loadCare(session);
  assert.deepEqual(care.permissions, { team: true, instructions: true, medicines: true });
  assert.equal(care.data.medicines[0].dose, '1 g');
  assert.equal(care.data.instructions[0].text.es, 'Descanse.');
  const model = createCareModel({ language: 'es', patientDisplayName: 'Madre', permissions: care.permissions, data: care.data });
  assert.equal(model.sections.medicines.status, 'ready');

  const discharge = await session.live.discharge();
  assert.equal(discharge.plan.status, 'ok');
  assert.deepEqual(discharge.plan.data.alarms, ['Le falta el aire.']);
});

test('daughter caring for the patient: results LOCKED without asking the server; visit, medicines, instructions ok', async () => {
  const client = fakeClient(daughterMe, SERVER);
  const session = sessionFor(daughterMe, { role: 'delegate', patientId: MOTHER }, client);
  assert.deepEqual(session.permissions, { visita: true, medicinas: true, instrucciones: true, estudios: false });
  assert.deepEqual(await loadResults(session), { status: 'restricted', items: [] });
  assert.ok(!client.calls.some(([type]) => type === 'Observation' || type === 'DiagnosticReport'), 'locked category never reaches the server');
  const visit = await loadVisit(session);
  assert.equal(visit.status, 'ready');
  assert.equal(visit.visit.stageKey, 'visitStagePrivate');
  const care = await loadCare(session);
  assert.equal(care.permissions.medicines, true);
  assert.equal(care.data.medicines.length, 1);
  const discharge = await session.live.discharge();
  assert.equal(discharge.plan.status, 'ok');
  assert.equal(discharge.prescriptions.status, 'ok');
});

test('husband: the 4 categories from auth/me', async () => {
  const session = sessionFor(husbandMe, { role: 'delegate', patientId: MOTHER });
  assert.deepEqual(session.permissions, { visita: true, medicinas: true, instrucciones: true, estudios: true });
  assert.equal((await loadResults(session)).items.length, 2);
});

test('server failure is an explicit error state, never mock data', async () => {
  const broken = fakeClient(patientMe, {}, { fail: { Encounter: new TypeError('fetch failed'), Observation: new TypeError('fetch failed'), MedicationAdministration: new TypeError('fetch failed') } });
  const session = sessionFor(patientMe, { role: 'self', patientId: MOTHER }, broken);
  const visit = createVisitController();
  await visit.open(session);
  assert.equal(visit.getSnapshot().status, 'error');
  assert.equal(visit.getSnapshot().visit, null);
  const results = createResultsController();
  await results.open(session);
  assert.deepEqual([results.getSnapshot().status, results.getSnapshot().items], ['error', []]);
  const care = createCareController();
  await care.open(session);
  assert.equal(care.getSnapshot().status, 'error');
  await assert.rejects(loadDischarge({ client: fakeClient(patientMe, {}, { fail: { CarePlan: new Error('x') } }), access: createAccess(patientMe), patientId: MOTHER }));
});

test('refresh re-reads from the server without a loading flash and keeps the open detail', async () => {
  const data = { ...SERVER, Observation: [observations[0]] };
  const session = sessionFor(patientMe, { role: 'self', patientId: MOTHER }, fakeClient(patientMe, data));
  const results = createResultsController();
  await results.open(session);
  results.detail('o-wbc');
  const seen = [];
  results.subscribe(() => seen.push(results.getSnapshot().status));
  data.Observation = observations;
  await results.refresh(session);
  assert.deepEqual(seen, ['ready']);
  assert.equal(results.getSnapshot().items.length, 2);
  assert.equal(results.getSnapshot().detail, 'o-wbc');

  const visit = createVisitController();
  await visit.open(session);
  data.Task = [{ ...stageTask, input: [{ type: { text: 'etapa' }, valueInteger: 6 }] }];
  await visit.refresh(session);
  assert.equal(visit.getSnapshot().visit.stage, 6);
});

const PUBLIC = { EXPO_PUBLIC_DATA_MODE: 'live', EXPO_PUBLIC_MEDPLUM_BASE_URL: 'https://example.test', EXPO_PUBLIC_MEDPLUM_PROJECT_ID: 'proj' };

function portalWith(cfg, { me = patientMe, roles = [{ role: 'self', patientId: MOTHER }], loginError } = {}) {
  const log = { logins: [], logouts: 0, mock: [] };
  const client = fakeClient(me, SERVER);
  const portal = createIntegratedPortal({
    cfg,
    openMock: async (account, role) => { log.mock.push([account, role]); return { client: { clear() {} }, patient: { id: 'carmen', name: [{ text: 'Mock' }] }, permissions: {}, account, role }; },
    deps: {
      loginDemo: async (_cfg, key) => { log.logins.push(key); if (loginError) throw loginError; return client; },
      logout: async () => { log.logouts++; },
      getRoles: async () => roles,
      openLiveSession: async (c, role) => { const access = createAccess(me); return { client: c, access, permissions: access.permissionsFor(role.patientId), profile: me.profile, patient: { id: role.patientId, name: [{ text: 'Madre' }] } }; },
      checkLive: async () => ({ status: 'available' }),
      closeAll: () => 0,
      loadAccess: async () => createAccess(me),
    },
  });
  return { portal, log };
}

test('mode: integrated by default only when the build is live; demonstration otherwise', () => {
  assert.equal(portalWith(buildConfig(PUBLIC)).portal.getSnapshot().mode, 'integrado');
  assert.equal(portalWith(buildConfig({})).portal.getSnapshot().mode, 'demostracion');
  assert.equal(portalWith(buildConfig({ ...PUBLIC, EXPO_PUBLIC_DATA_MODE: 'mock' })).portal.getSnapshot().mode, 'demostracion');
});

test('integrated loader: one sign-in per account (token reused), live session, never the mock', async () => {
  const { portal, log } = portalWith(buildConfig(PUBLIC));
  const store = createPortalStore(portal.load);
  await store.enter('carmen', 'self');
  assert.equal(store.getSnapshot().status, 'ready');
  assert.ok(store.getSnapshot().session.live);
  assert.equal(store.getSnapshot().session.patient.id, MOTHER);
  store.close();
  await store.enter('carmen', 'self');
  assert.deepEqual(log.logins, ['carmen']);
  assert.deepEqual(log.mock, []);
});

test('explicit switch: demonstration uses only the mock and drops every sign-in; back to integrated', async () => {
  const { portal, log } = portalWith(buildConfig(PUBLIC));
  const store = createPortalStore(portal.load);
  await store.enter('carmen', 'self');
  await portal.choose('demostracion');
  assert.equal(log.logouts, 1);
  await store.enter('rafael', 'delegate');
  assert.equal(store.getSnapshot().session.live, undefined);
  assert.deepEqual(log.mock, [['rafael', 'delegate']]);
  await portal.choose('integrado');
  assert.equal(portal.getSnapshot().availability, 'available');
  const notLive = portalWith(buildConfig({})).portal;
  await notLive.choose('integrado');
  assert.equal(notLive.getSnapshot().mode, 'demostracion', 'integrated mode needs a live build');
});

test('integrated failures end in an error state with a code (no mock data)', async () => {
  const throttled = Object.assign(new Error('LIVE_LOGIN_THROTTLED'), { code: 'LIVE_LOGIN_THROTTLED' });
  const { portal, log } = portalWith(buildConfig(PUBLIC), { loginError: throttled });
  const store = createPortalStore(portal.load);
  await store.enter('carmen', 'self');
  assert.deepEqual([store.getSnapshot().status, store.getSnapshot().session, store.getSnapshot().errorCode], ['error', null, 'LIVE_LOGIN_THROTTLED']);
  assert.equal(liveErrorKey('LIVE_LOGIN_THROTTLED'), 'liveThrottled');
  assert.equal(liveErrorKey('whatever'), 'liveContextError');
  assert.deepEqual(log.mock, []);
  const missing = portalWith(buildConfig(PUBLIC), { roles: [{ role: 'delegate', patientId: MOTHER }] }).portal;
  const store2 = createPortalStore(missing.load);
  await store2.enter('lourdes', 'self');
  assert.equal(store2.getSnapshot().errorCode, 'LIVE_ROLE_NOT_OFFERED');
  for (const key of ['liveThrottled', 'liveContextError', 'liveRoleMissing', 'modeIntegrated', 'modeDemo', 'dischargeTitle', 'familyDelegateIntro'])
    for (const language of ['en', 'es']) assert.ok(translate(language, key, { name: 'x' }).length > 0);
});

test('expired sign-in: one fresh login, then the context opens', async () => {
  let first = true;
  const log = { logins: [] };
  // The first auth/me answers 401 (expired token): the portal signs in again once.
  const p2 = createIntegratedPortal({
    cfg: buildConfig(PUBLIC), openMock: () => { throw new Error('no mock'); },
    deps: {
      loginDemo: async () => { log.logins.push('again'); return fakeClient(patientMe, SERVER); },
      getRoles: async () => { if (first) { first = false; throw new OperationOutcomeError(unauthorized); } return [{ role: 'self', patientId: MOTHER }]; },
      openLiveSession: async (c, role) => { const access = createAccess(patientMe); return { client: c, access, permissions: access.permissionsFor(role.patientId), profile: patientMe.profile, patient: { id: MOTHER } }; },
    },
  });
  const session = await p2.load('carmen', 'self');
  assert.equal(session.patient.id, MOTHER);
  assert.equal(log.logins.filter(x => x === 'again').length, 2);
});

test('watchAccess: a sharing change seen in auth/me triggers a reopen', async () => {
  let me = daughterMe;
  const { portal } = portalWith(buildConfig(PUBLIC));
  const session = sessionFor(daughterMe, { role: 'delegate', patientId: MOTHER });
  const watched = createIntegratedPortal({ cfg: buildConfig(PUBLIC), openMock: () => {}, deps: { loadAccess: async () => createAccess(me) } });
  let changed = 0;
  const stop = watched.watchAccess(session, () => changed++, 5);
  await new Promise(r => setTimeout(r, 20));
  assert.equal(changed, 0);
  me = husbandMe; // now "estudios" is shared too
  await new Promise(r => setTimeout(r, 30));
  stop();
  assert.equal(changed, 1);
  assert.equal(typeof portal.watchAccess({}, () => {}), 'function', 'mock sessions: no polling');
});
